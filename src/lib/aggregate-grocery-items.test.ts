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

	it("keeps ingredients with the same name but different-dimension units separate when the ingredient has no known density", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "quinoa",
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
					text: "quinoa",
					quantity: 500,
					unit: "g",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(2);
		expect(result.map((item) => item.unit).sort()).toEqual(["cups", "g"]);
		expect(result.every((item) => item.approximate === undefined)).toBe(true);
	});

	it("merges a known-density ingredient's volume-only units straight into an approximate weight, since it's normally bought by weight", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "sugar",
					quantity: 1,
					unit: "tbsp",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "sugar",
					quantity: 1,
					unit: "cup",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 tbsp + 1 cup = 251.3748 ml * ~0.845 g/ml sugar density ≈ 212.4 g,
		// rounded up to the next 0.25 g -> 212.5 g. Flagged approximate since a
		// density estimate was needed even though every source unit was volume.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "sugar",
			unit: "g",
			quantity: 212.5,
			approximate: true,
		});
	});

	it("merges a known-density ingredient's mass and volume units into one approximate weight (the cups-vs-grams sugar/flour case)", () => {
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

		// 2 cups (473.176 ml) * ~0.528 g/ml flour density ≈ 249.8 g, + 500 g
		// native ≈ 749.8 g, rounded up to the next 0.25 g -> 750 g.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "flour",
			unit: "g",
			quantity: 750,
			approximate: true,
		});
	});

	it("displays a pure density-bridged mass total in kg when its magnitude warrants it", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "honey",
					quantity: 3,
					unit: "cups",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		// 3 cups (709.764 ml) * ~1.433 g/ml honey density ≈ 1017.1 g, rounded up
		// to the next 0.25 kg -> 1.25 kg (no native mass unit to anchor on, so
		// magnitude picks the display unit).
		expect(result[0]).toMatchObject({
			text: "honey",
			unit: "kg",
			quantity: 1.25,
			approximate: true,
		});
	});

	it("displays a pure density-bridged mass total in mg when its magnitude warrants it", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "sugar",
					quantity: 0.001,
					unit: "tbsp",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		// 0.001 tbsp (0.0147868 ml) * ~0.845 g/ml sugar density ≈ 0.0125 g,
		// rounded up to the next 100 mg -> 100 mg.
		expect(result[0]).toMatchObject({
			text: "sugar",
			unit: "mg",
			quantity: 100,
			approximate: true,
		});
	});

	it("prefers magnitude-based mg/g/kg over a disproportionately tiny native mass unit once density estimation is involved", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "sugar",
					quantity: 1,
					unit: "cup",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "sugar",
					quantity: 500,
					unit: "mg",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 cup (236.588 ml) * ~0.845 g/ml sugar density ≈ 199.9 g (estimated) +
		// 500 mg (0.5 g, native) ≈ 200.4 g, rounded up to the next 0.25 g ->
		// 200.5 g. Without this rule, "mg" being the only *native* mass unit
		// present would otherwise anchor the display on it despite contributing
		// almost nothing to the total, producing an unreadable "≈200500 mg".
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "sugar",
			unit: "g",
			quantity: 200.5,
			approximate: true,
		});
	});

	it("merges ingredients with the same name across different units of the same dimension (volume) when no density is known", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "vanilla extract",
					quantity: 1,
					unit: "tsp",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "vanilla extract",
					quantity: 1,
					unit: "tbsp",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 tsp (4.92892 ml) + 1 tbsp (14.7868 ml) = 19.71572 ml = 1.333 tbsp,
		// rounded up to the nearest 0.25 -> displayed in "tbsp" since it's the
		// larger of the two units used; no density needed, so not approximate.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "vanilla extract",
			unit: "tbsp",
			quantity: 1.5,
			approximate: undefined,
		});
	});

	it("merges ingredients with the same name across different units of the same dimension (mass)", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "butter",
					quantity: 500,
					unit: "g",
				}),
				makeIngredient({
					id: "ing-2",
					text: "butter",
					quantity: 1,
					unit: "kg",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		// 500 g + 1000 g (1 kg) = 1500 g, displayed in "kg" (the larger unit
		// used) -> 1.5 kg, already on a 0.25 boundary.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "butter",
			unit: "kg",
			quantity: 1.5,
		});
	});

	it("does not merge count-based units even when they'd share a base name (a can and a jar aren't interchangeable)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "tomatoes",
					quantity: 1,
					unit: "can",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "tomatoes",
					quantity: 2,
					unit: "cans",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(2);
		expect(result.map((item) => item.unit).sort()).toEqual(["can", "cans"]);
	});

	it("merges eggs across generic count phrasings into an exact individual-item total, not a rounded-up dozen count", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "eggs",
					quantity: 6,
					unit: "eggs",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "eggs",
					quantity: 1,
					unit: "dozen",
				}),
			],
		});

		// 6 eggs + 1 dozen (12) = 18 -- displayed as a plain egg count, not "2
		// dozen" (which would overstate what's needed by 6, unlike a continuous
		// quantity where a bigger unit just makes the number easier to read).
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "eggs",
			unit: "eggs",
			quantity: 18,
			approximate: undefined,
		});
	});

	it("merges eggs across three generic count phrasings (eggs, dozen, half dozen)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "eggs",
					quantity: 1,
					unit: "dozen",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "eggs",
					quantity: 6,
					unit: "eggs",
				}),
			],
		});
		const recipeC = makeRecipe({
			id: "recipe-c",
			ingredients: [
				makeIngredient({
					id: "ing-c",
					text: "eggs",
					quantity: 1,
					unit: "half dozen",
				}),
			],
		});

		// 12 + 6 + 6 = 24, still a plain egg count.
		const result = aggregateGroceryItems([recipeA, recipeB, recipeC]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "eggs",
			unit: "eggs",
			quantity: 24,
			approximate: undefined,
		});
	});

	it("merges garlic cloves and a whole bulb via its approximate piece ratio, rounding up to a whole number of bulbs", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "garlic",
					quantity: 7,
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
					quantity: 1,
					unit: "whole",
				}),
			],
		});

		// 7 cloves / 10 (garlic's approximate cloves-per-bulb ratio) + 1 whole =
		// 1.7 bulbs, rounded up to 2 (can't buy a fraction of a bulb) -> plural.
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "garlic",
			unit: "bulbs",
			quantity: 2,
			approximate: true,
		});
	});

	it("merges garlic given only whole-bulb units as an exact sum, not flagged approximate", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "garlic",
					quantity: 2,
					unit: "whole",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "garlic",
					quantity: 1,
					unit: "whole",
				}),
			],
		});

		// No cloves-to-bulb ratio math was ever invoked -- 2 + 1 whole bulbs is
		// an exact sum, so this must NOT be flagged approximate.
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "garlic",
			unit: "bulbs",
			quantity: 3,
			approximate: undefined,
		});
	});

	it("converts a lone garlic-cloves entry to its approximate bulb equivalent, even with no merging opportunity", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "garlic",
					quantity: 7,
					unit: "cloves",
				}),
			],
		});

		// Always showing the purchasable unit (a bulb) is intentional even when
		// there's nothing to merge with -- 7/10 = 0.7, rounded up to 1 bulb.
		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "garlic",
			unit: "bulb",
			quantity: 1,
			approximate: true,
		});
	});

	it("merges bread loaves and slices via its approximate piece ratio", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "bread",
					quantity: 1,
					unit: "loaf",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "bread",
					quantity: 4,
					unit: "slices",
				}),
			],
		});

		// 1 loaf + 4 slices / 20 (bread's approximate slices-per-loaf ratio) =
		// 1.2 loaves, rounded up to 2 -> plural "loaves".
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "bread",
			unit: "loaves",
			quantity: 2,
			approximate: true,
		});
	});

	it("falls back to a generic 'piece' display unit for a count group whose only unit is a multiplier like dozen, not an individual-item alias", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "dinner rolls",
					quantity: 2,
					unit: "dozen",
				}),
			],
		});

		// No ingredient-specific piece ratio, and the only unit ever used
		// ("dozen") isn't itself an individual-item alias (its toBase is 12,
		// not 1) -- there's nothing in `unitsUsed` to echo back, so this falls
		// to the generic "piece" label. 2 dozen = 24.
		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "dinner rolls",
			unit: "piece",
			quantity: 24,
			approximate: undefined,
		});
	});

	it("leaves a count-based ingredient with no piece ratio and no merge opportunity unaffected", () => {
		const recipe = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-1",
					text: "lettuce",
					quantity: 3,
					unit: "heads",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "lettuce",
			unit: "heads",
			quantity: 3,
			approximate: undefined,
		});
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
					text: "broth",
					quantity: 250,
					unit: "ml",
				}),
				makeIngredient({
					id: "ing-3",
					text: "quinoa",
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
		expect(byText.broth).toBe(300);
		expect(byText.quinoa).toBe(1.25);
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
					text: "quinoa",
					quantity: 1,
					unit: "cup",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({ text: "quinoa", quantity: 2 });
	});

	it("scales each recipe independently before merging matching ingredients", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			baseServings: 2,
			currentServings: 6,
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "shrimp",
					quantity: 1,
					unit: "pieces",
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
					text: "shrimp",
					quantity: 2,
					unit: "pieces",
				}),
			],
		});

		// recipeA: 1 * 6/2 = 3, recipeB: 2 * 2/4 = 1 → merged 4. "pieces" is a
		// generic count unit (no ingredient-specific piece ratio for "shrimp"),
		// so this merges as an exact sum with no rounding/estimation involved --
		// unlike "cloves" (see the garlic tests below), which would obscure this
		// test's actual point (independent per-recipe scaling before merging)
		// behind piece-ratio rounding.
		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result[0]).toMatchObject({
			text: "shrimp",
			unit: "pieces",
			quantity: 4,
			approximate: undefined,
		});
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

		// 2 cloves + 3 cloves = 5 cloves; garlic has a known piece ratio (10
		// cloves/bulb, see ingredient-piece-ratio.ts), so this converts to
		// 5/10 = 0.5 bulb, rounded up to 1 bulb -- can't buy half a bulb.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "garlic",
			unit: "bulb",
			quantity: 1,
			descriptions: ["chopped", "minced"],
			approximate: true,
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

		// 2 cloves + 3 cloves = 5 cloves -> 5/10 bulb, rounded up to 1 bulb (see
		// the piece-ratio test above for the same arithmetic).
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "Garlic",
			unit: "bulb",
			quantity: 1,
			approximate: true,
		});
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

	it("keeps the checked state of a piece-ratio ingredient across its singular/plural container unit (e.g. garlic bulb -> bulbs)", () => {
		const previous = [
			makeItem({ text: "garlic", unit: "bulb", checked: true }),
		];
		const next = [makeItem({ text: "garlic", unit: "bulbs", checked: false })];

		// "bulb"/"bulbs" aren't in unit-conversion.ts's generic unit table at
		// all -- they're only meaningful via garlic's own piece ratio (see
		// ingredient-piece-ratio.ts) -- so this specifically exercises
		// checkedStateKey's piece-ratio lookup, not getUnitDimension.
		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
	});

	it("keeps the checked state of a piece-ratio ingredient across its sub-piece and container units (e.g. garlic cloves -> bulb)", () => {
		const previous = [
			makeItem({ text: "garlic", unit: "cloves", checked: true }),
		];
		const next = [makeItem({ text: "garlic", unit: "bulb", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
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

	it("prefixes the line with ≈ for an approximate (density-estimated) quantity", () => {
		expect(
			formatGroceryItemLine(
				makeItem({
					text: "sugar",
					quantity: 212.5,
					unit: "g",
					approximate: true,
				}),
			),
		).toBe("≈212.5 g sugar");
	});

	it("prefixes before the descriptions parentheses when both are present", () => {
		expect(
			formatGroceryItemLine(
				makeItem({
					text: "sugar",
					quantity: 212.5,
					unit: "g",
					approximate: true,
					descriptions: ["packed"],
				}),
			),
		).toBe("≈212.5 g sugar (packed)");
	});

	it("does not prefix when approximate is false or unset", () => {
		expect(formatGroceryItemLine(makeItem({ approximate: false }))).toBe(
			"5 cloves garlic",
		);
	});
});
