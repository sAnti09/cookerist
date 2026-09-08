import { beforeEach, describe, expect, it } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	saveGroceryList,
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
		saveGroceryList(list);

		expect(loadGroceryLists()).toEqual([list]);
	});

	it("prepends new grocery lists so the list stays reverse-chronological", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });

		saveGroceryList(first);
		saveGroceryList(second);

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
		saveGroceryList(makeList());

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
		saveGroceryList(first);
		saveGroceryList(second);

		const result = deleteGroceryList(first.id);

		expect(result).toEqual([second]);
		expect(loadGroceryLists()).toEqual([second]);
	});

	it("is a no-op when the id isn't found", () => {
		const list = makeList();
		saveGroceryList(list);

		expect(deleteGroceryList("not-a-real-id")).toEqual([list]);
	});
});

describe("updateGroceryList", () => {
	it("replaces the matching list in place and persists it", () => {
		const first = makeList({ name: "first" });
		const second = makeList({ name: "second" });
		saveGroceryList(first);
		saveGroceryList(second);

		const updatedFirst = { ...first, expanded: true };
		const result = updateGroceryList(updatedFirst);

		expect(result).toEqual([second, updatedFirst]);
		expect(loadGroceryLists()).toEqual([second, updatedFirst]);
	});

	it("is a no-op when the id isn't found", () => {
		const list = makeList();
		saveGroceryList(list);

		expect(updateGroceryList({ ...list, id: "not-a-real-id" })).toEqual([list]);
	});
});
