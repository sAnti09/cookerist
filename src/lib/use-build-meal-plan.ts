import { useCallback, useEffect, useRef } from "react";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { toStoredRecipe } from "#/lib/recipes-storage";
import { getUserTimezone } from "#/lib/user-region";
import { generateRecipe } from "#/server/generate-recipe";

const GENERATION_FAILED_MESSAGE = "Couldn't generate this dish. Try again?";

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
	return recipes.find(
		(recipe) => recipe.title.trim().toLowerCase() === normalized,
	);
}

// Resolves one entry: reuse an existing saved recipe whose title matches
// (case-insensitive, trimmed exact match — "no entry beats a wrong guess",
// same philosophy as ingredient-density.ts), or generate a brand-new one via
// the normal recipe pipeline. Never throws — a Groq failure becomes a
// "failed" entry with buildError set, same shape as the caller expects for
// a real off-topic/malformed-response result.
async function resolveEntry(
	entry: MealPlanEntry,
	plan: MealPlan,
	recipes: Recipe[],
	onCreateRecipe: (recipe: Recipe) => void,
	onUpdateRecipe: (recipe: Recipe) => void,
): Promise<MealPlanEntry> {
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
		const result = await generateRecipe({
			data: { prompt, timezone: getUserTimezone() },
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

// Drives a plan from status "building" to "ready", resolving each
// "suggested" entry in turn, sequentially — never in parallel, to avoid
// bursting the expensive recipe-generation model with a dozen simultaneous
// requests. Progress persists (via onUpdatePlan) after every single entry
// resolves, so the loop can safely keep running even if the component using
// this hook unmounts (e.g. the user navigates to another tab) — it isn't
// tied to the component's lifecycle, only to the plan's id/status via
// activeBuildLoops, which prevents ever double-starting a loop for the same
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

		async function run() {
			while (true) {
				const currentPlan = planRef.current;
				if (currentPlan.id !== planId || currentPlan.status !== "building")
					break;
				const nextEntry = currentPlan.entries.find(
					(entry) => entry.status === "suggested",
				);
				if (!nextEntry) {
					// Nothing left to resolve, but the plan is still marked
					// "building" — reconcile rather than silently leaving it stuck.
					// This is the self-healing counterpart to activeBuildLoops above:
					// that prevents a *future* race from corrupting status/entries
					// out of sync, but can't repair a plan already left stuck by a
					// *past* one (or any other drift) — every entry can be "ready"
					// while status never got flipped, and nothing else in this loop
					// ever re-checks that once there's nothing queued to process.
					const allReady = currentPlan.entries.every(
						(entry) => entry.status === "ready",
					);
					if (allReady) {
						const reconciled: MealPlan = { ...currentPlan, status: "ready" };
						planRef.current = reconciled;
						depsRef.current.onUpdatePlan(reconciled);
					}
					break;
				}

				const { recipes, onCreateRecipe, onUpdateRecipe } = depsRef.current;
				const resolved = await resolveEntry(
					nextEntry,
					currentPlan,
					recipes,
					onCreateRecipe,
					onUpdateRecipe,
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
