import type { GroceryCategory } from "#/lib/grocery-category";

export type GroceryListItemSource = "recipe" | "custom";

export type GroceryListItemOrigin = {
	recipeId: string;
	ingredientId: string;
};

export type GroceryListItem = {
	id: string;
	text: string;
	quantity: number;
	unit: string;
	checked: boolean;
	source: GroceryListItemSource;
	// Present (non-empty) only when source is "recipe" — the ingredients this
	// item was aggregated from.
	origins?: GroceryListItemOrigin[];
	// True when this item's quantity was estimated by converting between mass
	// and volume (e.g. combining "2 cups sugar" with "500 g sugar") using an
	// approximate ingredient density rather than a precise unit conversion —
	// flagged so the UI can mark it as an estimate rather than an exact total.
	approximate?: boolean;
	// Which grocery-store section this item is shelved in (see
	// src/lib/grocery-category.ts) — used to group the "From recipes" section
	// of the grocery list. Present (non-undefined) only for a recipe-sourced
	// item whose source ingredient(s) had a category; absent for a custom
	// item (there's no per-item category input for those) or an item
	// aggregated before this field existed.
	category?: GroceryCategory;
};

export type GroceryList = {
	id: string;
	createdAt: string;
	name: string;
	recipeIds: string[];
	items: GroceryListItem[];
	expanded: boolean;
	// Keys (see suggestGroceryMerges/suggestionKey in suggest-grocery-merges.ts)
	// of merge suggestions the user has explicitly said "not the same" to, so
	// the same pair of item names doesn't keep re-prompting on this list.
	// Absent/undefined on a list saved before this field existed — treated as
	// no dismissals.
	dismissedMergeSuggestionKeys?: string[];
	// Keys (same suggestionKey format as above) of merge suggestions the user
	// has explicitly confirmed ARE the same item. aggregateGroceryItems has no
	// memory of a manual merge — it only groups by normalized base name — so
	// without this, re-aggregating the list (the meal-plan "Update grocery
	// list" banner, or Edit-and-save) would silently split a previously-merged
	// pair back into two items and re-surface the exact suggestion the user
	// already accepted. See reapplyConfirmedMerges in suggest-grocery-merges.ts,
	// run after every re-aggregation. Absent/undefined on a list saved before
	// this field existed, or one with no confirmed merges yet.
	confirmedMergeKeys?: string[];
};

export const GROCERY_LIST_NAME_MAX_LENGTH = 255;

// Default name for a new grocery list, e.g. "Sep 16, 2026" (no recipes
// selected yet, or a custom-only list) or "Sep 16, 2026 for 3 recipes" —
// same date format used for recipe/grocery-list rows elsewhere in the app.
export function generateGroceryListName(
	recipeCount: number,
	date: Date = new Date(),
): string {
	const formattedDate = date.toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	if (recipeCount === 0) return formattedDate;
	const recipeWord = recipeCount === 1 ? "recipe" : "recipes";
	return `${formattedDate} for ${recipeCount} ${recipeWord}`;
}

export type GroceryListProgress = {
	checked: number;
	total: number;
	percent: number;
	completed: boolean;
};

export function getGroceryListProgress(list: GroceryList): GroceryListProgress {
	const total = list.items.length;
	const checked = list.items.filter((item) => item.checked).length;
	const percent = total > 0 ? Math.round((checked / total) * 100) : 0;
	return { checked, total, percent, completed: total > 0 && percent === 100 };
}
