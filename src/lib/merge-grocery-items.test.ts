import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "./grocery-list";
import { mergeGroceryListItems } from "./merge-grocery-items";

function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
	return {
		id: crypto.randomUUID(),
		text: "onion",
		quantity: 1,
		unit: "",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

describe("mergeGroceryListItems", () => {
	it("sums two mass quantities and picks the display unit by magnitude", () => {
		const a = makeItem({ text: "yellow onion", quantity: 500, unit: "g" });
		const b = makeItem({ text: "onion", quantity: 600, unit: "g" });

		const merged = mergeGroceryListItems(a, b, "onion");

		// 500 g + 600 g = 1100 g -> "kg" by magnitude, 1.1 kg rounded up to the
		// next 0.25 -> 1.25 kg.
		expect(merged).toMatchObject({
			text: "onion",
			quantity: 1.25,
			unit: "kg",
		});
	});

	it("sums two volume quantities across differently-scaled units", () => {
		const a = makeItem({ text: "broth", quantity: 1, unit: "cup" });
		const b = makeItem({ text: "chicken broth", quantity: 2, unit: "tbsp" });

		const merged = mergeGroceryListItems(a, b, "broth");

		// 1 cup (236.588 ml) + 2 tbsp (29.5736 ml) = 266.1616 ml, rounded up to
		// the nearest 100 -> 300 ml.
		expect(merged).toMatchObject({ unit: "ml", quantity: 300 });
	});

	it("sums two bare counts", () => {
		const a = makeItem({ text: "egg", quantity: 3, unit: "" });
		const b = makeItem({ text: "eggs", quantity: 1, unit: "dozen" });

		const merged = mergeGroceryListItems(a, b, "egg");

		expect(merged).toMatchObject({ quantity: 15, unit: "" });
	});

	it("sums a piece-ratio container unit across a singular/plural spelling", () => {
		const a = makeItem({ text: "garlic", quantity: 1, unit: "bulb" });
		const b = makeItem({ text: "garlic", quantity: 2, unit: "bulbs" });

		const merged = mergeGroceryListItems(a, b, "garlic");

		expect(merged).toMatchObject({ quantity: 3, unit: "bulbs" });
	});

	it("sums a piece-ratio sub-piece count into the container unit", () => {
		const a = makeItem({ text: "garlic", quantity: 8, unit: "cloves" });
		const b = makeItem({ text: "garlic", quantity: 4, unit: "cloves" });

		const merged = mergeGroceryListItems(a, b, "garlic");

		// 12 cloves / 10 cloves-per-bulb = 1.2, rounded up -> 2 bulbs.
		expect(merged).toMatchObject({ quantity: 2, unit: "bulbs" });
	});

	it("sums two identical arbitrary/unrecognized units directly", () => {
		const a = makeItem({ text: "canned tomatoes", quantity: 1, unit: "can" });
		const b = makeItem({ text: "tomatoes", quantity: 2, unit: "cans" });

		const merged = mergeGroceryListItems(a, b, "tomatoes");

		expect(merged).toMatchObject({ quantity: 3, unit: "can" });
	});

	it("returns null when the units are not combinable (different dimensions, no shared unit)", () => {
		const a = makeItem({ text: "onion", quantity: 1, unit: "kg" });
		const b = makeItem({ text: "yellow onion", quantity: 1, unit: "jar" });

		expect(mergeGroceryListItems(a, b, "onion")).toBeNull();
	});

	it("carries the merged item's checked state as true only when both were checked", () => {
		const a = makeItem({ quantity: 1, unit: "g", checked: true });
		const b = makeItem({ quantity: 1, unit: "g", checked: false });

		expect(mergeGroceryListItems(a, b, "onion")?.checked).toBe(false);

		const bothChecked = mergeGroceryListItems(
			makeItem({ quantity: 1, unit: "g", checked: true }),
			makeItem({ quantity: 1, unit: "g", checked: true }),
			"onion",
		);
		expect(bothChecked?.checked).toBe(true);
	});

	it("combines origins for recipe-sourced items", () => {
		const a = makeItem({
			quantity: 1,
			unit: "g",
			origins: [{ recipeId: "r1", ingredientId: "i1" }],
		});
		const b = makeItem({
			quantity: 1,
			unit: "g",
			origins: [{ recipeId: "r2", ingredientId: "i2" }],
		});

		const merged = mergeGroceryListItems(a, b, "onion");

		expect(merged?.origins).toEqual([
			{ recipeId: "r1", ingredientId: "i1" },
			{ recipeId: "r2", ingredientId: "i2" },
		]);
	});

	it("omits origins for custom-sourced items", () => {
		const a = makeItem({ quantity: 1, unit: "g", source: "custom" });
		const b = makeItem({ quantity: 1, unit: "g", source: "custom" });

		expect(mergeGroceryListItems(a, b, "onion")?.origins).toBeUndefined();
	});

	it("flags the merged item approximate when either half already was", () => {
		const a = makeItem({ quantity: 1, unit: "g", approximate: true });
		const b = makeItem({ quantity: 1, unit: "g" });

		expect(mergeGroceryListItems(a, b, "onion")?.approximate).toBe(true);
	});

	it("prefers item a's category, falling back to b's", () => {
		const a = makeItem({ quantity: 1, unit: "g", category: "Produce" });
		const b = makeItem({ quantity: 1, unit: "g", category: "Pantry" });

		expect(mergeGroceryListItems(a, b, "onion")?.category).toBe("Produce");

		const bOnly = mergeGroceryListItems(
			makeItem({ quantity: 1, unit: "g" }),
			makeItem({ quantity: 1, unit: "g", category: "Pantry" }),
			"onion",
		);
		expect(bOnly?.category).toBe("Pantry");
	});
});
