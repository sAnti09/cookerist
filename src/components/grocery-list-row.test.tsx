import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";
import { GroceryListRow } from "./grocery-list-row";

function makeItem(checked: boolean) {
	return {
		id: crypto.randomUUID(),
		text: "shrimp",
		quantity: 1,
		unit: "lb",
		checked,
		source: "recipe" as const,
	};
}

const list: GroceryList = {
	id: "list-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	name: "Weeknight Shopping",
	recipeIds: ["recipe-1", "recipe-2"],
	items: [makeItem(false), makeItem(false)],
	expanded: false,
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
	{
		id: "recipe-2",
		createdAt: "2026-01-15T12:00:00.000Z",
		prompt: "garlic bread",
		title: "Garlic Bread",
		overview: "",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
	},
];

function renderRow(
	overrides: Partial<ComponentProps<typeof GroceryListRow>> = {},
) {
	const props = {
		list,
		recipes,
		onDelete: vi.fn(),
		onEdit: vi.fn(),
		onToggleExpand: vi.fn(),
		onUpdate: vi.fn(),
		...overrides,
	};
	return { ...render(<GroceryListRow {...props} />), props };
}

describe("GroceryListRow", () => {
	it("shows the list name and the titles of the recipes it involves", () => {
		renderRow();

		expect(screen.getByText(list.name)).toBeInTheDocument();
		expect(screen.getByText("Shrimp Pasta, Garlic Bread")).toBeInTheDocument();
	});

	it("shows a count chip instead of titles when there are many recipes", () => {
		renderRow({
			list: {
				...list,
				recipeIds: ["recipe-1", "recipe-2", "recipe-3", "recipe-4"],
			},
			recipes: [
				...recipes,
				{ ...recipes[0], id: "recipe-3", title: "Tacos" },
				{ ...recipes[0], id: "recipe-4", title: "Salad" },
			],
		});

		expect(screen.getByText("4 recipes")).toBeInTheDocument();
		expect(screen.queryByText(/Shrimp Pasta,/)).not.toBeInTheDocument();
	});

	it("skips deleted recipes that no longer resolve to a title", () => {
		renderRow({ recipes: [recipes[0]] });

		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
	});

	it("shows a progress bar reflecting the percentage of checked items", () => {
		renderRow({
			list: { ...list, items: [makeItem(true), makeItem(false)] },
		});

		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"50",
		);
		expect(screen.getByText("1/2 checked")).toBeInTheDocument();
	});

	it("does not show a completed badge for an active list", () => {
		renderRow({
			list: { ...list, items: [makeItem(true), makeItem(false)] },
		});

		expect(screen.queryByText("Completed")).not.toBeInTheDocument();
	});

	it("shows a completed badge distinct from an active list at 100%", () => {
		renderRow({
			list: { ...list, items: [makeItem(true), makeItem(true)] },
		});

		expect(screen.getByText("Completed")).toBeInTheDocument();
		expect(screen.getByRole("progressbar")).toHaveAttribute(
			"aria-valuenow",
			"100",
		);
	});

	it("does not render the detail view when collapsed", () => {
		renderRow();

		expect(screen.queryByText("Items")).not.toBeInTheDocument();
	});

	it("renders the detail view when expanded", () => {
		renderRow({ list: { ...list, expanded: true } });

		expect(screen.getByText("Items")).toBeInTheDocument();
	});

	it("calls onToggleExpand with the list id when the header is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: /^Weeknight Shopping/i }),
		);

		expect(props.onToggleExpand).toHaveBeenCalledWith(list.id);
	});

	it("calls onToggleExpand with the list id when the expand icon is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Expand ${list.name}` }),
		);

		expect(props.onToggleExpand).toHaveBeenCalledWith(list.id);
	});

	it("labels the icon as collapse once expanded", () => {
		renderRow({ list: { ...list, expanded: true } });

		expect(
			screen.getByRole("button", { name: `Collapse ${list.name}` }),
		).toBeInTheDocument();
	});

	it("only reveals the delete and expand controls on hover while collapsed", () => {
		renderRow();

		const expandButton = screen.getByRole("button", {
			name: `Expand ${list.name}`,
		});
		expect(expandButton.parentElement).toHaveClass("opacity-0");
	});

	it("keeps the controls visible without hovering once expanded", () => {
		renderRow({ list: { ...list, expanded: true } });

		const collapseButton = screen.getByRole("button", {
			name: `Collapse ${list.name}`,
		});
		expect(collapseButton.parentElement).not.toHaveClass("opacity-0");
	});

	it("does not delete until the confirmation dialog is confirmed", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${list.name}` }),
		);

		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(props.onDelete).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(props.onDelete).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("calls onDelete with the list id when confirmed", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${list.name}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(props.onDelete).toHaveBeenCalledWith(list.id);
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("shows the creation date right before the checked-items count", () => {
		renderRow();

		const checkedText = screen.getByText("0/2 checked");
		expect(checkedText.parentElement).toHaveTextContent(/2026.*0\/2 checked/);
	});

	it("calls onEdit with the list when the edit button is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(screen.getByRole("button", { name: `Edit ${list.name}` }));

		expect(props.onEdit).toHaveBeenCalledWith(list);
	});

	it("calls onToggleExpand when the progress bar row is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(screen.getByText("0/2 checked"));

		expect(props.onToggleExpand).toHaveBeenCalledWith(list.id);
	});

	it("passes item updates from the detail view through to onUpdate", async () => {
		const user = userEvent.setup();
		const { props } = renderRow({ list: { ...list, expanded: true } });

		await user.click(screen.getByLabelText("Check all"));

		expect(props.onUpdate).toHaveBeenCalledWith({
			...list,
			expanded: true,
			items: list.items.map((item) => ({ ...item, checked: true })),
		});
	});
});
