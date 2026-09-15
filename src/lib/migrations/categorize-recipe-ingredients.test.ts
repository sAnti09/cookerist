import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Ingredient, Recipe } from "#/lib/recipe";
import { loadRecipes, saveRecipe } from "#/lib/recipes-storage";
import { categorizeIngredients } from "#/server/categorize-ingredients";
import {
	BATCH_SIZE,
	categorizeRecipeIngredients,
} from "./categorize-recipe-ingredients";

vi.mock("#/server/categorize-ingredients", () => ({
	categorizeIngredients: vi.fn(),
}));

const categorizeIngredientsMock = vi.mocked(categorizeIngredients);

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

beforeEach(() => {
	window.localStorage.clear();
	categorizeIngredientsMock.mockReset();
});

describe("categorizeRecipeIngredients", () => {
	it("does nothing and never calls the server function when there are no recipes", async () => {
		await categorizeRecipeIngredients();

		expect(categorizeIngredientsMock).not.toHaveBeenCalled();
	});

	it("does nothing when every recipe has no ingredients", async () => {
		saveRecipe([], makeRecipe({ ingredients: [] }));

		await categorizeRecipeIngredients();

		expect(categorizeIngredientsMock).not.toHaveBeenCalled();
	});

	it("assigns a category and corrects baseName/description onto every matching occurrence", async () => {
		saveRecipe(
			[],
			makeRecipe({
				id: "recipe-1",
				ingredients: [
					makeIngredient({
						id: "ing-1",
						baseName: "chicken",
						description: "breast, raw",
					}),
				],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "chicken breast",
					description: "raw",
					category: "Meat & Seafood",
					approxGramsPerUnit: null,
				},
			],
		});

		await categorizeRecipeIngredients();

		const [recipe] = loadRecipes();
		expect(recipe.ingredients[0]).toMatchObject({
			baseName: "chicken breast",
			description: "raw",
			text: "chicken breast, raw",
			category: "Meat & Seafood",
		});
	});

	it("backfills approxGramsPerUnit onto every matching occurrence", async () => {
		saveRecipe(
			[],
			makeRecipe({
				ingredients: [
					makeIngredient({ baseName: "onion", description: "", unit: "" }),
				],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "onion",
					description: "",
					category: "Produce",
					approxGramsPerUnit: 150,
				},
			],
		});

		await categorizeRecipeIngredients();

		const [recipe] = loadRecipes();
		expect(recipe.ingredients[0].approxGramsPerUnit).toBe(150);
	});

	it("dedupes identical (baseName, description) pairs across recipes into one request item", async () => {
		saveRecipe(
			saveRecipe(
				[],
				makeRecipe({
					id: "recipe-1",
					ingredients: [
						makeIngredient({ baseName: "garlic", description: "" }),
					],
				}),
			),
			makeRecipe({
				id: "recipe-2",
				ingredients: [makeIngredient({ baseName: "garlic", description: "" })],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "garlic",
					description: "",
					category: "Produce",
					approxGramsPerUnit: null,
				},
			],
		});

		await categorizeRecipeIngredients();

		expect(categorizeIngredientsMock).toHaveBeenCalledTimes(1);
		expect(categorizeIngredientsMock.mock.calls[0]?.[0]).toEqual({
			data: { items: [{ id: 0, baseName: "garlic", description: "" }] },
		});
		const [recipeA, recipeB] = loadRecipes();
		const byId = new Map([recipeA, recipeB].map((r) => [r.id, r]));
		expect(byId.get("recipe-1")?.ingredients[0].category).toBe("Produce");
		expect(byId.get("recipe-2")?.ingredients[0].category).toBe("Produce");
	});

	it("falls back to text as the effective baseName for a pre-TEST-255 ingredient with no baseName/description", async () => {
		saveRecipe(
			[],
			makeRecipe({
				ingredients: [
					{
						id: "ing-1",
						text: "shrimp",
						quantity: 1,
						unit: "lb",
						checked: false,
					},
				],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "shrimp",
					description: "",
					category: "Meat & Seafood",
					approxGramsPerUnit: null,
				},
			],
		});

		await categorizeRecipeIngredients();

		expect(categorizeIngredientsMock.mock.calls[0]?.[0]).toEqual({
			data: { items: [{ id: 0, baseName: "shrimp", description: "" }] },
		});
		const [recipe] = loadRecipes();
		expect(recipe.ingredients[0].category).toBe("Meat & Seafood");
	});

	it("splits more than BATCH_SIZE unique ingredients across multiple requests", async () => {
		const ingredients = Array.from({ length: BATCH_SIZE + 5 }, (_, i) =>
			makeIngredient({
				id: `ing-${i}`,
				baseName: `ingredient-${i}`,
				description: "",
			}),
		);
		saveRecipe([], makeRecipe({ ingredients }));
		categorizeIngredientsMock.mockResolvedValue({ type: "success", items: [] });

		await categorizeRecipeIngredients();

		expect(categorizeIngredientsMock).toHaveBeenCalledTimes(2);
		const firstBatch = categorizeIngredientsMock.mock.calls[0]?.[0].data.items;
		const secondBatch = categorizeIngredientsMock.mock.calls[1]?.[0].data.items;
		expect(firstBatch).toHaveLength(BATCH_SIZE);
		expect(secondBatch).toHaveLength(5);
	});

	it("leaves ingredients unmigrated (no throw) when a batch fails", async () => {
		saveRecipe(
			[],
			makeRecipe({
				ingredients: [makeIngredient({ baseName: "garlic", description: "" })],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed categorize-ingredients response from Groq",
		});

		await expect(categorizeRecipeIngredients()).resolves.toBeUndefined();

		const [recipe] = loadRecipes();
		expect(recipe.ingredients[0].category).toBeUndefined();
	});

	it("leaves ingredients unmigrated (no throw) when the server call rejects", async () => {
		saveRecipe(
			[],
			makeRecipe({
				ingredients: [makeIngredient({ baseName: "garlic", description: "" })],
			}),
		);
		categorizeIngredientsMock.mockRejectedValueOnce(new Error("network down"));

		await expect(categorizeRecipeIngredients()).resolves.toBeUndefined();

		const [recipe] = loadRecipes();
		expect(recipe.ingredients[0].category).toBeUndefined();
	});

	it("does not persist anything when no batch produced a usable correction", async () => {
		saveRecipe(
			[],
			makeRecipe({
				ingredients: [makeIngredient({ baseName: "garlic", description: "" })],
			}),
		);
		categorizeIngredientsMock.mockResolvedValueOnce({
			type: "success",
			items: [],
		});
		const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

		await categorizeRecipeIngredients();

		expect(setItem).not.toHaveBeenCalledWith(
			"cookerist:recipes",
			expect.anything(),
		);
		setItem.mockRestore();
	});

	it("leaves an unaffected recipe untouched", async () => {
		const untouchedRecipe = makeRecipe({
			id: "recipe-untouched",
			ingredients: [makeIngredient({ baseName: "untouched", description: "" })],
		});
		saveRecipe(
			saveRecipe([], untouchedRecipe),
			makeRecipe({
				id: "recipe-changed",
				ingredients: [makeIngredient({ baseName: "garlic", description: "" })],
			}),
		);
		const baselineUntouched = loadRecipes().find(
			(r) => r.id === "recipe-untouched",
		);
		categorizeIngredientsMock.mockImplementation(async ({ data }) => ({
			type: "success",
			items: data.items
				.filter((item) => item.baseName === "garlic")
				.map((item) => ({
					...item,
					category: "Produce" as const,
					approxGramsPerUnit: null,
				})),
		}));

		await categorizeRecipeIngredients();

		const recipes = loadRecipes();
		expect(recipes.find((r) => r.id === "recipe-untouched")).toEqual(
			baselineUntouched,
		);
	});
});
