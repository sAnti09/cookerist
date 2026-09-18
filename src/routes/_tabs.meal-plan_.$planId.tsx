import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Trash2, UserPlus } from "lucide-react";
import { useMemo, useState } from "react";
import { MealPlanBuilding } from "#/components/meal-plan-building";
import { MealPlanDraft } from "#/components/meal-plan-draft";
import { MealPlanReady } from "#/components/meal-plan-ready";
import { ShareResourceDialog } from "#/components/share-resource-dialog";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { IconButton } from "#/components/ui/icon-button";
import {
	aggregateGroceryItems,
	carryOverCheckedState,
} from "#/lib/aggregate-grocery-items";
import { useAppData } from "#/lib/app-data-context";
import type { GroceryList } from "#/lib/grocery-list";
import {
	DEFAULT_MEAL_PLAN_SERVINGS,
	formatMealPlanDateRange,
	groceryListSignature,
	type MealPlan,
} from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { reapplyConfirmedMerges } from "#/lib/suggest-grocery-merges";
import { useBuildMealPlan } from "#/lib/use-build-meal-plan";
import { useGoBack } from "#/lib/use-go-back";

export const Route = createFileRoute("/_tabs/meal-plan_/$planId")({
	component: MealPlanDetailScreen,
});

const STATUS_SUBTITLES: Record<MealPlan["status"], string> = {
	draft: "Draft · review before building",
	building: "Building",
	ready: "Ready",
};

// Stable placeholder passed to useBuildMealPlan when the real plan can't be
// found — hooks must run unconditionally every render, and a non-"building"
// status makes the hook's effect/loop no-op immediately.
const NOT_FOUND_PLAN: MealPlan = {
	id: "__not-found__",
	createdAt: "",
	updatedAt: "",
	sharedAt: null,
	ownerId: null,
	startDate: "",
	endDate: "",
	description: "",
	defaultServings: DEFAULT_MEAL_PLAN_SERVINGS,
	status: "ready",
	entries: [],
	refineInstructions: [],
};

function MealPlanDetailScreen() {
	const { planId } = Route.useParams();
	const navigate = useNavigate();
	const goBack = useGoBack();
	const {
		mealPlans,
		recipes,
		groceryLists,
		updateMealPlan,
		deleteMealPlan,
		createRecipe,
		updateRecipe,
		updateRecipes,
		saveGroceryListForm,
		updateGroceryList,
		isSharedWithMe,
	} = useAppData();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const plan = mealPlans.find((p) => p.id === planId);
	const shared = plan ? isSharedWithMe(plan) : false;

	const buildDeps = useMemo(
		() => ({
			recipes,
			onUpdatePlan: updateMealPlan,
			onCreateRecipe: createRecipe,
			onUpdateRecipe: updateRecipe,
		}),
		[recipes, updateMealPlan, createRecipe, updateRecipe],
	);
	const { retryEntry } = useBuildMealPlan(plan ?? NOT_FOUND_PLAN, buildDeps);

	if (!plan) {
		return (
			<div className="flex flex-col items-center gap-3 px-5 pt-16 text-center">
				<p className="text-sm text-ink-dim">
					This meal plan couldn't be found — it may have been deleted.
				</p>
				<Link
					to="/meal-plan"
					className="font-medium text-accent underline underline-offset-2"
				>
					Back to meal plans
				</Link>
			</div>
		);
	}

	function handleApprove() {
		if (!plan) return;
		updateMealPlan({
			...plan,
			status: "building",
			builtBefore: true,
			preAdjustEntries: undefined,
		});
	}

	// For a brand-new plan's first draft review, Discard deletes it outright
	// — there's nothing built yet to lose. For an already-built plan being
	// adjusted, Discard instead cancels the adjustment: restore the entries
	// as they were right before "Adjust plan" was clicked and go back to
	// viewing the plan, same as it was before this adjustment started.
	function handleDiscard() {
		if (!plan) return;
		if (plan.builtBefore) {
			updateMealPlan({
				...plan,
				status: "ready",
				entries: plan.preAdjustEntries ?? plan.entries,
				preAdjustEntries: undefined,
			});
			return;
		}
		deleteMealPlan(plan.id);
		navigate({ to: "/meal-plan" });
	}

	function handleAdjustPlan() {
		if (!plan) return;
		updateMealPlan({
			...plan,
			status: "draft",
			preAdjustEntries: plan.entries,
		});
	}

	// Client-side only — reuses the same aggregateGroceryItems math the
	// grocery-list create form uses (see grocery-list-create-form.tsx), keyed
	// directly off this plan's built recipes. No Groq call.
	function handleBuildGroceryList() {
		if (!plan) return;
		const planRecipes = plan.entries
			.map((entry) =>
				entry.recipeId
					? recipes.find((recipe) => recipe.id === entry.recipeId)
					: undefined,
			)
			.filter((recipe): recipe is Recipe => Boolean(recipe));
		if (planRecipes.length === 0) return;
		const now = new Date().toISOString();
		const list: GroceryList = {
			id: crypto.randomUUID(),
			createdAt: now,
			updatedAt: now,
			sharedAt: null,
			ownerId: null,
			name: `${formatMealPlanDateRange(plan.startDate, plan.endDate)} meal plan`,
			recipeIds: planRecipes.map((recipe) => recipe.id),
			items: aggregateGroceryItems(planRecipes),
			expanded: false,
		};
		saveGroceryListForm(list);
		const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
		updateMealPlan({
			...plan,
			groceryListId: list.id,
			groceryListSnapshot: groceryListSignature(plan.entries, recipeById),
		});
		navigate({ to: "/grocery/$listId", params: { listId: list.id } });
	}

	// Re-syncs an already-built grocery list against the plan's *current*
	// entries — offered from the Ready screen's "meal plan changed" banner
	// once isGroceryListStale flags a swap/add/remove/servings edit made
	// since the list was last built. Preserves the list's own custom
	// ingredients (never derived from the plan) and carries over checked
	// state for anything unchanged, same as the grocery list's own manual
	// Edit-and-save flow (grocery-list-create-form.tsx).
	function handleRefreshGroceryList() {
		if (!plan?.groceryListId) return;
		const existingList = groceryLists.find(
			(list) => list.id === plan.groceryListId,
		);
		if (!existingList) return;
		const planRecipes = plan.entries
			.map((entry) =>
				entry.recipeId
					? recipes.find((recipe) => recipe.id === entry.recipeId)
					: undefined,
			)
			.filter((recipe): recipe is Recipe => Boolean(recipe));
		const customIngredients = existingList.items
			.filter((item) => item.source === "custom")
			.map((item) => ({
				text: item.text,
				quantity: item.quantity,
				unit: item.unit,
			}));
		const newItems = aggregateGroceryItems(planRecipes, customIngredients);
		updateGroceryList({
			...existingList,
			recipeIds: planRecipes.map((recipe) => recipe.id),
			items: reapplyConfirmedMerges(
				carryOverCheckedState(existingList.items, newItems),
				existingList.confirmedMergeKeys,
			),
		});
		const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));
		updateMealPlan({
			...plan,
			groceryListSnapshot: groceryListSignature(plan.entries, recipeById),
		});
	}

	return (
		<div>
			<div className="sticky top-0 z-10 flex items-center gap-2 border-line border-b bg-bg px-4 py-3.5">
				<IconButton
					aria-label="Back to meal plans"
					onClick={() => goBack(() => navigate({ to: "/meal-plan" }))}
				>
					<ChevronLeft className="size-[18px]" aria-hidden="true" />
				</IconButton>
				<div className="display-title flex-1 truncate text-[15px] font-semibold">
					Meal Plan
				</div>
				{plan.status === "ready" && !shared ? (
					<IconButton
						aria-label="Share this meal plan"
						onClick={() => setShareDialogOpen(true)}
					>
						<UserPlus className="size-4 text-ink-dim" />
					</IconButton>
				) : null}
				<IconButton
					aria-label={
						shared ? "Remove this meal plan" : "Delete this meal plan"
					}
					onClick={() => setConfirmingDelete(true)}
				>
					<Trash2 className="size-4 text-ink-dim" />
				</IconButton>
			</div>

			<div className="px-5 pt-5">
				<h1 className="display-title text-2xl font-semibold leading-tight">
					{formatMealPlanDateRange(plan.startDate, plan.endDate)}
				</h1>
				<p className="mt-1 text-ink-dim text-xs">
					{STATUS_SUBTITLES[plan.status]}
				</p>

				<div className="mt-5">
					{plan.status === "draft" ? (
						<MealPlanDraft
							plan={plan}
							onUpdatePlan={updateMealPlan}
							onApprove={handleApprove}
							onDiscard={handleDiscard}
						/>
					) : plan.status === "building" ? (
						<MealPlanBuilding plan={plan} onRetryEntry={retryEntry} />
					) : (
						<MealPlanReady
							plan={plan}
							recipes={recipes}
							onUpdatePlan={updateMealPlan}
							onUpdateRecipes={updateRecipes}
							onCreateRecipe={createRecipe}
							onAdjustPlan={handleAdjustPlan}
							onBuildGroceryList={handleBuildGroceryList}
							onRefreshGroceryList={handleRefreshGroceryList}
						/>
					)}
				</div>
			</div>

			<ConfirmDialog
				open={confirmingDelete}
				title={shared ? "Remove this meal plan?" : "Delete this meal plan?"}
				description={
					shared
						? "This meal plan will be removed from your meal plans — the person who shared it (and anyone else it's shared with) keeps their copy."
						: "This meal plan will be permanently removed. Any recipes it built stay in your Recipes list."
				}
				confirmLabel={shared ? "Remove" : "Delete"}
				cancelLabel="Cancel"
				onConfirm={() => {
					setConfirmingDelete(false);
					deleteMealPlan(plan.id);
					navigate({ to: "/meal-plan" });
				}}
				onCancel={() => setConfirmingDelete(false)}
			/>
			<ShareResourceDialog
				open={shareDialogOpen}
				onClose={() => setShareDialogOpen(false)}
				table="meal_plans"
				id={plan.id}
				title={formatMealPlanDateRange(plan.startDate, plan.endDate)}
			/>
		</div>
	);
}
