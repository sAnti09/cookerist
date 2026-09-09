import { useMutation } from "@tanstack/react-query";
import { ChefHat } from "lucide-react";
import { useState } from "react";
import { CookMode } from "#/components/cook-mode";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { ServingsStepper } from "#/components/ui/servings-stepper";
import { combineIngredientName, groupSteps, type Recipe } from "#/lib/recipe";
import { formatIngredientLine, scaleQuantity } from "#/lib/scale-servings";
import { continueRecipe } from "#/server/generate-recipe";

type RecipeDetailProps = {
	recipe: Recipe;
	onUpdate: (recipe: Recipe) => void;
};

const CONTINUATION_ERROR_MESSAGE =
	"Couldn't load the rest of the recipe. Please try again.";

export function RecipeDetail({ recipe, onUpdate }: RecipeDetailProps) {
	const [continuationError, setContinuationError] = useState<string | null>(
		null,
	);
	const [cookModeOpen, setCookModeOpen] = useState(false);
	const continueMutation = useMutation({
		mutationFn: () =>
			continueRecipe({
				data: {
					prompt: recipe.prompt,
					soFar: {
						ingredients: recipe.ingredients.map((ingredient) => ({
							// Ingredients saved before the base name/description split
							// (TEST-255) have neither field — fall back to the full text
							// as the base name with no description.
							baseName: ingredient.baseName ?? ingredient.text,
							description: ingredient.description ?? "",
							quantity: ingredient.quantity,
							unit: ingredient.unit,
						})),
						steps: recipe.steps.map((step) => ({
							section: step.section,
							text: step.text,
						})),
					},
				},
			}),
	});

	function handleLoadMore() {
		setContinuationError(null);
		continueMutation.mutate(undefined, {
			onSuccess: (result) => {
				if (result.type !== "success") {
					setContinuationError(result.message);
					return;
				}
				onUpdate({
					...recipe,
					ingredients: [
						...recipe.ingredients,
						...result.ingredients.map((ingredient) => ({
							id: crypto.randomUUID(),
							text: combineIngredientName(
								ingredient.baseName,
								ingredient.description,
							),
							baseName: ingredient.baseName,
							description: ingredient.description,
							quantity: ingredient.quantity,
							unit: ingredient.unit,
							checked: false,
						})),
					],
					steps: [
						...recipe.steps,
						...result.steps.map((step) => ({
							id: crypto.randomUUID(),
							section: step.section,
							text: step.text,
							estimatedMinutes: step.estimatedMinutes ?? null,
							checked: false,
						})),
					],
					truncated: result.truncated,
				});
			},
			onError: () => {
				setContinuationError(CONTINUATION_ERROR_MESSAGE);
			},
		});
	}

	function handleServingsChange(nextServings: number) {
		if (nextServings < 1 || nextServings === recipe.currentServings) return;
		onUpdate({ ...recipe, currentServings: nextServings });
	}

	function handleToggleIngredient(id: string) {
		onUpdate({
			...recipe,
			ingredients: recipe.ingredients.map((ingredient) =>
				ingredient.id === id
					? { ...ingredient, checked: !ingredient.checked }
					: ingredient,
			),
		});
	}

	function handleCheckAllIngredients(checked: boolean) {
		onUpdate({
			...recipe,
			ingredients: recipe.ingredients.map((ingredient) => ({
				...ingredient,
				checked,
			})),
		});
	}

	function handleToggleStep(id: string) {
		onUpdate({
			...recipe,
			steps: recipe.steps.map((step) =>
				step.id === id ? { ...step, checked: !step.checked } : step,
			),
		});
	}

	const allIngredientsChecked =
		recipe.ingredients.length > 0 &&
		recipe.ingredients.every((ingredient) => ingredient.checked);
	const checkedCount = recipe.ingredients.filter(
		(ingredient) => ingredient.checked,
	).length;
	const progressPercent =
		recipe.ingredients.length > 0
			? Math.round((checkedCount / recipe.ingredients.length) * 100)
			: 0;
	const sections = groupSteps(recipe.steps);

	return (
		<>
			<div className="flex flex-col gap-5">
				<p className="text-sm text-ink-dim">{recipe.prompt}</p>
				<p className="text-sm">{recipe.overview}</p>

				<div className="flex items-center gap-3">
					<span className="text-sm font-medium">Servings</span>
					<ServingsStepper
						value={recipe.currentServings}
						onChange={handleServingsChange}
					/>
				</div>

				<section>
					<div className="flex items-center justify-between">
						<h4 className="font-medium">Ingredients</h4>
						<Checkbox
							checked={allIngredientsChecked}
							onChange={handleCheckAllIngredients}
							label="Check all"
						/>
					</div>
					<div
						role="progressbar"
						aria-label="Ingredients checked"
						aria-valuenow={progressPercent}
						aria-valuemin={0}
						aria-valuemax={100}
						className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg2"
					>
						<div
							className="h-full rounded-full bg-sage transition-[width] duration-300 ease-out"
							style={{ width: `${progressPercent}%` }}
						/>
					</div>
					<p className="mt-1 text-xs text-ink-dim tabular-nums">
						{checkedCount}/{recipe.ingredients.length} checked
					</p>
					<ul className="mt-3 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
						{recipe.ingredients.map((ingredient) => (
							<li key={ingredient.id}>
								<Checkbox
									checked={ingredient.checked}
									onChange={() => handleToggleIngredient(ingredient.id)}
									label={
										<span
											className={
												ingredient.checked
													? "tabular-nums text-ink-dim line-through"
													: "tabular-nums"
											}
										>
											{formatIngredientLine(
												scaleQuantity(
													ingredient.quantity,
													recipe.baseServings,
													recipe.currentServings,
												),
												ingredient.unit,
												ingredient.text,
											)}
										</span>
									}
								/>
							</li>
						))}
					</ul>
				</section>

				<section>
					<div className="flex items-center justify-between">
						<h4 className="font-medium">Steps</h4>
						{recipe.steps.length > 0 ? (
							<Button
								variant="primary"
								className="gap-1.5"
								onClick={() => setCookModeOpen(true)}
							>
								<ChefHat className="size-4" aria-hidden="true" />
								Cook mode
							</Button>
						) : null}
					</div>
					{sections.map((section, index) => (
						<div
							key={section.name ?? `ungrouped-${index}`}
							className={index > 0 ? "mt-3" : "mt-2"}
						>
							{section.name ? (
								<h5 className="text-sm font-semibold">{section.name}</h5>
							) : null}
							<ol className="mt-1 flex flex-col gap-2">
								{section.steps.map((step) => (
									<li key={step.id}>
										<Checkbox
											checked={step.checked}
											onChange={() => handleToggleStep(step.id)}
											label={
												<span
													className={
														step.checked
															? "text-ink-dim line-through"
															: undefined
													}
												>
													{step.text}
												</span>
											}
										/>
									</li>
								))}
							</ol>
						</div>
					))}
				</section>

				{recipe.truncated ? (
					<div className="rounded-[18px] border border-line bg-bg2 p-3 text-sm">
						<p className="text-ink-dim">
							This recipe got cut off before it finished generating.
						</p>
						<button
							type="button"
							onClick={handleLoadMore}
							disabled={continueMutation.isPending}
							className="mt-2 rounded-full bg-accent px-4 py-1.5 text-sm font-medium text-white disabled:opacity-60"
						>
							{continueMutation.isPending ? "Loading more…" : "Load more"}
						</button>
						{continuationError ? (
							<p className="mt-2 text-warn">{continuationError}</p>
						) : null}
					</div>
				) : null}
			</div>
			{cookModeOpen ? (
				<CookMode
					recipe={recipe}
					onUpdate={onUpdate}
					onClose={() => setCookModeOpen(false)}
				/>
			) : null}
		</>
	);
}
