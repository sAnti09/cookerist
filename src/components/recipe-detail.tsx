import { Checkbox } from "#/components/ui/checkbox";
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
	const checkedCount = recipe.ingredients.filter(
		(ingredient) => ingredient.checked,
	).length;
	const progressPercent =
		recipe.ingredients.length > 0
			? Math.round((checkedCount / recipe.ingredients.length) * 100)
			: 0;
	const sections = groupSteps(recipe.steps);

	return (
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
										{formatQuantity(
											scaleQuantity(
												ingredient.quantity,
												recipe.baseServings,
												recipe.currentServings,
											),
										)}{" "}
										{ingredient.unit} {ingredient.text}
									</span>
								}
							/>
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
									<Checkbox
										checked={step.checked}
										onChange={() => handleToggleStep(step.id)}
										label={
											<span
												className={
													step.checked ? "text-ink-dim line-through" : undefined
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
		</div>
	);
}
