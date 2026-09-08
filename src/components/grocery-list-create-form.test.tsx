import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { GroceryListCreateForm } from "./grocery-list-create-form";

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
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
		...overrides,
	};
}

function renderForm(
	overrides: Partial<ComponentProps<typeof GroceryListCreateForm>> = {},
) {
	const props = {
		recipes: [makeRecipe()],
		onUpdateRecipe: vi.fn(),
		onCreate: vi.fn(),
		onClose: vi.fn(),
		...overrides,
	};
	return { ...render(<GroceryListCreateForm {...props} />), props };
}

async function addRecipe(
	user: ReturnType<typeof userEvent.setup>,
	title: string,
) {
	await user.type(screen.getByLabelText("Search recipes to add"), title);
	await user.click(screen.getByRole("button", { name: title }));
}

describe("GroceryListCreateForm", () => {
	it("does not list every recipe up front — only a search field", () => {
		renderForm({
			recipes: [
				makeRecipe({ id: "recipe-1", title: "Shrimp Pasta" }),
				makeRecipe({ id: "recipe-2", title: "Garlic Bread" }),
			],
		});

		expect(screen.getByLabelText("Search recipes to add")).toBeInTheDocument();
		expect(screen.queryByText("Shrimp Pasta")).not.toBeInTheDocument();
		expect(screen.queryByText("Garlic Bread")).not.toBeInTheDocument();
	});

	it("shows matching recipes as the user types, and adds one on click", async () => {
		const user = userEvent.setup();
		renderForm({
			recipes: [
				makeRecipe({ id: "recipe-1", title: "Shrimp Pasta" }),
				makeRecipe({
					id: "recipe-2",
					title: "Garlic Bread",
					prompt: "garlic bread",
				}),
			],
		});

		await user.type(screen.getByLabelText("Search recipes to add"), "shrimp");

		expect(
			screen.getByRole("button", { name: "Shrimp Pasta" }),
		).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Garlic Bread" }),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Shrimp Pasta" }));

		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
		// The search clears and the dropdown closes once a recipe is added.
		expect(screen.getByLabelText("Search recipes to add")).toHaveValue("");
	});

	it("shows a 'no matching recipes' message for an unmatched query", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe({ title: "Shrimp Pasta" })] });

		await user.type(screen.getByLabelText("Search recipes to add"), "tacos");

		expect(screen.getByText("No matching recipes.")).toBeInTheDocument();
	});

	it("excludes already-added recipes from further search results", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe({ title: "Shrimp Pasta" })] });

		await addRecipe(user, "Shrimp Pasta");
		await user.type(screen.getByLabelText("Search recipes to add"), "shrimp");

		expect(screen.getByText("No matching recipes.")).toBeInTheDocument();
	});

	it("allows more than one recipe to be added", async () => {
		const user = userEvent.setup();
		renderForm({
			recipes: [
				makeRecipe({ id: "recipe-1", title: "Shrimp Pasta" }),
				makeRecipe({
					id: "recipe-2",
					title: "Garlic Bread",
					prompt: "garlic bread",
				}),
			],
		});

		await addRecipe(user, "Shrimp Pasta");
		await addRecipe(user, "Garlic Bread");

		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
		expect(screen.getByText("Garlic Bread")).toBeInTheDocument();
	});

	it("removes an added recipe via its remove button", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe({ title: "Shrimp Pasta" })] });

		await addRecipe(user, "Shrimp Pasta");
		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Remove Shrimp Pasta" }),
		);

		expect(screen.queryByText("Shrimp Pasta")).not.toBeInTheDocument();
		expect(screen.getByText(/no recipes added yet/i)).toBeInTheDocument();
	});

	it("updates the ingredient preview immediately when a recipe is added", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		expect(
			screen.getByText(/select a recipe or add a custom ingredient/i),
		).toBeInTheDocument();

		await addRecipe(user, "Shrimp Pasta");

		expect(screen.getByText(/1 lb shrimp/)).toBeInTheDocument();
	});

	it("removes a recipe's ingredients from the preview when it's removed", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		await addRecipe(user, "Shrimp Pasta");
		expect(screen.getByText(/1 lb shrimp/)).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Remove Shrimp Pasta" }),
		);

		expect(screen.queryByText(/1 lb shrimp/)).not.toBeInTheDocument();
	});

	it("changing a recipe's servings calls onUpdateRecipe and rescales the preview", async () => {
		const user = userEvent.setup();
		const recipe = makeRecipe();
		const { props, rerender } = renderForm({ recipes: [recipe] });

		await addRecipe(user, "Shrimp Pasta");
		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		expect(props.onUpdateRecipe).toHaveBeenCalledWith({
			...recipe,
			currentServings: 3,
		});

		// Simulate the parent applying the update and passing the new recipe back down.
		// The recipe is already added, so the preview should rescale without
		// re-adding anything.
		const updatedRecipe = { ...recipe, currentServings: 3 };
		rerender(
			<GroceryListCreateForm
				recipes={[updatedRecipe]}
				onUpdateRecipe={props.onUpdateRecipe}
				onCreate={props.onCreate}
				onClose={props.onClose}
			/>,
		);

		expect(screen.getByText(/1.5 lb shrimp/)).toBeInTheDocument();
	});

	it("renders the ingredient preview as a bulleted list", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		await addRecipe(user, "Shrimp Pasta");

		const preview = screen.getByText(/1 lb shrimp/).closest("ul");
		expect(preview).toHaveClass("list-disc");
	});

	it("suggests known units from recipe ingredients for the custom ingredient unit field", () => {
		renderForm({
			recipes: [
				makeRecipe({
					ingredients: [
						{
							id: "ing-1",
							text: "shrimp",
							quantity: 1,
							unit: "lb",
							checked: false,
						},
						{
							id: "ing-2",
							text: "garlic",
							quantity: 2,
							unit: "cloves",
							checked: false,
						},
					],
				}),
				makeRecipe({ id: "recipe-2", title: "Garlic Bread" }),
			],
		});

		const unitInput = screen.getByLabelText("Custom ingredient unit");
		expect(unitInput).toHaveAttribute("list", "grocery-known-units");
		// biome-ignore lint/style/noNonNullAssertion: the datalist is always rendered
		const datalist = document.getElementById("grocery-known-units")!;
		const options = Array.from(datalist.querySelectorAll("option")).map(
			(option) => option.getAttribute("value"),
		);
		// Deduplicated (both recipes share "lb") and sorted.
		expect(options).toEqual(["cloves", "lb"]);
	});

	it("does not add a custom ingredient's own unit to the suggestion list", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [] });

		await user.type(screen.getByLabelText("Custom ingredient name"), "Napkins");
		await user.type(screen.getByLabelText("Custom ingredient quantity"), "1");
		await user.type(screen.getByLabelText("Custom ingredient unit"), "pack");
		await user.click(screen.getByRole("button", { name: "Add" }));

		// biome-ignore lint/style/noNonNullAssertion: the datalist is always rendered
		const datalist = document.getElementById("grocery-known-units")!;
		expect(datalist.querySelectorAll("option")).toHaveLength(0);
	});

	it("adds a custom ingredient and reflects it in the preview", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [] });

		await user.type(
			screen.getByLabelText("Custom ingredient name"),
			"Paper towels",
		);
		await user.type(screen.getByLabelText("Custom ingredient quantity"), "2");
		await user.type(screen.getByLabelText("Custom ingredient unit"), "roll");
		await user.click(screen.getByRole("button", { name: "Add" }));

		// Appears once in the "Custom ingredients" list and once in the preview.
		expect(screen.getAllByText("2 roll Paper towels")).toHaveLength(2);
		expect(screen.getByLabelText("Custom ingredient name")).toHaveValue("");
	});

	it("removes a custom ingredient", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [] });

		await user.type(screen.getByLabelText("Custom ingredient name"), "Napkins");
		await user.type(screen.getByLabelText("Custom ingredient quantity"), "1");
		await user.type(screen.getByLabelText("Custom ingredient unit"), "pack");
		await user.click(screen.getByRole("button", { name: "Add" }));
		expect(screen.getAllByText("1 pack Napkins")).toHaveLength(2);

		await user.click(screen.getByRole("button", { name: "Remove Napkins" }));

		expect(screen.queryByText("1 pack Napkins")).not.toBeInTheDocument();
	});

	it("disables adding a custom ingredient until name, quantity, and unit are filled in", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [] });

		expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

		await user.type(screen.getByLabelText("Custom ingredient name"), "Napkins");
		expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

		await user.type(screen.getByLabelText("Custom ingredient quantity"), "1");
		expect(screen.getByRole("button", { name: "Add" })).toBeDisabled();

		await user.type(screen.getByLabelText("Custom ingredient unit"), "pack");
		expect(screen.getByRole("button", { name: "Add" })).toBeEnabled();
	});

	it("disables save with nothing selected and explains why", () => {
		renderForm({ recipes: [makeRecipe()] });

		expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
		expect(
			screen.getByText(
				/select at least one recipe or add a custom ingredient/i,
			),
		).toBeInTheDocument();
	});

	it("enables save once a recipe is added", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		await addRecipe(user, "Shrimp Pasta");

		expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
	});

	it("enables save with only a custom ingredient and no recipes", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [] });

		await user.type(screen.getByLabelText("Custom ingredient name"), "Salt");
		await user.type(screen.getByLabelText("Custom ingredient quantity"), "1");
		await user.type(screen.getByLabelText("Custom ingredient unit"), "box");
		await user.click(screen.getByRole("button", { name: "Add" }));

		expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
	});

	it("shows a confirmation dialog before saving, and does not persist on cancel", async () => {
		const user = userEvent.setup();
		const { props } = renderForm({ recipes: [makeRecipe()] });

		await addRecipe(user, "Shrimp Pasta");
		await user.click(screen.getByRole("button", { name: "Save" }));

		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(
			screen.getByText(/tied to the recipes you selected/i),
		).toBeInTheDocument();
		expect(props.onCreate).not.toHaveBeenCalled();

		await user.click(
			within(screen.getByRole("alertdialog")).getByRole("button", {
				name: "Cancel",
			}),
		);

		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
		expect(props.onCreate).not.toHaveBeenCalled();
		// The form itself is left open and unchanged.
		expect(screen.getByText("Shrimp Pasta")).toBeInTheDocument();
	});

	it("persists the grocery list once the confirmation dialog is confirmed", async () => {
		const user = userEvent.setup();
		const recipe = makeRecipe();
		const { props } = renderForm({ recipes: [recipe] });

		await addRecipe(user, "Shrimp Pasta");
		await user.click(screen.getByRole("button", { name: "Save" }));
		const confirmDialog = screen.getByRole("alertdialog");
		await user.click(
			within(confirmDialog).getByRole("button", { name: "Save" }),
		);

		expect(props.onCreate).toHaveBeenCalledTimes(1);
		const created = vi.mocked(props.onCreate).mock.calls[0][0];
		expect(created.name).toBe("Shrimp Pasta");
		expect(created.recipeIds).toEqual(["recipe-1"]);
		expect(created.items).toHaveLength(1);
		expect(created.items[0]).toMatchObject({
			text: "shrimp",
			quantity: 1,
			unit: "lb",
		});
	});

	it("defaults the name to the auto-generated value and lets it be edited", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		await addRecipe(user, "Shrimp Pasta");

		const nameInput = screen.getByLabelText("List name");
		expect(nameInput).toHaveValue("Shrimp Pasta");

		await user.clear(nameInput);
		await user.type(nameInput, "My custom list");

		expect(nameInput).toHaveValue("My custom list");
	});

	it("enforces a 255 character max length on the name field", async () => {
		const user = userEvent.setup();
		renderForm({ recipes: [makeRecipe()] });

		const nameInput = screen.getByLabelText("List name");
		await user.clear(nameInput);
		await user.type(nameInput, "a".repeat(300));

		expect((nameInput as HTMLInputElement).value.length).toBe(255);
	});

	it("calls onClose when the close button is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderForm();

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(props.onClose).toHaveBeenCalled();
	});

	it("calls onClose when the cancel button is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderForm();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(props.onClose).toHaveBeenCalled();
	});

	it("calls onClose when the backdrop is dismissed", async () => {
		const user = userEvent.setup();
		const { props } = renderForm();

		await user.click(screen.getByRole("button", { name: "Dismiss dialog" }));

		expect(props.onClose).toHaveBeenCalled();
	});
});
