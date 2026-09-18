import type { GroceryList } from "#/lib/grocery-list";
import type { MealPlan } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";

// What a single "Share" action needs to push to Supabase — see CLAUDE.md's
// "Sharing feature" roadmap item: sharing a recipe is just that recipe;
// sharing a grocery list drags along every recipe it references; sharing a
// meal plan drags along its recipes and its derived grocery list (if built).
// Pure/side-effect-free — share-actions.ts is what actually pushes/stamps
// these.
export type ShareCascade = {
	recipes: Recipe[];
	groceryLists: GroceryList[];
	mealPlans: MealPlan[];
};

function emptyCascade(): ShareCascade {
	return { recipes: [], groceryLists: [], mealPlans: [] };
}

export function resolveRecipeShare(recipe: Recipe): ShareCascade {
	return { ...emptyCascade(), recipes: [recipe] };
}

export function resolveGroceryListShare(
	list: GroceryList,
	recipeById: Map<string, Recipe>,
): ShareCascade {
	const recipes = list.recipeIds
		.map((id) => recipeById.get(id))
		.filter((recipe): recipe is Recipe => recipe != null);
	return { ...emptyCascade(), groceryLists: [list], recipes };
}

export function resolveMealPlanShare(
	plan: MealPlan,
	recipeById: Map<string, Recipe>,
	groceryListById: Map<string, GroceryList>,
): ShareCascade {
	const recipeIds = new Set(
		plan.entries
			.map((entry) => entry.recipeId)
			.filter((id): id is string => id != null),
	);
	const recipes = Array.from(recipeIds)
		.map((id) => recipeById.get(id))
		.filter((recipe): recipe is Recipe => recipe != null);
	const groceryList = plan.groceryListId
		? groceryListById.get(plan.groceryListId)
		: undefined;
	return {
		mealPlans: [plan],
		recipes,
		groceryLists: groceryList ? [groceryList] : [],
	};
}
