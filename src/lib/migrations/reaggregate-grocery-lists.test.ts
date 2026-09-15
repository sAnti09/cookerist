import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import { loadGroceryLists, saveGroceryList } from "#/lib/grocery-storage";
import type { Ingredient, Recipe } from "#/lib/recipe";
import { saveRecipe } from "#/lib/recipes-storage";
import { reaggregateGroceryLists } from "./reaggregate-grocery-lists";

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
	return {
		id: crypto.randomUUID(),
		text: "chicken breast",
		baseName: "chicken breast",
		description: "",
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
		text: "shrimp",
		quantity: 1,
		unit: "kg",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		name: "Weeknight Shopping",
		recipeIds: [],
		items: [],
		expanded: false,
		...overrides,
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("reaggregateGroceryLists", () => {
	it("does nothing when there are no stored grocery lists", () => {
		expect(() => reaggregateGroceryLists()).not.toThrow();
		expect(loadGroceryLists()).toEqual([]);
	});

	it("picks up a category corrected on the recipe since the list was created", () => {
		const recipe = makeRecipe({
			id: "recipe-1",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					baseName: "chicken breast",
					category: "Meat & Seafood",
				}),
			],
		});
		saveRecipe([], recipe);
		saveGroceryList(
			[],
			makeList({
				recipeIds: ["recipe-1"],
				items: [
					makeItem({
						text: "chicken breast",
						quantity: 1,
						unit: "kg",
						source: "recipe",
						origins: [{ recipeId: "recipe-1", ingredientId: "ing-1" }],
						// No category — this is what the list looked like before the
						// recipe was corrected/tagged.
					}),
				],
			}),
		);

		reaggregateGroceryLists();

		const [list] = loadGroceryLists();
		expect(list.items[0].category).toBe("Meat & Seafood");
	});

	it("preserves checked state by matching on text+unit, even though item ids are regenerated", () => {
		const recipe = makeRecipe({
			id: "recipe-1",
			ingredients: [
				makeIngredient({ id: "ing-1", baseName: "garlic", unit: "cloves" }),
			],
		});
		saveRecipe([], recipe);
		const originalItem = makeItem({
			text: "garlic",
			unit: "cloves",
			quantity: 1,
			checked: true,
			source: "recipe",
		});
		saveGroceryList(
			[],
			makeList({ recipeIds: ["recipe-1"], items: [originalItem] }),
		);

		reaggregateGroceryLists();

		const [list] = loadGroceryLists();
		expect(list.items[0].checked).toBe(true);
		expect(list.items[0].id).not.toBe(originalItem.id);
	});

	it("keeps custom ingredients on a mixed list", () => {
		const recipe = makeRecipe({
			id: "recipe-1",
			ingredients: [makeIngredient({ id: "ing-1", baseName: "shrimp" })],
		});
		saveRecipe([], recipe);
		saveGroceryList(
			[],
			makeList({
				recipeIds: ["recipe-1"],
				items: [
					makeItem({ text: "shrimp", source: "recipe" }),
					makeItem({
						id: "custom-1",
						text: "paper towels",
						quantity: 2,
						unit: "rolls",
						source: "custom",
					}),
				],
			}),
		);

		reaggregateGroceryLists();

		const [list] = loadGroceryLists();
		expect(list.items.some((item) => item.text === "paper towels")).toBe(true);
	});

	it("skips a purely custom list (no recipes) without rewriting it", () => {
		const customList = makeList({
			recipeIds: [],
			items: [
				makeItem({
					id: "custom-1",
					text: "napkins",
					quantity: 1,
					unit: "pack",
					source: "custom",
				}),
			],
		});
		saveGroceryList([], customList);
		const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

		reaggregateGroceryLists();

		expect(setItem).not.toHaveBeenCalledWith(
			"cookerist:grocery-lists",
			expect.anything(),
		);
		expect(loadGroceryLists()[0]).toEqual(customList);
		setItem.mockRestore();
	});

	it("drops items from a recipe that no longer exists, same as a manual edit+save would", () => {
		saveGroceryList(
			[],
			makeList({
				recipeIds: ["deleted-recipe"],
				items: [makeItem({ text: "shrimp", source: "recipe" })],
			}),
		);

		reaggregateGroceryLists();

		const [list] = loadGroceryLists();
		expect(list.items).toEqual([]);
	});

	it("re-aggregates every recipe-backed list in one pass", () => {
		saveRecipe(
			[],
			makeRecipe({
				id: "recipe-1",
				ingredients: [makeIngredient({ id: "ing-1", baseName: "shrimp" })],
			}),
		);
		saveGroceryList(
			saveGroceryList(
				[],
				makeList({
					id: "list-1",
					recipeIds: ["recipe-1"],
					items: [makeItem({ text: "shrimp", source: "recipe" })],
				}),
			),
			makeList({
				id: "list-2",
				recipeIds: ["recipe-1"],
				items: [makeItem({ text: "shrimp", source: "recipe" })],
			}),
		);

		reaggregateGroceryLists();

		const lists = loadGroceryLists();
		expect(lists.find((l) => l.id === "list-1")?.items).toHaveLength(1);
		expect(lists.find((l) => l.id === "list-2")?.items).toHaveLength(1);
	});
});
