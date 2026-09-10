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

// All mutation helpers below take the caller's current in-memory list rather
// than re-reading and re-normalizing it from localStorage on every call —
// that reload used to run on every single checkbox toggle, parsing and
// reallocating the *entire* stored recipe list for a one-recipe change. The
// in-memory list (already normalized once via loadRecipes() at mount) is the
// same data, so this drops the redundant work without changing behavior.
// Untouched recipes keep their exact object reference so React can skip
// re-rendering rows that didn't change.

export function saveRecipe(recipes: Recipe[], recipe: Recipe): Recipe[] {
	const next = [recipe, ...recipes];
	persist(next);
	return next;
}

export function deleteRecipe(recipes: Recipe[], id: string): Recipe[] {
	const next = recipes.filter((recipe) => recipe.id !== id);
	persist(next);
	return next;
}

export function updateRecipe(recipes: Recipe[], recipe: Recipe): Recipe[] {
	const next = recipes.map((r) => (r.id === recipe.id ? recipe : r));
	persist(next);
	return next;
}

// Like updateRecipe, but replaces several recipes in one persist cycle —
// used when a single action (e.g. checking a merged grocery item, TEST-242)
// touches ingredients across more than one recipe at once.
export function updateRecipes(
	recipes: Recipe[],
	recipesToUpdate: Recipe[],
): Recipe[] {
	const byId = new Map(recipesToUpdate.map((recipe) => [recipe.id, recipe]));
	const next = recipes.map((r) => byId.get(r.id) ?? r);
	persist(next);
	return next;
}

export function setExpandedRecipe(
	recipes: Recipe[],
	id: string | null,
): Recipe[] {
	const next = recipes.map((r) => {
		const expanded = r.id === id;
		return r.expanded === expanded ? r : { ...r, expanded };
	});
	persist(next);
	return next;
}

export function toggleFavoriteRecipe(recipes: Recipe[], id: string): Recipe[] {
	const next = recipes.map((r) =>
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
		caloriesPerServing: input.caloriesPerServing,
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
