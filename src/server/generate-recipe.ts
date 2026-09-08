import { createServerFn } from "@tanstack/react-start";
import { generateRecipe as generateRecipeCore } from "#/lib/groq/generate-recipe";

export const generateRecipe = createServerFn({ method: "POST" })
	.validator((prompt: string) => prompt)
	.handler(async ({ data }) => generateRecipeCore(data));
