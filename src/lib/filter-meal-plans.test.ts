import { describe, expect, it } from "vitest";
import { filterMealPlans } from "./filter-meal-plans";
import type { MealPlan } from "./meal-plan";

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		startDate: "2026-09-15",
		endDate: "2026-09-21",
		description: "",
		defaultServings: 4,
		status: "draft",
		entries: [],
		refineInstructions: [],
		...overrides,
	};
}

describe("filterMealPlans", () => {
	it("returns every plan when the search is empty", () => {
		const plans = [makePlan(), makePlan({ startDate: "2026-10-01" })];

		expect(filterMealPlans(plans, "")).toEqual(plans);
	});

	it("returns every plan when the search is only whitespace", () => {
		const plans = [makePlan()];

		expect(filterMealPlans(plans, "   ")).toEqual(plans);
	});

	it("matches by formatted date range, case-insensitively", () => {
		const plans = [
			makePlan({ startDate: "2026-09-15", endDate: "2026-09-21" }),
			makePlan({ startDate: "2026-10-01", endDate: "2026-10-07" }),
		];

		expect(filterMealPlans(plans, "sep 15")).toEqual([plans[0]]);
	});

	it("matches by description", () => {
		const plans = [
			makePlan({ description: "Mostly vegetarian" }),
			makePlan({ description: "Big Sunday dinner" }),
		];

		expect(filterMealPlans(plans, "vegetarian")).toEqual([plans[0]]);
	});

	it("returns an empty array when nothing matches", () => {
		const plans = [makePlan({ description: "Mostly vegetarian" })];

		expect(filterMealPlans(plans, "seafood")).toEqual([]);
	});
});
