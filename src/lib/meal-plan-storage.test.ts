import { beforeEach, describe, expect, it } from "vitest";
import type { MealPlan } from "#/lib/meal-plan";
import {
	deleteMealPlan,
	loadMealPlans,
	saveMealPlan,
	updateMealPlan,
} from "./meal-plan-storage";

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		startDate: "2026-09-15",
		endDate: "2026-09-21",
		description: "Mostly vegetarian",
		defaultServings: 4,
		status: "draft",
		entries: [],
		refineInstructions: [],
		...overrides,
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("loadMealPlans / saveMealPlan", () => {
	it("returns an empty list when nothing is stored", () => {
		expect(loadMealPlans()).toEqual([]);
	});

	it("round-trips a saved meal plan through localStorage", () => {
		const plan = makePlan();
		saveMealPlan([], plan);

		expect(loadMealPlans()).toEqual([plan]);
	});

	it("prepends new plans so the list stays reverse-chronological", () => {
		const first = makePlan({ description: "first" });
		const second = makePlan({ description: "second" });
		const afterFirst = saveMealPlan([], first);
		saveMealPlan(afterFirst, second);

		expect(loadMealPlans().map((p) => p.description)).toEqual([
			"second",
			"first",
		]);
	});

	it("ignores corrupt localStorage content instead of throwing", () => {
		window.localStorage.setItem("cookerist:meal-plans", "not valid json");

		expect(loadMealPlans()).toEqual([]);
	});

	it("filters out entries that aren't shaped like a MealPlan", () => {
		window.localStorage.setItem(
			"cookerist:meal-plans",
			JSON.stringify([{ not: "a meal plan" }, null, 42]),
		);

		expect(loadMealPlans()).toEqual([]);
	});

	it("returns an empty list when the stored value isn't an array", () => {
		window.localStorage.setItem(
			"cookerist:meal-plans",
			JSON.stringify({ foo: "bar" }),
		);

		expect(loadMealPlans()).toEqual([]);
	});

	it("keeps meal plans under a separate storage key from recipes/grocery lists", () => {
		saveMealPlan([], makePlan());

		expect(window.localStorage.getItem("cookerist:recipes")).toBeNull();
		expect(window.localStorage.getItem("cookerist:grocery-lists")).toBeNull();
		expect(window.localStorage.getItem("cookerist:meal-plans")).not.toBeNull();
	});
});

describe("deleteMealPlan", () => {
	it("removes the matching plan and persists the rest", () => {
		const first = makePlan({ description: "first" });
		const second = makePlan({ description: "second" });
		const afterFirst = saveMealPlan([], first);
		const afterSecond = saveMealPlan(afterFirst, second);

		const result = deleteMealPlan(afterSecond, first.id);

		expect(result).toEqual([second]);
		expect(loadMealPlans()).toEqual([second]);
	});

	it("is a no-op when the id isn't found", () => {
		const plan = makePlan();
		const plans = saveMealPlan([], plan);

		expect(deleteMealPlan(plans, "not-a-real-id")).toEqual([plan]);
	});
});

describe("updateMealPlan", () => {
	it("replaces the matching plan in place and persists it", () => {
		const first = makePlan({ description: "first" });
		const second = makePlan({ description: "second" });
		const afterFirst = saveMealPlan([], first);
		const afterSecond = saveMealPlan(afterFirst, second);

		const updatedFirst = { ...first, status: "ready" as const };
		const result = updateMealPlan(afterSecond, updatedFirst);

		expect(result).toEqual([second, updatedFirst]);
		expect(loadMealPlans()).toEqual([second, updatedFirst]);
	});

	it("is a no-op when the id isn't found", () => {
		const plan = makePlan();
		const plans = saveMealPlan([], plan);

		expect(updateMealPlan(plans, { ...plan, id: "not-a-real-id" })).toEqual([
			plan,
		]);
	});

	it("keeps every other plan's object reference unchanged (perf: avoids re-rendering unrelated rows)", () => {
		const first = makePlan({ description: "first" });
		const second = makePlan({ description: "second" });
		const plans = saveMealPlan(saveMealPlan([], first), second);

		const result = updateMealPlan(plans, { ...first, status: "ready" });

		expect(result.find((p) => p.id === second.id)).toBe(second);
	});
});
