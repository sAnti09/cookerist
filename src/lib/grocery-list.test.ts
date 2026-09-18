import { describe, expect, it } from "vitest";
import {
	type GroceryList,
	generateGroceryListName,
	getGroceryListProgress,
} from "./grocery-list";

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "list-1",
		createdAt: "2026-01-15T12:00:00.000Z",
		updatedAt: "2026-01-15T12:00:00.000Z",
		sharedAt: null,
		ownerId: null,
		name: "Shrimp Pasta",
		recipeIds: ["recipe-1"],
		items: [],
		expanded: false,
		...overrides,
	};
}

function makeItem(checked: boolean) {
	return {
		id: crypto.randomUUID(),
		text: "shrimp",
		quantity: 1,
		unit: "lb",
		checked,
		source: "recipe" as const,
	};
}

describe("generateGroceryListName", () => {
	const date = new Date("2026-09-16T12:00:00.000Z");

	it("defaults to just the date when no recipes are selected", () => {
		expect(generateGroceryListName(0, date)).toBe("Sep 16, 2026");
	});

	it("appends the singular 'recipe' for exactly one", () => {
		expect(generateGroceryListName(1, date)).toBe("Sep 16, 2026 for 1 recipe");
	});

	it("appends the plural 'recipes' for more than one", () => {
		expect(generateGroceryListName(3, date)).toBe("Sep 16, 2026 for 3 recipes");
	});

	it("defaults the date to today when none is given", () => {
		expect(generateGroceryListName(0)).toBe(
			new Date().toLocaleDateString(undefined, {
				year: "numeric",
				month: "short",
				day: "numeric",
			}),
		);
	});
});

describe("getGroceryListProgress", () => {
	it("returns zero progress and not completed for an empty item list", () => {
		expect(getGroceryListProgress(makeList({ items: [] }))).toEqual({
			checked: 0,
			total: 0,
			percent: 0,
			completed: false,
		});
	});

	it("computes a partial percentage and marks the list active", () => {
		const list = makeList({ items: [makeItem(true), makeItem(false)] });

		expect(getGroceryListProgress(list)).toEqual({
			checked: 1,
			total: 2,
			percent: 50,
			completed: false,
		});
	});

	it("rounds the percentage to the nearest whole number", () => {
		const list = makeList({
			items: [makeItem(true), makeItem(false), makeItem(false)],
		});

		expect(getGroceryListProgress(list).percent).toBe(33);
	});

	it("marks a fully checked, non-empty list as completed", () => {
		const list = makeList({ items: [makeItem(true), makeItem(true)] });

		expect(getGroceryListProgress(list)).toEqual({
			checked: 2,
			total: 2,
			percent: 100,
			completed: true,
		});
	});
});
