import {
	METRIC_GROCERY_UNITS_MIGRATION_ID,
	migrateGroceryListsToMetricUnits,
} from "./metric-grocery-units";
import type { Migration } from "./run-migrations";

export { runMigrations } from "./run-migrations";

// Every migration Cookerist has ever shipped, in the order they should run.
// Add new ones to the end — never remove or reorder an existing entry, since
// a browser that already ran it keeps that id marked completed regardless
// (see run-migrations.ts).
export const MIGRATIONS: readonly Migration[] = [
	{
		id: METRIC_GROCERY_UNITS_MIGRATION_ID,
		run: migrateGroceryListsToMetricUnits,
	},
];
