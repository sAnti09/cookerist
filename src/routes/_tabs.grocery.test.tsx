import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import { loadGroceryLists, saveGroceryList } from "#/lib/grocery-storage";
import { loadRecipes, saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
import { renderApp } from "#/test-utils/render-app";

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));

beforeEach(() => {
	window.localStorage.clear();
});

function makeGroceryList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		name: "Shrimp Pasta",
		recipeIds: [],
		items: [
			{
				id: crypto.randomUUID(),
				text: "shrimp",
				quantity: 1,
				unit: "lb",
				checked: false,
				source: "custom",
			},
		],
		expanded: false,
		...overrides,
	};
}

describe("Grocery screen", () => {
	it("shows the bottom tab bar", async () => {
		await renderApp("/grocery");

		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("shows a distinct empty state with a create entry point when no lists exist", async () => {
		await renderApp("/grocery");

		expect(screen.getByText(/no grocery lists yet/i)).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Create grocery list" }),
		).toBeInTheDocument();
	});

	it("lists saved grocery lists with progress and a completed badge", async () => {
		saveGroceryList(
			loadGroceryLists(),
			makeGroceryList({
				name: "Weeknight Groceries",
				items: [
					{
						id: "a",
						text: "shrimp",
						quantity: 1,
						unit: "lb",
						checked: true,
						source: "custom",
					},
				],
			}),
		);
		await renderApp("/grocery");

		expect(screen.getByText("Weeknight Groceries")).toBeInTheDocument();
		expect(screen.getByLabelText("Completed")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"100",
		);
	});

	it("filters lists by name via search", async () => {
		saveGroceryList(
			saveGroceryList(
				loadGroceryLists(),
				makeGroceryList({ name: "Taco Night" }),
			),
			makeGroceryList({ name: "Sunday Meal Prep" }),
		);
		await renderApp("/grocery");
		const user = userEvent.setup();

		await user.type(screen.getByLabelText("Search grocery lists"), "taco");

		expect(screen.getByText("Taco Night")).toBeInTheDocument();
		expect(screen.queryByText("Sunday Meal Prep")).not.toBeInTheDocument();
	});

	it("navigates to a list's full-screen detail page when its row is clicked", async () => {
		saveGroceryList(
			loadGroceryLists(),
			makeGroceryList({ name: "Weeknight Groceries" }),
		);
		await renderApp("/grocery");
		const user = userEvent.setup();

		await user.click(screen.getByText("Weeknight Groceries"));

		expect(
			await screen.findByRole("button", { name: "Back to grocery lists" }),
		).toBeInTheDocument();
	});

	it("creates a grocery list from the FAB and persists it", async () => {
		saveRecipe(
			loadRecipes(),
			toStoredRecipe("shrimp pasta", {
				title: "Garlic Shrimp Pasta",
				overview: "x",
				baseServings: 2,
				difficulty: "quick_and_easy",
				estimatedMinutes: 20,
				caloriesPerServing: 500,
				ingredients: [
					{
						baseName: "shrimp",
						description: "",
						quantity: 1,
						unit: "lb",
						category: "Meat & Seafood",
						approxGramsPerUnit: null,
					},
				],
				steps: [{ section: null, text: "cook" }],
			}),
		);
		await renderApp("/grocery");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Create grocery list" }),
		);

		const dialog = screen.getByRole("dialog");
		await user.type(
			within(dialog).getByLabelText("Search recipes to add"),
			"Garlic Shrimp Pasta",
		);
		await user.click(
			within(dialog).getByRole("button", { name: "Garlic Shrimp Pasta" }),
		);
		await user.click(within(dialog).getByRole("button", { name: "Save" }));
		await user.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Save",
			}),
		);

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
		// Default list name is now "<today's date> for 1 recipe" rather than
		// the recipe's own title — see generateGroceryListName.
		expect(
			await screen.findByRole("heading", { name: /for 1 recipe$/ }),
		).toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
		);
		expect(stored).toHaveLength(1);
		expect(stored[0].name).toMatch(/for 1 recipe$/);
	});
});
