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
		// "olive oil" itself is a multi-word override (0.913, distinct from the
		// generic "oil" fallback at 0.921) — matched via the 2-word suffix
		// before the "virgin"/"extra" modifiers are ever considered.
		expect(lookupIngredientDensity("extra virgin olive oil")).toBeCloseTo(
			0.913,
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
		expect(lookupIngredientDensity("chicken broth")).toBeCloseTo(1.014);
	});

	it("gives a dairy powder its own much lower density instead of the generic liquid-milk fallback", () => {
		// "milk" alone (liquid) is much denser than milk powder — without an
		// explicit "powdered milk"/"dry milk" override, both would incorrectly
		// resolve to the same (wrong) value via the bare "milk" fallback.
		expect(lookupIngredientDensity("milk")).toBeCloseTo(1.031);
		expect(lookupIngredientDensity("powdered milk")).toBeCloseTo(0.541);
		expect(lookupIngredientDensity("dry milk")).toBeCloseTo(0.541);
		expect(lookupIngredientDensity("powdered milk")).not.toBeCloseTo(
			lookupIngredientDensity("milk") as number,
		);
	});

	it("gives coconut milk its own density instead of the dairy-milk fallback", () => {
		expect(lookupIngredientDensity("coconut milk")).toBeCloseTo(0.955);
	});

	it("gives rice flour and oat flour their own density instead of the wheat-flour fallback", () => {
		expect(lookupIngredientDensity("rice flour")).toBeCloseTo(0.668);
		expect(lookupIngredientDensity("oat flour")).toBeCloseTo(0.44);
		expect(lookupIngredientDensity("flour")).toBeCloseTo(0.528);
	});

	it("corrects heavy/whipping cream to a liquid-appropriate density rather than SR Legacy's post-whip figure", () => {
		// Sanity-checked against half-and-half's own SR Legacy liquid figure
		// (1.023) — heavy cream should be in the same ballpark, not roughly
		// half of it.
		expect(lookupIngredientDensity("heavy cream")).toBeCloseTo(1.014);
		expect(lookupIngredientDensity("half and half")).toBeCloseTo(1.023);
	});
});
