import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecipes, saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
import { renderApp } from "#/test-utils/render-app";

const modifyRecipeMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: (...args: unknown[]) => modifyRecipeMock(...args),
}));

const validRecipe = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy" as const,
	estimatedMinutes: 25,
	caloriesPerServing: 620,
	ingredients: [
		{
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
			category: "Meat & Seafood" as const,
			approxGramsPerUnit: null,
		},
	],
	steps: [{ section: null, text: "Cook the pasta." }],
};

beforeEach(() => {
	modifyRecipeMock.mockReset();
	window.localStorage.clear();
});

function seedRecipe(overrides: { title?: string; favorite?: boolean } = {}) {
	const recipe = toStoredRecipe("shrimp pasta for 2", {
		...validRecipe,
		title: overrides.title ?? validRecipe.title,
	});
	const saved = saveRecipe(loadRecipes(), {
		...recipe,
		favorite: overrides.favorite ?? false,
	});
	return saved[0];
}

describe("Recipe detail screen", () => {
	it("shows a not-found state and a link back for an unknown id", async () => {
		await renderApp("/recipes/does-not-exist");

		expect(screen.getByText(/couldn't be found/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to recipes" }),
		).toHaveAttribute("href", "/recipes");
	});

	it("renders the recipe's title, meta, and detail content", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.getByRole("heading", { name: recipe.title }),
		).toBeInTheDocument();
		expect(screen.getByText("Quick & easy")).toBeInTheDocument();
		expect(screen.getByText("25 min")).toBeInTheDocument();
		expect(screen.getByText("620 cal")).toBeInTheDocument();
		expect(screen.getByText(recipe.overview)).toBeInTheDocument();
	});

	it("shows a sticky Start Cooking button and hides the bottom tab bar", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.getByRole("button", { name: "Start Cooking" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
	});

	it("hides the sticky Start Cooking button when the recipe has no steps", async () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", {
			...validRecipe,
			steps: [],
		});
		saveRecipe(loadRecipes(), recipe);
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.queryByRole("button", { name: "Start Cooking" }),
		).not.toBeInTheDocument();
	});

	it("opens and closes cook mode from the sticky Start Cooking button", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		expect(screen.queryByText("Step 1 of 1")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Start Cooking" }));
		expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Exit cook mode" }));
		expect(screen.queryByText("Step 1 of 1")).not.toBeInTheDocument();
	});

	it("navigates back to the recipes list via the back button", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Back to recipes" }));

		expect(
			await screen.findByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
	});

	it("toggles favorite from the header star and persists it", async () => {
		const recipe = seedRecipe({ favorite: false });
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		const favoriteButton = screen.getByRole("button", {
			name: `Favorite ${recipe.title}`,
		});
		await user.click(favoriteButton);

		expect(
			screen.getByRole("button", { name: `Unfavorite ${recipe.title}` }),
		).toHaveAttribute("aria-pressed", "true");
		const [stored] = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		);
		expect(stored.favorite).toBe(true);
	});

	it("deletes the recipe and navigates back to the list after confirming", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(
			await screen.findByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).not.toContain(
			recipe.title,
		);
	});

	it("does not delete until the confirmation dialog is confirmed", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(
			screen.getByRole("heading", { name: recipe.title }),
		).toBeInTheDocument();
	});

	it("forks a modification into a new recipe and navigates to its detail page", async () => {
		const recipe = seedRecipe({ title: "Original Recipe" });
		modifyRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: { ...validRecipe, title: "Forked Recipe" },
			truncated: false,
		});
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Modify ${recipe.title}` }),
		);
		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"make it spicier",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));
		await screen.findByRole("button", { name: "Approve" });
		await user.click(
			screen.getByRole("button", { name: "Create as new recipe" }),
		);

		expect(
			await screen.findByRole("heading", { name: "Forked Recipe" }),
		).toBeInTheDocument();
		await waitFor(() => {
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:recipes") ?? "[]",
			);
			expect(
				stored.some((r: { title: string }) => r.title === "Forked Recipe"),
			).toBe(true);
		});
	});
});
