import { MAX_THUMBNAIL_ATTEMPTS } from "#/lib/recipe";
import { loadRecipes, replaceRecipes } from "#/lib/recipes-storage";
import { generateRecipeThumbnail } from "#/server/generate-recipe-thumbnail";
import type { MigrationRunResult } from "./run-migrations";

export const GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID =
	"generate-recipe-thumbnails";

// One-time backfill for every recipe saved before thumbnails existed (or one
// that already tried and failed, but hasn't hit the retry cap yet) — see
// CLAUDE.md's "Recipe thumbnail images" section. Respects the same
// MAX_THUMBNAIL_ATTEMPTS cap as app-data-context.tsx's
// generateThumbnailForRecipe (the automatic creation-time trigger and the
// detail screen's manual "Generate image" button) so a recipe never gets
// more than that many attempts total, however they're distributed across
// this migration, creation time, and manual retries. Sequential, not
// batched/parallel — unlike categorize-recipe-ingredients.ts (one Groq call
// covers many ingredients at once), each thumbnail is its own independent
// DeepInfra + R2 round trip, so there's no batching win here, only a rate
// limit to be gentle with.
//
// Returns `{ retry: true }` (see run-migrations.ts) only when there was
// something to do and literally none of it succeeded — the same "mobile
// browser suspends the in-flight fetch mid-request" failure mode
// categorize-recipe-ingredients.ts was written to handle. A recipe left with
// one failed attempt after this migration still gets its second, manual try
// via the detail screen's button.
export async function generateRecipeThumbnails(): Promise<MigrationRunResult> {
	const candidates = loadRecipes().filter(
		(recipe) =>
			!recipe.thumbnailUrl &&
			(recipe.thumbnailAttempts ?? 0) < MAX_THUMBNAIL_ATTEMPTS,
	);
	if (candidates.length === 0) return;

	let succeeded = 0;
	for (const recipe of candidates) {
		try {
			const result = await generateRecipeThumbnail({
				data: {
					recipeId: recipe.id,
					title: recipe.title,
					overview: recipe.overview,
				},
			});
			// Re-reads localStorage on every iteration (rather than accumulating
			// changes against the stale `candidates` snapshot) since this loop
			// makes several sequential network round trips — the user could
			// plausibly edit/delete a recipe in the meantime, and applying each
			// result against a fresh read keeps that window as small as possible.
			const current = loadRecipes();
			if (result.type === "success") {
				succeeded++;
				replaceRecipes(
					current.map((r) =>
						r.id === recipe.id ? { ...r, thumbnailUrl: result.url } : r,
					),
				);
			} else {
				replaceRecipes(
					current.map((r) =>
						r.id === recipe.id
							? { ...r, thumbnailAttempts: (r.thumbnailAttempts ?? 0) + 1 }
							: r,
					),
				);
			}
		} catch (error) {
			console.error("generate-recipe-thumbnails: request threw:", error);
			const current = loadRecipes();
			replaceRecipes(
				current.map((r) =>
					r.id === recipe.id
						? { ...r, thumbnailAttempts: (r.thumbnailAttempts ?? 0) + 1 }
						: r,
				),
			);
		}
	}

	if (succeeded === 0) return { retry: true };
}
