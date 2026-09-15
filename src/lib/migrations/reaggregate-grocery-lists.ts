import {
	aggregateGroceryItems,
	type CustomGroceryIngredient,
	carryOverCheckedState,
} from "#/lib/aggregate-grocery-items";
import { loadGroceryLists, replaceGroceryLists } from "#/lib/grocery-storage";
import { loadRecipes } from "#/lib/recipes-storage";

export const REAGGREGATE_GROCERY_LISTS_MIGRATION_ID =
	"reaggregate-grocery-lists-after-ingredient-categorization";

// A GroceryList's items are computed once (by aggregateGroceryItems) and
// persisted as-is (see grocery-list.ts) — never re-derived from its recipes
// on an ordinary page load, only when the user re-opens the list via "Edit"
// and saves again (grocery-list-create-form.tsx runs this exact same
// aggregateGroceryItems + carryOverCheckedState pair). So correcting a
// recipe's ingredients (see categorize-recipe-ingredients.ts, which must run
// before this one — see the MIGRATIONS order in index.ts) doesn't reach an
// already-created list on its own; without this, the only way to see the
// correction there is exactly what surfaced this gap: manually editing and
// re-saving each list. This migration does that same re-aggregation for
// every stored list once, so existing lists pick up the correction without
// the user having to touch them.
//
// Every item gets a freshly generated id (aggregateGroceryItems always mints
// new ones), same as a manual edit+save would produce — carryOverCheckedState
// still preserves each item's checked state by matching on normalized
// text+unit, not id, so nothing about "what's already been checked off"
// gets lost.
export function reaggregateGroceryLists(): void {
	const lists = loadGroceryLists();
	if (lists.length === 0) return;

	const recipes = loadRecipes();
	const recipesById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

	let anyChanged = false;
	const updated = lists.map((list) => {
		// A purely custom list (no recipe involved) has nothing that could
		// benefit from a recipe-ingredient correction — skip it rather than
		// churning its items' ids for no reason.
		if (list.recipeIds.length === 0) return list;

		const listRecipes = list.recipeIds
			.map((id) => recipesById.get(id))
			.filter((recipe): recipe is NonNullable<typeof recipe> =>
				Boolean(recipe),
			);
		const customIngredients: CustomGroceryIngredient[] = list.items
			.filter((item) => item.source === "custom")
			.map((item) => ({
				text: item.text,
				quantity: item.quantity,
				unit: item.unit,
			}));

		const freshItems = aggregateGroceryItems(listRecipes, customIngredients);
		anyChanged = true;
		return { ...list, items: carryOverCheckedState(list.items, freshItems) };
	});

	if (anyChanged) replaceGroceryLists(updated);
}
