import { beforeEach, describe, expect, it } from "vitest";
import type { RecipeResponse } from "#/lib/groq/schema";
import {
	deleteRecipe,
	loadRecipes,
	recordThumbnailAttemptFailure,
	saveRecipe,
	setExpandedRecipe,
	setRecipeThumbnail,
	toggleFavoriteRecipe,
	toStoredRecipe,
	updateRecipe,
	updateRecipes,
	upsertRecipes,
} from "./recipes-storage";

const recipeInput: RecipeResponse = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy",
	estimatedMinutes: 25,
	caloriesPerServing: 620,
	ingredients: [
		{
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
			category: "Meat & Seafood",
			approxGramsPerUnit: null,
		},
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
		expect(recipe.caloriesPerServing).toBe(620);
		expect(recipe.expanded).toBe(false);
		expect(recipe.favorite).toBe(false);
		expect(recipe.truncated).toBe(false);
		expect(recipe.modificationCount).toBe(0);
		expect(recipe.thumbnailUrl).toBeNull();
		expect(recipe.thumbnailAttempts).toBe(0);
		expect(recipe.ingredients[0]).toMatchObject({
			text: "shrimp",
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
			category: "Meat & Seafood",
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
					category: "Produce",
					approxGramsPerUnit: null,
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
		saveRecipe([], recipe);

		expect(loadRecipes()).toEqual([recipe]);
	});

	it("prepends new recipes so the list stays reverse-chronological", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);

		const afterFirst = saveRecipe([], first);
		saveRecipe(afterFirst, second);

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

	it("loads pre-existing recipes saved before caloriesPerServing existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { caloriesPerServing, ...withoutCalories } = legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutCalories]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].caloriesPerServing).toBeUndefined();
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

	it("defaults modificationCount to 0 for recipes saved before it existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { modificationCount, ...withoutModificationCount } = legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutModificationCount]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].modificationCount).toBe(0);
	});

	it("defaults thumbnailUrl to null and thumbnailAttempts to 0 for recipes saved before they existed", () => {
		const legacyRecipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { thumbnailUrl, thumbnailAttempts, ...withoutThumbnailFields } =
			legacyRecipe;
		window.localStorage.setItem(
			"cookerist:recipes",
			JSON.stringify([withoutThumbnailFields]),
		);

		const loaded = loadRecipes();

		expect(loaded).toHaveLength(1);
		expect(loaded[0].thumbnailUrl).toBeNull();
		expect(loaded[0].thumbnailAttempts).toBe(0);
	});
});

describe("deleteRecipe", () => {
	it("removes the matching recipe and persists the rest", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const afterFirst = saveRecipe([], first);
		const afterSecond = saveRecipe(afterFirst, second);

		const result = deleteRecipe(afterSecond, first.id);

		expect(result).toEqual([second]);
		expect(loadRecipes()).toEqual([second]);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(deleteRecipe(recipes, "not-a-real-id")).toEqual([recipe]);
	});
});

describe("updateRecipe", () => {
	it("replaces the matching recipe in place and persists it", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const afterFirst = saveRecipe([], first);
		const afterSecond = saveRecipe(afterFirst, second);

		const updatedFirst = { ...first, currentServings: 4 };
		const result = updateRecipe(afterSecond, updatedFirst);

		// updateRecipe stamps a fresh updatedAt (see touch() in
		// recipes-storage.ts), so compare everything else exactly and just
		// sanity-check updatedAt moved forward.
		expect(result).toEqual([
			second,
			{ ...updatedFirst, updatedAt: result[1]?.updatedAt },
		]);
		expect(result[1]?.updatedAt >= first.updatedAt).toBe(true);
		expect(loadRecipes()).toEqual(result);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(updateRecipe(recipes, { ...recipe, id: "not-a-real-id" })).toEqual([
			recipe,
		]);
	});

	it("keeps every other recipe's object reference unchanged (perf: avoids re-rendering unrelated rows)", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const recipes = saveRecipe(saveRecipe([], first), second);

		const result = updateRecipe(recipes, { ...first, currentServings: 4 });

		expect(result.find((r) => r.id === second.id)).toBe(second);
	});
});

describe("updateRecipes", () => {
	it("replaces multiple matching recipes in one call and persists all of them", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const third = toStoredRecipe("third prompt", recipeInput);
		const afterFirst = saveRecipe([], first);
		const afterSecond = saveRecipe(afterFirst, second);
		const afterThird = saveRecipe(afterSecond, third);

		const updatedFirst = { ...first, currentServings: 4 };
		const updatedThird = { ...third, currentServings: 6 };
		const result = updateRecipes(afterThird, [updatedFirst, updatedThird]);

		// updateRecipes stamps a fresh updatedAt per recipe (see touch() in
		// recipes-storage.ts), so compare everything else exactly and just
		// sanity-check updatedAt moved forward for both.
		expect(result).toEqual([
			{ ...updatedThird, updatedAt: result[0]?.updatedAt },
			second,
			{ ...updatedFirst, updatedAt: result[2]?.updatedAt },
		]);
		expect(result[0]?.updatedAt >= third.updatedAt).toBe(true);
		expect(result[2]?.updatedAt >= first.updatedAt).toBe(true);
		expect(loadRecipes()).toEqual(result);
	});

	it("is a no-op for ids that aren't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(
			updateRecipes(recipes, [{ ...recipe, id: "not-a-real-id" }]),
		).toEqual([recipe]);
	});

	it("returns the unmodified list when passed no recipes", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(updateRecipes(recipes, [])).toEqual([recipe]);
	});
});

describe("setExpandedRecipe", () => {
	it("expands the matching recipe and collapses every other one", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const afterFirst = saveRecipe([], { ...first, expanded: true });
		const afterSecond = saveRecipe(afterFirst, second);

		const result = setExpandedRecipe(afterSecond, second.id);

		expect(result.find((r) => r.id === first.id)?.expanded).toBe(false);
		expect(result.find((r) => r.id === second.id)?.expanded).toBe(true);
		expect(loadRecipes()).toEqual(result);
	});

	it("collapses everything when passed null", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], { ...recipe, expanded: true });

		const result = setExpandedRecipe(recipes, null);

		expect(result.every((r) => r.expanded === false)).toBe(true);
	});

	it("keeps recipes whose expanded state doesn't change referentially identical (perf)", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const third = toStoredRecipe("third prompt", recipeInput);
		const recipes = saveRecipe(
			saveRecipe(saveRecipe([], first), second),
			third,
		);
		const firstBefore = recipes.find((r) => r.id === first.id);

		const expandedSecond = setExpandedRecipe(recipes, second.id);
		const expandedThird = setExpandedRecipe(expandedSecond, third.id);

		expect(expandedThird.find((r) => r.id === first.id)).toBe(firstBefore);
	});
});

describe("toggleFavoriteRecipe", () => {
	it("flips the matching recipe's favorite state and persists it", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const afterFirst = saveRecipe([], first);
		const afterSecond = saveRecipe(afterFirst, second);

		const result = toggleFavoriteRecipe(afterSecond, first.id);

		expect(result.find((r) => r.id === first.id)?.favorite).toBe(true);
		expect(result.find((r) => r.id === second.id)?.favorite).toBe(false);
		expect(loadRecipes()).toEqual(result);
	});

	it("toggles back to false on a second call", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		const afterFirstToggle = toggleFavoriteRecipe(recipes, recipe.id);
		const result = toggleFavoriteRecipe(afterFirstToggle, recipe.id);

		expect(result[0].favorite).toBe(false);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(toggleFavoriteRecipe(recipes, "not-a-real-id")).toEqual([recipe]);
	});
});

describe("setRecipeThumbnail", () => {
	it("sets the matching recipe's thumbnailUrl and persists it", () => {
		const first = toStoredRecipe("first prompt", recipeInput);
		const second = toStoredRecipe("second prompt", recipeInput);
		const afterFirst = saveRecipe([], first);
		const afterSecond = saveRecipe(afterFirst, second);

		const result = setRecipeThumbnail(
			afterSecond,
			first.id,
			"https://example.com/r1.png",
		);

		expect(result.find((r) => r.id === first.id)?.thumbnailUrl).toBe(
			"https://example.com/r1.png",
		);
		expect(result.find((r) => r.id === second.id)?.thumbnailUrl).toBeNull();
		expect(loadRecipes()).toEqual(result);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(
			setRecipeThumbnail(recipes, "not-a-real-id", "https://example.com/x.png"),
		).toEqual([recipe]);
	});
});

describe("recordThumbnailAttemptFailure", () => {
	it("increments the matching recipe's thumbnailAttempts and persists it", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		const result = recordThumbnailAttemptFailure(recipes, recipe.id);

		expect(result[0].thumbnailAttempts).toBe(1);
		expect(loadRecipes()).toEqual(result);
	});

	it("accumulates across repeated calls", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		const once = recordThumbnailAttemptFailure(recipes, recipe.id);
		const twice = recordThumbnailAttemptFailure(once, recipe.id);

		expect(twice[0].thumbnailAttempts).toBe(2);
	});

	it("treats a missing thumbnailAttempts (pre-existing recipe) as starting from 0", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const { thumbnailAttempts, ...withoutAttempts } = recipe;
		const recipes = saveRecipe([], withoutAttempts as typeof recipe);

		const result = recordThumbnailAttemptFailure(recipes, recipe.id);

		expect(result[0].thumbnailAttempts).toBe(1);
	});

	it("is a no-op when the id isn't found", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		expect(recordThumbnailAttemptFailure(recipes, "not-a-real-id")).toEqual([
			recipe,
		]);
	});
});

describe("upsertRecipes", () => {
	it("does nothing and returns the same array when there's nothing to upsert", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const recipes = saveRecipe([], recipe);

		const result = upsertRecipes(recipes, []);

		expect(result).toBe(recipes);
	});

	it("inserts a new recipe not previously known locally", () => {
		const existing = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const incoming = {
			...toStoredRecipe("garlic bread", recipeInput),
			id: "new-one",
		};

		const result = upsertRecipes([existing], [incoming]);

		expect(result.map((r) => r.id).sort()).toEqual(
			[existing.id, "new-one"].sort(),
		);
	});

	it("replaces an existing recipe by id", () => {
		const original = toStoredRecipe("shrimp pasta for 2", recipeInput);
		const updated = { ...original, title: "Updated Title" };

		const result = upsertRecipes([original], [updated]);

		expect(result).toHaveLength(1);
		expect(result[0]?.title).toBe("Updated Title");
	});

	it("persists the merged result to localStorage", () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", recipeInput);

		upsertRecipes([], [recipe]);

		expect(loadRecipes().map((r) => r.id)).toEqual([recipe.id]);
	});

	it("sorts the result newest-first by createdAt", () => {
		const older = {
			...toStoredRecipe("shrimp pasta for 2", recipeInput),
			id: "older",
			createdAt: "2026-01-01T00:00:00.000Z",
		};
		const newer = {
			...toStoredRecipe("shrimp pasta for 2", recipeInput),
			id: "newer",
			createdAt: "2026-01-05T00:00:00.000Z",
		};

		const result = upsertRecipes([older], [newer]);

		expect(result.map((r) => r.id)).toEqual(["newer", "older"]);
	});
});
