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
};

export const GROCERY_LIST_NAME_MAX_LENGTH = 255;

export function generateGroceryListName(recipeTitles: string[]): string {
	const joined = recipeTitles.join(", ");
	if (joined.length <= GROCERY_LIST_NAME_MAX_LENGTH) return joined;
	return `${joined.slice(0, GROCERY_LIST_NAME_MAX_LENGTH - 1)}…`;
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
