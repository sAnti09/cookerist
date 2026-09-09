import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { RecipeDetail } from "./recipe-detail";

const baseRecipe: Recipe = {
	id: "recipe-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	prompt: "shrimp pasta for 2",
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	currentServings: 2,
	ingredients: [
		{ id: "ing-1", text: "shrimp", quantity: 300, unit: "g", checked: false },
		{
			id: "ing-2",
			text: "garlic",
			quantity: 4,
			unit: "cloves",
			checked: false,
		},
	],
	steps: [
		{ id: "step-1", section: "Prep", text: "Chop garlic", checked: false },
		{ id: "step-2", section: "Prep", text: "Peel shrimp", checked: false },
		{ id: "step-3", section: "Cook", text: "Saute garlic", checked: false },
	],
	expanded: true,
	favorite: false,
};

describe("RecipeDetail", () => {
	it("renders the prompt, overview, and scaled ingredient quantities", () => {
		render(<RecipeDetail recipe={baseRecipe} onUpdate={vi.fn()} />);

		expect(screen.getByText(baseRecipe.prompt)).toBeInTheDocument();
		expect(screen.getByText(baseRecipe.overview)).toBeInTheDocument();
		expect(screen.getByText(/300 g shrimp/)).toBeInTheDocument();
		expect(screen.getByText(/4 cloves garlic/)).toBeInTheDocument();
	});

	it("does not repeat the difficulty badge or estimated time (already shown on the collapsed row)", () => {
		render(
			<RecipeDetail
				recipe={{ ...baseRecipe, difficulty: "hard", estimatedMinutes: 90 }}
				onUpdate={vi.fn()}
			/>,
		);

		expect(screen.queryByText("Hard")).not.toBeInTheDocument();
		expect(screen.queryByText("1 hr 30 min")).not.toBeInTheDocument();
	});

	it("rescales ingredient quantities in real time when servings increase", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		const { rerender } = render(
			<RecipeDetail recipe={baseRecipe} onUpdate={onUpdate} />,
		);

		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			currentServings: 3,
		});

		rerender(
			<RecipeDetail
				recipe={{ ...baseRecipe, currentServings: 3 }}
				onUpdate={onUpdate}
			/>,
		);

		expect(screen.getByText(/450 g shrimp/)).toBeInTheDocument();
		expect(screen.getByText(/6 cloves garlic/)).toBeInTheDocument();
	});

	it("does not decrease servings below 1", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		render(
			<RecipeDetail
				recipe={{ ...baseRecipe, currentServings: 1 }}
				onUpdate={onUpdate}
			/>,
		);

		await user.click(screen.getByRole("button", { name: "Decrease servings" }));

		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("toggles a single ingredient's checked state", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		render(<RecipeDetail recipe={baseRecipe} onUpdate={onUpdate} />);

		await user.click(screen.getByText(/300 g shrimp/));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			ingredients: [
				{ ...baseRecipe.ingredients[0], checked: true },
				baseRecipe.ingredients[1],
			],
		});
	});

	it("checks all ingredients via the check-all control", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		render(<RecipeDetail recipe={baseRecipe} onUpdate={onUpdate} />);

		await user.click(screen.getByLabelText("Check all"));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			ingredients: baseRecipe.ingredients.map((ingredient) => ({
				...ingredient,
				checked: true,
			})),
		});
	});

	it("toggles a step's checked state", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		render(<RecipeDetail recipe={baseRecipe} onUpdate={onUpdate} />);

		await user.click(screen.getByText("Chop garlic"));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			steps: [
				{ ...baseRecipe.steps[0], checked: true },
				baseRecipe.steps[1],
				baseRecipe.steps[2],
			],
		});
	});

	it("groups steps under their section headings when present", () => {
		render(<RecipeDetail recipe={baseRecipe} onUpdate={vi.fn()} />);

		expect(screen.getByText("Prep")).toBeInTheDocument();
		expect(screen.getByText("Cook")).toBeInTheDocument();
	});

	it("omits the unit when it duplicates the ingredient text (TEST-243 AC1)", () => {
		const recipeWithDuplicateUnit: Recipe = {
			...baseRecipe,
			ingredients: [
				{ id: "ing-1", text: "egg", quantity: 1, unit: "egg", checked: false },
			],
		};
		render(
			<RecipeDetail recipe={recipeWithDuplicateUnit} onUpdate={vi.fn()} />,
		);

		expect(screen.getByText("1 egg")).toBeInTheDocument();
		expect(screen.queryByText(/1 egg egg/)).not.toBeInTheDocument();
	});

	it("renders steps flat with no section heading when ungrouped", () => {
		const flatRecipe: Recipe = {
			...baseRecipe,
			steps: [
				{ id: "s1", section: null, text: "Boil water", checked: false },
				{ id: "s2", section: null, text: "Add pasta", checked: false },
			],
		};
		render(<RecipeDetail recipe={flatRecipe} onUpdate={vi.fn()} />);

		expect(screen.queryByText("Prep")).not.toBeInTheDocument();
		expect(screen.getByText("Boil water")).toBeInTheDocument();
	});
});
