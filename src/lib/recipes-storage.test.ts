import { beforeEach, describe, expect, it } from "vitest";
import type { RecipeResponse } from "#/lib/groq/schema";
import {
	deleteRecipe,
	loadRecipes,
	saveRecipe,
	setExpandedRecipe,
	toStoredRecipe,
	updateRecipe,
} from "./recipes-storage";

const recipeInput: RecipeResponse = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	ingredients: [{ text: "shrimp", quantity: 300, unit: "g" }],
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
		expect(recipe.expanded).toBe(false);
		expect(recipe.ingredients[0]).toMatchObject({
			text: "shrimp",
			quantity: 300,
			unit: "g",
			checked: false,
		});
		expect(recipe.steps[0]).toMatchObject({
			section: null,
			text: "Cook the pasta.",
			checked: false,
		});
		expect(recipe.id).toBeTruthy();
		expect(recipe.ingredients[0].id).toBeTruthy();
		expect(recipe.steps[0].id).toBeTruthy();
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
