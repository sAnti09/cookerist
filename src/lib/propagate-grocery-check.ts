import type { GroceryList, GroceryListItem } from "./grocery-list";
import type { Recipe } from "./recipe";

// One-directional (grocery -> recipe, see TEST-242): applies a checked value
// to every recipe ingredient the given grocery items were aggregated from.
// Custom items have no origins and are ignored. Returns only the recipes
// that actually changed, for the caller to persist.
export function applyGroceryItemsCheckedToRecipes(
	recipes: Recipe[],
	items: GroceryListItem[],
	checked: boolean,
): Recipe[] {
	const ingredientIdsByRecipe = new Map<string, Set<string>>();
	for (const item of items) {
		if (item.source !== "recipe" || !item.origins) continue;
		for (const origin of item.origins) {
			const ids =
				ingredientIdsByRecipe.get(origin.recipeId) ?? new Set<string>();
			ids.add(origin.ingredientId);
			ingredientIdsByRecipe.set(origin.recipeId, ids);
		}
	}

	const updated: Recipe[] = [];
	for (const recipe of recipes) {
		const ingredientIds = ingredientIdsByRecipe.get(recipe.id);
		if (!ingredientIds) continue;
		updated.push({
			...recipe,
			ingredients: recipe.ingredients.map((ingredient) =>
				ingredientIds.has(ingredient.id)
					? { ...ingredient, checked }
					: ingredient,
			),
		});
	}
	return updated;
}

export type GroceryItemToggleResult = {
	list: GroceryList;
	affectedRecipes: Recipe[];
};

// Toggles a single item's checked state and propagates it to any recipe
// ingredients it was aggregated from — the update GroceryListDetail and
// GroceryMode both need when a shopper taps one item's checkbox. Returns null
// when the id isn't found (nothing to toggle).
export function toggleGroceryListItem(
	list: GroceryList,
	recipes: Recipe[],
	itemId: string,
): GroceryItemToggleResult | null {
	const item = list.items.find((i) => i.id === itemId);
	if (!item) return null;
	const checked = !item.checked;
	return {
		list: {
			...list,
			items: list.items.map((i) => (i.id === itemId ? { ...i, checked } : i)),
		},
		affectedRecipes: applyGroceryItemsCheckedToRecipes(
			recipes,
			[item],
			checked,
		),
	};
}
