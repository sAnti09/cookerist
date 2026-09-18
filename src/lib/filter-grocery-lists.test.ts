import { describe, expect, it } from "vitest";
import { filterGroceryLists } from "./filter-grocery-lists";
import type { GroceryList } from "./grocery-list";

function makeList(name: string): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		name,
		recipeIds: [],
		items: [],
		expanded: false,
	};
}

describe("filterGroceryLists", () => {
	it("returns every list when the search is empty", () => {
		const lists = [makeList("Taco Night"), makeList("Sunday Meal Prep")];

		expect(filterGroceryLists(lists, "")).toEqual(lists);
	});

	it("returns every list when the search is only whitespace", () => {
		const lists = [makeList("Taco Night")];

		expect(filterGroceryLists(lists, "   ")).toEqual(lists);
	});

	it("filters by name, case-insensitively", () => {
		const lists = [makeList("Taco Night"), makeList("Sunday Meal Prep")];

		expect(filterGroceryLists(lists, "taco")).toEqual([lists[0]]);
	});

	it("returns an empty array when nothing matches", () => {
		const lists = [makeList("Taco Night")];

		expect(filterGroceryLists(lists, "pasta")).toEqual([]);
	});
});
