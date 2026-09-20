import {
	aggregateGroceryItems,
	type CustomGroceryIngredient,
} from "#/lib/aggregate-grocery-items";
import { loadGroceryLists, replaceGroceryLists } from "#/lib/grocery-storage";
import { loadRecipes } from "#/lib/recipes-storage";
import { rebuildGroceryListItems } from "#/lib/suggest-grocery-merges";

export const REAGGREGATE_GROCERY_LISTS_MIGRATION_ID =
	"reaggregate-grocery-lists-after-ingredient-categorization";

// A second, later id for the exact same function — needed because a browser
// that already ran the migration above (under the first id) has it marked
// completed forever, but ran it while aggregateGroceryItems still had the
// bug where a non-liquid volume ingredient (e.g. "1 cup chopped carrots")
// got forced into ml/l same as a real liquid — see liquid-ingredients.ts.
// That already-completed run re-aggregated every list using the buggy
// logic, baking the wrong ml/l values back into storage; only a fresh
// migration run (a new id) picks up today's fixed aggregateGroceryItems.
// This only reaches recipe-linked lists — see the file-level comment below
// for why a purely custom list can't be retroactively fixed the same way.
export const REAGGREGATE_GROCERY_LISTS_LIQUID_FIX_MIGRATION_ID =
	"reaggregate-grocery-lists-liquid-volume-fix";

// A third id, same reasoning: needed after categorize-recipe-ingredients.ts
// starts backfilling Ingredient.approxGramsPerUnit onto already-saved
// ingredients (see CATEGORIZE_RECIPE_INGREDIENTS_APPROX_WEIGHT_MIGRATION_ID)
// — a stored list won't bridge a bare count (e.g. "1 onion") into the mass
// bucket alongside a real-weight occurrence of the same ingredient until
// it's re-aggregated against that newly-backfilled data.
export const REAGGREGATE_GROCERY_LISTS_APPROX_WEIGHT_MIGRATION_ID =
	"reaggregate-grocery-lists-approx-weight";

// A fourth id, same reasoning: needed after aggregate-grocery-items.ts
// started checking isLiquidIngredient *before* density lookup instead of
// after — a recognized liquid (milk, oil, broth, cream, ...) that used to
// have a density entry no longer bridges to mass at all, always staying in
// metric volume (ml/l) instead. A list re-aggregated by an earlier id still
// has that ingredient's old density-bridged gram total baked in.
export const REAGGREGATE_GROCERY_LISTS_LIQUID_PRIORITY_FIX_MIGRATION_ID =
	"reaggregate-grocery-lists-liquid-priority-fix";

// A fifth id, same reasoning: needed after aggregate-grocery-items.ts added
// the "liquid" hybrid bucket — a recognized liquid with a known density now
// merges a real mass occurrence with a real volume occurrence of the same
// ingredient into one line (mass wins, bridging the volume in via density),
// instead of always splitting them or always forcing volume regardless. A
// list re-aggregated by an earlier id still has any such liquid showing as
// two separate lines (or force-converted to ml with no mass occurrence
// considered at all).
export const REAGGREGATE_GROCERY_LISTS_LIQUID_HYBRID_FIX_MIGRATION_ID =
	"reaggregate-grocery-lists-liquid-hybrid-fix";

// A GroceryList's items are computed once (by aggregateGroceryItems) and
// persisted as-is (see grocery-list.ts) — never re-derived from its recipes
// on an ordinary page load, only when the user re-opens the list via "Edit"
// and saves again (grocery-list-create-form.tsx runs this exact same
// aggregateGroceryItems + rebuildGroceryListItems pair). So correcting a
// recipe's ingredients (see categorize-recipe-ingredients.ts, which must run
// before this one — see the MIGRATIONS order in index.ts) doesn't reach an
// already-created list on its own; without this, the only way to see the
// correction there is exactly what surfaced this gap: manually editing and
// re-saving each list. This does that same re-aggregation for every stored
// list, so existing lists pick up a recipe-data correction without the user
// having to touch them — registered under two separate migration ids in
// index.ts (see REAGGREGATE_GROCERY_LISTS_LIQUID_FIX_MIGRATION_ID above),
// since it needs to run again whenever a *later* fix changes what a fresh
// aggregation would produce, not just the first time.
//
// A surviving item keeps its id and checked state across the rebuild (see
// rebuildGroceryListItems/carryOverCheckedState, matching on normalized
// text+unit, not id) — only a genuinely new or dropped item gets a fresh id,
// same as a manual edit+save produces.
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
		return {
			...list,
			items: rebuildGroceryListItems(
				list.items,
				freshItems,
				list.confirmedMergeKeys,
			),
		};
	});

	if (anyChanged) replaceGroceryLists(updated);
}
