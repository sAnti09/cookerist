import { describe, expect, it } from "vitest";
import { highlightIngredientMentions } from "./highlight-ingredients";
import type { Ingredient } from "./recipe";

function ingredient(overrides: Partial<Ingredient> = {}): Ingredient {
	return {
		id: overrides.id ?? crypto.randomUUID(),
		text: overrides.text ?? "shrimp",
		quantity: overrides.quantity ?? 1,
		unit: overrides.unit ?? "",
		checked: overrides.checked ?? false,
		baseName: overrides.baseName,
		description: overrides.description,
	};
}

describe("highlightIngredientMentions", () => {
	it("skips an ingredient with no usable name instead of crashing", () => {
		const result = highlightIngredientMentions("Chop garlic finely", [
			ingredient({ text: "", baseName: undefined }),
			ingredient({ baseName: "garlic" }),
		]);

		expect(result).toContainEqual({ text: "garlic", matched: true });
	});

	it("returns the whole text unmatched when there are no ingredients", () => {
		expect(highlightIngredientMentions("Chop garlic finely", [])).toEqual([
			{ text: "Chop garlic finely", matched: false },
		]);
	});

	it("highlights a single ingredient mention, splitting the surrounding text", () => {
		const result = highlightIngredientMentions("Chop garlic finely", [
			ingredient({ baseName: "garlic" }),
		]);

		expect(result).toEqual([
			{ text: "Chop ", matched: false },
			{ text: "garlic", matched: true },
			{ text: " finely", matched: false },
		]);
	});

	it("matches case-insensitively while preserving the original text casing", () => {
		const result = highlightIngredientMentions("Add Garlic to the pan", [
			ingredient({ baseName: "garlic" }),
		]);

		expect(result).toContainEqual({ text: "Garlic", matched: true });
	});

	it("matches a multi-word base name as a single mention", () => {
		const result = highlightIngredientMentions(
			"Season the chicken breast with salt",
			[ingredient({ baseName: "chicken breast" })],
		);

		expect(result).toContainEqual({
			text: "chicken breast",
			matched: true,
		});
	});

	it("prefers the longer overlapping ingredient name", () => {
		const result = highlightIngredientMentions(
			"Sear the chicken breast until golden",
			[
				ingredient({ baseName: "chicken" }),
				ingredient({ baseName: "chicken breast" }),
			],
		);

		expect(result).toContainEqual({ text: "chicken breast", matched: true });
		expect(result).not.toContainEqual({ text: "chicken", matched: true });
	});

	it("allows a simple plural match", () => {
		const result = highlightIngredientMentions("Add 2 cloves of garlic", [
			ingredient({ baseName: "clove" }),
		]);

		expect(result).toContainEqual({ text: "cloves", matched: true });
	});

	it("does not match an ingredient name inside a longer, unrelated word", () => {
		const result = highlightIngredientMentions("Slice the eggplant", [
			ingredient({ baseName: "egg" }),
		]);

		expect(result).toEqual([{ text: "Slice the eggplant", matched: false }]);
	});

	it("falls back to the ingredient's text when baseName is absent", () => {
		const result = highlightIngredientMentions("Peel the shrimp", [
			ingredient({ text: "shrimp", baseName: undefined }),
		]);

		expect(result).toContainEqual({ text: "shrimp", matched: true });
	});

	it("escapes regex special characters in an ingredient name", () => {
		const result = highlightIngredientMentions(
			"Add the chili (dried) to the pot",
			[ingredient({ baseName: "chili (dried)" })],
		);

		expect(result).toContainEqual({ text: "chili (dried)", matched: true });
	});

	it("matches a name that doesn't start with a word character", () => {
		const result = highlightIngredientMentions("Season with (smoked) paprika", [
			ingredient({ baseName: "(smoked) paprika" }),
		]);

		expect(result).toContainEqual({
			text: "(smoked) paprika",
			matched: true,
		});
	});

	it("highlights multiple distinct ingredients in the same step", () => {
		const result = highlightIngredientMentions(
			"Combine the garlic and shrimp in the pan",
			[ingredient({ baseName: "garlic" }), ingredient({ baseName: "shrimp" })],
		);

		expect(result).toEqual([
			{ text: "Combine the ", matched: false },
			{ text: "garlic", matched: true },
			{ text: " and ", matched: false },
			{ text: "shrimp", matched: true },
			{ text: " in the pan", matched: false },
		]);
	});

	it("returns the whole text unmatched when no ingredient appears in it", () => {
		const result = highlightIngredientMentions("Preheat the oven", [
			ingredient({ baseName: "garlic" }),
		]);

		expect(result).toEqual([{ text: "Preheat the oven", matched: false }]);
	});

	describe("head-noun fallback", () => {
		it("falls back to a multi-word name's last word when only that word appears", () => {
			const result = highlightIngredientMentions(
				"Proof the yeast in warm water",
				[ingredient({ baseName: "dry yeast" })],
			);

			expect(result).toContainEqual({ text: "yeast", matched: true });
		});

		it("never highlights an earlier modifier word on its own", () => {
			const result = highlightIngredientMentions(
				"Keep the flour dry before adding the yeast",
				[ingredient({ baseName: "dry yeast" })],
			);

			expect(result).toEqual([
				{ text: "Keep the flour dry before adding the ", matched: false },
				{ text: "yeast", matched: true },
			]);
		});

		it("still matches the full phrase as one unit when both words appear together", () => {
			const result = highlightIngredientMentions(
				"Add the dry yeast to the flour",
				[ingredient({ baseName: "dry yeast" })],
			);

			expect(result).toEqual([
				{ text: "Add the ", matched: false },
				{ text: "dry yeast", matched: true },
				{ text: " to the flour", matched: false },
			]);
		});

		it("does not add a head-word fallback that is a common function word", () => {
			const result = highlightIngredientMentions("Cook for a lot of time", [
				ingredient({ baseName: "leg of" }),
			]);

			expect(result).toEqual([
				{ text: "Cook for a lot of time", matched: false },
			]);
		});
	});
});
