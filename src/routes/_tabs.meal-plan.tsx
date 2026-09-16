import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { MealPlanRow } from "#/components/meal-plan-row";
import { SearchInput } from "#/components/ui/search-input";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useAppData } from "#/lib/app-data-context";
import { filterMealPlans } from "#/lib/filter-meal-plans";

export const Route = createFileRoute("/_tabs/meal-plan")({
	component: MealPlanScreen,
});

function MealPlanScreen() {
	const { mealPlans } = useAppData();
	const [search, setSearch] = useState("");
	const filteredPlans = useMemo(
		() => filterMealPlans(mealPlans, search),
		[mealPlans, search],
	);

	return (
		<div className="px-5 pt-5">
			<div className="flex items-center justify-between gap-3">
				<h1 className="display-title text-[22px] font-semibold text-ink">
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
					filteredPlans.map((plan) => <MealPlanRow key={plan.id} plan={plan} />)
				)}
			</div>

			<Link
				to="/meal-plan/new"
				aria-label="New meal plan"
				className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-40 flex size-14 items-center justify-center rounded-full bg-accent text-primary-foreground shadow-[0_10px_20px_-6px_rgba(33,28,22,0.35)] transition-opacity hover:opacity-90"
			>
				<Plus className="size-[22px]" aria-hidden="true" />
			</Link>
		</div>
	);
}
