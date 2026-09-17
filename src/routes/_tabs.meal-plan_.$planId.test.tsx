import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import { loadMealPlans, saveMealPlan } from "#/lib/meal-plan-storage";
import type { Recipe } from "#/lib/recipe";
import { loadRecipes, saveRecipe } from "#/lib/recipes-storage";
import { generateRecipe } from "#/server/generate-recipe";
import { refineMealPlanDraft } from "#/server/meal-plan";
import { renderApp } from "#/test-utils/render-app";

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));
vi.mock("#/server/meal-plan", () => ({
	generateMealPlanDraft: vi.fn(),
	refineMealPlanDraft: vi.fn(),
}));

const generateRecipeMock = vi.mocked(generateRecipe);
const refineMealPlanDraftMock = vi.mocked(refineMealPlanDraft);

beforeEach(() => {
	window.localStorage.clear();
	generateRecipeMock.mockReset();
	refineMealPlanDraftMock.mockReset();
});

function makeEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
	return {
		id: "e1",
		day: "2026-09-15",
		mealType: "breakfast",
		slotIndex: 0,
		status: "suggested",
		suggestedTitle: "Overnight Oats",
		suggestedOverview: "Oats soaked overnight with berries.",
		...overrides,
	};
}

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: "plan-1",
		createdAt: "2026-09-15T12:00:00.000Z",
		startDate: "2026-09-15",
		endDate: "2026-09-15",
		description: "",
		defaultServings: 4,
		status: "draft",
		entries: [makeEntry()],
		refineInstructions: [],
		...overrides,
	};
}

function swipeLeft(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 200, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 100, clientY: 0 }],
	});
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "recipe-1",
		createdAt: new Date().toISOString(),
		prompt: "a dish",
		title: "Overnight Oats",
		overview: "Oats soaked overnight with berries.",
		baseServings: 4,
		currentServings: 4,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

describe("Meal plan detail screen — not found", () => {
	it("shows a not-found state and a link back for an unknown id", async () => {
		await renderApp("/meal-plan/does-not-exist");

		expect(screen.getByText(/couldn't be found/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to meal plans" }),
		).toHaveAttribute("href", "/meal-plan");
	});
});

describe("Meal plan detail screen — draft", () => {
	it("hides the bottom tab bar and shows the suggested entries", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");

		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("refines the draft and replaces the entries", async () => {
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				{
					day: "2026-09-15",
					mealType: "breakfast",
					slotIndex: 0,
					title: "Tofu Scramble",
					overview: "Turmeric-spiced tofu with peppers.",
				},
			],
		});
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make it vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));

		expect(await screen.findByText("Tofu Scramble")).toBeInTheDocument();
		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
	});

	it("passes the plan's original description along with a refine instruction", async () => {
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				{
					day: "2026-09-15",
					mealType: "breakfast",
					slotIndex: 0,
					title: "Tofu Scramble",
					overview: "Turmeric-spiced tofu with peppers.",
				},
			],
		});
		saveMealPlan(
			loadMealPlans(),
			makePlan({ description: "Mostly vegetarian" }),
		);
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make Monday vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));
		await screen.findByText("Tofu Scramble");

		expect(refineMealPlanDraftMock).toHaveBeenCalledWith({
			data: expect.objectContaining({ description: "Mostly vegetarian" }),
		});
	});

	it("shows an inline error when the refine call returns an error result", async () => {
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "error",
			message: "Groq is down",
		});
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make it vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));

		expect(await screen.findByText("Groq is down")).toBeInTheDocument();
		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("shows a generic inline error when the refine call rejects", async () => {
		refineMealPlanDraftMock.mockRejectedValueOnce(new Error("network down"));
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make it vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));

		expect(
			await screen.findByText(/something went wrong refining/i),
		).toBeInTheDocument();
	});

	it("shows the plan's description as a quote above the entries", async () => {
		saveMealPlan(
			loadMealPlans(),
			makePlan({ description: "Mostly vegetarian" }),
		);
		await renderApp("/meal-plan/plan-1");

		expect(screen.getByText('"Mostly vegetarian"')).toBeInTheDocument();
	});

	it("discards the plan and navigates back to the list", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Discard" }));

		expect(
			await screen.findByRole("heading", { name: "Meal Plan" }),
		).toBeInTheDocument();
		expect(
			JSON.parse(window.localStorage.getItem("cookerist:meal-plans") ?? "[]"),
		).toEqual([]);
	});

	it("approves the plan, which starts building and reuses a matching saved recipe", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Approve & build" }));

		expect(
			await screen.findByText("Servings for this plan"),
		).toBeInTheDocument();
		expect(generateRecipeMock).not.toHaveBeenCalled();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(stored[0].status).toBe("ready");
		expect(stored[0].entries[0]).toMatchObject({
			status: "ready",
			reused: true,
		});
	});
});

describe("Meal plan detail screen — building", () => {
	it("shows progress and offers Retry for a failed entry", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Groq is down",
		});
		saveMealPlan(loadMealPlans(), makePlan({ status: "building" }));
		await renderApp("/meal-plan/plan-1");

		expect(
			await screen.findByRole("button", { name: "Retry" }),
		).toBeInTheDocument();
		expect(screen.getByText(/groq is down/i)).toBeInTheDocument();
	});
});

describe("Meal plan detail screen — ready", () => {
	function readyPlan(): MealPlan {
		return makePlan({
			status: "ready",
			builtBefore: true,
			entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
		});
	}

	it("shows an edited badge for a dish whose servings diverge from the plan default", async () => {
		saveRecipe(loadRecipes(), makeRecipe({ currentServings: 1 }));
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");

		expect(screen.getByText(/servings:\s*1\s*·\s*edited/i)).toBeInTheDocument();
	});

	it("does not bump a dish whose servings already diverge from the previous default", async () => {
		saveRecipe(loadRecipes(), makeRecipe({ currentServings: 1 }));
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		await screen.findByText(/servings:\s*1\s*·\s*edited/i);
		const storedRecipes = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		) as Recipe[];
		expect(storedRecipes[0].currentServings).toBe(1);
	});

	it("shows a View grocery list link once one has already been built", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), { ...readyPlan(), groceryListId: "list-1" });
		await renderApp("/meal-plan/plan-1");

		expect(
			screen.getByRole("link", { name: /view grocery list/i }),
		).toHaveAttribute("href", "/grocery/list-1");
		expect(
			screen.queryByRole("button", { name: "Build grocery list" }),
		).not.toBeInTheDocument();
	});

	it("links each dish to its full recipe detail page", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByText("Overnight Oats"));

		expect(
			await screen.findByRole("button", { name: /Back to recipes/i }),
		).toBeInTheDocument();
	});

	it("bumps every non-edited dish's servings when the plan-level stepper changes", async () => {
		saveRecipe(loadRecipes(), makeRecipe({ currentServings: 4 }));
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		await screen.findByText(/servings:\s*5/i);
		const storedRecipes = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		) as Recipe[];
		expect(storedRecipes[0].currentServings).toBe(5);
	});

	it("builds a grocery list from the plan's recipes and navigates to it", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Build grocery list" }),
		);

		expect(
			await screen.findByRole("heading", { name: /meal plan/i }),
		).toBeInTheDocument();
		const storedLists = JSON.parse(
			window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
		);
		expect(storedLists).toHaveLength(1);
		expect(storedLists[0].recipeIds).toEqual(["recipe-1"]);
	});

	it("adjusts the plan back to draft with Approve & build disabled until a refine happens", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Adjust plan" }));

		expect(
			await screen.findByRole("button", { name: "Approve & build" }),
		).toBeDisabled();
		expect(screen.getByText(/describe a change above/i)).toBeInTheDocument();
		// Discard is relabeled since it no longer deletes an already-built plan.
		expect(
			screen.queryByRole("button", { name: "Discard" }),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
	});

	it("enables Approve & build once a refine actually changes the adjusted plan", async () => {
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				{
					day: "2026-09-15",
					mealType: "breakfast",
					slotIndex: 0,
					title: "Tofu Scramble",
					overview: "Turmeric-spiced tofu with peppers.",
				},
			],
		});
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Adjust plan" }));
		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make it vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));
		await screen.findByText("Tofu Scramble");

		expect(
			screen.getByRole("button", { name: "Approve & build" }),
		).not.toBeDisabled();
	});

	it("cancels an adjustment without deleting the plan, restoring the pre-adjustment entries", async () => {
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				{
					day: "2026-09-15",
					mealType: "breakfast",
					slotIndex: 0,
					title: "Tofu Scramble",
					overview: "Turmeric-spiced tofu with peppers.",
				},
			],
		});
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Adjust plan" }));
		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"make it vegan",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));
		await screen.findByText("Tofu Scramble");

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		// Back to the original Ready view, plan not deleted, original dish restored.
		expect(await screen.findByText("Overnight Oats")).toBeInTheDocument();
		expect(screen.queryByText("Tofu Scramble")).not.toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(stored).toHaveLength(1);
		expect(stored[0].status).toBe("ready");
		expect(stored[0].entries[0].recipeId).toBe("recipe-1");
	});
});

describe("Meal plan detail screen — ready — entry swipe actions", () => {
	function readyPlan(): MealPlan {
		return makePlan({
			status: "ready",
			builtBefore: true,
			entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
		});
	}

	it("navigates back to the meal plan (not the recipes list) from a recipe opened via the plan", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByText("Overnight Oats"));
		await user.click(
			await screen.findByRole("button", { name: /Back to recipes/i }),
		);

		expect(
			await screen.findByText("Servings for this plan"),
		).toBeInTheDocument();
	});

	it("ignores a short or mostly-vertical touch gesture (not a deliberate swipe)", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 100, clientY: 0 }] });
		fireEvent.touchEnd(entry, {
			changedTouches: [{ clientX: 110, clientY: 0 }],
		});
		expect(
			screen.queryByRole("button", { name: "Change recipe for Breakfast" }),
		).not.toBeInTheDocument();

		fireEvent.touchStart(entry, { touches: [{ clientX: 100, clientY: 0 }] });
		fireEvent.touchEnd(entry, {
			changedTouches: [{ clientX: 40, clientY: 120 }],
		});
		expect(
			screen.queryByRole("button", { name: "Change recipe for Breakfast" }),
		).not.toBeInTheDocument();
	});

	it("suppresses the click right after a swipe, then closes (without navigating) on a later tap while revealed", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		swipeLeft(entry);
		expect(
			screen.getByRole("button", { name: "Change recipe for Breakfast" }),
		).toBeInTheDocument();

		fireEvent.click(entry);
		expect(
			screen.getByRole("button", { name: "Change recipe for Breakfast" }),
		).toBeInTheDocument();
		expect(screen.getByText("Servings for this plan")).toBeInTheDocument();

		fireEvent.click(entry);
		expect(
			screen.queryByRole("button", { name: "Change recipe for Breakfast" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Servings for this plan")).toBeInTheDocument();
	});

	it("keeps the entry when the delete confirmation is cancelled", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			screen.getByRole("button", {
				name: "Remove Overnight Oats from the meal plan",
			}),
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("closes the change-recipe dialog without changing anything", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			screen.getByRole("button", { name: "Change recipe for Breakfast" }),
		);
		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(
			screen.queryByRole("dialog", { name: "Change recipe" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("reveals delete/change actions on swipe and removes the entry after confirming delete", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			screen.getByRole("button", {
				name: "Remove Overnight Oats from the meal plan",
			}),
		);
		await user.click(screen.getByRole("button", { name: "Remove" }));

		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
		expect(
			screen.getByText(/no dishes left in this plan/i),
		).toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(stored[0].entries).toHaveLength(0);
	});

	it("swaps an entry to a different saved recipe via search, aligning its servings to the plan default", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveRecipe(
			loadRecipes(),
			makeRecipe({ id: "recipe-2", title: "Pancakes", currentServings: 2 }),
		);
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			screen.getByRole("button", { name: "Change recipe for Breakfast" }),
		);
		await user.type(
			screen.getByLabelText("Search recipes to swap in"),
			"Pancakes",
		);
		await user.click(screen.getByRole("button", { name: "Pancakes" }));

		expect(await screen.findByText("Pancakes")).toBeInTheDocument();
		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(stored[0].entries[0]).toMatchObject({
			recipeId: "recipe-2",
			reused: true,
		});
		const storedRecipes = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		) as Recipe[];
		expect(
			storedRecipes.find((recipe) => recipe.id === "recipe-2")?.currentServings,
		).toBe(4);
	});

	it("generates a brand-new recipe for an entry via a prompt", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: {
				title: "Tofu Scramble",
				overview: "Turmeric-spiced tofu with peppers.",
				baseServings: 2,
				difficulty: "quick_and_easy",
				estimatedMinutes: 15,
				caloriesPerServing: 300,
				ingredients: [],
				steps: [],
			},
			truncated: false,
		});
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			screen.getByRole("button", { name: "Change recipe for Breakfast" }),
		);
		await user.click(screen.getByRole("button", { name: "Generate new" }));
		await user.type(
			screen.getByLabelText("Describe a replacement dish"),
			"tofu scramble",
		);
		await user.click(screen.getByRole("button", { name: "Generate" }));

		expect(await screen.findByText("Tofu Scramble")).toBeInTheDocument();
		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
		const storedRecipes = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		) as Recipe[];
		expect(storedRecipes).toHaveLength(2);
		expect(
			storedRecipes.find((recipe) => recipe.title === "Tofu Scramble")
				?.currentServings,
		).toBe(4);
	});
});

describe("Meal plan detail screen — delete", () => {
	it("deletes the plan via the header action after confirming", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Delete this meal plan" }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(
			await screen.findByRole("heading", { name: "Meal Plan" }),
		).toBeInTheDocument();
		expect(
			JSON.parse(window.localStorage.getItem("cookerist:meal-plans") ?? "[]"),
		).toEqual([]);
	});
});
