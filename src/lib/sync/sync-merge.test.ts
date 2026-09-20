import { describe, expect, it } from "vitest";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { mergeGroceryList, mergeMealPlan, mergeRecipe } from "./sync-merge";

function baseRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "r1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: "2026-01-01T00:00:00.000Z",
		ownerId: null,
		prompt: "test",
		title: "Original",
		overview: "",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

describe("mergeRecipe", () => {
	it("keeps the local recipe when it's newer", () => {
		const local = baseRecipe({ updatedAt: "2026-01-02T00:00:00.000Z" });
		const remote = baseRecipe({
			title: "Remote",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		expect(mergeRecipe(local, remote)).toBe(local);
	});

	it("adopts the remote recipe when it's newer", () => {
		const local = baseRecipe({ updatedAt: "2026-01-01T00:00:00.000Z" });
		const remote = baseRecipe({
			title: "Remote",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});
		expect(mergeRecipe(local, remote)).toBe(remote);
	});
});

function item(overrides: Partial<GroceryListItem>): GroceryListItem {
	return {
		id: "i1",
		text: "Garlic",
		quantity: 1,
		unit: "clove",
		checked: false,
		source: "custom",
		...overrides,
	};
}

function baseList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "l1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: "2026-01-01T00:00:00.000Z",
		ownerId: null,
		name: "List",
		recipeIds: [],
		items: [],
		expanded: false,
		...overrides,
	};
}

// Whole-record last-write-wins, same as mergeRecipe/mergeMealPlan — see
// sync-merge.ts's own comment for why grocery lists moved off item-level
// union-by-id merging (id-churn duplication, removal resurrection, and an
// unchecked item getting rechecked by a stale remote OR all traced back to
// it).
describe("mergeGroceryList", () => {
	it("keeps the local list (and its items) when it's newer", () => {
		const local = baseList({
			updatedAt: "2026-01-02T00:00:00.000Z",
			items: [item({ id: "a", checked: false })],
		});
		const remote = baseList({
			updatedAt: "2026-01-01T00:00:00.000Z",
			items: [item({ id: "a", checked: true }), item({ id: "b" })],
		});
		expect(mergeGroceryList(local, remote)).toBe(local);
	});

	it("adopts the remote list (and its items) when it's newer, discarding local's items entirely", () => {
		const local = baseList({
			updatedAt: "2026-01-01T00:00:00.000Z",
			items: [item({ id: "a" }), item({ id: "b" })],
		});
		const remote = baseList({
			updatedAt: "2026-01-02T00:00:00.000Z",
			items: [item({ id: "a", quantity: 5 })],
		});
		expect(mergeGroceryList(local, remote)).toBe(remote);
	});

	// Regression: this used to be the "unchecked items get rechecked after a
	// sync" bug — item-level OR meant an intentional uncheck could never
	// survive against a stale copy that still had it checked. Under
	// whole-record LWW, whichever side actually unchecked it also bumped its
	// own `updatedAt` doing so, so it's the newer side and wins outright.
	it("an intentional uncheck survives, since it's the newer side", () => {
		const local = baseList({
			updatedAt: "2026-01-02T00:00:00.000Z",
			items: [item({ id: "a", checked: false })],
		});
		const remote = baseList({
			updatedAt: "2026-01-01T00:00:00.000Z",
			items: [item({ id: "a", checked: true })],
		});
		expect(mergeGroceryList(local, remote).items[0]?.checked).toBe(false);
	});
});

function entry(overrides: Partial<MealPlanEntry>): MealPlanEntry {
	return {
		id: "e1",
		day: "2026-01-01",
		mealType: "dinner",
		slotIndex: 0,
		status: "suggested",
		suggestedTitle: "x",
		suggestedOverview: "x",
		...overrides,
	};
}

function basePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: "p1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: "2026-01-01T00:00:00.000Z",
		ownerId: null,
		startDate: "2026-01-01",
		endDate: "2026-01-07",
		description: "",
		defaultServings: 4,
		status: "ready",
		entries: [],
		refineInstructions: [],
		...overrides,
	};
}

// Whole-record last-write-wins, same as mergeRecipe — see sync-merge.ts's
// own comment for why meal plans moved off entry-level union-by-id merging
// (three separate resurrection/duplication bugs all traced back to it).
describe("mergeMealPlan", () => {
	it("keeps the local plan (and its entries) when it's newer", () => {
		const local = basePlan({
			updatedAt: "2026-01-02T00:00:00.000Z",
			entries: [entry({ id: "a" })],
		});
		const remote = basePlan({
			updatedAt: "2026-01-01T00:00:00.000Z",
			entries: [
				entry({ id: "a", suggestedTitle: "stale" }),
				entry({ id: "b" }),
			],
		});
		expect(mergeMealPlan(local, remote)).toBe(local);
	});

	it("adopts the remote plan (and its entries) when it's newer, discarding local's entries entirely", () => {
		const local = basePlan({
			updatedAt: "2026-01-01T00:00:00.000Z",
			entries: [entry({ id: "a" }), entry({ id: "b" })],
		});
		const remote = basePlan({
			updatedAt: "2026-01-02T00:00:00.000Z",
			entries: [entry({ id: "a", suggestedTitle: "new" })],
		});
		expect(mergeMealPlan(local, remote)).toBe(remote);
	});

	// A removed entry never resurrects under whole-record LWW: whichever side
	// actually removed it also bumped its own `updatedAt` doing so (see
	// meal-plan-storage.ts's touch()), so it's the newer side and wins
	// outright — no per-entry union to accidentally carry the old one back.
	it("a locally-removed entry doesn't resurrect from a stale remote copy that still has it", () => {
		const local = basePlan({
			updatedAt: "2026-01-02T00:00:00.000Z",
			entries: [],
		});
		const remote = basePlan({
			updatedAt: "2026-01-01T00:00:00.000Z",
			entries: [entry({ id: "a" })],
		});
		expect(mergeMealPlan(local, remote).entries).toEqual([]);
	});
});
