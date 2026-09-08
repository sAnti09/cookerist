import type { RecipeResponse } from "#/lib/groq/schema";
import type { Recipe } from "#/lib/recipe";

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
		return parsed.filter(isRecipe);
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

export function toStoredRecipe(prompt: string, input: RecipeResponse): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		prompt,
		title: input.title,
		overview: input.overview,
		baseServings: input.baseServings,
		currentServings: input.baseServings,
		ingredients: input.ingredients.map((ingredient) => ({
			id: crypto.randomUUID(),
			text: ingredient.text,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			checked: false,
		})),
		steps: input.steps.map((step) => ({
			id: crypto.randomUUID(),
			section: step.section,
			text: step.text,
			checked: false,
		})),
		expanded: false,
	};
}
