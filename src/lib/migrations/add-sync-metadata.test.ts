import { beforeEach, describe, expect, it } from "vitest";
import { loadGroceryLists } from "#/lib/grocery-storage";
import { loadMealPlans } from "#/lib/meal-plan-storage";
import { loadRecipes } from "#/lib/recipes-storage";
import { addSyncMetadata } from "./add-sync-metadata";

const RECIPES_KEY = "cookerist:recipes";
const GROCERY_KEY = "cookerist:grocery-lists";
const MEAL_PLANS_KEY = "cookerist:meal-plans";

beforeEach(() => {
	window.localStorage.clear();
});

describe("addSyncMetadata", () => {
	it("backfills updatedAt (from createdAt) and sharedAt (null) on pre-existing recipes", () => {
		window.localStorage.setItem(
			RECIPES_KEY,
			JSON.stringify([
				{
					id: "r1",
					createdAt: "2025-01-01T00:00:00.000Z",
					prompt: "test",
					title: "Old recipe",
					overview: "",
					baseServings: 2,
					currentServings: 2,
					ingredients: [],
					steps: [],
					expanded: false,
					favorite: false,
				},
			]),
		);

		addSyncMetadata();

		const raw = JSON.parse(window.localStorage.getItem(RECIPES_KEY) ?? "[]");
		expect(raw[0].updatedAt).toBe("2025-01-01T00:00:00.000Z");
		expect(raw[0].sharedAt).toBeNull();
	});

	it("backfills grocery lists the same way", () => {
		window.localStorage.setItem(
			GROCERY_KEY,
			JSON.stringify([
				{
					id: "l1",
					createdAt: "2025-01-01T00:00:00.000Z",
					name: "List",
					recipeIds: [],
					items: [],
					expanded: false,
				},
			]),
		);

		addSyncMetadata();

		const raw = JSON.parse(window.localStorage.getItem(GROCERY_KEY) ?? "[]");
		expect(raw[0].updatedAt).toBe("2025-01-01T00:00:00.000Z");
		expect(raw[0].sharedAt).toBeNull();
	});

	it("backfills meal plans the same way", () => {
		window.localStorage.setItem(
			MEAL_PLANS_KEY,
			JSON.stringify([
				{
					id: "p1",
					createdAt: "2025-01-01T00:00:00.000Z",
					startDate: "2025-01-01",
					endDate: "2025-01-07",
					description: "",
					defaultServings: 4,
					status: "ready",
					entries: [],
					refineInstructions: [],
				},
			]),
		);

		addSyncMetadata();

		const raw = JSON.parse(window.localStorage.getItem(MEAL_PLANS_KEY) ?? "[]");
		expect(raw[0].updatedAt).toBe("2025-01-01T00:00:00.000Z");
		expect(raw[0].sharedAt).toBeNull();
	});

	it("does nothing when there's no stored data of any kind", () => {
		expect(() => addSyncMetadata()).not.toThrow();
		expect(loadRecipes()).toEqual([]);
		expect(loadGroceryLists()).toEqual([]);
		expect(loadMealPlans()).toEqual([]);
	});

	it("never overwrites an already-set sharedAt (e.g. re-running after a partial migration)", () => {
		window.localStorage.setItem(
			RECIPES_KEY,
			JSON.stringify([
				{
					id: "r1",
					createdAt: "2025-01-01T00:00:00.000Z",
					updatedAt: "2025-06-01T00:00:00.000Z",
					sharedAt: "2025-06-01T00:00:00.000Z",
					prompt: "test",
					title: "Already shared",
					overview: "",
					baseServings: 2,
					currentServings: 2,
					ingredients: [],
					steps: [],
					expanded: false,
					favorite: false,
				},
			]),
		);

		addSyncMetadata();

		const raw = JSON.parse(window.localStorage.getItem(RECIPES_KEY) ?? "[]");
		expect(raw[0].updatedAt).toBe("2025-06-01T00:00:00.000Z");
		expect(raw[0].sharedAt).toBe("2025-06-01T00:00:00.000Z");
	});
});
