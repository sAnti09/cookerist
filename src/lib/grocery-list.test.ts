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
	it("joins recipe titles with a comma and space", () => {
		expect(generateGroceryListName(["Shrimp Pasta", "Garlic Bread"])).toBe(
			"Shrimp Pasta, Garlic Bread",
		);
	});

	it("returns a single title unchanged", () => {
		expect(generateGroceryListName(["Shrimp Pasta"])).toBe("Shrimp Pasta");
	});

	it("returns an empty string for no titles", () => {
		expect(generateGroceryListName([])).toBe("");
	});

	it("leaves a joined string at exactly the max length untouched", () => {
		const title = "a".repeat(255);
		expect(generateGroceryListName([title])).toBe(title);
		expect(generateGroceryListName([title]).length).toBe(255);
	});

	it("truncates a joined string over 255 characters and appends an ellipsis", () => {
		const title = "a".repeat(300);

		const name = generateGroceryListName([title]);

		expect(name.length).toBe(255);
		expect(name.endsWith("…")).toBe(true);
		expect(name).toBe(`${"a".repeat(254)}…`);
	});

	it("truncates the joined result of multiple titles, not each title individually", () => {
		const titles = ["a".repeat(200), "b".repeat(100), "c".repeat(100)];

		const name = generateGroceryListName(titles);

		expect(name.length).toBe(255);
		expect(name.endsWith("…")).toBe(true);
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
