import type { RecipeResponse } from "#/lib/groq/schema";
import type { Ingredient, Step } from "#/lib/recipe";

// Converts a persisted, display-shape Ingredient/Step back into the wire
// shape Groq expects — shared by calls that describe "what's here already"
// (continuation, modification) rather than generating fresh.
export function toWireIngredient(
	ingredient: Ingredient,
): RecipeResponse["ingredients"][number] {
	return {
		// Ingredients saved before the base name/description split (TEST-255)
		// have neither field — fall back to the full text as the base name
		// with no description.
		baseName: ingredient.baseName ?? ingredient.text,
		description: ingredient.description ?? "",
		quantity: ingredient.quantity,
		unit: ingredient.unit,
	};
}

export function toWireStep(step: Step): RecipeResponse["steps"][number] {
	return {
		section: step.section,
		text: step.text,
		estimatedMinutes: step.estimatedMinutes ?? null,
	};
}
