import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { Button } from "#/components/ui/button";
import { ServingsStepper } from "#/components/ui/servings-stepper";
import {
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	isEntryServingsEdited,
	MEAL_TYPE_LABELS,
	type MealPlan,
} from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

export function MealPlanReady({
	plan,
	recipes,
	onUpdatePlan,
	onUpdateRecipes,
	onAdjustPlan,
	onBuildGroceryList,
}: {
	plan: MealPlan;
	recipes: Recipe[];
	onUpdatePlan: (plan: MealPlan) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
	onAdjustPlan: () => void;
	onBuildGroceryList: () => void;
}) {
	const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
	const days = groupMealPlanEntriesByDay(plan.entries);

	// Broadcasts a new plan-wide servings target to every entry's recipe,
	// except ones that already diverge from the *previous* default (an
	// individual per-dish edit made via that recipe's own detail page) — so
	// bumping the shared stepper doesn't clobber a deliberate override. See
	// meal-plan.ts's isEntryServingsEdited.
	function handleServingsChange(next: number) {
		if (next < 1 || next === plan.defaultServings) return;
		const previousDefault = plan.defaultServings;
		const updatedRecipes: Recipe[] = [];
		for (const entry of plan.entries) {
			if (!entry.recipeId) continue;
			const recipe = recipeById.get(entry.recipeId);
			if (!recipe) continue;
			if (!isEntryServingsEdited(recipe.currentServings, previousDefault)) {
				updatedRecipes.push({ ...recipe, currentServings: next });
			}
		}
		if (updatedRecipes.length > 0) onUpdateRecipes(updatedRecipes);
		onUpdatePlan({ ...plan, defaultServings: next });
	}

	return (
		<div className="pb-32">
			<div className="card flex items-center justify-between gap-3 bg-card p-3.5">
				<span className="font-semibold text-sm">Servings for this plan</span>
				<ServingsStepper
					value={plan.defaultServings}
					onChange={handleServingsChange}
				/>
			</div>

			<div className="mt-5 flex flex-col gap-5">
				{days.map(({ day, entries }) => (
					<div key={day}>
						<p className="mb-2 font-semibold text-ink-dim text-xs">
							{formatMealPlanDay(day)}
						</p>
						<div className="flex flex-col gap-2">
							{entries.map((entry) => {
								const recipe = entry.recipeId
									? recipeById.get(entry.recipeId)
									: undefined;
								if (!recipe) return null;
								const edited = isEntryServingsEdited(
									recipe.currentServings,
									plan.defaultServings,
								);
								return (
									<Link
										key={entry.id}
										to="/recipes/$recipeId"
										params={{ recipeId: recipe.id }}
										className="card block bg-card p-3.5 text-ink no-underline transition-colors hover:bg-bg2"
									>
										<span className="font-bold text-[10px] text-ink-dim uppercase tracking-wide">
											{MEAL_TYPE_LABELS[entry.mealType]}
										</span>
										<p className="mt-1 font-semibold text-sm">{recipe.title}</p>
										<p className="mt-0.5 text-ink-dim text-xs">
											{recipe.overview}
										</p>
										<span
											className={cn(
												"mt-1.5 inline-flex w-fit items-center rounded-[10px] border px-2 py-0.5 text-[11px]",
												edited
													? "border-accent/40 bg-accent/10 font-semibold text-accent"
													: "border-line text-ink-dim",
											)}
										>
											Servings: {recipe.currentServings}
											{edited ? " · edited" : ""}
										</span>
									</Link>
								);
							})}
						</div>
					</div>
				))}
			</div>

			<div
				className="fixed inset-x-0 bottom-0 z-40 flex gap-2.5 border-line border-t bg-bg px-5 pt-3.5 shadow-[0_-8px_22px_-18px_rgba(33,28,22,0.25)]"
				style={{
					paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
				}}
			>
				<Button
					variant="secondary"
					onClick={onAdjustPlan}
					className="flex-1 py-3"
				>
					Adjust plan
				</Button>
				{plan.groceryListId ? (
					<Link
						to="/grocery/$listId"
						params={{ listId: plan.groceryListId }}
						className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent py-3 font-semibold text-[15px] text-primary-foreground no-underline"
					>
						<ShoppingCart className="size-[15px]" aria-hidden="true" />
						View grocery list
					</Link>
				) : (
					<Button onClick={onBuildGroceryList} className="flex-1 gap-1.5 py-3">
						<ShoppingCart className="size-[15px]" aria-hidden="true" />
						Build grocery list
					</Button>
				)}
			</div>
		</div>
	);
}
