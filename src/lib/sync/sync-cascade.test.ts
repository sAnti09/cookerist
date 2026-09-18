import { describe, expect, it } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import type { MealPlan } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import {
	resolveGroceryListShare,
	resolveMealPlanShare,
	resolveRecipeShare,
} from "./sync-cascade";

function makeRecipe(id: string): Recipe {
	return {
		id,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		prompt: "test",
		title: `Recipe ${id}`,
		overview: "",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
	};
}

function makeGroceryList(id: string, recipeIds: string[]): GroceryList {
	return {
		id,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		name: `List ${id}`,
		recipeIds,
		items: [],
		expanded: false,
	};
}

function makeMealPlan(
	id: string,
	recipeIds: Array<string | undefined>,
	groceryListId?: string,
): MealPlan {
	return {
		id,
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		startDate: "2026-01-01",
		endDate: "2026-01-07",
		description: "",
		defaultServings: 4,
		status: "ready",
		entries: recipeIds.map((recipeId, index) => ({
			id: `entry-${index}`,
			day: "2026-01-01",
			mealType: "dinner",
			slotIndex: 0,
			status: recipeId ? "ready" : "suggested",
			suggestedTitle: "x",
			suggestedOverview: "x",
			recipeId,
		})),
		refineInstructions: [],
		groceryListId,
	};
}

describe("resolveRecipeShare", () => {
	it("returns just the recipe", () => {
		const recipe = makeRecipe("r1");
		expect(resolveRecipeShare(recipe)).toEqual({
			recipes: [recipe],
			groceryLists: [],
			mealPlans: [],
		});
	});
});

describe("resolveGroceryListShare", () => {
	it("drags along every recipe the list references", () => {
		const r1 = makeRecipe("r1");
		const r2 = makeRecipe("r2");
		const list = makeGroceryList("l1", ["r1", "r2"]);
		const recipeById = new Map([
			["r1", r1],
			["r2", r2],
		]);

		const cascade = resolveGroceryListShare(list, recipeById);

		expect(cascade.groceryLists).toEqual([list]);
		expect(cascade.recipes).toEqual([r1, r2]);
		expect(cascade.mealPlans).toEqual([]);
	});

	it("skips a recipeId with no matching recipe rather than throwing", () => {
		const list = makeGroceryList("l1", ["missing"]);
		const cascade = resolveGroceryListShare(list, new Map());
		expect(cascade.recipes).toEqual([]);
	});
});

describe("resolveMealPlanShare", () => {
	it("drags along its resolved recipes and derived grocery list", () => {
		const r1 = makeRecipe("r1");
		const list = makeGroceryList("gl1", ["r1"]);
		const plan = makeMealPlan("p1", ["r1", undefined], "gl1");
		const recipeById = new Map([["r1", r1]]);
		const groceryListById = new Map([["gl1", list]]);

		const cascade = resolveMealPlanShare(plan, recipeById, groceryListById);

		expect(cascade.mealPlans).toEqual([plan]);
		expect(cascade.recipes).toEqual([r1]);
		expect(cascade.groceryLists).toEqual([list]);
	});

	it("has no grocery list in the cascade when the plan hasn't built one yet", () => {
		const r1 = makeRecipe("r1");
		const plan = makeMealPlan("p1", ["r1"]);
		const cascade = resolveMealPlanShare(
			plan,
			new Map([["r1", r1]]),
			new Map(),
		);
		expect(cascade.groceryLists).toEqual([]);
	});
});
