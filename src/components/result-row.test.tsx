import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { RecipeResultRow } from "./result-row";

const recipe: Recipe = {
	id: "recipe-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	prompt: "shrimp pasta for 2",
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	currentServings: 2,
	ingredients: [],
	steps: [],
	expanded: false,
};

describe("RecipeResultRow", () => {
	it("shows the title and creation date, without the original prompt", () => {
		render(<RecipeResultRow recipe={recipe} onDelete={vi.fn()} />);

		expect(screen.getByText(recipe.title)).toBeInTheDocument();
		expect(screen.getByText(/2026/)).toBeInTheDocument();
		expect(screen.queryByText(recipe.prompt)).not.toBeInTheDocument();
	});

	it("does not delete until the confirmation dialog is confirmed", async () => {
		const onDelete = vi.fn();
		const user = userEvent.setup();
		render(<RecipeResultRow recipe={recipe} onDelete={onDelete} />);

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);

		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(onDelete).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(onDelete).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("calls onDelete with the recipe id when confirmed", async () => {
		const onDelete = vi.fn();
		const user = userEvent.setup();
		render(<RecipeResultRow recipe={recipe} onDelete={onDelete} />);

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(onDelete).toHaveBeenCalledWith(recipe.id);
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("dismisses when the backdrop is clicked", async () => {
		const onDelete = vi.fn();
		const user = userEvent.setup();
		render(<RecipeResultRow recipe={recipe} onDelete={onDelete} />);

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Dismiss dialog" }));

		expect(onDelete).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("dismisses on Escape", async () => {
		const onDelete = vi.fn();
		const user = userEvent.setup();
		render(<RecipeResultRow recipe={recipe} onDelete={onDelete} />);

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.keyboard("{Escape}");

		expect(onDelete).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});
});
