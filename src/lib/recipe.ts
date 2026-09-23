import type { GroceryCategory } from "#/lib/grocery-category";

export type Ingredient = {
	id: string;
	text: string;
	quantity: number;
	unit: string;
	checked: boolean;
	// Optional: absent on ingredients saved before TEST-255 split ingredient
	// naming into a base name (what grocery combination keys on, e.g. "garlic")
	// and a description (preserved detail, e.g. "chopped"). When absent,
	// callers should fall back to treating `text` as the base name with no
	// description.
	baseName?: string;
	description?: string;
	// Which grocery-store section this ingredient is shelved in (see
	// src/lib/grocery-category.ts), used to group the grocery list.
	// Optional: absent on ingredients saved before this field existed —
	// callers should fall back to DEFAULT_GROCERY_CATEGORY ("Other").
	category?: GroceryCategory;
	// Approximate weight in grams of ONE unit of this ingredient — only ever
	// meaningful when `unit` is "" (unitless/one whole piece) and the
	// ingredient is the kind a shopper could plausibly buy either by count
	// or by weight (e.g. one onion ≈ 150g); null for anything else,
	// including a genuinely count-native item like eggs (see
	// prompt-rules.ts's APPROX_WEIGHT_RULE). Lets aggregate-grocery-items.ts
	// bridge a bare count into the mass bucket, the same way
	// ingredient-density.ts bridges volume, so e.g. "1 onion" and "200 g
	// onion" merge into one grocery-list line instead of staying separate.
	// Optional: absent on ingredients saved before this field existed —
	// callers should treat that the same as null (no estimate).
	approxGramsPerUnit?: number | null;
	// How this ingredient scales as recipe servings change:
	// "linear" (default) for bulk mass/proteins/starches (1:1 with servings);
	// "sublinear" for pan aromatics, spices, seasonings, and cooking fats.
	scalingClass?: "linear" | "sublinear";
};

// Composes the full display name from a base name + optional description
// (e.g. "garlic" + "chopped" -> "garlic, chopped"), used both when building a
// freshly-generated ingredient's display `text` and when merging a Groq
// continuation response back into a recipe.
export function combineIngredientName(
	baseName: string,
	description: string,
): string {
	const trimmedBase = baseName.trim();
	const trimmedDescription = description.trim();
	return trimmedDescription
		? `${trimmedBase}, ${trimmedDescription}`
		: trimmedBase;
}

export type Step = {
	id: string;
	section: string | null;
	text: string;
	checked: boolean;
	// Optional: minutes estimate for an inherently time-based step (e.g.
	// "simmer for 10 minutes") — populated by Groq only when relevant
	// (TEST-258). Absent/null for most steps, which fall back to plain
	// navigation with no timer.
	estimatedMinutes?: number | null;
};

export type Difficulty = "quick_and_easy" | "intermediate" | "hard";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
	quick_and_easy: "Quick & easy",
	intermediate: "Intermediate",
	hard: "Hard",
};

// A revised full recipe returned by a "modify recipe" Groq call, held for
// review before the user approves or discards it — the approved `Recipe`
// itself is left untouched until then. `instructions` accumulates one entry
// per modification round (oldest first) so refining re-prompts against this
// draft rather than the original, letting edits compound.
export type PendingModification = {
	instructions: string[];
	draft: {
		title: string;
		overview: string;
		baseServings: number;
		difficulty?: Difficulty | null;
		estimatedMinutes?: number | null;
		caloriesPerServing?: number | null;
		ingredients: Ingredient[];
		steps: Step[];
		truncated: boolean;
	};
};

// A modification is a full recipe-generation-cost Groq call, not the cheap
// classifier — capped per recipe (not per draft), and never refunded: every
// successful call counts against this budget the moment it's generated,
// whether that draft is later approved or discarded, so approving one
// modification and starting a fresh draft doesn't reset it. Compare against
// `Recipe.modificationCount`, not `PendingModification.instructions.length`.
export const MAX_MODIFICATIONS = 2;

// A thumbnail is generated automatically once at creation time, plus at most
// one manual retry via the detail screen's "Generate image" button — see
// app-data-context.tsx's generateThumbnailForRecipe, which is the one place
// this cap is enforced (both the automatic trigger and the manual button
// route through it, and the backfill migration for older recipes respects it
// too). Once this many attempts have failed with thumbnailUrl still null, the
// detail screen shows an inline "couldn't be generated" message instead of
// the button.
export const MAX_THUMBNAIL_ATTEMPTS = 2;

export type Recipe = {
	id: string;
	createdAt: string;
	prompt: string;
	title: string;
	overview: string;
	baseServings: number;
	currentServings: number;
	// Optional: absent on recipes saved before TEST-229 added these fields.
	difficulty?: Difficulty | null;
	estimatedMinutes?: number | null;
	// Optional: absent on recipes saved before this field existed.
	caloriesPerServing?: number | null;
	ingredients: Ingredient[];
	steps: Step[];
	expanded: boolean;
	favorite: boolean;
	// True when Groq's response was cut off mid-generation (TEST-243) — the
	// recipe detail view offers a "Load more" action to fetch the rest.
	// Optional: absent on recipes saved before this field existed.
	truncated?: boolean;
	// Set while a "modify recipe" draft is awaiting approval/discard. Optional:
	// absent whenever there's no modification in progress.
	pendingModification?: PendingModification;
	// Total number of successful "modify recipe" Groq calls made against this
	// recipe, ever — incremented the moment a call succeeds, regardless of
	// whether that draft is later approved or discarded. Capped at
	// MAX_MODIFICATIONS. Optional: absent on recipes saved before this
	// feature existed — treat as 0.
	modificationCount?: number;
	// ISO timestamp bumped on every content mutation (not pure UI state like
	// `expanded`) — the clock the sync engine's last-write-wins merge compares
	// (see src/lib/sync/). Always present after loadRecipes() normalizes it —
	// the one-time `add-sync-metadata` migration backfills it from
	// `createdAt` for existing data, and recipes-storage.ts's load path falls
	// back the same way for anything that migration hasn't reached yet (e.g.
	// a fresh test).
	updatedAt: string;
	// ISO timestamp once this recipe has been pushed to Supabase at least
	// once; null means it's still local-only and the sync engine never
	// touches it (see CLAUDE.md's "Sharing feature" roadmap item — a solo user
	// who never shares anything should never get a row in Supabase). Every
	// device paired under the same identity is a symmetric co-owner once
	// shared — any of them can fully delete it, which cascades to the rest
	// (see src/lib/sync/sync-engine.ts).
	sharedAt: string | null;
	// The Supabase account (`users.id`) this recipe's row actually belongs
	// to — null for a local-only recipe that's never synced. Set once, the
	// first time this recipe is ever synced (to this device's own account),
	// or overwritten from Supabase's own `owner_id` column on every pull
	// thereafter (see sync-engine.ts). When this differs from the current
	// device's own account, the recipe was shared *to* this account by
	// someone else (see CLAUDE.md's "Per-resource sharing" roadmap item) —
	// use isSharedWithMe (src/lib/sync/share-status.ts) rather than comparing
	// this directly, so the "am I the owner" check lives in one place.
	ownerId: string | null;
	// URL of a generated thumbnail image (Cloudflare R2), set asynchronously
	// after recipe creation — see src/server/generate-recipe-thumbnail.ts. Null
	// while pending/unset (generation never blocks recipe creation itself).
	// Optional: absent on recipes saved before this field existed — callers
	// should treat that the same as null (see the generate-recipe-thumbnails
	// migration for backfilling existing recipes).
	thumbnailUrl?: string | null;
	// Number of thumbnail-generation attempts made so far (the automatic one
	// at creation/backfill time, plus any manual "Generate image" retry),
	// capped at MAX_THUMBNAIL_ATTEMPTS. Only meaningful while thumbnailUrl is
	// null. Optional: absent on recipes saved before this field existed —
	// callers should treat that the same as 0.
	thumbnailAttempts?: number;
};

export function formatEstimatedTime(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes === 0
		? `${hours} hr`
		: `${hours} hr ${remainingMinutes} min`;
}

export function formatCaloriesPerServing(calories: number): string {
	return `${Math.round(calories)} cal`;
}

export type StepSection = {
	name: string | null;
	steps: Step[];
};

export function groupSteps(steps: Step[]): StepSection[] {
	const sections: StepSection[] = [];
	for (const step of steps) {
		const last = sections[sections.length - 1];
		if (last && last.name === step.section) {
			last.steps.push(step);
		} else {
			sections.push({ name: step.section, steps: [step] });
		}
	}
	return sections;
}
