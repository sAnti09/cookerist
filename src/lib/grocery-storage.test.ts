import { beforeEach, describe, expect, it } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	saveGroceryList,
	setExpandedGroceryList,
	updateGroceryList,
} from "./grocery-storage";

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		name: "Shrimp Pasta, Garlic Bread",
		recipeIds: ["recipe-1", "recipe-2"],
		items: [
			{
				id: crypto.randomUUID(),
				text: "shrimp",
				quantity: 300,
				unit: "g",
				checked: false,
				source: "recipe",
				origins: [{ recipeId: "recipe-1", ingredientId: "ing-1" }],
			},
			{
				id: crypto.randomUUID(),
				text: "paper towels",
				quantity: 1,
				unit: "roll",
				checked: false,
				source: "custom",
			},
		],
		expanded: false,
		...overrides,
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("loadGroceryLists / saveGroceryList", () => {
	it("returns an empty list when nothing is stored", () => {
		expect(loadGroceryLists()).toEqual([]);
	});

	it("round-trips a saved grocery list through localStorage", () => {
		const list = makeList();
		saveGroceryList([], list);

		expect(loadGroceryLists()).toEqual([list]);
	});

	it("prepends new grocery lists so the list stays reverse-chronological", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });

		const afterFirst = saveGroceryList([], first);
		saveGroceryList(afterFirst, second);

		expect(loadGroceryLists().map((l) => l.name)).toEqual(["second", "first"]);
	});

	it("ignores corrupt localStorage content instead of throwing", () => {
		window.localStorage.setItem("cookerist:grocery-lists", "not valid json");

		expect(loadGroceryLists()).toEqual([]);
	});

	it("filters out entries that aren't shaped like a GroceryList", () => {
		window.localStorage.setItem(
			"cookerist:grocery-lists",
			JSON.stringify([{ not: "a grocery list" }]),
		);

		expect(loadGroceryLists()).toEqual([]);
	});

	it("filters out non-object and null entries", () => {
		window.localStorage.setItem(
			"cookerist:grocery-lists",
			JSON.stringify(["not an object", null, 42]),
		);

		expect(loadGroceryLists()).toEqual([]);
	});

	it("returns an empty list when the stored value isn't an array", () => {
		window.localStorage.setItem(
			"cookerist:grocery-lists",
			JSON.stringify({ foo: "bar" }),
		);

		expect(loadGroceryLists()).toEqual([]);
	});

	it("keeps this feature's lists under a separate storage key from recipes", () => {
		saveGroceryList([], makeList());

		expect(window.localStorage.getItem("cookerist:recipes")).toBeNull();
		expect(
			window.localStorage.getItem("cookerist:grocery-lists"),
		).not.toBeNull();
	});
});

describe("deleteGroceryList", () => {
	it("removes the matching list and persists the rest", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });
		const afterFirst = saveGroceryList([], first);
		const afterSecond = saveGroceryList(afterFirst, second);

		const result = deleteGroceryList(afterSecond, first.id);

		expect(result).toEqual([second]);
		expect(loadGroceryLists()).toEqual([second]);
	});

	it("is a no-op when the id isn't found", () => {
		const list = makeList();
		const lists = saveGroceryList([], list);

		expect(deleteGroceryList(lists, "not-a-real-id")).toEqual([list]);
	});
});

describe("updateGroceryList", () => {
	it("replaces the matching list in place and persists it", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });
		const afterFirst = saveGroceryList([], first);
		const afterSecond = saveGroceryList(afterFirst, second);

		const updatedFirst = { ...first, expanded: true };
		const result = updateGroceryList(afterSecond, updatedFirst);

		expect(result).toEqual([second, updatedFirst]);
		expect(loadGroceryLists()).toEqual([second, updatedFirst]);
	});

	it("is a no-op when the id isn't found", () => {
		const list = makeList();
		const lists = saveGroceryList([], list);

		expect(updateGroceryList(lists, { ...list, id: "not-a-real-id" })).toEqual([
			list,
		]);
	});

	it("keeps every other list's object reference unchanged (perf: avoids re-rendering unrelated rows)", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });
		const lists = saveGroceryList(saveGroceryList([], first), second);

		const result = updateGroceryList(lists, { ...first, expanded: true });

		expect(result.find((l) => l.id === second.id)).toBe(second);
	});
});

describe("setExpandedGroceryList", () => {
	it("expands the matching list and collapses every other one", () => {
		const first = makeList({ name: "first", expanded: true });
		const second = makeList({ name: "second" });
		const afterFirst = saveGroceryList([], first);
		const afterSecond = saveGroceryList(afterFirst, second);

		const result = setExpandedGroceryList(afterSecond, first.id);

		expect(result.find((l) => l.id === first.id)?.expanded).toBe(true);
		expect(result.find((l) => l.id === second.id)?.expanded).toBe(false);
	});

	it("collapses every list when passed null", () => {
		const list = makeList({ expanded: true });
		const lists = saveGroceryList([], list);

		const result = setExpandedGroceryList(lists, null);

		expect(result.every((l) => l.expanded === false)).toBe(true);
	});

	it("keeps lists whose expanded state doesn't change referentially identical (perf)", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });
		const third = makeList({ name: "third" });
		const lists = saveGroceryList(
			saveGroceryList(saveGroceryList([], first), second),
			third,
		);
		const firstBefore = lists.find((l) => l.id === first.id);

		const expandedSecond = setExpandedGroceryList(lists, second.id);
		const expandedThird = setExpandedGroceryList(expandedSecond, third.id);

		expect(expandedThird.find((l) => l.id === first.id)).toBe(firstBefore);
	});
});
