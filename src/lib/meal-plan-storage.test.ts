import { beforeEach, describe, expect, it } from "vitest";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import {
	deleteMealPlan,
	loadMealPlans,
	removeRecipeFromMealPlans,
	saveMealPlan,
	updateMealPlan,
	upsertMealPlans,
} from "./meal-plan-storage";

function makeEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
	return {
		id: crypto.randomUUID(),
		day: "2026-09-15",
		mealType: "breakfast",
		slotIndex: 0,
		status: "ready",
		suggestedTitle: "x",
		suggestedOverview: "x",
		...overrides,
	};
}

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
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

		// updateMealPlan stamps a fresh updatedAt (see touch() in
		// meal-plan-storage.ts), so compare everything else exactly and just
		// sanity-check updatedAt moved forward.
		expect(result).toEqual([
			second,
			{ ...updatedFirst, updatedAt: result[1]?.updatedAt },
		]);
		expect(result[1]?.updatedAt >= first.updatedAt).toBe(true);
		expect(loadMealPlans()).toEqual(result);
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

describe("upsertMealPlans", () => {
	it("does nothing and returns the same array when there's nothing to upsert", () => {
		const plans = saveMealPlan([], makePlan());

		const result = upsertMealPlans(plans, []);

		expect(result).toBe(plans);
	});

	it("inserts a new plan not previously known locally", () => {
		const existing = makePlan({ id: "existing" });
		const incoming = makePlan({ id: "new-one" });

		const result = upsertMealPlans([existing], [incoming]);

		expect(result.map((p) => p.id).sort()).toEqual(["existing", "new-one"]);
	});

	it("replaces an existing plan by id", () => {
		const original = makePlan({ id: "p1", description: "Original" });
		const updated = { ...original, description: "Updated" };

		const result = upsertMealPlans([original], [updated]);

		expect(result).toHaveLength(1);
		expect(result[0]?.description).toBe("Updated");
	});

	it("persists the merged result to localStorage", () => {
		const plan = makePlan({ id: "p1" });

		upsertMealPlans([], [plan]);

		expect(loadMealPlans().map((p) => p.id)).toEqual(["p1"]);
	});

	it("sorts the result newest-first by createdAt", () => {
		const older = makePlan({
			id: "older",
			createdAt: "2026-01-01T00:00:00.000Z",
		});
		const newer = makePlan({
			id: "newer",
			createdAt: "2026-01-05T00:00:00.000Z",
		});

		const result = upsertMealPlans([older], [newer]);

		expect(result.map((p) => p.id)).toEqual(["newer", "older"]);
	});
});

describe("removeRecipeFromMealPlans", () => {
	it("returns the same array reference when no plan references the recipe", () => {
		const plans = saveMealPlan(
			[],
			makePlan({ entries: [makeEntry({ recipeId: "other" })] }),
		);

		expect(removeRecipeFromMealPlans(plans, "deleted-recipe")).toBe(plans);
	});

	it("strips the reference, touches, and persists only the affected plan", () => {
		const untouched = makePlan({
			id: "p1",
			entries: [makeEntry({ recipeId: "other" })],
		});
		const affected = makePlan({
			id: "p2",
			entries: [makeEntry({ id: "e1", recipeId: "deleted-recipe" })],
		});
		const plans = saveMealPlan(saveMealPlan([], untouched), affected);

		const result = removeRecipeFromMealPlans(plans, "deleted-recipe");

		expect(result.find((p) => p.id === "p1")).toBe(untouched);
		const updated = result.find((p) => p.id === "p2");
		expect(updated?.entries).toEqual([]);
		expect((updated?.updatedAt ?? "") >= affected.updatedAt).toBe(true);
		expect(loadMealPlans()).toEqual(result);
	});
});
