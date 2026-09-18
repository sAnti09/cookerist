import { createFileRoute, Link } from "@tanstack/react-router";
import { Menu, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MealPlanRow } from "#/components/meal-plan-row";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { IconButton } from "#/components/ui/icon-button";
import { SearchInput } from "#/components/ui/search-input";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useAppData } from "#/lib/app-data-context";
import { filterMealPlans } from "#/lib/filter-meal-plans";

export const Route = createFileRoute("/_tabs/meal-plan")({
	component: MealPlanScreen,
});

function MealPlanScreen() {
	const { mealPlans, deleteMealPlan, openAccountDrawer, isSharedWithMe } =
		useAppData();
	const [search, setSearch] = useState("");
	const [deletingPlanId, setDeletingPlanId] = useState<string | null>(null);
	const deletingPlan = mealPlans.find((p) => p.id === deletingPlanId);
	const deletingPlanShared = deletingPlan
		? isSharedWithMe(deletingPlan)
		: false;
	const filteredPlans = useMemo(
		() => filterMealPlans(mealPlans, search),
		[mealPlans, search],
	);

	return (
		<div className="px-5 pt-5">
			<div className="flex items-center gap-3">
				<IconButton aria-label="Account & sync" onClick={openAccountDrawer}>
					<Menu className="size-4 text-ink-dim" aria-hidden="true" />
				</IconButton>
				<h1 className="display-title flex-1 text-[22px] font-semibold text-ink">
					Meal Plan
				</h1>
				<ThemeToggle />
			</div>

			{mealPlans.length > 0 ? (
				<div className="mt-4">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search meal plans…"
						aria-label="Search meal plans"
						clearLabel="Clear meal plan search"
					/>
				</div>
			) : null}

			<div className="mt-4 flex flex-col gap-2.5 pb-4">
				{mealPlans.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No meal plans yet — plan a week to get started.
					</p>
				) : filteredPlans.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No meal plans match "{search.trim()}".
					</p>
				) : (
					filteredPlans.map((plan) => (
						<MealPlanRow
							key={plan.id}
							plan={plan}
							shared={isSharedWithMe(plan)}
							onDelete={() => setDeletingPlanId(plan.id)}
						/>
					))
				)}
			</div>

			<Link
				to="/meal-plan/new"
				aria-label="New meal plan"
				className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-40 flex size-14 items-center justify-center rounded-full bg-accent text-primary-foreground shadow-[0_10px_20px_-6px_rgba(33,28,22,0.35)] transition-opacity hover:opacity-90"
			>
				<Plus className="size-[22px]" aria-hidden="true" />
			</Link>

			<ConfirmDialog
				open={deletingPlanId != null}
				title={
					deletingPlanShared
						? "Remove this meal plan?"
						: "Delete this meal plan?"
				}
				description={
					deletingPlanShared
						? "This meal plan will be removed from your meal plans — the person who shared it (and anyone else it's shared with) keeps their copy."
						: "This meal plan will be permanently removed. Any recipes it built stay in your Recipes list."
				}
				confirmLabel={deletingPlanShared ? "Remove" : "Delete"}
				cancelLabel="Cancel"
				onConfirm={() => {
					if (deletingPlanId) deleteMealPlan(deletingPlanId);
					setDeletingPlanId(null);
				}}
				onCancel={() => setDeletingPlanId(null)}
			/>
		</div>
	);
}
