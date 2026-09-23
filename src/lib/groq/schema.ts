import { z } from "zod";
import {
	DEFAULT_GROCERY_CATEGORY,
	GROCERY_CATEGORIES,
} from "#/lib/grocery-category";
import { MEAL_TYPES } from "#/lib/meal-plan";

export const onTopicResponseSchema = z.object({
	on_topic: z.boolean(),
});

export const dishIdentificationResponseSchema = z.object({
	is_food: z.boolean(),
	description: z.string(),
});

export type DishIdentificationResponse = z.infer<
	typeof dishIdentificationResponseSchema
>;

export const difficultySchema = z.enum([
	"quick_and_easy",
	"intermediate",
	"hard",
]);

// `.catch()` falls back to "Other" for a missing/unrecognized value instead
// of failing the whole ingredient (and thus the whole recipe) over one bad
// category tag — this field is a display grouping nicety, not something
// worth rejecting an otherwise-good recipe for.
export const groceryCategorySchema = z
	.enum(GROCERY_CATEGORIES)
	.catch(DEFAULT_GROCERY_CATEGORY);

// `.catch(null)` falls back to "no estimate" for a missing/invalid value —
// same reasoning as category above, this is a nicety (lets a unitless count
// ingredient bridge to an approximate weight, see aggregate-grocery-items.ts)
// never worth rejecting an otherwise-good recipe over.
export const approxGramsPerUnitSchema = z
	.number()
	.positive()
	.nullable()
	.catch(null);

// `.catch("linear")` defaults to "linear" for missing or unrecognized values —
// bulk ingredients (linear) are the safe default, so a missing or malformed
// tag scales 1:1 rather than dampening unexpectedly.
export const scalingClassSchema = z
	.enum(["linear", "sublinear"])
	.catch("linear");

const ingredientItemSchema = z.object({
	baseName: z.string().min(1),
	description: z.string(),
	quantity: z.number().nonnegative(),
	unit: z.string(),
	category: groceryCategorySchema,
	approxGramsPerUnit: approxGramsPerUnitSchema,
	scalingClass: scalingClassSchema,
});

const stepItemSchema = z.object({
	section: z.string().nullable(),
	text: z.string().min(1),
	// Only present for inherently time-based steps (e.g. simmering, baking,
	// resting) — see TEST-258. Absent/null for most steps.
	estimatedMinutes: z.number().positive().nullable().optional(),
});

export const recipeResponseSchema = z.object({
	title: z.string().min(1),
	overview: z.string().min(1),
	baseServings: z.number().positive(),
	difficulty: difficultySchema,
	estimatedMinutes: z.number().positive(),
	caloriesPerServing: z.number().positive(),
	ingredients: z.array(ingredientItemSchema).min(1),
	steps: z.array(stepItemSchema).min(1),
});

export type RecipeResponse = z.infer<typeof recipeResponseSchema>;

// Used by the continuation call (TEST-243) that asks Groq for only the
// remaining ingredients/steps after a truncated response — both arrays are
// allowed to be empty since a given continuation might only need to finish
// one of the two.
export const recipeContinuationResponseSchema = z.object({
	ingredients: z.array(ingredientItemSchema),
	steps: z.array(stepItemSchema),
});

export type RecipeContinuationResponse = z.infer<
	typeof recipeContinuationResponseSchema
>;

// Used by the one-time categorize-recipe-ingredients migration (see
// src/lib/migrations/categorize-recipe-ingredients.ts), which batches
// already-saved ingredients back to Groq for a category tag plus a
// baseName/description correctness pass. `id` echoes the input item's id
// back so the migration can match a response entry to the ingredient(s) it
// came from without relying on response order.
export const categorizeIngredientsResponseSchema = z.object({
	items: z.array(
		z.object({
			id: z.number(),
			baseName: z.string().min(1),
			description: z.string(),
			category: groceryCategorySchema,
			approxGramsPerUnit: approxGramsPerUnitSchema,
			scalingClass: scalingClassSchema,
		}),
	),
});

export type CategorizeIngredientsResponse = z.infer<
	typeof categorizeIngredientsResponseSchema
>;

// Used by generateMealPlanDraft/refineMealPlanDraft (see
// groq/generate-meal-plan.ts) — a lightweight per-dish suggestion (title +
// overview only, no ingredients/steps yet) for one slot in a meal plan's
// wizard grid. `day`/`mealType`/`slotIndex` echo the requested slot back so
// the response can be matched to the entry it's for without relying on
// array order.
const mealPlanDraftEntrySchema = z.object({
	day: z.string().min(1),
	mealType: z.enum(MEAL_TYPES),
	slotIndex: z.number().int().nonnegative(),
	title: z.string().min(1),
	overview: z.string().min(1),
});

export const mealPlanDraftResponseSchema = z.object({
	entries: z.array(mealPlanDraftEntrySchema),
});

export type MealPlanDraftEntry = z.infer<typeof mealPlanDraftEntrySchema>;
export type MealPlanDraftResponse = z.infer<typeof mealPlanDraftResponseSchema>;
