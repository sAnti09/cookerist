import { z } from "zod";

export const onTopicResponseSchema = z.object({
	on_topic: z.boolean(),
});

export const difficultySchema = z.enum([
	"quick_and_easy",
	"intermediate",
	"hard",
]);

const ingredientItemSchema = z.object({
	baseName: z.string().min(1),
	description: z.string(),
	quantity: z.number().nonnegative(),
	unit: z.string(),
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
