import { combineIngredientName, type Ingredient } from "#/lib/recipe";
import type { RecipeDiff } from "#/lib/recipe-diff";

type RecipeModificationDiffProps = {
	diff: RecipeDiff;
};

function formatIngredientForDiff(ingredient: Ingredient): string {
	const name = ingredient.baseName
		? combineIngredientName(ingredient.baseName, ingredient.description ?? "")
		: ingredient.text;
	return [String(ingredient.quantity), ingredient.unit, name]
		.filter((part) => part !== "")
		.join(" ");
}

export function RecipeModificationDiff({ diff }: RecipeModificationDiffProps) {
	return (
		<div className="mt-2 flex flex-col gap-3 rounded-[18px] border border-line bg-bg2 p-3 text-sm">
			{diff.title ? (
				<p>
					<span className="text-ink-dim line-through">{diff.title.before}</span>{" "}
					→ <span className="font-medium">{diff.title.after}</span>
				</p>
			) : null}
			{diff.overview ? (
				<p>
					<span className="text-ink-dim line-through">
						{diff.overview.before}
					</span>{" "}
					→ <span>{diff.overview.after}</span>
				</p>
			) : null}
			{diff.servings ? (
				<p>
					Servings:{" "}
					<span className="text-ink-dim line-through">
						{diff.servings.before}
					</span>{" "}
					→ <span className="font-medium">{diff.servings.after}</span>
				</p>
			) : null}

			<div>
				<h5 className="text-sm font-semibold">Ingredients</h5>
				<ul className="mt-1 flex flex-col gap-1">
					{diff.ingredients.map((entry) => {
						if (entry.status === "added") {
							return (
								<li key={`added-${entry.ingredient.id}`} className="text-sage">
									+ {formatIngredientForDiff(entry.ingredient)}
								</li>
							);
						}
						if (entry.status === "removed") {
							return (
								<li
									key={`removed-${entry.ingredient.id}`}
									className="text-warn line-through"
								>
									− {formatIngredientForDiff(entry.ingredient)}
								</li>
							);
						}
						if (entry.status === "changed") {
							return (
								<li key={`changed-${entry.before.id}-${entry.after.id}`}>
									<span className="text-ink-dim line-through">
										{formatIngredientForDiff(entry.before)}
									</span>{" "}
									→{" "}
									<span className="font-medium">
										{formatIngredientForDiff(entry.after)}
									</span>
								</li>
							);
						}
						return (
							<li
								key={`unchanged-${entry.ingredient.id}`}
								className="text-ink-dim"
							>
								{formatIngredientForDiff(entry.ingredient)}
							</li>
						);
					})}
				</ul>
			</div>

			<div>
				<h5 className="text-sm font-semibold">Steps</h5>
				<ul className="mt-1 flex flex-col gap-1">
					{diff.steps.map((entry) => {
						if (entry.status === "added") {
							return (
								<li key={`added-${entry.step.id}`} className="text-sage">
									+ {entry.step.text}
								</li>
							);
						}
						if (entry.status === "removed") {
							return (
								<li
									key={`removed-${entry.step.id}`}
									className="text-warn line-through"
								>
									− {entry.step.text}
								</li>
							);
						}
						return (
							<li key={`unchanged-${entry.step.id}`} className="text-ink-dim">
								{entry.step.text}
							</li>
						);
					})}
				</ul>
			</div>
		</div>
	);
}
