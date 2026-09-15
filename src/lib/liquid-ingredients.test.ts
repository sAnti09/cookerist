import { describe, expect, it } from "vitest";
import { isLiquidIngredient } from "./liquid-ingredients";

describe("isLiquidIngredient", () => {
	it("recognizes a bare liquid name", () => {
		expect(isLiquidIngredient("water")).toBe(true);
		expect(isLiquidIngredient("milk")).toBe(true);
		expect(isLiquidIngredient("broth")).toBe(true);
	});

	it("recognizes a liquid with a leading modifier", () => {
		expect(isLiquidIngredient("chicken broth")).toBe(true);
		expect(isLiquidIngredient("olive oil")).toBe(true);
		expect(isLiquidIngredient("orange juice")).toBe(true);
		expect(isLiquidIngredient("vanilla extract")).toBe(true);
		expect(isLiquidIngredient("soy sauce")).toBe(true);
	});

	it("is case/whitespace insensitive", () => {
		expect(isLiquidIngredient("  Chicken Broth  ")).toBe(true);
	});

	it("returns false for a solid measured by volume for cooking convenience", () => {
		expect(isLiquidIngredient("carrot")).toBe(false);
		expect(isLiquidIngredient("chopped carrots")).toBe(false);
		expect(isLiquidIngredient("black pepper")).toBe(false);
		expect(isLiquidIngredient("quinoa")).toBe(false);
		expect(isLiquidIngredient("flour")).toBe(false);
	});

	it("returns false for an empty string", () => {
		expect(isLiquidIngredient("")).toBe(false);
		expect(isLiquidIngredient("   ")).toBe(false);
	});

	it("only matches the last word, not an unrelated ingredient that merely contains a liquid word", () => {
		// "oil" is a liquid, but "boil" the word isn't "oil" as a whole word.
		expect(isLiquidIngredient("hard-boiled egg")).toBe(false);
	});

	it("does not classify a dry/powdered form of a liquid word as a liquid", () => {
		// Milk powder is a dry, weighable product, not the liquid, even though
		// it ends in "milk" (or contains "powder"/"powdered"/"dry") — see
		// ingredient-density.ts's own "milk powder"/"powdered milk"/"dry milk"
		// entries, which this guard exists specifically not to shadow.
		expect(isLiquidIngredient("dry milk")).toBe(false);
		expect(isLiquidIngredient("powdered milk")).toBe(false);
		expect(isLiquidIngredient("milk powder")).toBe(false);
		expect(isLiquidIngredient("dried cranberries")).toBe(false);
	});
});
