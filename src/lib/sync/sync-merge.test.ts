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

describe("mergeGroceryList", () => {
	it("unions items present on only one side", () => {
		const local = baseList({ items: [item({ id: "a" })] });
		const remote = baseList({ items: [item({ id: "b" })] });
		const merged = mergeGroceryList(local, remote);
		expect(merged.items.map((i) => i.id).sort()).toEqual(["a", "b"]);
	});

	it("ORs checked state for an item present on both sides regardless of recency", () => {
		const local = baseList({
			updatedAt: "2026-01-02T00:00:00.000Z",
			items: [item({ id: "a", checked: true })],
		});
		const remote = baseList({
			updatedAt: "2026-01-01T00:00:00.000Z",
			items: [item({ id: "a", checked: false })],
		});
		const merged = mergeGroceryList(local, remote);
		expect(merged.items[0]?.checked).toBe(true);
	});

	it("takes a shared item's other fields from whichever list is newer", () => {
		const local = baseList({
			updatedAt: "2026-01-01T00:00:00.000Z",
			items: [item({ id: "a", quantity: 1 })],
		});
		const remote = baseList({
			updatedAt: "2026-01-02T00:00:00.000Z",
			items: [item({ id: "a", quantity: 5 })],
		});
		const merged = mergeGroceryList(local, remote);
		expect(merged.items[0]?.quantity).toBe(5);
	});

	it("takes non-item fields from whichever side is newer", () => {
		const local = baseList({
			name: "Old name",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		const remote = baseList({
			name: "New name",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});
		expect(mergeGroceryList(local, remote).name).toBe("New name");
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

describe("mergeMealPlan", () => {
	it("unions entries present on only one side (e.g. added while the other device was offline)", () => {
		const local = basePlan({ entries: [entry({ id: "a" })] });
		const remote = basePlan({ entries: [entry({ id: "b" })] });
		const merged = mergeMealPlan(local, remote);
		expect(merged.entries.map((e) => e.id).sort()).toEqual(["a", "b"]);
	});

	it("takes a shared entry from whichever plan is newer", () => {
		const local = basePlan({
			updatedAt: "2026-01-01T00:00:00.000Z",
			entries: [entry({ id: "a", suggestedTitle: "old" })],
		});
		const remote = basePlan({
			updatedAt: "2026-01-02T00:00:00.000Z",
			entries: [entry({ id: "a", suggestedTitle: "new" })],
		});
		const merged = mergeMealPlan(local, remote);
		expect(merged.entries[0]?.suggestedTitle).toBe("new");
	});

	it("takes non-entry fields from whichever side is newer", () => {
		const local = basePlan({
			status: "ready",
			updatedAt: "2026-01-02T00:00:00.000Z",
		});
		const remote = basePlan({
			status: "draft",
			updatedAt: "2026-01-01T00:00:00.000Z",
		});
		expect(mergeMealPlan(local, remote).status).toBe("ready");
	});
});
