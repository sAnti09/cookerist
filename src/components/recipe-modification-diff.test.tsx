import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Ingredient, Step } from "#/lib/recipe";
import type { RecipeDiff } from "#/lib/recipe-diff";
import { RecipeModificationDiff } from "./recipe-modification-diff";

const shrimp: Ingredient = {
	id: "ing-1",
	text: "shrimp",
	baseName: "shrimp",
	description: "",
	quantity: 300,
	unit: "g",
	checked: false,
};

const chicken: Ingredient = {
	id: "ing-2",
	text: "chicken breast",
	baseName: "chicken breast",
	description: "",
	quantity: 300,
	unit: "g",
	checked: false,
};

const garlic: Ingredient = {
	id: "ing-3",
	text: "garlic",
	baseName: "garlic",
	description: "",
	quantity: 4,
	unit: "cloves",
	checked: false,
};

const chopGarlic: Step = {
	id: "step-1",
	section: null,
	text: "Chop garlic",
	checked: false,
};

const plate: Step = {
	id: "step-2",
	section: null,
	text: "Plate and serve",
	checked: false,
};

function baseDiff(overrides: Partial<RecipeDiff> = {}): RecipeDiff {
	return {
		title: null,
		overview: null,
		servings: null,
		ingredients: [],
		steps: [],
		...overrides,
	};
}

describe("RecipeModificationDiff", () => {
	it("renders a title change", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					title: { before: "Shrimp Pasta", after: "Chicken Pasta" },
				})}
			/>,
		);

		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
		expect(screen.getByText("Chicken Pasta")).toBeInTheDocument();
	});

	it("renders a servings change", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({ servings: { before: 2, after: 4 } })}
			/>,
		);

		expect(screen.getByText("2")).toBeInTheDocument();
		expect(screen.getByText("4")).toBeInTheDocument();
	});

	it("renders an added ingredient with a + prefix", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					ingredients: [{ status: "added", ingredient: chicken }],
				})}
			/>,
		);

		expect(screen.getByText("+ 300 g chicken breast")).toBeInTheDocument();
	});

	it("renders a removed ingredient with a − prefix", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					ingredients: [{ status: "removed", ingredient: shrimp }],
				})}
			/>,
		);

		expect(screen.getByText("− 300 g shrimp")).toBeInTheDocument();
	});

	it("renders a changed ingredient as before → after", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					ingredients: [
						{
							status: "changed",
							before: garlic,
							after: { ...garlic, quantity: 6 },
						},
					],
				})}
			/>,
		);

		expect(screen.getByText("4 cloves garlic")).toBeInTheDocument();
		expect(screen.getByText("6 cloves garlic")).toBeInTheDocument();
	});

	it("renders an unchanged ingredient plainly", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					ingredients: [{ status: "unchanged", ingredient: garlic }],
				})}
			/>,
		);

		expect(screen.getByText("4 cloves garlic")).toBeInTheDocument();
	});

	it("renders added/removed/unchanged steps", () => {
		render(
			<RecipeModificationDiff
				diff={baseDiff({
					steps: [
						{ status: "unchanged", step: chopGarlic },
						{ status: "removed", step: { ...plate, text: "Serve cold" } },
						{ status: "added", step: plate },
					],
				})}
			/>,
		);

		expect(screen.getByText("Chop garlic")).toBeInTheDocument();
		expect(screen.getByText("− Serve cold")).toBeInTheDocument();
		expect(screen.getByText("+ Plate and serve")).toBeInTheDocument();
	});
});
