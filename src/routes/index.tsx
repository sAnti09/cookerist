import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PromptForm } from "#/components/prompt-form";
import {
	PendingResultRow,
	type PendingRow,
	RecipeResultRow,
} from "#/components/result-row";
import type { Recipe } from "#/lib/recipe";
import { loadRecipes, saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
import { generateRecipe } from "#/server/generate-recipe";

export const Route = createFileRoute("/")({ component: Home });

const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish you'd like to make.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";

export function Home() {
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [pending, setPending] = useState<PendingRow[]>([]);
	const mutation = useMutation({
		mutationFn: (prompt: string) => generateRecipe({ data: prompt }),
	});

	useEffect(() => {
		setRecipes(loadRecipes());
	}, []);

	function submit(prompt: string, replaceId?: string) {
		const localId = replaceId ?? crypto.randomUUID();
		setPending((rows) => [
			{ localId, prompt, status: "loading" },
			...rows.filter((row) => row.localId !== localId),
		]);

		mutation
			.mutateAsync(prompt)
			.then((result) => {
				if (result.type === "success") {
					const recipe = toStoredRecipe(prompt, result.recipe);
					setRecipes(saveRecipe(recipe));
					setPending((rows) => rows.filter((row) => row.localId !== localId));
					return;
				}

				const message =
					result.type === "off_topic" ? OFF_TOPIC_MESSAGE : result.message;
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message }
							: row,
					),
				);
			})
			.catch(() => {
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message: GENERIC_ERROR_MESSAGE }
							: row,
					),
				);
			});
	}

	return (
		<div className="mx-auto max-w-2xl p-8">
			<h1 className="text-4xl font-bold">Cookerist</h1>
			<p className="mt-4 text-lg text-muted-foreground">
				Tell us what you want to cook, and get back the ingredients and steps.
			</p>

			<div className="mt-8">
				<PromptForm onSubmit={submit} />
			</div>

			<div className="mt-8 flex flex-col gap-3">
				{pending.map((row) => (
					<PendingResultRow key={row.localId} row={row} onRetry={submit} />
				))}
				{recipes.map((recipe) => (
					<RecipeResultRow key={recipe.id} recipe={recipe} />
				))}
			</div>
		</div>
	);
}
