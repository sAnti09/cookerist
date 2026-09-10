import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { RecipeDetail } from "./recipe-detail";

const continueRecipeMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	continueRecipe: (...args: unknown[]) => continueRecipeMock(...args),
}));

function renderDetail(recipe: Recipe, onUpdate: (recipe: Recipe) => void) {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<RecipeDetail recipe={recipe} onUpdate={onUpdate} />
		</QueryClientProvider>,
	);
}

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
	beforeEach(() => {
		continueRecipeMock.mockReset();
	});

	it("renders the prompt, overview, and scaled ingredient quantities", () => {
		renderDetail(baseRecipe, vi.fn());

		expect(screen.getByText(baseRecipe.prompt)).toBeInTheDocument();
		expect(screen.getByText(baseRecipe.overview)).toBeInTheDocument();
		expect(screen.getByText("300 g")).toBeInTheDocument();
		expect(screen.getByText("shrimp")).toBeInTheDocument();
		expect(screen.getByText("4 cloves")).toBeInTheDocument();
		expect(screen.getByText("garlic")).toBeInTheDocument();
	});

	it("does not repeat the difficulty badge or estimated time (already shown on the collapsed row)", () => {
		renderDetail(
			{ ...baseRecipe, difficulty: "hard", estimatedMinutes: 90 },
			vi.fn(),
		);

		expect(screen.queryByText("Hard")).not.toBeInTheDocument();
		expect(screen.queryByText("1 hr 30 min")).not.toBeInTheDocument();
	});

	it("rescales ingredient quantities in real time when servings increase", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		const queryClient = new QueryClient();
		const { rerender } = render(
			<QueryClientProvider client={queryClient}>
				<RecipeDetail recipe={baseRecipe} onUpdate={onUpdate} />
			</QueryClientProvider>,
		);

		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			currentServings: 3,
		});

		rerender(
			<QueryClientProvider client={queryClient}>
				<RecipeDetail
					recipe={{ ...baseRecipe, currentServings: 3 }}
					onUpdate={onUpdate}
				/>
			</QueryClientProvider>,
		);

		expect(screen.getByText("450 g")).toBeInTheDocument();
		expect(screen.getByText("6 cloves")).toBeInTheDocument();
	});

	it("does not decrease servings below 1", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		renderDetail({ ...baseRecipe, currentServings: 1 }, onUpdate);

		await user.click(screen.getByRole("button", { name: "Decrease servings" }));

		expect(onUpdate).not.toHaveBeenCalled();
	});

	it("toggles a single ingredient's checked state", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		renderDetail(baseRecipe, onUpdate);

		await user.click(screen.getByText("shrimp"));

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
		renderDetail(baseRecipe, onUpdate);

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
		renderDetail(baseRecipe, onUpdate);

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
		renderDetail(baseRecipe, vi.fn());

		expect(screen.getByText("Prep")).toBeInTheDocument();
		expect(screen.getByText("Cook")).toBeInTheDocument();
	});

	it("opens and closes cook mode from the Steps section", async () => {
		const user = userEvent.setup();
		renderDetail(baseRecipe, vi.fn());

		expect(screen.queryByText("Step 1 of 3")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Cook mode" }));

		expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Exit cook mode" }));

		expect(screen.queryByText("Step 1 of 3")).not.toBeInTheDocument();
	});

	it("hides the cook mode entry point when the recipe has no steps", () => {
		renderDetail({ ...baseRecipe, steps: [] }, vi.fn());

		expect(
			screen.queryByRole("button", { name: "Cook mode" }),
		).not.toBeInTheDocument();
	});

	it("omits the unit when it duplicates the ingredient text (TEST-243 AC1)", () => {
		const recipeWithDuplicateUnit: Recipe = {
			...baseRecipe,
			ingredients: [
				{ id: "ing-1", text: "egg", quantity: 1, unit: "egg", checked: false },
			],
		};
		renderDetail(recipeWithDuplicateUnit, vi.fn());

		expect(screen.getByText("1")).toBeInTheDocument();
		expect(screen.getByText("egg")).toBeInTheDocument();
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
		renderDetail(flatRecipe, vi.fn());

		expect(screen.queryByText("Prep")).not.toBeInTheDocument();
		expect(screen.getByText("Boil water")).toBeInTheDocument();
	});

	it("shows no load-more notice when the recipe isn't truncated", () => {
		renderDetail(baseRecipe, vi.fn());

		expect(
			screen.queryByRole("button", { name: "Load more" }),
		).not.toBeInTheDocument();
	});

	it("shows a load-more notice for a truncated recipe and merges in the continuation on success", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		continueRecipeMock.mockResolvedValueOnce({
			type: "success",
			ingredients: [
				{ baseName: "parmesan", description: "", quantity: 50, unit: "g" },
			],
			steps: [{ section: null, text: "Plate and serve." }],
			truncated: false,
		});

		renderDetail({ ...baseRecipe, truncated: true }, onUpdate);

		expect(
			screen.getByText(
				"This recipe got cut off before it finished generating.",
			),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
		const updated = onUpdate.mock.calls[0]?.[0] as Recipe;
		expect(updated.truncated).toBe(false);
		expect(updated.ingredients).toHaveLength(3);
		expect(updated.ingredients[2]).toMatchObject({
			text: "parmesan",
			quantity: 50,
			unit: "g",
			checked: false,
		});
		expect(updated.steps).toHaveLength(4);
		expect(updated.steps[3]).toMatchObject({
			section: null,
			text: "Plate and serve.",
			checked: false,
		});

		const callArgs = continueRecipeMock.mock.calls[0]?.[0];
		expect(callArgs.data.prompt).toBe(baseRecipe.prompt);
		expect(callArgs.data.soFar.ingredients).toEqual([
			{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
			{ baseName: "garlic", description: "", quantity: 4, unit: "cloves" },
		]);
	});

	it("keeps the recipe truncated when the continuation is itself cut off again", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		continueRecipeMock.mockResolvedValueOnce({
			type: "success",
			ingredients: [],
			steps: [],
			truncated: true,
		});

		renderDetail({ ...baseRecipe, truncated: true }, onUpdate);
		await user.click(screen.getByRole("button", { name: "Load more" }));

		await waitFor(() => expect(onUpdate).toHaveBeenCalledTimes(1));
		expect((onUpdate.mock.calls[0]?.[0] as Recipe).truncated).toBe(true);
	});

	it("shows an inline error message when the continuation server call reports an error", async () => {
		const user = userEvent.setup();
		continueRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed recipe continuation response from Groq",
		});

		renderDetail({ ...baseRecipe, truncated: true }, vi.fn());
		await user.click(screen.getByRole("button", { name: "Load more" }));

		expect(
			await screen.findByText(
				"Malformed recipe continuation response from Groq",
			),
		).toBeInTheDocument();
	});

	it("shows a generic inline error message when the continuation call rejects", async () => {
		const user = userEvent.setup();
		continueRecipeMock.mockRejectedValueOnce(new Error("network down"));

		renderDetail({ ...baseRecipe, truncated: true }, vi.fn());
		await user.click(screen.getByRole("button", { name: "Load more" }));

		expect(
			await screen.findByText(
				"Couldn't load the rest of the recipe. Please try again.",
			),
		).toBeInTheDocument();
	});
});
