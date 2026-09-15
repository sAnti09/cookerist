import { roundGroceryQuantity } from "#/lib/aggregate-grocery-items";
import type { GroceryListItem } from "#/lib/grocery-list";
import { loadGroceryLists, replaceGroceryLists } from "#/lib/grocery-storage";
import {
	convertFromBase,
	convertToBase,
	getUnitDimension,
	pickMetricDisplayUnit,
} from "#/lib/unit-conversion";

export const METRIC_GROCERY_UNITS_MIGRATION_ID = "grocery-units-to-metric";

// A GroceryListItem's quantity/unit is computed once (by
// aggregateGroceryItems) and then persisted as-is — it's never re-derived
// from its source recipes on ordinary page loads, only when a list is
// re-edited and re-saved. So a list saved before the grocery list started
// always displaying mass/volume in metric still shows its old native-unit
// quantity (e.g. "1 lb" shrimp, "2 cups" broth) forever unless the user
// happens to re-edit it. This re-derives just the display unit/quantity for
// each mass/volume item, using the exact same rule (pickMetricDisplayUnit)
// and rounding (roundGroceryQuantity) a fresh aggregation would apply today
// — every other bucket (count, length, unrecognized) is untouched, since
// this migration is scoped to the mass/volume metric-display change only.
function migrateItem(item: GroceryListItem): GroceryListItem {
	const dimension = getUnitDimension(item.unit);
	if (dimension !== "mass" && dimension !== "volume") return item;

	const baseQuantity = convertToBase(item.quantity, item.unit);
	if (baseQuantity === null) return item;

	const displayUnit = pickMetricDisplayUnit(dimension, baseQuantity);
	const displayQuantity = roundGroceryQuantity(
		convertFromBase(baseQuantity, displayUnit),
		displayUnit,
	);
	if (displayUnit === item.unit && displayQuantity === item.quantity) {
		return item;
	}
	return { ...item, unit: displayUnit, quantity: displayQuantity };
}

export function migrateGroceryListsToMetricUnits(): void {
	const lists = loadGroceryLists();
	let anyChanged = false;

	const migrated = lists.map((list) => {
		const items = list.items.map(migrateItem);
		const changed = items.some((item, index) => item !== list.items[index]);
		if (changed) anyChanged = true;
		return changed ? { ...list, items } : list;
	});

	if (anyChanged) replaceGroceryLists(migrated);
}
