import { Link } from "@tanstack/react-router";
import { ShoppingCart } from "lucide-react";
import { useState } from "react";
import { MealPlanChangeRecipeDialog } from "#/components/meal-plan-change-recipe-dialog";
import { MealPlanEntryRow } from "#/components/meal-plan-entry-row";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { ServingsStepper } from "#/components/ui/servings-stepper";
import {
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	isEntryServingsEdited,
	MEAL_TYPE_LABELS,
	type MealPlan,
} from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";

export function MealPlanReady({
	plan,
	recipes,
	onUpdatePlan,
	onUpdateRecipes,
	onCreateRecipe,
	onAdjustPlan,
	onBuildGroceryList,
}: {
	plan: MealPlan;
	recipes: Recipe[];
	onUpdatePlan: (plan: MealPlan) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
	onCreateRecipe: (recipe: Recipe) => void;
	onAdjustPlan: () => void;
	onBuildGroceryList: () => void;
}) {
	const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
	const days = groupMealPlanEntriesByDay(plan.entries);
	const [deleteEntryId, setDeleteEntryId] = useState<string | null>(null);
	const [changingEntryId, setChangingEntryId] = useState<string | null>(null);

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

	function confirmDeleteEntry() {
		if (!deleteEntryId) return;
		onUpdatePlan({
			...plan,
			entries: plan.entries.filter((entry) => entry.id !== deleteEntryId),
		});
		setDeleteEntryId(null);
	}

	// Aligns the swapped-in existing recipe's servings to the plan's shared
	// default, same as a freshly-resolved entry gets in use-build-meal-plan.ts.
	function handleSwapExisting(entryId: string, recipeId: string) {
		const existing = recipeById.get(recipeId);
		if (existing && existing.currentServings !== plan.defaultServings) {
			onUpdateRecipes([{ ...existing, currentServings: plan.defaultServings }]);
		}
		onUpdatePlan({
			...plan,
			entries: plan.entries.map((entry) =>
				entry.id === entryId
					? {
							...entry,
							recipeId,
							reused: true,
							status: "ready" as const,
							buildError: undefined,
						}
					: entry,
			),
		});
		setChangingEntryId(null);
	}

	function handleGenerateNew(entryId: string, recipe: Recipe) {
		onCreateRecipe(recipe);
		onUpdatePlan({
			...plan,
			entries: plan.entries.map((entry) =>
				entry.id === entryId
					? {
							...entry,
							recipeId: recipe.id,
							reused: false,
							status: "ready" as const,
							buildError: undefined,
						}
					: entry,
			),
		});
		setChangingEntryId(null);
	}

	const changingEntry = changingEntryId
		? plan.entries.find((entry) => entry.id === changingEntryId)
		: undefined;
	const changingEntryRecipe = changingEntry?.recipeId
		? recipeById.get(changingEntry.recipeId)
		: undefined;

	return (
		<div className="pb-32">
			<div className="card flex items-center justify-between gap-3 bg-card p-3.5">
				<span className="font-semibold text-sm">Servings for this plan</span>
				<ServingsStepper
					value={plan.defaultServings}
					onChange={handleServingsChange}
				/>
			</div>

			{days.length === 0 ? (
				<p className="mt-5 card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
					No dishes left in this plan.
				</p>
			) : (
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
										<MealPlanEntryRow
											key={entry.id}
											entry={entry}
											recipe={recipe}
											edited={edited}
											planId={plan.id}
											onDelete={() => setDeleteEntryId(entry.id)}
											onChangeRecipe={() => setChangingEntryId(entry.id)}
										/>
									);
								})}
							</div>
						</div>
					))}
				</div>
			)}

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

			<ConfirmDialog
				open={deleteEntryId != null}
				title="Remove this dish from the plan?"
				description="This only removes it from the meal plan — the recipe itself stays in your Recipes list."
				confirmLabel="Remove"
				cancelLabel="Cancel"
				onConfirm={confirmDeleteEntry}
				onCancel={() => setDeleteEntryId(null)}
			/>

			{changingEntry ? (
				<MealPlanChangeRecipeDialog
					entryLabel={`${MEAL_TYPE_LABELS[changingEntry.mealType]} · ${formatMealPlanDay(changingEntry.day)}`}
					currentRecipeId={changingEntryRecipe?.id}
					currentServings={plan.defaultServings}
					recipes={recipes}
					onClose={() => setChangingEntryId(null)}
					onSwapExisting={(recipeId) =>
						handleSwapExisting(changingEntry.id, recipeId)
					}
					onGenerateNew={(recipe) =>
						handleGenerateNew(changingEntry.id, recipe)
					}
				/>
			) : null}
		</div>
	);
}
