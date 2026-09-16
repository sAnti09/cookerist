import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { MealPlanWizardForm } from "#/components/meal-plan-wizard-form";
import { IconButton } from "#/components/ui/icon-button";
import { useAppData } from "#/lib/app-data-context";
import type { MealPlan } from "#/lib/meal-plan";

export const Route = createFileRoute("/_tabs/meal-plan_/new")({
	component: NewMealPlanScreen,
});

function NewMealPlanScreen() {
	const navigate = useNavigate();
	const { createMealPlan } = useAppData();

	function handleCreated(plan: MealPlan) {
		createMealPlan(plan);
		navigate({ to: "/meal-plan/$planId", params: { planId: plan.id } });
	}

	return (
		<div>
			<div className="sticky top-0 z-10 flex items-center gap-2 border-line border-b bg-bg px-4 py-3.5">
				<IconButton
					aria-label="Back to meal plans"
					onClick={() => navigate({ to: "/meal-plan" })}
				>
					<ChevronLeft className="size-[18px]" aria-hidden="true" />
				</IconButton>
				<div className="display-title flex-1 truncate text-[15px] font-semibold">
					New meal plan
				</div>
			</div>

			<div className="px-5 pt-5 pb-6">
				<h1 className="display-title text-2xl font-semibold leading-tight">
					New meal plan
				</h1>
				<p className="mt-1.5 text-ink-dim text-sm">
					Set the shape of the week — Cookerist will suggest a dish for each
					meal.
				</p>
				<MealPlanWizardForm onCreated={handleCreated} />
			</div>
		</div>
	);
}
