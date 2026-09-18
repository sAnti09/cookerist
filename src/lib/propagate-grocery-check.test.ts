import { describe, expect, it } from "vitest";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import type { Ingredient, Recipe } from "#/lib/recipe";
import {
	applyGroceryItemsCheckedToRecipes,
	toggleGroceryListItem,
} from "./propagate-grocery-check";

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
	return {
		id: crypto.randomUUID(),
		text: "chicken",
		quantity: 1,
		unit: "kg",
		checked: false,
		...overrides,
	};
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		prompt: "a dish",
		title: "A Dish",
		overview: "overview",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
	return {
		id: crypto.randomUUID(),
		text: "chicken",
		quantity: 1,
		unit: "kg",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

describe("applyGroceryItemsCheckedToRecipes", () => {
	it("checks the source ingredient in a single source recipe", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a" })],
		});
		const item = makeItem({
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-a" }],
		});

		const result = applyGroceryItemsCheckedToRecipes([recipe], [item], true);

		expect(result).toHaveLength(1);
		expect(result[0].ingredients[0].checked).toBe(true);
	});

	it("checks the matching ingredient in every source recipe for an item merged across recipes", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a" })],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [makeIngredient({ id: "ing-b" })],
		});
		const item = makeItem({
			origins: [
				{ recipeId: "recipe-a", ingredientId: "ing-a" },
				{ recipeId: "recipe-b", ingredientId: "ing-b" },
			],
		});

		const result = applyGroceryItemsCheckedToRecipes(
			[recipeA, recipeB],
			[item],
			true,
		);

		expect(result).toHaveLength(2);
		expect(
			result.find((r) => r.id === "recipe-a")?.ingredients[0].checked,
		).toBe(true);
		expect(
			result.find((r) => r.id === "recipe-b")?.ingredients[0].checked,
		).toBe(true);
	});

	it("unchecks the source ingredient when checked is false", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a", checked: true })],
		});
		const item = makeItem({
			checked: true,
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-a" }],
		});

		const result = applyGroceryItemsCheckedToRecipes([recipe], [item], false);

		expect(result[0].ingredients[0].checked).toBe(false);
	});

	it("leaves unrelated ingredients in the same recipe untouched", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-a" }),
				makeIngredient({ id: "ing-other", text: "salt" }),
			],
		});
		const item = makeItem({
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-a" }],
		});

		const result = applyGroceryItemsCheckedToRecipes([recipe], [item], true);

		expect(
			result[0].ingredients.find((i) => i.id === "ing-other")?.checked,
		).toBe(false);
	});

	it("returns no changed recipes for a custom item", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a" })],
		});
		const item = makeItem({ source: "custom", origins: undefined });

		const result = applyGroceryItemsCheckedToRecipes([recipe], [item], true);

		expect(result).toEqual([]);
	});

	it("merges multiple items touching the same recipe into one updated recipe", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-a" }),
				makeIngredient({ id: "ing-b", text: "salt" }),
			],
		});
		const itemA = makeItem({
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-a" }],
		});
		const itemB = makeItem({
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-b" }],
		});

		const result = applyGroceryItemsCheckedToRecipes(
			[recipe],
			[itemA, itemB],
			true,
		);

		expect(result).toHaveLength(1);
		expect(result[0].ingredients.every((i) => i.checked)).toBe(true);
	});

	it("does not include recipes with no matching origins", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a" })],
		});
		const item = makeItem({
			origins: [{ recipeId: "recipe-b", ingredientId: "ing-x" }],
		});

		const result = applyGroceryItemsCheckedToRecipes([recipe], [item], true);

		expect(result).toEqual([]);
	});

	it("returns an empty array for an empty items list", () => {
		const recipe = makeRecipe({ id: "recipe-a" });

		expect(applyGroceryItemsCheckedToRecipes([recipe], [], true)).toEqual([]);
	});
});

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		name: "Weeknight Shopping",
		recipeIds: [],
		items: [],
		expanded: true,
		...overrides,
	};
}

describe("toggleGroceryListItem", () => {
	it("flips the item's checked state and propagates it to its source recipe", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a" })],
		});
		const item = makeItem({
			id: "item-1",
			checked: false,
			origins: [{ recipeId: "recipe-a", ingredientId: "ing-a" }],
		});
		const list = makeList({ items: [item] });

		const result = toggleGroceryListItem(list, [recipe], "item-1");

		expect(result?.list.items[0].checked).toBe(true);
		expect(result?.affectedRecipes[0].ingredients[0].checked).toBe(true);
	});

	it("does not touch other items in the list", () => {
		const itemA = makeItem({ id: "item-1", checked: false, text: "onion" });
		const itemB = makeItem({ id: "item-2", checked: false, text: "garlic" });
		const list = makeList({ items: [itemA, itemB] });

		const result = toggleGroceryListItem(list, [], "item-1");

		expect(result?.list.items[1]).toBe(itemB);
	});

	it("returns null for an id that isn't in the list", () => {
		const list = makeList({ items: [makeItem({ id: "item-1" })] });

		expect(toggleGroceryListItem(list, [], "missing")).toBeNull();
	});
});
