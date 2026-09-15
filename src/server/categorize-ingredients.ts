import { createServerFn } from "@tanstack/react-start";
import {
	type CategorizeIngredientsInput,
	categorizeIngredients as categorizeIngredientsCore,
} from "#/lib/groq/categorize-ingredients";

export const categorizeIngredients = createServerFn({ method: "POST" })
	.validator((data: { items: CategorizeIngredientsInput[] }) => data)
	.handler(async ({ data }) => categorizeIngredientsCore(data.items));
