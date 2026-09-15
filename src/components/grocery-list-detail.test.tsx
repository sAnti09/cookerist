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
		ingredients: [
			{ id: "ing-1", text: "shrimp", quantity: 1, unit: "lb", checked: false },
		],
		steps: [],
		expanded: false,
		favorite: false,
	},
];

function renderDetail(
	overrides: Partial<GroceryList> = {},
	recipesOverride: Recipe[] = recipes,
) {
	const onUpdate = vi.fn();
	const onUpdateRecipes = vi.fn();
	const { rerender } = render(
		<GroceryListDetail
			list={{ ...list, ...overrides }}
			recipes={recipesOverride}
			onUpdate={onUpdate}
			onUpdateRecipes={onUpdateRecipes}
		/>,
	);
	return {
		onUpdate,
		onUpdateRecipes,
		rerenderWithList: (nextList: GroceryList) =>
			rerender(
				<GroceryListDetail
					list={nextList}
					recipes={recipesOverride}
					onUpdate={onUpdate}
					onUpdateRecipes={onUpdateRecipes}
				/>,
			),
	};
}

describe("GroceryListDetail", () => {
	it("sections recipe-sourced and custom items separately", () => {
		renderDetail();

		expect(screen.getByText("From recipes")).toBeInTheDocument();
		expect(screen.getByText("Custom")).toBeInTheDocument();
		expect(screen.getByText("1 lb")).toBeInTheDocument();
		expect(screen.getByText("shrimp")).toBeInTheDocument();
		expect(screen.getByText("2 rolls")).toBeInTheDocument();
		expect(screen.getByText("paper towels")).toBeInTheDocument();
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

		await user.click(screen.getByText("shrimp"));

		expect(onUpdate).toHaveBeenCalledWith({
			...list,
			items: [{ ...list.items[0], checked: true }, list.items[1]],
		});
	});

	it("propagates a checked recipe-sourced item to its source recipe ingredient (TEST-242 AC1)", async () => {
		const user = userEvent.setup();
		const { onUpdateRecipes } = renderDetail();

		await user.click(screen.getByText("shrimp"));

		expect(onUpdateRecipes).toHaveBeenCalledWith([
			{
				...recipes[0],
				ingredients: [{ ...recipes[0].ingredients[0], checked: true }],
			},
		]);
	});

	it("propagates an uncheck back to the source recipe ingredient (TEST-242 AC2)", async () => {
		const user = userEvent.setup();
		const { onUpdateRecipes } = renderDetail(
			{
				items: [{ ...list.items[0], checked: true }, list.items[1]],
			},
			[
				{
					...recipes[0],
					ingredients: [{ ...recipes[0].ingredients[0], checked: true }],
				},
			],
		);

		await user.click(screen.getByText("shrimp"));

		expect(onUpdateRecipes).toHaveBeenCalledWith([
			{
				...recipes[0],
				ingredients: [{ ...recipes[0].ingredients[0], checked: false }],
			},
		]);
	});

	it("does not propagate when toggling a custom item (TEST-242 AC3)", async () => {
		const user = userEvent.setup();
		const { onUpdateRecipes } = renderDetail();

		await user.click(screen.getByText("paper towels"));

		expect(onUpdateRecipes).not.toHaveBeenCalled();
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

	it("propagates check-all to recipe-sourced items only", async () => {
		const user = userEvent.setup();
		const { onUpdateRecipes } = renderDetail();

		await user.click(screen.getByLabelText("Check all"));

		expect(onUpdateRecipes).toHaveBeenCalledWith([
			{
				...recipes[0],
				ingredients: [{ ...recipes[0].ingredients[0], checked: true }],
			},
		]);
	});

	it("omits the unit when it duplicates the item text (TEST-243 AC1)", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "egg",
					quantity: 1,
					unit: "egg",
					checked: false,
					source: "recipe",
				},
			],
		});

		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("egg")).toBeInTheDocument();
		expect(screen.queryByText(/1 egg egg/)).not.toBeInTheDocument();
	});

	it("reflects an all-checked list in the check-all control", () => {
		renderDetail({
			items: list.items.map((item) => ({ ...item, checked: true })),
		});

		expect(screen.getByLabelText("Check all")).toBeChecked();
	});

	it("does not show the approximate-quantity note when no item is approximate", () => {
		renderDetail();

		expect(
			screen.queryByText(/estimated by converting/),
		).not.toBeInTheDocument();
	});

	it("lists items alphabetically within each section regardless of input order", () => {
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
				{
					id: "item-2",
					text: "garlic",
					quantity: 3,
					unit: "cloves",
					checked: false,
					source: "recipe",
				},
				{
					id: "item-3",
					text: "paper towels",
					quantity: 2,
					unit: "rolls",
					checked: false,
					source: "custom",
				},
				{
					id: "item-4",
					text: "aluminum foil",
					quantity: 1,
					unit: "",
					checked: false,
					source: "custom",
				},
			],
		});

		const recipeNames = screen
			.getAllByText(/^(garlic|shrimp)$/)
			.map((el) => el.textContent);
		expect(recipeNames).toEqual(["garlic", "shrimp"]);

		const customNames = screen
			.getAllByText(/^(aluminum foil|paper towels)$/)
			.map((el) => el.textContent);
		expect(customNames).toEqual(["aluminum foil", "paper towels"]);
	});

	it("does not show a category heading when every recipe item shares one category (e.g. all saved before this field existed)", () => {
		renderDetail();

		expect(screen.queryByText("Other")).not.toBeInTheDocument();
		expect(screen.queryByText("Meat & Seafood")).not.toBeInTheDocument();
	});

	it("groups the From recipes section by category once more than one is present", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "chicken breast",
					quantity: 1,
					unit: "kg",
					checked: false,
					source: "recipe",
					category: "Meat & Seafood",
				},
				{
					id: "item-2",
					text: "onion",
					quantity: 2,
					unit: "",
					checked: false,
					source: "recipe",
					category: "Produce",
				},
			],
		});

		expect(screen.getByText("Meat & Seafood")).toBeInTheDocument();
		expect(screen.getByText("Produce")).toBeInTheDocument();
		// Categories render in the fixed store-aisle order (Produce before
		// Meat & Seafood), not input/alphabetical order.
		const headings = screen
			.getAllByText(/^(Produce|Meat & Seafood)$/)
			.map((el) => el.textContent);
		expect(headings).toEqual(["Produce", "Meat & Seafood"]);
	});

	it("never shows a category heading for the Custom section", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "chicken breast",
					quantity: 1,
					unit: "kg",
					checked: false,
					source: "recipe",
					category: "Meat & Seafood",
				},
				{
					id: "item-2",
					text: "onion",
					quantity: 2,
					unit: "",
					checked: false,
					source: "recipe",
					category: "Produce",
				},
				{
					id: "item-3",
					text: "paper towels",
					quantity: 1,
					unit: "roll",
					checked: false,
					source: "custom",
				},
			],
		});

		// "Custom" section stays flat even though the recipe section above it
		// is grouped by category.
		const customSection = screen.getByText("Custom").closest("div");
		expect(customSection?.textContent).not.toContain("Other");
	});

	it("sinks checked items to the bottom of their section, alphabetical within each group", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "shrimp",
					quantity: 1,
					unit: "lb",
					checked: true,
					source: "recipe",
				},
				{
					id: "item-2",
					text: "garlic",
					quantity: 3,
					unit: "cloves",
					checked: false,
					source: "recipe",
				},
				{
					id: "item-3",
					text: "basil",
					quantity: 1,
					unit: "bunch",
					checked: true,
					source: "recipe",
				},
				{
					id: "item-4",
					text: "carrot",
					quantity: 2,
					unit: "",
					checked: false,
					source: "recipe",
				},
			],
		});

		const recipeNames = screen
			.getAllByText(/^(basil|carrot|garlic|shrimp)$/)
			.map((el) => el.textContent);
		expect(recipeNames).toEqual(["carrot", "garlic", "basil", "shrimp"]);
	});

	it("moves an item to the bottom of its section once its checked update is applied", async () => {
		const user = userEvent.setup();
		const itemsBefore: GroceryList["items"] = [
			{
				id: "item-1",
				text: "apple",
				quantity: 1,
				unit: "",
				checked: false,
				source: "recipe",
			},
			{
				id: "item-2",
				text: "banana",
				quantity: 1,
				unit: "",
				checked: false,
				source: "recipe",
			},
		];
		const { onUpdate, rerenderWithList } = renderDetail({
			items: itemsBefore,
		});

		await user.click(screen.getByText("apple"));
		const updatedList = onUpdate.mock.calls[0][0] as GroceryList;
		rerenderWithList(updatedList);

		const recipeNames = screen
			.getAllByText(/^(apple|banana)$/)
			.map((el) => el.textContent);
		expect(recipeNames).toEqual(["banana", "apple"]);
	});

	it("filters items by search text across both sections", async () => {
		const user = userEvent.setup();
		renderDetail();

		await user.type(screen.getByLabelText("Search grocery items"), "shrimp");

		expect(screen.getByText("shrimp")).toBeInTheDocument();
		expect(screen.queryByText("paper towels")).not.toBeInTheDocument();
	});

	it("shows a no-results message when the search matches nothing", async () => {
		const user = userEvent.setup();
		renderDetail();

		await user.type(
			screen.getByLabelText("Search grocery items"),
			"nonexistent",
		);

		expect(
			screen.getByText('No items match "nonexistent".'),
		).toBeInTheDocument();
		expect(screen.queryByText("shrimp")).not.toBeInTheDocument();
		expect(screen.queryByText("paper towels")).not.toBeInTheDocument();
	});

	it("check-all still checks every item even while a search filters the view", async () => {
		const user = userEvent.setup();
		const { onUpdate } = renderDetail();

		await user.type(screen.getByLabelText("Search grocery items"), "shrimp");
		await user.click(screen.getByLabelText("Check all"));

		expect(onUpdate).toHaveBeenCalledWith({
			...list,
			items: list.items.map((item) => ({ ...item, checked: true })),
		});
	});

	it("shows a note explaining the ≈ symbol when a list has an approximate item", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "sugar",
					quantity: 212.5,
					unit: "g",
					checked: false,
					source: "recipe",
					approximate: true,
				},
			],
		});

		expect(screen.getByText("≈212.5 g")).toBeInTheDocument();
		expect(screen.getByText("sugar")).toBeInTheDocument();
		expect(screen.getByText(/estimated by converting/)).toBeInTheDocument();
	});

	it("shows a merge suggestion for a name-alike pair of recipe items", () => {
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "yellow onion",
					quantity: 500,
					unit: "g",
					checked: false,
					source: "recipe",
				},
				{
					id: "item-2",
					text: "onion",
					quantity: 300,
					unit: "g",
					checked: false,
					source: "recipe",
				},
			],
		});

		expect(
			screen.getByText(/might be the same item — merge into "onion"\?/),
		).toBeInTheDocument();
	});

	it("does not show a merge suggestion when nothing name-alike is present", () => {
		renderDetail();

		expect(
			screen.queryByText(/might be the same item/),
		).not.toBeInTheDocument();
	});

	it("merges the suggested pair, combining quantities and origins, when Merge is clicked", async () => {
		const user = userEvent.setup();
		const { onUpdate } = renderDetail({
			items: [
				{
					id: "item-1",
					text: "yellow onion",
					quantity: 500,
					unit: "g",
					checked: false,
					source: "recipe",
					origins: [{ recipeId: "recipe-1", ingredientId: "ing-a" }],
				},
				{
					id: "item-2",
					text: "onion",
					quantity: 300,
					unit: "g",
					checked: false,
					source: "recipe",
					origins: [{ recipeId: "recipe-1", ingredientId: "ing-b" }],
				},
			],
		});

		await user.click(screen.getByRole("button", { name: "Merge" }));

		expect(onUpdate).toHaveBeenCalledTimes(1);
		const updated = onUpdate.mock.calls[0][0] as GroceryList;
		expect(updated.items).toHaveLength(1);
		expect(updated.items[0]).toMatchObject({
			text: "onion",
			quantity: 800,
			unit: "g",
			origins: [
				{ recipeId: "recipe-1", ingredientId: "ing-a" },
				{ recipeId: "recipe-1", ingredientId: "ing-b" },
			],
		});
	});

	it("opens Grocery Mode from the Shop action and can exit back to the list", async () => {
		const user = userEvent.setup();
		renderDetail();

		await user.click(screen.getByRole("button", { name: "Shop" }));
		expect(screen.getByText("Grocery Mode")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Exit grocery mode" }));
		expect(screen.queryByText("Grocery Mode")).not.toBeInTheDocument();
	});

	it("disables the Shop action when the list has no items", () => {
		renderDetail({ items: [] });

		expect(screen.getByRole("button", { name: "Shop" })).toBeDisabled();
	});

	it("dismisses a merge suggestion and does not re-show it for the same pair", async () => {
		const user = userEvent.setup();
		renderDetail({
			items: [
				{
					id: "item-1",
					text: "yellow onion",
					quantity: 500,
					unit: "g",
					checked: false,
					source: "recipe",
				},
				{
					id: "item-2",
					text: "onion",
					quantity: 300,
					unit: "g",
					checked: false,
					source: "recipe",
				},
			],
		});

		await user.click(screen.getByRole("button", { name: "Not the same" }));

		expect(
			screen.queryByText(/might be the same item/),
		).not.toBeInTheDocument();
	});
});
