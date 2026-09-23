import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "#/lib/grocery-list";
import type { Ingredient, Recipe } from "#/lib/recipe";
import {
	aggregateGroceryItems,
	COUNTABLE_UNITS,
	canonicalizeUnitForMerging,
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
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
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
		expect(roundGroceryQuantity(0.75, "jar")).toBe(1);
		expect(roundGroceryQuantity(1.25, "boxes")).toBe(2);
		expect(roundGroceryQuantity(0.5, "packet")).toBe(1);
		expect(roundGroceryQuantity(1.5, "sprigs")).toBe(2);
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

	it("recognizes commercial containers and packaging units", () => {
		expect(isCountableUnit("box")).toBe(true);
		expect(isCountableUnit("boxes")).toBe(true);
		expect(isCountableUnit("jar")).toBe(true);
		expect(isCountableUnit("jars")).toBe(true);
		expect(isCountableUnit("bottle")).toBe(true);
		expect(isCountableUnit("bottles")).toBe(true);
		expect(isCountableUnit("packet")).toBe(true);
		expect(isCountableUnit("packets")).toBe(true);
		expect(isCountableUnit("sprig")).toBe(true);
		expect(isCountableUnit("sprigs")).toBe(true);
	});

	it("returns false for continuous units", () => {
		expect(isCountableUnit("g")).toBe(false);
		expect(isCountableUnit("kg")).toBe(false);
		expect(isCountableUnit("ml")).toBe(false);
		expect(isCountableUnit("cups")).toBe(false);
	});
});

describe("canonicalizeUnitForMerging", () => {
	it("canonicalizes simple -s plurals", () => {
		expect(canonicalizeUnitForMerging("cans")).toBe("can");
		expect(canonicalizeUnitForMerging("bottles")).toBe("bottle");
		expect(canonicalizeUnitForMerging("slices")).toBe("slice");
	});

	it("canonicalizes -es plurals (boxes, bunches, pinches, glasses)", () => {
		expect(canonicalizeUnitForMerging("boxes")).toBe("box");
		expect(canonicalizeUnitForMerging("bunches")).toBe("bunch");
		expect(canonicalizeUnitForMerging("pinches")).toBe("pinch");
		expect(canonicalizeUnitForMerging("glasses")).toBe("glass");
	});

	it("preserves words ending in ss like glass", () => {
		expect(canonicalizeUnitForMerging("glass")).toBe("glass");
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

		// Stay in separate buckets (mass vs. volume, no density to bridge
		// them). The mass one still displays in metric ("g"); the volume one
		// stays in its native unit ("cups") since quinoa isn't a recognized
		// liquid (see liquid-ingredients.ts) — forcing it to ml would be
		// misleading for something bought by weight, not the milliliter.
		expect(result).toHaveLength(2);
		expect(result.map((item) => item.unit).sort()).toEqual(["cups", "g"]);
		expect(result.every((item) => item.approximate === undefined)).toBe(true);
	});

	it("still forces a genuine liquid to metric volume even with no density entry (wine)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [makeIngredient({ id: "ing-a", text: "wine", unit: "cup" })],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "wine",
					quantity: 2,
					unit: "tbsp",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 cup (236.588 ml) + 2 tbsp (29.5736 ml) = 266.1616 ml, rounded up to
		// the nearest 100 -> 300 ml — wine is a recognized liquid, so it's
		// still forced to metric despite having no density entry.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({ unit: "ml", quantity: 300 });
	});

	it("keeps a recognized liquid in metric volume when it's the only unit family used, despite having a density entry (milk)", () => {
		const recipe = makeRecipe({
			ingredients: [makeIngredient({ text: "milk", quantity: 2, unit: "cup" })],
		});

		const result = aggregateGroceryItems([recipe]);

		// Nothing to bridge with — density is never even consulted, so this
		// stays exact volume — 2 cups = 473.176 ml, rounded up to the
		// nearest 100.
		expect(result[0]).toMatchObject({
			unit: "ml",
			quantity: 500,
			approximate: undefined,
		});
	});

	it("keeps a recognized liquid with a modifier in metric volume when it's the only unit family used (chicken broth)", () => {
		const recipe = makeRecipe({
			ingredients: [
				makeIngredient({
					text: "chicken broth",
					quantity: 1,
					unit: "cup",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			unit: "ml",
			approximate: undefined,
		});
	});

	it("merges spaghetti sauce given in grams by two recipes straight into mass, untouched by its liquid classification", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "spaghetti sauce",
					quantity: 100,
					unit: "g",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "spaghetti sauce",
					quantity: 200,
					unit: "g",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "spaghetti sauce",
			unit: "g",
			quantity: 300,
			approximate: undefined,
		});
	});

	it("merges a mass and a volume occurrence of the same liquid into mass, bridging via density and flagging approximate (milk)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-a", text: "milk", quantity: 50, unit: "g" }),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "milk",
					quantity: 100,
					unit: "ml",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 50 g (native, exact) + 100 ml * 1.031 g/mL = 103.1 g (estimated) =
		// 153.1 g, rounded up to the nearest 0.25 -> 153.25 g.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "milk",
			unit: "g",
			quantity: 153.25,
			approximate: true,
		});
	});

	it("merges two volume occurrences of the same liquid without ever consulting density (milk)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-a", text: "milk", quantity: 1, unit: "cup" }),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "milk",
					quantity: 100,
					unit: "ml",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 cup (236.588 ml) + 100 ml = 336.588 ml, rounded up to the
		// nearest 100 -> 400 ml. Exact: both are volume, no bridging needed.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "milk",
			unit: "ml",
			quantity: 400,
			approximate: undefined,
		});
	});

	it("merges two mass occurrences of the same liquid without ever consulting density (milk)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({ id: "ing-a", text: "milk", quantity: 50, unit: "g" }),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({ id: "ing-b", text: "milk", quantity: 100, unit: "g" }),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "milk",
			unit: "g",
			quantity: 150,
			approximate: undefined,
		});
	});

	it("merges a non-liquid volume ingredient with no density in its native unit, largest actually-used", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "chopped carrots",
					quantity: 2,
					unit: "tbsp",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "chopped carrots",
					quantity: 1,
					unit: "cup",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0].unit).toBe("cup");
		expect(result[0].approximate).toBeUndefined();
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

	it("merges a length-measured ingredient with a mass-measured one via its approximate length density (the inches-vs-grams ginger case)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "ginger",
					quantity: 2,
					unit: "inches",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "ginger",
					quantity: 10,
					unit: "g",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 2 inches * ~15 g/inch ginger length-density = 30 g (estimated), + 10 g
		// native = 40 g, already on a 0.25 boundary.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "ginger",
			unit: "g",
			quantity: 40,
			approximate: true,
		});
	});

	it("merges a length-only ingredient with no known length density across differently-spelled units, without any estimate", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "lemongrass",
					quantity: 1,
					unit: "in",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "lemongrass",
					quantity: 1,
					unit: "cm",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 in (2.54 cm) + 1 cm = 3.54 cm = 1.3937 in, rounded up to the next
		// 0.25 -> 1.5 in (the larger of the two units actually used); no length
		// density known for lemongrass, so no estimate involved.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "lemongrass",
			unit: "in",
			quantity: 1.5,
			approximate: undefined,
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

		// 1 tsp (4.92892 ml) + 1 tbsp (14.7868 ml) = 19.71572 ml, displayed in
		// "ml" (always metric now, never "tsp"/"tbsp"), rounded up to the
		// nearest 100 ml -> 100 ml; no density needed, so not approximate.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "vanilla extract",
			unit: "ml",
			quantity: 100,
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
					unit: "jar",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(2);
		expect(result.map((item) => item.unit).sort()).toEqual(["can", "jar"]);
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

	it("falls back to a bare unitless display for a count group whose only unit is a multiplier like dozen, not an individual-item alias", () => {
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
		// to a bare unitless display rather than a "piece" label that was
		// never actually used. 2 dozen = 24.
		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "dinner rolls",
			unit: "",
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
		// Quinoa isn't a recognized liquid (see liquid-ingredients.ts) and has
		// no density entry, so it stays in its native "cups" unit — 1.1
		// rounded up to the nearest 0.25 -> 1.25.
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

		// 1 cup scaled to 2 cups — quinoa isn't a recognized liquid, so it
		// stays in its native "cup" unit rather than being forced to ml.
		expect(result[0]).toMatchObject({
			text: "quinoa",
			unit: "cup",
			quantity: 2,
		});
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

	it("combines ingredients with the same base name but different descriptions (TEST-255 AC2)", () => {
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
			approximate: true,
		});
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

	it("merges a plain ingredient with a size-described one (the medium-onion case)", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "onion",
					description: "",
					quantity: 1,
					unit: "whole",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "medium onion",
					description: "",
					quantity: 1,
					unit: "whole",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "onion",
			unit: "whole",
			quantity: 2,
		});
	});

	it("merges a size-described ingredient with a differently-described one under the same base name", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "large onion",
					description: "diced",
					quantity: 1,
					unit: "whole",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "onion",
					description: "chopped",
					quantity: 1,
					unit: "whole",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "onion",
			quantity: 2,
		});
	});

	it("merges a bare unitless whole item with an explicit 'whole'/'piece' unit for the same ingredient", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "large onion",
					description: "",
					quantity: 1,
					unit: "whole",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "onion",
					description: "",
					quantity: 1,
					unit: "",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "onion",
			unit: "",
			quantity: 2,
		});
	});

	it("merges when Groq puts the size word in the unit field instead of the base name", () => {
		// Real data observed in the wild: same baseName ("onion") in both, but
		// one occurrence has the size word as its `unit` ("large") rather than
		// folded into `description` or `baseName` like the size-descriptor
		// stripping above expects.
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "onion",
					description: "sliced",
					quantity: 1,
					unit: "large",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "onion",
					description: "large, quartered",
					quantity: 1,
					unit: "",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "onion",
			unit: "",
			quantity: 2,
		});
	});

	it("merges an unrecognized unit's singular and plural spelling (e.g. 'can'/'cans')", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "diced tomatoes",
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
					baseName: "diced tomatoes",
					quantity: 2,
					unit: "cans",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "diced tomatoes",
			quantity: 3,
		});
	});

	it("merges -es plural units (e.g. 'box'/'boxes')", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "pasta",
					quantity: 1,
					unit: "box",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "pasta",
					quantity: 2,
					unit: "boxes",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "pasta",
			quantity: 3,
			unit: "box",
		});
	});

	it("does not fold two genuinely different unrecognized units together", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "cheese",
					quantity: 1,
					unit: "block",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					baseName: "cheese",
					quantity: 4,
					unit: "slices",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(2);
	});

	it("displays a group built entirely from a scaled count unit (e.g. 'dozen') without a bogus 'piece' label", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "eggs",
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
					baseName: "eggs",
					quantity: 2,
					unit: "dozen",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "eggs",
			unit: "",
			quantity: 36,
		});
	});

	it("merges eggs across differently-sized descriptions too, since the user chose to leave size to the shopper", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					baseName: "large eggs",
					description: "",
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
					baseName: "eggs",
					description: "",
					quantity: 6,
					unit: "eggs",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "eggs",
			unit: "eggs",
			quantity: 12,
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

	it("carries an ingredient's category onto its grocery item", () => {
		const recipe = makeRecipe({
			ingredients: [
				makeIngredient({
					text: "chicken breast",
					quantity: 1,
					unit: "kg",
					category: "Meat & Seafood",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0].category).toBe("Meat & Seafood");
	});

	it('defaults to "Other" when the ingredient has no category (saved before this field existed)', () => {
		const recipe = makeRecipe({
			ingredients: [makeIngredient({ text: "mystery", category: undefined })],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0].category).toBe("Other");
	});

	it("keeps the first-seen category when merging occurrences from multiple recipes", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "chicken breast",
					quantity: 1,
					unit: "kg",
					category: "Meat & Seafood",
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "chicken breast",
					quantity: 500,
					unit: "g",
					category: "Other",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		expect(result).toHaveLength(1);
		expect(result[0].category).toBe("Meat & Seafood");
	});

	it("does not set a category on a custom ingredient", () => {
		const result = aggregateGroceryItems(
			[],
			[{ text: "napkins", quantity: 1, unit: "pack" }],
		);

		expect(result[0].category).toBeUndefined();
	});

	it("bridges a unitless count ingredient into the mass bucket via approxGramsPerUnit", () => {
		const recipe = makeRecipe({
			ingredients: [
				makeIngredient({
					text: "onion",
					quantity: 1,
					unit: "",
					approxGramsPerUnit: 150,
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "onion",
			unit: "g",
			quantity: 150,
			approximate: true,
		});
	});

	it("merges a unitless count occurrence with a real-weight occurrence of the same ingredient", () => {
		const recipeA = makeRecipe({
			id: "recipe-a",
			ingredients: [
				makeIngredient({
					id: "ing-a",
					text: "onion",
					quantity: 1,
					unit: "",
					approxGramsPerUnit: 150,
				}),
			],
		});
		const recipeB = makeRecipe({
			id: "recipe-b",
			ingredients: [
				makeIngredient({
					id: "ing-b",
					text: "onion",
					quantity: 200,
					unit: "g",
				}),
			],
		});

		const result = aggregateGroceryItems([recipeA, recipeB]);

		// 1 onion (~150 g, estimated) + 200 g (native) = 350 g, already a
		// multiple of 0.25 -> stays 350.
		expect(result).toHaveLength(1);
		expect(result[0]).toMatchObject({
			text: "onion",
			unit: "g",
			quantity: 350,
			approximate: true,
		});
	});

	it("keeps a unitless count ingredient as a plain count when no approxGramsPerUnit is given (e.g. eggs)", () => {
		const recipe = makeRecipe({
			ingredients: [
				makeIngredient({
					text: "eggs",
					quantity: 3,
					unit: "",
					approxGramsPerUnit: null,
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		expect(result[0]).toMatchObject({
			text: "eggs",
			unit: "",
			quantity: 3,
			approximate: undefined,
		});
	});

	it("scales the approxGramsPerUnit-bridged contribution by servings", () => {
		const recipe = makeRecipe({
			baseServings: 2,
			currentServings: 4,
			ingredients: [
				makeIngredient({
					text: "potato",
					quantity: 1,
					unit: "",
					approxGramsPerUnit: 150,
					scalingClass: "linear",
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		// 1 piece scaled linearly to 2 pieces * 150 g = 300 g.
		expect(result[0]).toMatchObject({ unit: "g", quantity: 300 });
	});

	it("scales sublinear ingredients with dampened scaling when aggregating", () => {
		const recipe = makeRecipe({
			baseServings: 2,
			currentServings: 4,
			ingredients: [
				makeIngredient({
					text: "onion",
					quantity: 1,
					unit: "",
					approxGramsPerUnit: 150,
				}),
			],
		});

		const result = aggregateGroceryItems([recipe]);

		// 1 onion scaled from 2 to 4 servings with ratio 2: 2^0.6 ≈ 1.516 * 150 g = 227.5 g
		expect(result[0]?.unit).toBe("g");
		expect(result[0]?.quantity).toBeCloseTo(227.5, 1);
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
		const previous = [
			makeItem({ id: "old-id", text: "shrimp", unit: "lb", checked: true }),
		];
		const next = [
			makeItem({ id: "new-id", text: "shrimp", unit: "lb", checked: false }),
		];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
		// The previous item's id is reused, not the fresh one aggregation just
		// minted — a minor nicety (avoids an unnecessary React remount), not
		// load-bearing for sync (see the function's own comment).
		expect(result[0].id).toBe("old-id");
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

	it("keeps the checked state of a recognized liquid with density across mass and volume units", () => {
		const previous = [makeItem({ text: "milk", unit: "g", checked: true })];
		const next = [makeItem({ text: "milk", unit: "ml", checked: false })];

		const result = carryOverCheckedState(previous, next);

		expect(result[0].checked).toBe(true);
	});

	it("assigns distinct IDs and checked states to duplicate items with the same key", () => {
		const item1 = makeItem({
			id: "id-1",
			text: "eggs",
			unit: "",
			checked: true,
		});
		const item2 = makeItem({
			id: "id-2",
			text: "eggs",
			unit: "",
			checked: false,
		});
		const next1 = makeItem({
			id: "fresh-1",
			text: "eggs",
			unit: "",
			checked: false,
		});
		const next2 = makeItem({
			id: "fresh-2",
			text: "eggs",
			unit: "",
			checked: false,
		});

		const result = carryOverCheckedState([item1, item2], [next1, next2]);

		expect(result).toHaveLength(2);
		expect(result[0].id).toBe("id-1");
		expect(result[0].checked).toBe(true);
		expect(result[1].id).toBe("id-2");
		expect(result[1].checked).toBe(false);
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

	it("renders the base quantity/unit/name line", () => {
		expect(formatGroceryItemLine(makeItem())).toBe("5 cloves garlic");
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

	it("does not prefix when approximate is false or unset", () => {
		expect(formatGroceryItemLine(makeItem({ approximate: false }))).toBe(
			"5 cloves garlic",
		);
	});
});
