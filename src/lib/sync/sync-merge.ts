import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";

// Merge rules for reconciling a local entity against the version pulled from
// Supabase during sync-on-open (see sync-engine.ts) — also reused, per
// CLAUDE.md's roadmap, when "the other device is your own" (pairing a second
// device that already had local data — see share-actions.ts's
// shareAllLocalData). Deliberately no CRDT machinery: recipes are rarely
// edited concurrently so whole-record last-write-wins is enough; grocery
// lists and meal plans merge their children (items/entries) by id instead,
// since those are additive/idempotent (checking an item, adding a slot) in a
// way a whole-record LWW would risk clobbering — see CLAUDE.md's "Sharing
// feature" roadmap item for the reasoning this mirrors.

export function mergeRecipe(local: Recipe, remote: Recipe): Recipe {
	return remote.updatedAt > local.updatedAt ? remote : local;
}

// An item present on both sides keeps `checked = local || remote` — checking
// something off is monotonic progress, so OR is always the right answer
// regardless of which side is "newer" (the "additive/idempotent" property
// the roadmap cites). Its other fields (text/quantity/unit/category) come
// from whichever side's *list* updatedAt is newer. An item present on only
// one side is carried over as-is (union, never dropped).
function mergeItems(
	localItems: GroceryListItem[],
	remoteItems: GroceryListItem[],
	remoteIsNewer: boolean,
): GroceryListItem[] {
	const byId = new Map(localItems.map((item) => [item.id, item]));
	for (const remoteItem of remoteItems) {
		const localItem = byId.get(remoteItem.id);
		if (!localItem) {
			byId.set(remoteItem.id, remoteItem);
			continue;
		}
		const base = remoteIsNewer ? remoteItem : localItem;
		byId.set(remoteItem.id, {
			...base,
			checked: localItem.checked || remoteItem.checked,
		});
	}
	return Array.from(byId.values());
}

export function mergeGroceryList(
	local: GroceryList,
	remote: GroceryList,
): GroceryList {
	const remoteIsNewer = remote.updatedAt > local.updatedAt;
	const newer = remoteIsNewer ? remote : local;
	return {
		...newer,
		items: mergeItems(local.items, remote.items, remoteIsNewer),
	};
}

// An entry present on both sides takes its fields from whichever side's
// *plan* updatedAt is newer (no per-entry timestamp to compare finer than
// that — see the plan's own reasoning for why that's an acceptable
// trade-off). An entry present on only one side is carried over as-is, so an
// entry added on one device while the other was offline is never lost.
function mergeEntries(
	localEntries: MealPlanEntry[],
	remoteEntries: MealPlanEntry[],
	remoteIsNewer: boolean,
): MealPlanEntry[] {
	const byId = new Map(localEntries.map((entry) => [entry.id, entry]));
	for (const remoteEntry of remoteEntries) {
		const localEntry = byId.get(remoteEntry.id);
		if (!localEntry) {
			byId.set(remoteEntry.id, remoteEntry);
			continue;
		}
		byId.set(remoteEntry.id, remoteIsNewer ? remoteEntry : localEntry);
	}
	return Array.from(byId.values());
}

export function mergeMealPlan(local: MealPlan, remote: MealPlan): MealPlan {
	const remoteIsNewer = remote.updatedAt > local.updatedAt;
	const newer = remoteIsNewer ? remote : local;
	return {
		...newer,
		entries: mergeEntries(local.entries, remote.entries, remoteIsNewer),
	};
}
