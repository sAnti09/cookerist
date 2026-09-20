import {
	ADD_SYNC_METADATA_MIGRATION_ID,
	addSyncMetadata,
} from "./add-sync-metadata";
import {
	CATEGORIZE_RECIPE_INGREDIENTS_APPROX_WEIGHT_MIGRATION_ID,
	CATEGORIZE_RECIPE_INGREDIENTS_MIGRATION_ID,
	categorizeRecipeIngredients,
} from "./categorize-recipe-ingredients";
import {
	GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID,
	generateRecipeThumbnails,
} from "./generate-recipe-thumbnails";
import {
	METRIC_GROCERY_UNITS_MIGRATION_ID,
	migrateGroceryListsToMetricUnits,
} from "./metric-grocery-units";
import {
	REAGGREGATE_GROCERY_LISTS_APPROX_WEIGHT_MIGRATION_ID,
	REAGGREGATE_GROCERY_LISTS_LIQUID_FIX_MIGRATION_ID,
	REAGGREGATE_GROCERY_LISTS_LIQUID_HYBRID_FIX_MIGRATION_ID,
	REAGGREGATE_GROCERY_LISTS_LIQUID_PRIORITY_FIX_MIGRATION_ID,
	REAGGREGATE_GROCERY_LISTS_MIGRATION_ID,
	reaggregateGroceryLists,
} from "./reaggregate-grocery-lists";
import type { Migration } from "./run-migrations";

export { runMigrations } from "./run-migrations";

// Every migration Cookerist has ever shipped, in the order they should run.
// Add new ones to the end — never remove or reorder an existing entry, since
// a browser that already ran it keeps that id marked completed regardless
// (see run-migrations.ts). Order matters here specifically:
// reaggregate-grocery-lists must run after categorize-recipe-ingredients so
// it re-aggregates lists against already-corrected recipes, not stale ones.
export const MIGRATIONS: readonly Migration[] = [
	{
		id: METRIC_GROCERY_UNITS_MIGRATION_ID,
		run: migrateGroceryListsToMetricUnits,
	},
	{
		id: CATEGORIZE_RECIPE_INGREDIENTS_MIGRATION_ID,
		run: categorizeRecipeIngredients,
	},
	{
		id: REAGGREGATE_GROCERY_LISTS_MIGRATION_ID,
		run: reaggregateGroceryLists,
	},
	// Re-runs the same re-aggregation again now that aggregateGroceryItems no
	// longer forces a non-liquid volume ingredient (e.g. "1 cup chopped
	// carrots") into ml/l — see the id's own comment in
	// reaggregate-grocery-lists.ts for why a second run under a new id is
	// what's needed here, not a change to the entry above.
	{
		id: REAGGREGATE_GROCERY_LISTS_LIQUID_FIX_MIGRATION_ID,
		run: reaggregateGroceryLists,
	},
	// Re-runs categorizeRecipeIngredients now that it also backfills
	// Ingredient.approxGramsPerUnit (see the id's own comment in
	// categorize-recipe-ingredients.ts), then re-aggregates lists again so
	// they pick up the newly-bridged count->mass merges (e.g. "1 onion" +
	// "200 g onion" combining into one line).
	{
		id: CATEGORIZE_RECIPE_INGREDIENTS_APPROX_WEIGHT_MIGRATION_ID,
		run: categorizeRecipeIngredients,
	},
	{
		id: REAGGREGATE_GROCERY_LISTS_APPROX_WEIGHT_MIGRATION_ID,
		run: reaggregateGroceryLists,
	},
	// Re-runs re-aggregation once more now that a recognized liquid (milk,
	// oil, broth, cream, ...) never bridges to mass via density anymore —
	// see the id's own comment in reaggregate-grocery-lists.ts.
	{
		id: REAGGREGATE_GROCERY_LISTS_LIQUID_PRIORITY_FIX_MIGRATION_ID,
		run: reaggregateGroceryLists,
	},
	// Re-runs re-aggregation once more now that a recognized liquid with a
	// known density merges a real mass occurrence with a real volume
	// occurrence into one line (mass wins) instead of always splitting them
	// or always forcing volume — see the id's own comment in
	// reaggregate-grocery-lists.ts.
	{
		id: REAGGREGATE_GROCERY_LISTS_LIQUID_HYBRID_FIX_MIGRATION_ID,
		run: reaggregateGroceryLists,
	},
	// Backfills the sync-engine metadata fields (updatedAt/sharedAt) added for
	// the sharing feature — see add-sync-metadata.ts.
	{
		id: ADD_SYNC_METADATA_MIGRATION_ID,
		run: addSyncMetadata,
	},
	// One-time backfill of a thumbnail image for every recipe saved before
	// thumbnails existed — see generate-recipe-thumbnails.ts.
	{
		id: GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID,
		run: generateRecipeThumbnails,
	},
];
