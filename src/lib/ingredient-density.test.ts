import { describe, expect, it } from "vitest";
import { lookupIngredientDensity } from "./ingredient-density";

describe("lookupIngredientDensity", () => {
	it("finds a generic single-word match", () => {
		expect(lookupIngredientDensity("sugar")).toBeCloseTo(0.845);
		expect(lookupIngredientDensity("flour")).toBeCloseTo(0.528);
	});

	it("is case/whitespace-insensitive", () => {
		expect(lookupIngredientDensity("  Sugar  ")).toBeCloseTo(0.845);
	});

	it("prefers a more specific multi-word match over the generic fallback", () => {
		expect(lookupIngredientDensity("brown sugar")).toBeCloseTo(0.93);
		expect(lookupIngredientDensity("sugar")).toBeCloseTo(0.845);
		expect(lookupIngredientDensity("brown sugar")).not.toBeCloseTo(
			lookupIngredientDensity("sugar") as number,
		);
	});

	it("falls back to a generic single-word match when a descriptive modifier precedes it", () => {
		expect(lookupIngredientDensity("granulated sugar")).toBeCloseTo(0.845);
		expect(lookupIngredientDensity("all-purpose flour")).toBeCloseTo(0.528);
		// "bread flour" itself is a multi-word override (0.579, distinct from
		// the generic "flour" fallback at 0.528) — matched via the 2-word
		// suffix before the "coarse"/"extra" modifiers are ever considered.
		expect(lookupIngredientDensity("extra coarse bread flour")).toBeCloseTo(
			0.579,
		);
	});

	it("does not match a table word that's only a modifier, not the head noun", () => {
		// "sugar snap peas" is a real grocery product, not sugar — the head
		// noun is "peas", which isn't in the table, so this must return null
		// rather than incorrectly picking up the "sugar" density.
		expect(lookupIngredientDensity("sugar snap peas")).toBeNull();
	});

	it("returns null for an ingredient with no known density", () => {
		expect(lookupIngredientDensity("chicken breast")).toBeNull();
		expect(lookupIngredientDensity("garlic")).toBeNull();
		expect(lookupIngredientDensity("")).toBeNull();
	});

	it("has entries for genuine liquids too — used only conditionally by aggregate-grocery-items.ts's liquid bucket", () => {
		// A density entry existing here doesn't mean the ingredient always
		// displays in mass — see liquid-ingredients.ts's "liquid" bucket,
		// which only consults this when a real mass occurrence of the same
		// liquid also exists to bridge into.
		expect(lookupIngredientDensity("milk")).toBeCloseTo(1.031);
		expect(lookupIngredientDensity("olive oil")).toBeCloseTo(0.913);
		expect(lookupIngredientDensity("chicken broth")).toBeCloseTo(1.014);
		expect(lookupIngredientDensity("vinegar")).toBeCloseTo(1.01);
		expect(lookupIngredientDensity("heavy cream")).toBeCloseTo(1.014);
	});

	it("gives cottage cheese its own density instead of the generic hard-cheese fallback", () => {
		// Cottage cheese (a wet curd cheese, close to water density) is nothing
		// like cheddar's density — without an explicit override, the bare
		// "cheese" fallback (which ends in the same last word) would silently
		// apply cheddar's much lower value here.
		expect(lookupIngredientDensity("cottage cheese")).toBeCloseTo(0.951);
		expect(lookupIngredientDensity("cottage cheese")).not.toBeCloseTo(
			lookupIngredientDensity("cheese") as number,
		);
	});

	it("covers a broad set of pantry staples sourced from USDA FoodData Central", () => {
		expect(lookupIngredientDensity("rice")).toBeCloseTo(0.782);
		expect(lookupIngredientDensity("butter")).toBeCloseTo(0.96);
		expect(lookupIngredientDensity("honey")).toBeCloseTo(1.433);
		expect(lookupIngredientDensity("cornstarch")).toBeCloseTo(0.541);
		expect(lookupIngredientDensity("almonds")).toBeCloseTo(0.613);
		expect(lookupIngredientDensity("cinnamon")).toBeCloseTo(0.527);
		expect(lookupIngredientDensity("kidney beans")).toBeCloseTo(0.778);
	});

	it("gives a dairy powder its own density, distinct from the generic cheese fallback", () => {
		// Milk powder isn't a liquid (see liquid-ingredients.ts's "dry"/
		// "powder" guard) — it's a genuinely dry, weighable product, so it
		// keeps its own density entry here despite "milk" itself having none.
		expect(lookupIngredientDensity("powdered milk")).toBeCloseTo(0.541);
		expect(lookupIngredientDensity("dry milk")).toBeCloseTo(0.541);
		expect(lookupIngredientDensity("milk powder")).toBeCloseTo(0.541);
	});

	it("gives rice flour and oat flour their own density instead of the wheat-flour fallback", () => {
		expect(lookupIngredientDensity("rice flour")).toBeCloseTo(0.668);
		expect(lookupIngredientDensity("oat flour")).toBeCloseTo(0.44);
		expect(lookupIngredientDensity("flour")).toBeCloseTo(0.528);
	});

	it("keeps half and half's own density (not classified as a liquid by name)", () => {
		// "half and half" doesn't end in one of liquid-ingredients.ts's
		// recognized liquid words, so it still goes through density bridging
		// like a dry/solid staple would — a known, accepted coverage gap
		// rather than a hardcoded special case.
		expect(lookupIngredientDensity("half and half")).toBeCloseTo(1.023);
	});

	it("matches singular and plural forms of ingredients", () => {
		expect(lookupIngredientDensity("almond")).toBeCloseTo(0.613);
		expect(lookupIngredientDensity("chickpea")).toBeCloseTo(0.845);
		expect(lookupIngredientDensity("raisin")).toBeCloseTo(0.697);
		expect(lookupIngredientDensity("walnut")).toBeCloseTo(0.494);
	});
});
