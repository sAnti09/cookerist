import { createServerFn } from "@tanstack/react-start";
import type { AiProvider } from "#/lib/ai/client";
import {
	continueRecipe as continueRecipeCore,
	generateRecipe as generateRecipeCore,
	modifyRecipe as modifyRecipeCore,
} from "#/lib/groq/generate-recipe";
import type { RecipeResponse } from "#/lib/groq/schema";

export const generateRecipe = createServerFn({ method: "POST" })
	.validator(
		(data: {
			prompt: string;
			timezone?: string;
			skipOnTopicCheck?: boolean;
			provider?: AiProvider;
		}) => data,
	)
	.handler(async ({ data }) =>
		generateRecipeCore(data.prompt, data.timezone, {
			skipOnTopicCheck: data.skipOnTopicCheck,
			provider: data.provider,
		}),
	);

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

export const modifyRecipe = createServerFn({ method: "POST" })
	.validator((data: { instruction: string; current: RecipeResponse }) => data)
	.handler(async ({ data }) =>
		modifyRecipeCore(data.instruction, data.current),
	);
