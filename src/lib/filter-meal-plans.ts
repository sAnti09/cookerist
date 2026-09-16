import { formatMealPlanDateRange, type MealPlan } from "#/lib/meal-plan";

// Same minimal single-field shape as filter-grocery-lists.ts — matches
// against the formatted date-range label plus the plan's free-text
// description, since neither name nor recipe titles exist as their own
// searchable field on a MealPlan.
export function filterMealPlans(plans: MealPlan[], search: string): MealPlan[] {
	const query = search.trim().toLowerCase();
	if (!query) return plans;
	return plans.filter((plan) => {
		const dateRange = formatMealPlanDateRange(
			plan.startDate,
			plan.endDate,
		).toLowerCase();
		return (
			dateRange.includes(query) ||
			plan.description.toLowerCase().includes(query)
		);
	});
}
