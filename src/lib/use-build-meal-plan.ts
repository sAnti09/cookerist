import { useCallback, useEffect, useRef } from "react";
import type { AiProvider } from "#/lib/ai/client";
import {
	canonicalDishTitle,
	type MealPlan,
	type MealPlanEntry,
} from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { toStoredRecipe } from "#/lib/recipes-storage";
import { getUserTimezone } from "#/lib/user-region";
import { generateRecipe } from "#/server/generate-recipe";

const GENERATION_FAILED_MESSAGE = "Couldn't generate this dish. Try again?";

// Hard ceiling on concurrent OpenRouter workers, even for a very large plan
// — OpenRouter itself won't rate-limit a paid account, but `sort: "latency"`
// (client.ts) still funnels concurrent calls toward whichever single
// upstream is fastest right now, so an unbounded pool just relocates the
// bottleneck there instead of actually parallelizing.
const MAX_OPENROUTER_WORKERS = 5;

// Roughly halves the remaining dishes once Groq's own worker is accounted
// for — each OpenRouter worker ends up pulling ~2 dishes off the shared
// queue over the course of a run, so this is a right-sizing estimate for the
// *initial* pool, not an exact final per-worker count. 0 or 1 pending dishes
// needs no OpenRouter worker at all: the sole Groq worker below handles it
// alone rather than spinning up a second worker that would just find
// nothing left to claim.
function computeOpenRouterWorkerCount(pendingCount: number): number {
	if (pendingCount <= 1) return 0;
	return Math.max(
		1,
		Math.min(Math.floor((pendingCount - 1) / 2), MAX_OPENROUTER_WORKERS),
	);
}

// Exactly one Groq worker, always — never scaled up, regardless of plan
// size. Groq's free-tier account has a real, fixed rate ceiling (~30
// req/min, 6K-30K tokens/min depending on model — see CLAUDE.md's AI
// provider abstraction section), shared with every other Groq call the app
// makes; a single worker (which naturally self-throttles to one in-flight
// request at a time) is the safe upper bound. All additional concurrency
// for a bigger plan comes from OpenRouter instead (see
// computeOpenRouterWorkerCount above), which has no such per-account
// ceiling on a paid plan. chatCompletion's existing one-shot
// cross-provider failover still applies underneath each worker if its
// pinned provider errors.
export function computeBuildWorkerProviders(
	pendingCount: number,
): AiProvider[] {
	const openrouterWorkers = computeOpenRouterWorkerCount(pendingCount);
	const providers: AiProvider[] = ["groq"];
	for (let i = 0; i < openrouterWorkers; i++) providers.push("openrouter");
	return providers;
}

type BuildMealPlanDeps = {
	recipes: Recipe[];
	onUpdatePlan: (plan: MealPlan) => void;
	onCreateRecipe: (recipe: Recipe) => void;
	onUpdateRecipe: (recipe: Recipe) => void;
};

function findExistingRecipe(
	recipes: Recipe[],
	suggestedTitle: string,
): Recipe | undefined {
	const normalized = suggestedTitle.trim().toLowerCase();
	const exactMatch = recipes.find(
		(recipe) => recipe.title.trim().toLowerCase() === normalized,
	);
	if (exactMatch) return exactMatch;

	const targetCanonical = canonicalDishTitle(suggestedTitle);
	if (!targetCanonical) return undefined;

	return recipes.find(
		(recipe) => canonicalDishTitle(recipe.title) === targetCanonical,
	);
}

// Resolves one entry: reuse an existing saved recipe whose title matches
// (case-insensitive exact or canonical title match), or generate a brand-new
// one via the normal recipe pipeline. Never throws — a Groq failure becomes
// a "failed" entry with buildError set, same shape as the caller expects for
// a real off-topic/malformed-response result.
async function resolveEntry(
	entry: MealPlanEntry,
	plan: MealPlan,
	recipes: Recipe[],
	onCreateRecipe: (recipe: Recipe) => void,
	onUpdateRecipe: (recipe: Recipe) => void,
	provider: AiProvider,
): Promise<MealPlanEntry> {
	if (entry.recipeId) {
		const existingById = recipes.find((recipe) => recipe.id === entry.recipeId);
		if (
			existingById &&
			canonicalDishTitle(existingById.title) ===
				canonicalDishTitle(entry.suggestedTitle)
		) {
			if (existingById.currentServings !== plan.defaultServings) {
				onUpdateRecipe({
					...existingById,
					currentServings: plan.defaultServings,
				});
			}
			return {
				...entry,
				status: "ready",
				recipeId: existingById.id,
				reused: true,
				buildError: undefined,
			};
		}
	}

	const existing = findExistingRecipe(recipes, entry.suggestedTitle);
	if (existing) {
		if (existing.currentServings !== plan.defaultServings) {
			onUpdateRecipe({ ...existing, currentServings: plan.defaultServings });
		}
		return {
			...entry,
			status: "ready",
			recipeId: existing.id,
			reused: true,
			buildError: undefined,
		};
	}

	const prompt = `${entry.suggestedTitle} — ${entry.suggestedOverview}`;
	try {
		// skipOnTopicCheck: true — this prompt is the app's own meal-plan
		// suggestion (mealPlanDraft), provably on-topic by construction, so
		// there's no need to risk the cheap classifier's occasional
		// false-negative rejecting a dish the app itself just suggested.
		const result = await generateRecipe({
			data: {
				prompt,
				timezone: getUserTimezone(),
				skipOnTopicCheck: true,
				provider,
			},
		});
		if (result.type !== "success") {
			return {
				...entry,
				status: "failed",
				buildError:
					result.type === "off_topic"
						? GENERATION_FAILED_MESSAGE
						: result.message,
			};
		}
		const recipe: Recipe = {
			...toStoredRecipe(prompt, result.recipe, result.truncated),
			currentServings: plan.defaultServings,
		};
		onCreateRecipe(recipe);
		return {
			...entry,
			status: "ready",
			recipeId: recipe.id,
			reused: false,
			buildError: undefined,
		};
	} catch (error) {
		return {
			...entry,
			status: "failed",
			buildError:
				error instanceof Error ? error.message : GENERATION_FAILED_MESSAGE,
		};
	}
}

// Module-level (not per-hook-instance) so that only one build loop EVER
// runs for a given plan id, even across multiple mounted instances of this
// hook. A per-instance useRef can't see a *different* instance's ref, so if
// this hook ever mounts twice in quick succession for the same plan — React
// StrictMode's deliberate double-invoke, a hydration-mismatch "regenerate
// on the client" (see meal-plan-wizard-form.tsx's own SSR-safety comment;
// the metadata rows here call toLocaleDateString(undefined, …), which is
// itself locale-dependent and a latent hydration-mismatch risk if the
// server's and the browser's default locale ever disagree), or a
// back/forward-cache restore — two independent loops could start, each
// holding its OWN stale snapshot of the plan and racing to persist via
// onUpdatePlan. Since that persist is a plain replace (not a merge), the
// loop whose write lands last simply overwrites the other's progress —
// exactly the shape of bug that could leave a plan showing "Building"
// forever even after every entry has actually finished. A shared, global
// set of in-flight plan ids closes this off regardless of what caused the
// double-mount.
const activeBuildLoops = new Set<string>();

// Drives a plan from status "building" to "ready" using a small pool of
// concurrent workers (sized by computeBuildWorkerProviders above) instead of
// one strictly-sequential loop — safe now that OpenRouter is genuine
// separate capacity from Groq, not just a same-provider retry target. Each
// worker repeatedly claims the next unclaimed "suggested" entry and resolves it
// against its own pinned provider; `claimed` is a plain in-memory Set (never
// persisted — it only needs to prevent two workers in *this* run from
// picking the same entry, not to survive a reload) rather than a new entry
// status, since JS's single-threaded execution means claiming is atomic as
// long as it happens synchronously with no `await` in between (it does).
// Progress still persists (via onUpdatePlan) after every single entry
// resolves — each worker reads `planRef.current` fresh right before writing
// its own result back, so a worker that finishes later merges onto whatever
// the other workers already wrote instead of clobbering it, the same
// read-latest-then-merge pattern the old sequential loop relied on, just now
// contended by more than one in-flight resolve at a time. The loop isn't
// tied to the component's lifecycle, only to the plan's id/status via
// activeBuildLoops, which prevents ever double-starting a pool for the same
// plan. A reload picks back up automatically: mounting this hook against a
// plan that's still "building" with unresolved entries re-triggers the
// effect below exactly the same way a fresh "Approve & build" does.
export function useBuildMealPlan(plan: MealPlan, deps: BuildMealPlanDeps) {
	const depsRef = useRef(deps);
	depsRef.current = deps;
	const planRef = useRef(plan);
	planRef.current = plan;

	const startLoop = useCallback((planId: string) => {
		if (activeBuildLoops.has(planId)) return;
		if (
			planRef.current.id !== planId ||
			planRef.current.status !== "building"
		) {
			return;
		}
		activeBuildLoops.add(planId);

		const claimed = new Set<string>();

		// Nothing left to resolve (globally, across all workers), but the plan
		// is still marked "building" — reconcile rather than silently leaving
		// it stuck. This is the self-healing counterpart to activeBuildLoops
		// above: that prevents a *future* race from corrupting status/entries
		// out of sync, but can't repair a plan already left stuck by a *past*
		// one (or any other drift) — every entry can be "ready" while status
		// never got flipped, and nothing else here ever re-checks that once
		// there's nothing queued to process. A claimed-but-still-in-flight
		// entry is still "suggested" in planRef.current until its worker
		// finishes, so this only fires once every entry has truly settled.
		function reconcileIfNothingLeft() {
			const currentPlan = planRef.current;
			if (currentPlan.id !== planId || currentPlan.status !== "building")
				return;
			const stillPending = currentPlan.entries.some(
				(entry) => entry.status === "suggested",
			);
			if (stillPending) return;
			const allReady = currentPlan.entries.every(
				(entry) => entry.status === "ready",
			);
			if (allReady) {
				const reconciled: MealPlan = { ...currentPlan, status: "ready" };
				planRef.current = reconciled;
				depsRef.current.onUpdatePlan(reconciled);
			}
		}

		function claimNextEntry(): MealPlanEntry | undefined {
			const currentPlan = planRef.current;
			if (currentPlan.id !== planId || currentPlan.status !== "building")
				return undefined;
			const next = currentPlan.entries.find(
				(entry) => entry.status === "suggested" && !claimed.has(entry.id),
			);
			if (next) claimed.add(next.id);
			return next;
		}

		async function worker(provider: AiProvider) {
			while (true) {
				const nextEntry = claimNextEntry();
				if (!nextEntry) {
					reconcileIfNothingLeft();
					break;
				}

				const currentPlan = planRef.current;
				const { recipes, onCreateRecipe, onUpdateRecipe } = depsRef.current;
				const resolved = await resolveEntry(
					nextEntry,
					currentPlan,
					recipes,
					onCreateRecipe,
					onUpdateRecipe,
					provider,
				);

				// The plan may have moved on (deleted, or a different plan mounted
				// this same hook instance's callbacks) while the await above was
				// in flight — abandon rather than resurrect/overwrite it.
				if (planRef.current.id !== planId) break;

				const latestPlan = planRef.current;
				const updatedEntries = latestPlan.entries.map((entry) =>
					entry.id === nextEntry.id ? resolved : entry,
				);
				const allReady = updatedEntries.every(
					(entry) => entry.status === "ready",
				);
				const updatedPlan: MealPlan = {
					...latestPlan,
					entries: updatedEntries,
					status: allReady ? "ready" : "building",
				};
				planRef.current = updatedPlan;
				depsRef.current.onUpdatePlan(updatedPlan);
			}
		}

		async function run() {
			const pendingCount = planRef.current.entries.filter(
				(entry) => entry.status === "suggested",
			).length;
			const providers = computeBuildWorkerProviders(pendingCount);
			await Promise.all(providers.map(worker));
			activeBuildLoops.delete(planId);
		}

		run();
	}, []);

	useEffect(() => {
		if (plan.status === "building") startLoop(plan.id);
	}, [plan.status, plan.id, startLoop]);

	// Resets one failed entry back to "suggested" and (re)starts the loop —
	// needed because a plan stuck with only failed entries left has nothing
	// for the effect above to react to (status/id don't change), so retrying
	// has to explicitly kick the loop itself.
	const retryEntry = useCallback(
		(entryId: string) => {
			const currentPlan = planRef.current;
			const updatedEntries = currentPlan.entries.map((entry) =>
				entry.id === entryId
					? { ...entry, status: "suggested" as const, buildError: undefined }
					: entry,
			);
			const updatedPlan: MealPlan = {
				...currentPlan,
				entries: updatedEntries,
				status: "building",
			};
			planRef.current = updatedPlan;
			depsRef.current.onUpdatePlan(updatedPlan);
			startLoop(updatedPlan.id);
		},
		[startLoop],
	);

	return { retryEntry };
}
