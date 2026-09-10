import { describe, expect, it } from "vitest";
import type { Ingredient, Step } from "./recipe";
import { diffRecipes } from "./recipe-diff";

function ingredient(overrides: Partial<Ingredient> = {}): Ingredient {
	return {
		id: "ing-1",
		text: "shrimp",
		baseName: "shrimp",
		description: "",
		quantity: 300,
		unit: "g",
		checked: false,
		...overrides,
	};
}

function step(overrides: Partial<Step> = {}): Step {
	return {
		id: "step-1",
		section: null,
		text: "Cook the pasta.",
		checked: false,
		...overrides,
	};
}

function fields(overrides: {
	title?: string;
	overview?: string;
	baseServings?: number;
	ingredients?: Ingredient[];
	steps?: Step[];
}) {
	return {
		title: "Garlic Butter Shrimp Pasta",
		overview: "A quick, creamy shrimp pasta.",
		baseServings: 2,
		ingredients: [ingredient()],
		steps: [step()],
		...overrides,
	};
}

describe("diffRecipes", () => {
	it("reports no title/overview/servings change when identical", () => {
		const before = fields({});
		const after = fields({});

		const diff = diffRecipes(before, after);

		expect(diff.title).toBeNull();
		expect(diff.overview).toBeNull();
		expect(diff.servings).toBeNull();
	});

	it("reports a title change", () => {
		const diff = diffRecipes(
			fields({}),
			fields({ title: "Spicy Garlic Butter Shrimp Pasta" }),
		);

		expect(diff.title).toEqual({
			before: "Garlic Butter Shrimp Pasta",
			after: "Spicy Garlic Butter Shrimp Pasta",
		});
	});

	it("reports an overview change", () => {
		const diff = diffRecipes(
			fields({}),
			fields({ overview: "A spicy, creamy shrimp pasta." }),
		);

		expect(diff.overview).toEqual({
			before: "A quick, creamy shrimp pasta.",
			after: "A spicy, creamy shrimp pasta.",
		});
	});

	it("reports a servings change", () => {
		const diff = diffRecipes(fields({}), fields({ baseServings: 4 }));

		expect(diff.servings).toEqual({ before: 2, after: 4 });
	});

	describe("ingredients", () => {
		it("marks an identical ingredient unchanged", () => {
			const before = fields({ ingredients: [ingredient()] });
			const after = fields({
				ingredients: [ingredient({ id: "ing-2", checked: true })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual([
				{ status: "unchanged", ingredient: after.ingredients[0] },
			]);
		});

		it("marks a same-baseName ingredient with a different quantity as changed", () => {
			const before = fields({ ingredients: [ingredient({ quantity: 300 })] });
			const after = fields({ ingredients: [ingredient({ quantity: 500 })] });

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual([
				{
					status: "changed",
					before: before.ingredients[0],
					after: after.ingredients[0],
				},
			]);
		});

		it("marks a same-baseName ingredient with a different unit as changed", () => {
			const before = fields({ ingredients: [ingredient({ unit: "g" })] });
			const after = fields({ ingredients: [ingredient({ unit: "kg" })] });

			const diff = diffRecipes(before, after);

			expect(diff.ingredients[0]?.status).toBe("changed");
		});

		it("marks a same-baseName ingredient with a different description as changed", () => {
			const before = fields({
				ingredients: [ingredient({ description: "" })],
			});
			const after = fields({
				ingredients: [ingredient({ description: "peeled" })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients[0]?.status).toBe("changed");
		});

		it("marks an ingredient only in before as removed", () => {
			const before = fields({
				ingredients: [ingredient({ baseName: "shrimp" })],
			});
			const after = fields({ ingredients: [] });

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual([
				{ status: "removed", ingredient: before.ingredients[0] },
			]);
		});

		it("marks an ingredient only in after as added", () => {
			const before = fields({ ingredients: [] });
			const after = fields({
				ingredients: [ingredient({ baseName: "chicken breast" })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual([
				{ status: "added", ingredient: after.ingredients[0] },
			]);
		});

		it("treats a swapped ingredient as one removed and one added, not changed", () => {
			const before = fields({
				ingredients: [ingredient({ id: "a", baseName: "shrimp" })],
			});
			const after = fields({
				ingredients: [ingredient({ id: "b", baseName: "chicken breast" })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual(
				expect.arrayContaining([
					{ status: "removed", ingredient: before.ingredients[0] },
					{ status: "added", ingredient: after.ingredients[0] },
				]),
			);
			expect(diff.ingredients).toHaveLength(2);
		});

		it("matches duplicate baseNames one-to-one in order rather than merging them", () => {
			const before = fields({
				ingredients: [
					ingredient({ id: "a", baseName: "onion", quantity: 1 }),
					ingredient({ id: "b", baseName: "onion", quantity: 2 }),
				],
			});
			const after = fields({
				ingredients: [
					ingredient({ id: "c", baseName: "onion", quantity: 1 }),
					ingredient({ id: "d", baseName: "onion", quantity: 3 }),
				],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients).toEqual([
				{ status: "unchanged", ingredient: after.ingredients[0] },
				{
					status: "changed",
					before: before.ingredients[1],
					after: after.ingredients[1],
				},
			]);
		});

		it("falls back to text as the key when baseName is absent (pre-TEST-255 ingredients)", () => {
			const before = fields({
				ingredients: [
					ingredient({ baseName: undefined, text: "shrimp", quantity: 300 }),
				],
			});
			const after = fields({
				ingredients: [
					ingredient({ baseName: undefined, text: "shrimp", quantity: 500 }),
				],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients[0]?.status).toBe("changed");
		});

		it("matches baseName case/whitespace-insensitively", () => {
			const before = fields({
				ingredients: [ingredient({ baseName: "  Onion " })],
			});
			const after = fields({
				ingredients: [ingredient({ baseName: "onion" })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.ingredients[0]?.status).toBe("unchanged");
		});
	});

	describe("steps", () => {
		it("marks an identical step (by text) unchanged, ignoring id and section", () => {
			const before = fields({
				steps: [step({ id: "s1", section: "Prep", text: "Chop garlic" })],
			});
			const after = fields({
				steps: [step({ id: "s2", section: null, text: "Chop garlic" })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual([
				{ status: "unchanged", step: after.steps[0] },
			]);
		});

		it("marks a step only in before as removed", () => {
			const before = fields({ steps: [step({ text: "Chop garlic" })] });
			const after = fields({ steps: [] });

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual([
				{ status: "removed", step: before.steps[0] },
			]);
		});

		it("marks a step only in after as added", () => {
			const before = fields({ steps: [] });
			const after = fields({ steps: [step({ text: "Plate and serve." })] });

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual([{ status: "added", step: after.steps[0] }]);
		});

		it("treats a reworded step as removed+added rather than changed", () => {
			const before = fields({
				steps: [step({ id: "a", text: "Cook the pasta." })],
			});
			const after = fields({
				steps: [step({ id: "b", text: "Cook the pasta until al dente." })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual(
				expect.arrayContaining([
					{ status: "removed", step: before.steps[0] },
					{ status: "added", step: after.steps[0] },
				]),
			);
			expect(diff.steps).toHaveLength(2);
		});

		it("matches a step key that appears more than once in after against a single before occurrence", () => {
			const before = fields({ steps: [step({ id: "a", text: "Stir." })] });
			const after = fields({
				steps: [
					step({ id: "b", text: "Stir." }),
					step({ id: "c", text: "Stir." }),
				],
			});

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual([
				{ status: "unchanged", step: after.steps[0] },
				{ status: "added", step: after.steps[1] },
			]);
		});

		it("matches duplicate step text one-to-one in order", () => {
			const before = fields({
				steps: [
					step({ id: "a", text: "Stir." }),
					step({ id: "b", text: "Stir." }),
				],
			});
			const after = fields({
				steps: [step({ id: "c", text: "Stir." })],
			});

			const diff = diffRecipes(before, after);

			expect(diff.steps).toEqual([
				{ status: "unchanged", step: after.steps[0] },
				{ status: "removed", step: before.steps[1] },
			]);
		});
	});
});
