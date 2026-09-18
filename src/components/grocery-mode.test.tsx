import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";
import { GroceryMode } from "./grocery-mode";

function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
	return {
		id: crypto.randomUUID(),
		text: "item",
		quantity: 1,
		unit: "",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

function makeList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "list-1",
		createdAt: "2026-01-15T12:00:00.000Z",
		updatedAt: "2026-01-15T12:00:00.000Z",
		sharedAt: null,
		name: "Weeknight Shopping",
		recipeIds: [],
		items: [],
		expanded: true,
		...overrides,
	};
}

// A representative shop: one category with a single checked item (sinks to
// the bottom, stays visible), one with two+ checked items (tucked behind a
// disclosure), one fully checked (collapses to a done pill), plus a custom
// item outside any recipe category.
const zucchini = makeItem({
	id: "zucchini",
	text: "zucchini",
	category: "Produce",
});
const limes = makeItem({ id: "limes", text: "limes", category: "Produce" });
const cilantro = makeItem({
	id: "cilantro",
	text: "cilantro",
	checked: true,
	category: "Produce",
});
const chicken = makeItem({
	id: "chicken",
	text: "chicken breasts",
	category: "Meat & Seafood",
});
const bacon = makeItem({
	id: "bacon",
	text: "bacon",
	checked: true,
	category: "Meat & Seafood",
});
const shrimp = makeItem({
	id: "shrimp",
	text: "shrimp",
	checked: true,
	category: "Meat & Seafood",
});
const eggs = makeItem({
	id: "eggs",
	text: "eggs",
	checked: true,
	category: "Dairy & Eggs",
});
const cream = makeItem({
	id: "cream",
	text: "heavy cream",
	checked: true,
	category: "Dairy & Eggs",
});
const paperTowels = makeItem({
	id: "paper-towels",
	text: "paper towels",
	source: "custom",
});

function renderGroceryMode(overrides: Partial<GroceryList> = {}) {
	const onUpdate = vi.fn();
	const onUpdateRecipes = vi.fn();
	const onClose = vi.fn();
	const recipes: Recipe[] = [];
	const initialList = makeList({
		items: [
			zucchini,
			limes,
			cilantro,
			chicken,
			bacon,
			shrimp,
			eggs,
			cream,
			paperTowels,
		],
		...overrides,
	});
	const { rerender } = render(
		<GroceryMode
			list={initialList}
			recipes={recipes}
			onUpdate={onUpdate}
			onUpdateRecipes={onUpdateRecipes}
			onClose={onClose}
		/>,
	);
	return {
		onUpdate,
		onUpdateRecipes,
		onClose,
		rerenderWithList: (nextList: GroceryList) =>
			rerender(
				<GroceryMode
					list={nextList}
					recipes={recipes}
					onUpdate={onUpdate}
					onUpdateRecipes={onUpdateRecipes}
					onClose={onClose}
				/>,
			),
	};
}

beforeEach(() => {
	Element.prototype.scrollIntoView = vi.fn();
});

afterEach(() => {
	vi.restoreAllMocks();
});

describe("GroceryMode", () => {
	it("shows the overall checked/total count and progress", () => {
		renderGroceryMode();

		expect(screen.getByText("5 of 9 checked")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"56",
		);
	});

	it("renders categories in store-aisle order, and a Custom section for non-recipe items", () => {
		renderGroceryMode();

		const headings = screen
			.getAllByRole("heading", { level: 4 })
			.map((el) => el.textContent);
		expect(headings).toEqual(["Produce", "Meat & Seafood", "Custom"]);
	});

	it("shows a lone checked item inline instead of behind a disclosure", () => {
		renderGroceryMode();

		expect(screen.getByText("cilantro")).toBeInTheDocument();
		expect(screen.queryByText("1 checked")).not.toBeInTheDocument();
	});

	it("tucks 2+ checked items in a category behind a 'N checked' disclosure, closed by default", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		expect(screen.queryByText("bacon")).not.toBeInTheDocument();
		expect(screen.queryByText("shrimp")).not.toBeInTheDocument();
		const disclosure = screen.getByRole("button", { name: "2 checked" });
		expect(disclosure).toHaveAttribute("aria-expanded", "false");

		await user.click(disclosure);

		expect(screen.getByText("bacon")).toBeInTheDocument();
		expect(screen.getByText("shrimp")).toBeInTheDocument();
		expect(disclosure).toHaveAttribute("aria-expanded", "true");
	});

	it("collapses a fully-checked category into a done pill, expandable back", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		expect(
			screen.queryByRole("heading", { name: "Dairy & Eggs" }),
		).not.toBeInTheDocument();
		expect(screen.queryByText("eggs")).not.toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		);

		expect(
			screen.getByRole("heading", { name: "Dairy & Eggs" }),
		).toBeInTheDocument();
		expect(screen.getByText("eggs")).toBeInTheDocument();
		expect(screen.getByText("heavy cream")).toBeInTheDocument();
	});

	it("re-collapses an expanded, still fully-checked category via its collapse control (TEST bug: no way to collapse it back)", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.click(
			screen.getByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		);
		expect(screen.getByText("eggs")).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Collapse Dairy & Eggs" }),
		);

		expect(screen.queryByText("eggs")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		).toBeInTheDocument();
	});

	it("auto-collapses a category again once it's fully re-checked, without a stale manual-expand override (TEST bug: recheck didn't re-collapse)", async () => {
		const user = userEvent.setup();
		const { onUpdate, rerenderWithList } = renderGroceryMode();

		// Expand the done category, then uncheck one item in it — no longer
		// fully done, so it renders flat rather than as a pill.
		await user.click(
			screen.getByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		);
		await user.click(screen.getByText("eggs"));
		rerenderWithList(onUpdate.mock.calls[0][0] as GroceryList);
		expect(
			screen.queryByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		).not.toBeInTheDocument();
		expect(screen.getByText("heavy cream")).toBeInTheDocument();

		// Re-check it — the category is fully done again. It should collapse
		// back to the pill on its own, with no further clicks.
		await user.click(screen.getByText("eggs"));
		rerenderWithList(onUpdate.mock.calls[1][0] as GroceryList);

		expect(screen.queryByText("eggs")).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: /Dairy & Eggs.*all checked/s }),
		).toBeInTheDocument();
	});

	it("toggles an item and calls onUpdate with the flipped checked state", async () => {
		const user = userEvent.setup();
		const { onUpdate } = renderGroceryMode();

		await user.click(screen.getByText("zucchini"));

		const updated = onUpdate.mock.calls[0][0] as GroceryList;
		expect(updated.items.find((item) => item.id === "zucchini")?.checked).toBe(
			true,
		);
	});

	it("filters items by search text, hiding sections with no match", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.type(screen.getByLabelText("Search grocery items"), "zucchini");

		expect(screen.getByText("zucchini")).toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Meat & Seafood" }),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("heading", { name: "Custom" }),
		).not.toBeInTheDocument();
	});

	it("shows a checked match inline during search, bypassing the disclosure/collapse rules", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.type(screen.getByLabelText("Search grocery items"), "bacon");

		expect(screen.getByText("bacon")).toBeInTheDocument();
		expect(screen.queryByText("2 checked")).not.toBeInTheDocument();
	});

	it("dims aisle chips that have no current match while searching", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.type(screen.getByLabelText("Search grocery items"), "zucchini");

		expect(screen.getByRole("button", { name: "Produce" })).not.toHaveClass(
			"opacity-40",
		);
		expect(screen.getByRole("button", { name: "Meat & Seafood" })).toHaveClass(
			"opacity-40",
		);
	});

	it("shows a no-match message when nothing matches the search", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.type(
			screen.getByLabelText("Search grocery items"),
			"nonexistent",
		);

		expect(
			screen.getByText('No items match "nonexistent".'),
		).toBeInTheDocument();
	});

	it("scrolls to a section when its aisle chip is clicked", async () => {
		const user = userEvent.setup();
		renderGroceryMode();

		await user.click(screen.getByRole("button", { name: "Produce" }));

		expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
			behavior: "smooth",
			block: "start",
		});
	});

	it("shows the completion screen once every item is checked, and exits on Back to list", async () => {
		const user = userEvent.setup();
		const { onClose } = renderGroceryMode({
			items: [
				makeItem({ id: "a", text: "a", checked: true }),
				makeItem({ id: "b", text: "b", checked: true }),
			],
		});

		expect(screen.getByText("Cart's full")).toBeInTheDocument();
		expect(screen.getByText("2 of 2 checked")).toBeInTheDocument();
		expect(document.querySelectorAll(".confetti-piece")).toHaveLength(22);

		await user.click(screen.getByRole("button", { name: "Back to list" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("exits on the close button", async () => {
		const user = userEvent.setup();
		const { onClose } = renderGroceryMode();

		await user.click(screen.getByRole("button", { name: "Exit grocery mode" }));

		expect(onClose).toHaveBeenCalledTimes(1);
	});
});
