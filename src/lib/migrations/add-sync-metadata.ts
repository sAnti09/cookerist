import { loadGroceryLists, replaceGroceryLists } from "#/lib/grocery-storage";
import { loadMealPlans, replaceMealPlans } from "#/lib/meal-plan-storage";
import { loadRecipes, replaceRecipes } from "#/lib/recipes-storage";

export const ADD_SYNC_METADATA_MIGRATION_ID = "add-sync-metadata";

// Recipe/GroceryList/MealPlan gained `updatedAt`/`sharedAt` fields for the
// sharing/sync feature (see src/lib/sync/ and CLAUDE.md's "Sharing feature"
// roadmap item). loadRecipes()/loadGroceryLists()/loadMealPlans() already
// default these on every read (updatedAt falls back to createdAt, sharedAt
// to null) so the app never crashes on old data — this migration exists
// purely to make that backfill permanent in localStorage, the same "compute
// it once, persist it, stop re-deriving on every load" reasoning as every
// other migration here. Uses the plain replaceX() bulk writers (not
// updateX(), which stamps updatedAt to "now") so backfilling doesn't itself
// look like a fresh edit.
//
// Purely local and synchronous — no Groq call, nothing worth retrying — so
// this follows the default "throws → still marked completed" rule (see
// run-migrations.ts) rather than opting into `{ retry: true }`.
export function addSyncMetadata(): void {
	const recipes = loadRecipes();
	if (recipes.length > 0) replaceRecipes(recipes);

	const lists = loadGroceryLists();
	if (lists.length > 0) replaceGroceryLists(lists);

	const plans = loadMealPlans();
	if (plans.length > 0) replaceMealPlans(plans);
}
