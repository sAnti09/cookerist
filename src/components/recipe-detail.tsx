import { ServingsStepper } from "#/components/ui/servings-stepper";
import { groupSteps, type Recipe } from "#/lib/recipe";
import { formatQuantity, scaleQuantity } from "#/lib/scale-servings";

type RecipeDetailProps = {
	recipe: Recipe;
	onUpdate: (recipe: Recipe) => void;
};

export function RecipeDetail({ recipe, onUpdate }: RecipeDetailProps) {
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
	const sections = groupSteps(recipe.steps);

	return (
		<div className="flex flex-col gap-5">
			<p className="text-sm text-muted-foreground">{recipe.prompt}</p>
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
					<label className="flex items-center gap-2 text-sm">
						<input
							type="checkbox"
							checked={allIngredientsChecked}
							onChange={(event) =>
								handleCheckAllIngredients(event.target.checked)
							}
						/>
						Check all
					</label>
				</div>
				<ul className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
					{recipe.ingredients.map((ingredient) => (
						<li key={ingredient.id}>
							<label className="flex items-center gap-2 text-sm">
								<input
									type="checkbox"
									checked={ingredient.checked}
									onChange={() => handleToggleIngredient(ingredient.id)}
								/>
								<span
									className={
										ingredient.checked
											? "text-muted-foreground line-through"
											: undefined
									}
								>
									{formatQuantity(
										scaleQuantity(
											ingredient.quantity,
											recipe.baseServings,
											recipe.currentServings,
										),
									)}{" "}
									{ingredient.unit} {ingredient.text}
								</span>
							</label>
						</li>
					))}
				</ul>
			</section>

			<section>
				<h4 className="font-medium">Steps</h4>
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
									<label className="flex items-start gap-2 text-sm">
										<input
											type="checkbox"
											checked={step.checked}
											className="mt-1"
											onChange={() => handleToggleStep(step.id)}
										/>
										<span
											className={
												step.checked
													? "text-muted-foreground line-through"
													: undefined
											}
										>
											{step.text}
										</span>
									</label>
								</li>
							))}
						</ol>
					</div>
				))}
			</section>
		</div>
	);
}
