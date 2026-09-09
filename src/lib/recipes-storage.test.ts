import { beforeEach, describe, expect, it } from "vitest";
import type { RecipeResponse } from "#/lib/groq/schema";
import {
	deleteRecipe,
	loadRecipes,
	saveRecipe,
	setExpandedRecipe,
	toggleFavoriteRecipe,
	toStoredRecipe,
	updateRecipe,
	updateRecipes,
} from "./recipes-storage";

const recipeInput: RecipeResponse = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy",
	estimatedMinutes: 25,
	ingredients: [
		{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
	],
	steps: [{ section: null, text: "Cook the pasta." }],
};

beforeEach(() => {
	window.localStorage.clear();
});

describe("toStoredRecipe", () => {
	it("builds a full Recipe with client-only fields defaulted", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);

		expect(recipe.prompt).toBe("shrimp pasta for 2");
		expect(recipe.title).toBe(recipeInput.title);
		expect(recipe.currentServings).toBe(recipeInput.baseServings);
		expect(recipe.difficulty).toBe("quick_and_easy");
		expect(recipe.estimatedMinutes).toBe(25);
		expect(recipe.expanded).toBe(false);
		expect(recipe.favorite).toBe(false);
		expect(recipe.truncated).toBe(false);
		expect(recipe.ingredients[0]).toMatchObject({
			text: "shrimp",
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
			checked: false,
		});
		expect(recipe.steps[0]).toMatchObject({
			section: null,
			text: "Cook the pasta.",
			estimatedMinutes: null,
			checked: false,
		});
		expect(recipe.id).toBeTruthy();
		expect(recipe.ingredients[0].id).toBeTruthy();
		expect(recipe.steps[0].id).toBeTruthy();
	});

	it("marks the recipe truncated when the caller passes true", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput, true);

		expect(recipe.truncated).toBe(true);
	});

	it("carries through a step's estimated duration when Groq provides one", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", {
			...recipeInput,
			steps: [
				{ section: "Cook", text: "Simmer the sauce.", estimatedMinutes: 10 },
			],
		});

		expect(recipe.steps[0]).toMatchObject({ estimatedMinutes: 10 });
	});

	it("combines base name + description into the display text (TEST-255 AC2)", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", {
			...recipeInput,
			ingredients: [
				{
					baseName: "garlic",
					description: "chopped",
					quantity: 2,
					unit: "cloves",
				},
			],
		});

		expect(recipe.ingredients[0]).toMatchObject({
			text: "garlic, chopped",
			baseName: "garlic",
			description: "chopped",
		});
	});
});

describe("loadRecipes / saveRecipe", () => {
	it("round-trips a saved recipe through localStorage", () => {
		expect(loadRecipes()).toEqual([]);

		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(loadRecipes()).toEqual([recipe]);
	});

	it("prepends new recipes so the list stays reverse-chronological", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);

		saveRecipe(first);
		saveRecipe(second);

		expect(loadRecipes().map((r) => r.prompt)).toEqual([
			"second prompt",
			"first prompt",
		]);
	});

	it("ignores corrupt localStorage content instead of throwing", () => {
		window.localStorage.setItem("cookerist:recipes", "not valid json");

		expect(loadRecipes()).toEqual([]);
	});

	it("filters out entries that aren't shaped like a Recipe", () => {
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([{ not: "a recipe" }]),
		);

		expect(loadRecipes()).toEqual([]);
	});

	it("filters out non-object and null entries", () => {
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify(["not an object", null, 42]),
		);

		expect(loadRecipes()).toEqual([]);
	});

	it("returns an empty list when nothing is stored", () => {
		expect(loadRecipes()).toEqual([]);
	});

	it("returns an empty list when the stored value isn't an array", () => {
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify({ foo: "bar" }),
		);

		expect(loadRecipes()).toEqual([]);
	});

	it("loads pre-existing recipes saved before difficulty/estimatedMinutes existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { difficulty, estimatedMinutes, ...withoutNewFields } = legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutNewFields]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].difficulty).toBeUndefined();
		expect(loaded[0].estimatedMinutes).toBeUndefined();
	});

	it("defaults favorite to false for recipes saved before it existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { favorite, ...withoutFavorite } = legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutFavorite]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].favorite).toBe(false);
	});

	it("loads pre-existing recipes whose ingredients predate the base name/description split without crashing (TEST-255)", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { baseName, description, ...legacyIngredient } =
			legacyRecipe.ingredients[0];
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([{ ...legacyRecipe, ingredients: [legacyIngredient] }]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].ingredients[0].baseName).toBeUndefined();
		expect(loaded[0].ingredients[0].description).toBeUndefined();
		expect(loaded[0].ingredients[0].text).toBe("shrimp");
	});

	it("defaults truncated to false for recipes saved before it existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { truncated, ...withoutTruncated } = legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutTruncated]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].truncated).toBe(false);
	});
});

describe("deleteRecipe", () => {
	it("removes the matching recipe and persists the rest", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		saveRecipe(first);
		saveRecipe(second);

		const result = deleteRecipe(first.id);

		expect(result).toEqual([second]);
		expect(loadRecipes()).toEqual([second]);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(deleteRecipe("not-a-real-id")).toEqual([recipe]);
	});
});

describe("updateRecipe", () => {
	it("replaces the matching recipe in place and persists it", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		saveRecipe(first);
		saveRecipe(second);

		const updatedFirst = { ...first, currentServings: 4 };
		const result = updateRecipe(updatedFirst);

		expect(result).toEqual([second, updatedFirst]);
		expect(loadRecipes()).toEqual([second, updatedFirst]);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(updateRecipe({ ...recipe, id: "not-a-real-id" })).toEqual([recipe]);
	});
});

describe("updateRecipes", () => {
	it("replaces multiple matching recipes in one call and persists all of them", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const third = toStoredRecipe("third prompt", recipeInput);
		saveRecipe(first);
		saveRecipe(second);
		saveRecipe(third);

		const updatedFirst = { ...first, currentServings: 4 };
		const updatedThird = { ...third, currentServings: 6 };
		const result = updateRecipes([updatedFirst, updatedThird]);

		expect(result).toEqual([updatedThird, second, updatedFirst]);
		expect(loadRecipes()).toEqual(result);
	});

	it("is a no-op for ids that aren't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(updateRecipes([{ ...recipe, id: "not-a-real-id" }])).toEqual([
			recipe,
		]);
	});

	it("returns the unmodified list when passed no recipes", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(updateRecipes([])).toEqual([recipe]);
	});
});

describe("setExpandedRecipe", () => {
	it("expands the matching recipe and collapses every other one", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		saveRecipe({ ...first, expanded: true });
		saveRecipe(second);

		const result = setExpandedRecipe(second.id);

		expect(result.find((r) => r.id === first.id)?.expanded).toBe(false);
		expect(result.find((r) => r.id === second.id)?.expanded).toBe(true);
		expect(loadRecipes()).toEqual(result);
	});

	it("collapses everything when passed null", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe({ ...recipe, expanded: true });

		const result = setExpandedRecipe(null);

		expect(result.every((r) => r.expanded === false)).toBe(true);
	});
});

describe("toggleFavoriteRecipe", () => {
	it("flips the matching recipe's favorite state and persists it", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		saveRecipe(first);
		saveRecipe(second);

		const result = toggleFavoriteRecipe(first.id);

		expect(result.find((r) => r.id === first.id)?.favorite).toBe(true);
		expect(result.find((r) => r.id === second.id)?.favorite).toBe(false);
		expect(loadRecipes()).toEqual(result);
	});

	it("toggles back to false on a second call", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		toggleFavoriteRecipe(recipe.id);
		const result = toggleFavoriteRecipe(recipe.id);

		expect(result[0].favorite).toBe(false);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		saveRecipe(recipe);

		expect(toggleFavoriteRecipe("not-a-real-id")).toEqual([recipe]);
	});
});
