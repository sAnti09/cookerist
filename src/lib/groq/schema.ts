import { z } from "zod";

export const onTopicResponseSchema = z.object({
	on_topic: z.boolean(),
});

export const difficultySchema = z.enum([
	"quick_and_easy",
	"intermediate",
	"hard",
]);

export const recipeResponseSchema = z.object({
	title: z.string().min(1),
	overview: z.string().min(1),
	baseServings: z.number().positive(),
	difficulty: difficultySchema,
	estimatedMinutes: z.number().positive(),
	ingredients: z
		.array(
			z.object({
				text: z.string().min(1),
				quantity: z.number().nonnegative(),
				unit: z.string(),
			}),
		)
		.min(1),
	steps: z
		.array(
			z.object({
				section: z.string().nullable(),
				text: z.string().min(1),
			}),
		)
		.min(1),
});

export type RecipeResponse = z.infer<typeof recipeResponseSchema>;
