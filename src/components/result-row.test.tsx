import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { RecipeResultRow } from "./result-row";

// RecipeResultRow renders RecipeDetail when expanded, which calls
// useMutation (TEST-243's recipe continuation flow) and therefore needs a
// QueryClientProvider ancestor even in tests that never trigger it.
vi.mock("#/server/generate-recipe", () => ({
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));

const recipe: Recipe = {
	id: "recipe-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	prompt: "shrimp pasta for 2",
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	currentServings: 2,
	ingredients: [
		{ id: "ing-1", text: "shrimp", quantity: 300, unit: "g", checked: false },
	],
	steps: [
		{ id: "step-1", section: null, text: "Cook the pasta.", checked: false },
	],
	expanded: false,
	favorite: false,
};

function renderRow(
	overrides: Partial<ComponentProps<typeof RecipeResultRow>> = {},
) {
	const props = {
		recipe,
		onDelete: vi.fn(),
		onToggleExpand: vi.fn(),
		onToggleFavorite: vi.fn(),
		onUpdate: vi.fn(),
		onCreateRecipe: vi.fn(),
		...overrides,
	};
	const queryClient = new QueryClient();
	return {
		...render(
			<QueryClientProvider client={queryClient}>
				<RecipeResultRow {...props} />
			</QueryClientProvider>,
		),
		props,
	};
}

describe("RecipeResultRow", () => {
	it("shows the title and creation date, without the original prompt", () => {
		renderRow();

		expect(screen.getByText(recipe.title)).toBeInTheDocument();
		expect(screen.getByText(/2026/)).toBeInTheDocument();
		expect(screen.queryByText(recipe.prompt)).not.toBeInTheDocument();
	});

	it("does not render the detail view when collapsed", () => {
		renderRow();

		expect(screen.queryByText(recipe.overview)).not.toBeInTheDocument();
	});

	it("shows a difficulty badge and estimated time when present", () => {
		renderRow({
			recipe: { ...recipe, difficulty: "quick_and_easy", estimatedMinutes: 25 },
		});

		expect(screen.getByText("Quick & easy")).toBeInTheDocument();
		expect(screen.getByText("25 min")).toBeInTheDocument();
	});

	it("shows no difficulty badge or time for recipes saved before TEST-229", () => {
		renderRow();

		expect(
			screen.queryByText(/quick|intermediate|hard/i),
		).not.toBeInTheDocument();
		expect(screen.queryByText(/min$/)).not.toBeInTheDocument();
	});

	it("calls onToggleExpand exactly once with the recipe id when the header is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(screen.getByRole("button", { name: /^Garlic Butter/i }));

		expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
		expect(props.onToggleExpand).toHaveBeenCalledWith(recipe.id);
	});

	it("calls onToggleExpand when the header is activated with the keyboard", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		screen.getByRole("button", { name: /^Garlic Butter/i }).focus();
		await user.keyboard("{Enter}");
		await user.keyboard(" ");

		expect(props.onToggleExpand).toHaveBeenCalledTimes(2);
		expect(props.onToggleExpand).toHaveBeenCalledWith(recipe.id);
	});

	it("calls onToggleExpand exactly once with the recipe id when the expand icon is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Expand ${recipe.title}` }),
		);

		expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
		expect(props.onToggleExpand).toHaveBeenCalledWith(recipe.id);
	});

	it("calls onToggleExpand when an arbitrary non-interactive point of the card is clicked", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(screen.getByTestId(`recipe-row-${recipe.id}`));

		expect(props.onToggleExpand).toHaveBeenCalledTimes(1);
		expect(props.onToggleExpand).toHaveBeenCalledWith(recipe.id);
	});

	it("labels the icon as collapse once expanded", () => {
		renderRow({ recipe: { ...recipe, expanded: true } });

		expect(
			screen.getByRole("button", { name: `Collapse ${recipe.title}` }),
		).toBeInTheDocument();
	});

	it("keeps the expand/collapse chevron visible at all times, as a discoverability cue", () => {
		renderRow();
		expect(
			screen.getByRole("button", { name: `Expand ${recipe.title}` }),
		).not.toHaveClass("opacity-0");

		renderRow({ recipe: { ...recipe, expanded: true } });
		expect(
			screen.getByRole("button", { name: `Collapse ${recipe.title}` }),
		).not.toHaveClass("opacity-0");
	});

	it("only reveals the delete control on hover at desktop widths while collapsed, and doesn't let it be clicked while hidden there", () => {
		renderRow();

		const deleteButton = screen.getByRole("button", {
			name: `Delete ${recipe.title}`,
		});
		expect(deleteButton).toHaveClass("sm:opacity-0");
		expect(deleteButton).toHaveClass("sm:pointer-events-none");
	});

	it("keeps the delete control visible and clickable once expanded", () => {
		renderRow({ recipe: { ...recipe, expanded: true } });

		const deleteButton = screen.getByRole("button", {
			name: `Delete ${recipe.title}`,
		});
		expect(deleteButton).not.toHaveClass("sm:opacity-0");
		expect(deleteButton).not.toHaveClass("sm:pointer-events-none");
	});

	it("never hides the delete control behind hover at mobile widths, even while collapsed", () => {
		renderRow();

		const deleteButton = screen.getByRole("button", {
			name: `Delete ${recipe.title}`,
		});
		expect(deleteButton).not.toHaveClass("opacity-0");
		expect(deleteButton).not.toHaveClass("pointer-events-none");
	});

	it("calls onToggleFavorite with the recipe id when the favorite icon is clicked, without expanding or deleting", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Favorite ${recipe.title}` }),
		);

		expect(props.onToggleFavorite).toHaveBeenCalledWith(recipe.id);
		expect(props.onToggleExpand).not.toHaveBeenCalled();
		expect(props.onDelete).not.toHaveBeenCalled();
	});

	it("shows a distinct filled indicator and unfavorite label once a recipe is favorited", () => {
		renderRow({ recipe: { ...recipe, favorite: true } });

		const favoriteButton = screen.getByRole("button", {
			name: `Unfavorite ${recipe.title}`,
		});
		expect(favoriteButton).toHaveAttribute("aria-pressed", "true");
		expect(favoriteButton.querySelector("svg")).toHaveClass("fill-accent");
	});

	it("hides the favorite control behind hover while collapsed and not yet favorited, and doesn't let it be clicked while hidden", () => {
		renderRow();

		const favoriteButton = screen.getByRole("button", {
			name: `Favorite ${recipe.title}`,
		});
		expect(favoriteButton).toHaveClass("opacity-0");
		expect(favoriteButton).toHaveClass("pointer-events-none");
	});

	it("keeps the favorite control visible without hovering once favorited", () => {
		renderRow({ recipe: { ...recipe, favorite: true } });

		const favoriteButton = screen.getByRole("button", {
			name: `Unfavorite ${recipe.title}`,
		});
		expect(favoriteButton).not.toHaveClass("opacity-0");
	});

	it("keeps the favorite control visible without hovering once expanded", () => {
		renderRow({ recipe: { ...recipe, expanded: true } });

		const favoriteButton = screen.getByRole("button", {
			name: `Favorite ${recipe.title}`,
		});
		expect(favoriteButton).not.toHaveClass("opacity-0");
	});

	it("renders the full recipe detail when expanded", () => {
		renderRow({ recipe: { ...recipe, expanded: true } });

		expect(screen.getByText(recipe.overview)).toBeInTheDocument();
		expect(screen.getByText("300 g")).toBeInTheDocument();
		expect(screen.getByText("shrimp")).toBeInTheDocument();
	});

	it("forwards ingredient toggles from the detail view to onUpdate", async () => {
		const user = userEvent.setup();
		const { props } = renderRow({ recipe: { ...recipe, expanded: true } });

		await user.click(screen.getByText("shrimp"));

		expect(props.onUpdate).toHaveBeenCalledWith({
			...recipe,
			expanded: true,
			ingredients: [{ ...recipe.ingredients[0], checked: true }],
		});
	});

	it("does not delete until the confirmation dialog is confirmed, and never expands or collapses the row", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);

		expect(screen.getByRole("alertdialog")).toBeInTheDocument();
		expect(props.onDelete).not.toHaveBeenCalled();
		expect(props.onToggleExpand).not.toHaveBeenCalled();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(props.onDelete).not.toHaveBeenCalled();
		expect(props.onToggleExpand).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("calls onDelete with the recipe id when confirmed, without also toggling expand", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(props.onDelete).toHaveBeenCalledWith(recipe.id);
		expect(props.onToggleExpand).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("dismisses when the backdrop is clicked, without toggling expand", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Dismiss dialog" }));

		expect(props.onDelete).not.toHaveBeenCalled();
		expect(props.onToggleExpand).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	it("dismisses on Escape", async () => {
		const user = userEvent.setup();
		const { props } = renderRow();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.keyboard("{Escape}");

		expect(props.onDelete).not.toHaveBeenCalled();
		expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
	});

	describe("modify icon", () => {
		it("only reveals the modify control on hover at desktop widths while collapsed, and doesn't let it be clicked while hidden there", () => {
			renderRow();

			const modifyButton = screen.getByRole("button", {
				name: `Modify ${recipe.title}`,
			});
			expect(modifyButton).toHaveClass("sm:opacity-0");
			expect(modifyButton).toHaveClass("sm:pointer-events-none");
		});

		it("keeps the modify control visible and clickable once expanded", () => {
			renderRow({ recipe: { ...recipe, expanded: true } });

			const modifyButton = screen.getByRole("button", {
				name: `Modify ${recipe.title}`,
			});
			expect(modifyButton).not.toHaveClass("sm:opacity-0");
			expect(modifyButton).not.toHaveClass("sm:pointer-events-none");
		});

		it("never hides the modify control behind hover at mobile widths, even while collapsed", () => {
			renderRow();

			const modifyButton = screen.getByRole("button", {
				name: `Modify ${recipe.title}`,
			});
			expect(modifyButton).not.toHaveClass("opacity-0");
			expect(modifyButton).not.toHaveClass("pointer-events-none");
		});

		it("opens the modification dialog on a collapsed row without expanding it", async () => {
			const user = userEvent.setup();
			const { props } = renderRow();

			await user.click(
				screen.getByRole("button", { name: `Modify ${recipe.title}` }),
			);

			expect(props.onToggleExpand).not.toHaveBeenCalled();
			expect(
				screen.getByLabelText("Describe how to modify this recipe"),
			).toBeInTheDocument();
		});

		it("opens the modification dialog on an already-expanded row too", async () => {
			const user = userEvent.setup();
			const { props } = renderRow({ recipe: { ...recipe, expanded: true } });

			await user.click(
				screen.getByRole("button", { name: `Modify ${recipe.title}` }),
			);

			expect(props.onToggleExpand).not.toHaveBeenCalled();
			expect(
				screen.getByLabelText("Describe how to modify this recipe"),
			).toBeInTheDocument();
		});

		it("does not trigger delete when clicked", async () => {
			const user = userEvent.setup();
			const { props } = renderRow({ recipe: { ...recipe, expanded: true } });

			await user.click(
				screen.getByRole("button", { name: `Modify ${recipe.title}` }),
			);

			expect(props.onDelete).not.toHaveBeenCalled();
		});

		it("closes via the dialog's own close button", async () => {
			const user = userEvent.setup();
			renderRow();

			await user.click(
				screen.getByRole("button", { name: `Modify ${recipe.title}` }),
			);
			expect(
				screen.getByLabelText("Describe how to modify this recipe"),
			).toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Close" }));

			expect(
				screen.queryByLabelText("Describe how to modify this recipe"),
			).not.toBeInTheDocument();
		});

		it("shows the wand icon in accent color when a modification is pending", () => {
			renderRow({
				recipe: {
					...recipe,
					pendingModification: {
						instructions: ["make it spicier"],
						draft: {
							title: recipe.title,
							overview: recipe.overview,
							baseServings: recipe.baseServings,
							ingredients: recipe.ingredients,
							steps: recipe.steps,
							truncated: false,
						},
					},
				},
			});

			const modifyButton = screen.getByRole("button", {
				name: `Modify ${recipe.title}`,
			});
			expect(modifyButton.querySelector("svg")).toHaveClass("text-accent");
		});
	});
});
