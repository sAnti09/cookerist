import type { RecipeResponse } from "#/lib/groq/schema";
import { combineIngredientName, type Recipe } from "#/lib/recipe";

const STORAGE_KEY = "cookerist:recipes";

function isRecipe(value: unknown): value is Recipe {
	if (typeof value !== "object" || value === null) return false;
	const r = value as Record<string, unknown>;
	return (
		typeof r.id === "string" &&
		typeof r.createdAt === "string" &&
		typeof r.title === "string" &&
		Array.isArray(r.ingredients) &&
		Array.isArray(r.steps)
	);
}

export function loadRecipes(): Recipe[] {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isRecipe).map((recipe) => ({
			...recipe,
			favorite: recipe.favorite ?? false,
			truncated: recipe.truncated ?? false,
			modificationCount: recipe.modificationCount ?? 0,
		}));
	} catch {
		return [];
	}
}

function persist(recipes: Recipe[]): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(recipes));
}

export function saveRecipe(recipe: Recipe): Recipe[] {
	const next = [recipe, ...loadRecipes()];
	persist(next);
	return next;
}

export function deleteRecipe(id: string): Recipe[] {
	const next = loadRecipes().filter((recipe) => recipe.id !== id);
	persist(next);
	return next;
}

export function updateRecipe(recipe: Recipe): Recipe[] {
	const next = loadRecipes().map((r) => (r.id === recipe.id ? recipe : r));
	persist(next);
	return next;
}

// Like updateRecipe, but replaces several recipes in one load/persist cycle —
// used when a single action (e.g. checking a merged grocery item, TEST-242)
// touches ingredients across more than one recipe at once.
export function updateRecipes(recipes: Recipe[]): Recipe[] {
	const byId = new Map(recipes.map((recipe) => [recipe.id, recipe]));
	const next = loadRecipes().map((r) => byId.get(r.id) ?? r);
	persist(next);
	return next;
}

export function setExpandedRecipe(id: string | null): Recipe[] {
	const next = loadRecipes().map((r) => ({ ...r, expanded: r.id === id }));
	persist(next);
	return next;
}

export function toggleFavoriteRecipe(id: string): Recipe[] {
	const next = loadRecipes().map((r) =>
		r.id === id ? { ...r, favorite: !r.favorite } : r,
	);
	persist(next);
	return next;
}

export function toStoredRecipe(
	prompt: string,
	input: RecipeResponse,
	truncated = false,
): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		prompt,
		title: input.title,
		overview: input.overview,
		baseServings: input.baseServings,
		currentServings: input.baseServings,
		difficulty: input.difficulty,
		estimatedMinutes: input.estimatedMinutes,
		ingredients: input.ingredients.map((ingredient) => ({
			id: crypto.randomUUID(),
			text: combineIngredientName(ingredient.baseName, ingredient.description),
			baseName: ingredient.baseName,
			description: ingredient.description,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			checked: false,
		})),
		steps: input.steps.map((step) => ({
			id: crypto.randomUUID(),
			section: step.section,
			text: step.text,
			estimatedMinutes: step.estimatedMinutes ?? null,
			checked: false,
		})),
		expanded: false,
		favorite: false,
		truncated,
		modificationCount: 0,
	};
}
