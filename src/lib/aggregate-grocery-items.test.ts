import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "#/lib/grocery-list";
import type { Ingredient, Recipe } from "#/lib/recipe";
import {
	aggregateGroceryItems,
	COUNTABLE_UNITS,
	carryOverCheckedState,
	formatGroceryItemLine,
	isCountableUnit,
	roundGroceryQuantity,
} from "./aggregate-grocery-items";

function makeIngredient(overrides: Partial<Ingredient> = {}): Ingredient {
	return {
		id: crypto.randomUUID(),
		text: "chicken",
		quantity: 1,
		unit: "kg",
		checked: false,
		...overrides,
	};
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		prompt: "a dish",
		title: "A Dish",
		overview: "overview",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

describe("roundGroceryQuantity", () => {
	it("rounds mg up to the next multiple of 100", () => {
		expect(roundGroceryQuantity(150, "mg")).toBe(200);
		expect(roundGroceryQuantity(200, "mg")).toBe(200);
		expect(roundGroceryQuantity(1, "mg")).toBe(100);
	});

	it("rounds ml up to the next multiple of 100", () => {
		expect(roundGroceryQuantity(250, "ml")).toBe(300);
		expect(roundGroceryQuantity(300, "ml")).toBe(300);
	});

	it("is case-insensitive for mg/ml", () => {
		expect(roundGroceryQuantity(150, "ML")).toBe(200);
		expect(roundGroceryQuantity(150, "Mg")).toBe(200);
	});

	it("rounds other continuous units up to the next multiple of 0.25", () => {
		expect(roundGroceryQuantity(1.3, "g")).toBe(1.5);
		expect(roundGroceryQuantity(1.1, "cups")).toBe(1.25);
		expect(roundGroceryQuantity(1.25, "kg")).toBe(1.25);
		expect(roundGroceryQuantity(2, "tbsp")).toBe(2);
		expect(roundGroceryQuantity(0.01, "tsp")).toBe(0.25);
	});

	it("rounds countable units up to the next whole number only when fractional", () => {
		expect(roundGroceryQuantity(3, "eggs")).toBe(3);
		expect(roundGroceryQuantity(3.5, "eggs")).toBe(4);
		expect(roundGroceryQuantity(2.1, "cloves")).toBe(3);
		expect(roundGroceryQuantity(1, "pieces")).toBe(1);
	});

	it("treats countable units as case/whitespace-insensitive", () => {
		expect(roundGroceryQuantity(3.2, "  Cloves ")).toBe(4);
	});
});

describe("isCountableUnit", () => {
	it("recognizes every unit in the exported countable-units list", () => {
		for (const unit of COUNTABLE_UNITS) {
			expect(isCountableUnit(unit)).toBe(true);
		}
	});

	it("returns false for continuous units", () => {
		expect(isCountableUnit("g")).toBe(false);
		expect(isCountableUnit("kg")).toBe(false);
		expect(isCountableUnit("ml")).toBe(false);
		expect(isCountableUnit("cups")).toBe(false);
	});
});

describe("aggregateGroceryItems", () => {
	it("combines matching ingredients (same normalized text + unit) across recipes", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "  Chicken  ",
					quantity: 1,
					unit: "kg",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "chicken",
					quantity: 2,
					unit: "kg",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "Chicken",
			unit: "kg",
			quantity: 3,
			source: "recipe",
		});
	});

	it("keeps ingredients with the same name but different units separate", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "flour",
					quantity: 2,
					unit: "cups",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "flour",
					quantity: 500,
					unit: "g",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(2);
		expect(result.map((item) => item.unit).sort()).toEqual(["cups", "g"]);
	});

	it("retains the {recipeId, ingredientId} origins of every merged ingredient", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "garlic",
					quantity: 2,
					unit: "cloves",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "garlic",
					quantity: 3,
					unit: "cloves",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result[0].origins).toEqual([
			{ recipeId: "recipe-a", ingredientId: "ing-a" },
			{ recipeId: "recipe-b", ingredientId: "ing-b" },
		]);
	});

	it("rounds each merged group per its own unit bucket", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "salt",
					quantity: 150,
					unit: "mg",
				}),
				makeIngredient({
					id: "ing-2",
					text: "milk",
					quantity: 250,
					unit: "ml",
				}),
				makeIngredient({
					id: "ing-3",
					text: "sugar",
					quantity: 1.1,
					unit: "cups",
				}),
				makeIngredient({
					id: "ing-4",
					text: "eggs",
					quantity: 3.5,
					unit: "eggs",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);
		const byText = Object.fromEntries(
			result.map((item) => [item.text, item.quantity]),
		);

		expect(byText.salt).toBe(200);
		expect(byText.milk).toBe(300);
		expect(byText.sugar).toBe(1.25);
		expect(byText.eggs).toBe(4);
	});

	it("passes custom ingredients through unmodified and unmerged", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "paper towels",
					quantity: 1,
					unit: "roll",
				}),
			],
		});

		const result = aggregateGroceryItems(
			[recipe],
			[{ text: "paper towels", quantity: 2, unit: "roll" }],
		);

		expect(result).toHaveLength(2);
		const custom = result.find((item) => item.source === "custom");
		expect(custom).toMatchObject({
			text: "paper towels",
			quantity: 2,
			unit: "roll",
			source: "custom",
		});
		expect(custom?.origins).toBeUndefined();

		const recipeItem = result.find((item) => item.source === "recipe");
		expect(recipeItem?.quantity).toBe(1);
	});

	it("scales ingredient quantities to the recipe's current servings, not its base quantity", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			baseServings: 2,
			currentServings: 4,
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "flour",
					quantity: 1,
					unit: "cup",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({ text: "flour", quantity: 2 });
	});

	it("scales each recipe independently before merging matching ingredients", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			baseServings: 2,
			currentServings: 6,
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "garlic",
					quantity: 1,
					unit: "cloves",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			baseServings: 4,
			currentServings: 2,
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "garlic",
					quantity: 2,
					unit: "cloves",
				}),
			],
		});

		// recipeA: 1 * 6/2 = 3, recipeB: 2 * 2/4 = 1 → merged 4
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result[0]).toMatchObject({ text: "garlic", quantity: 4 });
	});

	it("returns an empty array for no recipes and no custom ingredients", () => {
		expect(aggregateGroceryItems([])).toEqual([]);
	});

	it("combines ingredients with the same base name but different descriptions, preserving both as detail (TEST-255 AC2)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "garlic, chopped",
					baseName: "garlic",
					description: "chopped",
					quantity: 2,
					unit: "cloves",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "garlic, minced",
					baseName: "garlic",
					description: "minced",
					quantity: 3,
					unit: "cloves",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "garlic",
			unit: "cloves",
			quantity: 5,
			descriptions: ["chopped", "minced"],
		});
	});

	it("does not add a description twice, and omits the field entirely when there is none", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					baseName: "garlic",
					description: "chopped",
					quantity: 1,
					unit: "cloves",
				}),
				makeIngredient({
					id: "ing-2",
					baseName: "garlic",
					description: "chopped",
					quantity: 1,
					unit: "cloves",
				}),
				makeIngredient({
					id: "ing-3",
					baseName: "onion",
					description: "",
					quantity: 1,
					unit: "whole",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		const garlic = result.find((item) => item.text === "garlic");
		expect(garlic?.descriptions).toEqual(["chopped"]);
		const onion = result.find((item) => item.text === "onion");
		expect(onion?.descriptions).toBeUndefined();
	});

	it("falls back to the ingredient's text as the base name for ingredients saved before the split existed (TEST-255)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "Garlic",
					quantity: 2,
					unit: "cloves",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "garlic",
					description: "",
					quantity: 3,
					unit: "cloves",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ text: "Garlic", quantity: 5 });
	});

	it("assigns each item a unique id and starts every item unchecked", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-1", text: "salt", quantity: 1, unit: "g" }),
			],
		});

		const result = aggregateGroceryItems(
			[recipe],
			[{ text: "napkins", quantity: 1, unit: "pack" }],
		);

		const ids = new Set(result.map((item) => item.id));
		expect(ids.size).toBe(result.length);
		expect(result.every((item) => item.checked === false)).toBe(true);
	});
});

describe("carryOverCheckedState", () => {
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

	it("keeps the checked state of an item whose merged text+unit is unchanged", () => {
		const previous = [makeItem({ text: "shrimp", unit: "lb", checked: true })];
		const next = [
			makeItem({ id: "new-id", text: "shrimp", unit: "lb", checked: false }),
		];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
		// The new item's own id is preserved, only checked is carried over.
		expect(result[0].id).toBe("new-id");
	});

	it("resets a brand new item (no matching text+unit in the previous list) to unchecked", () => {
		const previous = [makeItem({ text: "shrimp", unit: "lb", checked: true })];
		const next = [makeItem({ text: "napkins", unit: "pack", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(false);
	});

	it("resets an item whose unit changed, even if the text is the same", () => {
		const previous = [makeItem({ text: "flour", unit: "cups", checked: true })];
		const next = [makeItem({ text: "flour", unit: "g", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(false);
	});

	it("drops items no longer present without carrying anything over for them", () => {
		const previous = [
			makeItem({ text: "shrimp", unit: "lb", checked: true }),
			makeItem({ text: "garlic", unit: "cloves", checked: true }),
		];
		const next = [makeItem({ text: "shrimp", unit: "lb", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result).toHaveLength(1);
		expect(result[0].checked).toBe(true);
	});

	it("matches on normalized (trimmed, case-insensitive) text and unit", () => {
		const previous = [
			makeItem({ text: "  Shrimp  ", unit: "LB", checked: true }),
		];
		const next = [makeItem({ text: "shrimp", unit: "lb", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
	});

	it("returns an empty array when there are no new items", () => {
		const previous = [makeItem({ checked: true })];

		expect(carryOverCheckedState(previous, [])).toEqual([]);
	});
});

describe("formatGroceryItemLine", () => {
	function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
		return {
			id: crypto.randomUUID(),
			text: "garlic",
			quantity: 5,
			unit: "cloves",
			checked: false,
			source: "recipe",
			...overrides,
		};
	}

	it("renders the base quantity/unit/name line with no descriptions", () => {
		expect(formatGroceryItemLine(makeItem())).toBe("5 cloves garlic");
	});

	it("appends preserved descriptions in parentheses (TEST-255 AC2)", () => {
		expect(
			formatGroceryItemLine(makeItem({ descriptions: ["chopped", "minced"] })),
		).toBe("5 cloves garlic (chopped, minced)");
	});

	it("omits the parentheses for an empty descriptions array", () => {
		expect(formatGroceryItemLine(makeItem({ descriptions: [] }))).toBe(
			"5 cloves garlic",
		);
	});
});
