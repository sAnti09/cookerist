import type { Difficulty, Recipe } from "./recipe";

export type RecipeFilters = {
	search: string;
	difficulty: Difficulty | "all";
	favoritesOnly: boolean;
};

export const DEFAULT_FILTERS: RecipeFilters = {
	search: "",
	difficulty: "all",
	favoritesOnly: false,
};

export function hasActiveFilters(filters: RecipeFilters): boolean {
	return (
		filters.search.trim().length > 0 ||
		filters.difficulty !== "all" ||
		filters.favoritesOnly
	);
}

export function filterRecipes(
	recipes: Recipe[],
	filters: RecipeFilters,
): Recipe[] {
	const query = filters.search.trim().toLowerCase();
	return recipes.filter((recipe) => {
		if (query) {
			const matchesQuery =
				recipe.title.toLowerCase().includes(query) ||
				recipe.prompt.toLowerCase().includes(query);
			if (!matchesQuery) return false;
		}
		if (
			filters.difficulty !== "all" &&
			recipe.difficulty !== filters.difficulty
		) {
			return false;
		}
		if (filters.favoritesOnly && !recipe.favorite) return false;
		return true;
	});
}
