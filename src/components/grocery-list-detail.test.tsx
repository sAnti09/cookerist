import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";
import { GroceryListDetail } from "./grocery-list-detail";

const list: GroceryList = {
	id: "list-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	name: "Weeknight Shopping",
	recipeIds: ["recipe-1"],
	items: [
		{
			id: "item-1",
			text: "shrimp",
			quantity: 1,
			unit: "lb",
			checked: false,
			source: "recipe",
			origins: [{ recipeId: "recipe-1", ingredientId: "ing-1" }],
		},
		{
			id: "item-2",
			text: "paper towels",
			quantity: 2,
			unit: "rolls",
			checked: false,
			source: "custom",
		},
	],
	expanded: true,
};

const recipes: Recipe[] = [
	{
		id: "recipe-1",
		createdAt: "2026-01-15T12:00:00.000Z",
		prompt: "shrimp pasta",
		title: "Shrimp Pasta",
		overview: "",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
	},
];

function renderDetail(overrides: Partial<GroceryList> = {}) {
	const onUpdate = vi.fn();
	render(
		<GroceryListDetail
			list={{ ...list, ...overrides }}
			recipes={recipes}
			onUpdate={onUpdate}
		/>,
	);
	return { onUpdate };
}

describe("GroceryListDetail", () => {
	it("shows the titles of the recipes involved", () => {
		renderDetail();

		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
	});

	it("does not render a recipes section when the list has no recipes", () => {
		renderDetail({ recipeIds: [] });

		expect(screen.queryByText("Recipes in this list")).not.toBeInTheDocument();
	});

	it("sections recipe-sourced and custom items separately", () => {
		renderDetail();

		expect(screen.getByText("From recipes")).toBeInTheDocument();
		expect(screen.getByText("Custom")).toBeInTheDocument();
		expect(screen.getByText(/1 lb shrimp/)).toBeInTheDocument();
		expect(screen.getByText(/2 rolls paper towels/)).toBeInTheDocument();
	});

	it("omits a section when it has no items", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "shrimp",
					quantity: 1,
					unit: "lb",
					checked: false,
					source: "recipe",
				},
			],
		});

		expect(screen.getByText("From recipes")).toBeInTheDocument();
		expect(screen.queryByText("Custom")).not.toBeInTheDocument();
	});

	it("toggles a single item's checked state", async () => {
		const user = userEvent.setup();
		const { onUpdate } = renderDetail();

		await user.click(screen.getByText(/1 lb shrimp/));

		expect(onUpdate).toHaveBeenCalledWith({
			...list,
			items: [{ ...list.items[0], checked: true }, list.items[1]],
		});
	});

	it("checks all items via the check-all control", async () => {
		const user = userEvent.setup();
		const { onUpdate } = renderDetail();

		await user.click(screen.getByLabelText("Check all"));

		expect(onUpdate).toHaveBeenCalledWith({
			...list,
			items: list.items.map((item) => ({ ...item, checked: true })),
		});
	});

	it("reflects an all-checked list in the check-all control", () => {
		renderDetail({
			items: list.items.map((item) => ({ ...item, checked: true })),
		});

		expect(screen.getByLabelText("Check all")).toBeChecked();
	});
});
