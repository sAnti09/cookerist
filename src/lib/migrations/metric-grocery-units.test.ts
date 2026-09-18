import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import { loadGroceryLists, saveGroceryList } from "#/lib/grocery-storage";
import { migrateGroceryListsToMetricUnits } from "./metric-grocery-units";

function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
	return {
		id: crypto.randomUUID(),
		text: "shrimp",
		quantity: 1,
		unit: "lb",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		name: "Weeknight Shopping",
		recipeIds: ["recipe-1"],
		items: [makeItem()],
		expanded: false,
		...overrides,
	};
}

beforeEach(() => {
	window.localStorage.clear();
});

describe("migrateGroceryListsToMetricUnits", () => {
	it("converts a native mass unit (lb) to metric (g)", () => {
		saveGroceryList(
			[],
			makeList({ items: [makeItem({ unit: "lb", quantity: 1 })] }),
		);

		migrateGroceryListsToMetricUnits();

		const [migrated] = loadGroceryLists();
		expect(migrated.items[0]).toMatchObject({ unit: "g", quantity: 453.75 });
	});

	it("converts a native volume unit (cup) to metric (ml)", () => {
		saveGroceryList(
			[],
			makeList({
				items: [makeItem({ text: "broth", unit: "cup", quantity: 1 })],
			}),
		);

		migrateGroceryListsToMetricUnits();

		const [migrated] = loadGroceryLists();
		expect(migrated.items[0]).toMatchObject({ unit: "ml", quantity: 300 });
	});

	it("leaves a non-liquid volume item untouched (e.g. carrots measured by the cup)", () => {
		const item = makeItem({ text: "carrot", unit: "cup", quantity: 2 });
		saveGroceryList([], makeList({ items: [item] }));

		migrateGroceryListsToMetricUnits();

		const [migrated] = loadGroceryLists();
		expect(migrated.items[0]).toEqual(item);
	});

	it("leaves an already-metric item untouched (same object reference)", () => {
		const item = makeItem({ text: "salt", unit: "g", quantity: 300 });
		saveGroceryList([], makeList({ items: [item] }));

		migrateGroceryListsToMetricUnits();

		const [migrated] = loadGroceryLists();
		expect(migrated.items[0]).toEqual(item);
	});

	it("leaves a non-mass/volume item (count, length, unrecognized) untouched", () => {
		const items = [
			makeItem({ id: "1", text: "eggs", unit: "", quantity: 6 }),
			makeItem({ id: "2", text: "ginger", unit: "in", quantity: 2 }),
			makeItem({ id: "3", text: "napkins", unit: "pack", quantity: 1 }),
		];
		saveGroceryList([], makeList({ items }));

		migrateGroceryListsToMetricUnits();

		expect(loadGroceryLists()[0].items).toEqual(items);
	});

	it("preserves checked state and other item fields while converting", () => {
		saveGroceryList(
			[],
			makeList({
				items: [makeItem({ unit: "lb", quantity: 2, checked: true })],
			}),
		);

		migrateGroceryListsToMetricUnits();

		const [migrated] = loadGroceryLists();
		expect(migrated.items[0]).toMatchObject({
			text: "shrimp",
			checked: true,
			source: "recipe",
		});
	});

	it("migrates items across multiple lists in one pass", () => {
		saveGroceryList(
			saveGroceryList(
				[],
				makeList({ id: "list-1", items: [makeItem({ unit: "lb" })] }),
			),
			makeList({
				id: "list-2",
				items: [makeItem({ unit: "oz", quantity: 4 })],
			}),
		);

		migrateGroceryListsToMetricUnits();

		const lists = loadGroceryLists();
		expect(lists.find((l) => l.id === "list-1")?.items[0].unit).toBe("g");
		expect(lists.find((l) => l.id === "list-2")?.items[0].unit).toBe("g");
	});

	it("is a no-op (no localStorage write) when nothing needs converting", () => {
		saveGroceryList(
			[],
			makeList({ items: [makeItem({ unit: "g", quantity: 300 })] }),
		);
		const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

		migrateGroceryListsToMetricUnits();

		expect(setItem).not.toHaveBeenCalled();
		setItem.mockRestore();
	});

	it("does nothing when there are no stored grocery lists", () => {
		expect(() => migrateGroceryListsToMetricUnits()).not.toThrow();
		expect(loadGroceryLists()).toEqual([]);
	});
});
