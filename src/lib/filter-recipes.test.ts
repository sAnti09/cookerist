import { describe, expect, it } from "vitest";
import {
	DEFAULT_FILTERS,
	filterRecipes,
	hasActiveFilters,
	type RecipeFilters,
} from "./filter-recipes";
import type { Recipe } from "./recipe";

function recipe(overrides: Partial<Recipe>): Recipe {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		createdAt: "2026-01-01T00:00:00.000Z",
		prompt: "shrimp pasta for 2",
		title: "Garlic Butter Shrimp Pasta",
		overview: "A quick, creamy shrimp pasta.",
		baseServings: 2,
		currentServings: 2,
		difficulty: "quick_and_easy",
		estimatedMinutes: 25,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

describe("filterRecipes", () => {
	it("returns everything when no filters are active", () => {
		const recipes = [recipe({ id: "a" }), recipe({ id: "b" })];

		expect(filterRecipes(recipes, DEFAULT_FILTERS)).toEqual(recipes);
	});

	it("matches search against the title, case-insensitively", () => {
		const target = recipe({ title: "Garlic Butter Shrimp Pasta" });
		const other = recipe({ title: "Beef Tacos", prompt: "quick tacos" });

		expect(
			filterRecipes([target, other], { ...DEFAULT_FILTERS, search: "shrimp" }),
		).toEqual([target]);
		expect(
			filterRecipes([target, other], { ...DEFAULT_FILTERS, search: "SHRIMP" }),
		).toEqual([target]);
	});

	it("matches search against the original prompt", () => {
		const target = recipe({
			title: "Garlic Butter Shrimp Pasta",
			prompt: "something spicy for date night",
		});
		const other = recipe({ title: "Beef Tacos", prompt: "quick tacos" });

		expect(
			filterRecipes([target, other], {
				...DEFAULT_FILTERS,
				search: "date night",
			}),
		).toEqual([target]);
	});

	it("trims whitespace from the search query", () => {
		const target = recipe({ title: "Beef Tacos" });

		expect(
			filterRecipes([target], { ...DEFAULT_FILTERS, search: "  tacos  " }),
		).toEqual([target]);
	});

	it("filters by difficulty, and 'all' clears the filter", () => {
		const easy = recipe({ id: "a", difficulty: "quick_and_easy" });
		const hard = recipe({ id: "b", difficulty: "hard" });

		expect(
			filterRecipes([easy, hard], { ...DEFAULT_FILTERS, difficulty: "hard" }),
		).toEqual([hard]);
		expect(
			filterRecipes([easy, hard], { ...DEFAULT_FILTERS, difficulty: "all" }),
		).toEqual([easy, hard]);
	});

	it("excludes recipes with no difficulty when a difficulty filter is active", () => {
		const legacy = recipe({ difficulty: undefined });

		expect(
			filterRecipes([legacy], { ...DEFAULT_FILTERS, difficulty: "hard" }),
		).toEqual([]);
	});

	it("filters to favorites only when enabled", () => {
		const favorited = recipe({ id: "a", favorite: true });
		const notFavorited = recipe({ id: "b", favorite: false });

		expect(
			filterRecipes([favorited, notFavorited], {
				...DEFAULT_FILTERS,
				favoritesOnly: true,
			}),
		).toEqual([favorited]);
	});

	it("combines filters with AND logic", () => {
		const match = recipe({
			id: "a",
			title: "Garlic Butter Shrimp Pasta",
			difficulty: "quick_and_easy",
			favorite: true,
		});
		const wrongDifficulty = recipe({
			id: "b",
			title: "Garlic Shrimp Stir Fry",
			difficulty: "hard",
			favorite: true,
		});
		const notFavorited = recipe({
			id: "c",
			title: "Garlic Shrimp Skillet",
			difficulty: "quick_and_easy",
			favorite: false,
		});

		const filters: RecipeFilters = {
			search: "shrimp",
			difficulty: "quick_and_easy",
			favoritesOnly: true,
		};

		expect(
			filterRecipes([match, wrongDifficulty, notFavorited], filters),
		).toEqual([match]);
	});
});

describe("hasActiveFilters", () => {
	it("is false for the default filters", () => {
		expect(hasActiveFilters(DEFAULT_FILTERS)).toBe(false);
	});

	it("is false when search is only whitespace", () => {
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: "   " })).toBe(false);
	});

	it("is true when any filter deviates from default", () => {
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, search: "tacos" })).toBe(
			true,
		);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, difficulty: "hard" })).toBe(
			true,
		);
		expect(hasActiveFilters({ ...DEFAULT_FILTERS, favoritesOnly: true })).toBe(
			true,
		);
	});
});
