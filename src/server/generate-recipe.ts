import { createServerFn } from "@tanstack/react-start";
import {
	continueRecipe as continueRecipeCore,
	generateRecipe as generateRecipeCore,
} from "#/lib/groq/generate-recipe";
import type { RecipeResponse } from "#/lib/groq/schema";

export const generateRecipe = createServerFn({ method: "POST" })
	.validator((prompt: string) => prompt)
	.handler(async ({ data }) => generateRecipeCore(data));

export const continueRecipe = createServerFn({ method: "POST" })
	.validator(
		(data: {
			prompt: string;
			soFar: {
				ingredients: RecipeResponse["ingredients"];
				steps: RecipeResponse["steps"];
			};
		}) => data,
	)
	.handler(async ({ data }) => continueRecipeCore(data.prompt, data.soFar));
