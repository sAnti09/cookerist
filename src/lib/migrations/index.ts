import {
	CATEGORIZE_RECIPE_INGREDIENTS_MIGRATION_ID,
	categorizeRecipeIngredients,
} from "./categorize-recipe-ingredients";
import {
	METRIC_GROCERY_UNITS_MIGRATION_ID,
	migrateGroceryListsToMetricUnits,
} from "./metric-grocery-units";
import {
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
];
