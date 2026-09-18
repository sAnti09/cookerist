import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import { loadGroceryLists, saveGroceryList } from "#/lib/grocery-storage";
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

const getDeviceIdentityMock = vi.fn();
const ensureDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
	ensureDeviceIdentity: () => ensureDeviceIdentityMock(),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: () => runSyncMock(),
}));

const generateRecipeMock = vi.mocked(generateRecipe);
const refineMealPlanDraftMock = vi.mocked(refineMealPlanDraft);

beforeEach(() => {
	window.localStorage.clear();
	generateRecipeMock.mockReset();
	refineMealPlanDraftMock.mockReset();
	getDeviceIdentityMock.mockReset();
	ensureDeviceIdentityMock.mockReset();
	runSyncMock.mockReset();
	getDeviceIdentityMock.mockReturnValue(null);
	runSyncMock.mockResolvedValue(null);
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
		updatedAt: "2026-09-15T12:00:00.000Z",
		sharedAt: null,
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

// Deltas here (150px) are past SWIPE_THRESHOLD_PX (110) in meal-plan-entry-row.tsx.
function swipeLeft(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 250, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 100, clientY: 0 }],
	});
}

function swipeRight(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 100, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 250, clientY: 0 }],
	});
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "recipe-1",
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
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

function makeGroceryList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "list-1",
		createdAt: "2026-09-15T12:00:00.000Z",
		updatedAt: "2026-09-15T12:00:00.000Z",
		sharedAt: null,
		name: "Sep 15 meal plan",
		recipeIds: ["recipe-1"],
		items: [
			{
				id: "item-1",
				text: "oats",
				quantity: 1,
				unit: "cup",
				checked: false,
				source: "recipe",
				origins: [{ recipeId: "recipe-1", ingredientId: "ing-1" }],
			},
		],
		expanded: false,
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

describe("Meal plan detail screen — back navigation", () => {
	it("uses a true history back (a POP, not a fresh navigation) when arrived at via in-app navigation, so the list's scroll position can be restored", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		const { router } = await renderApp("/meal-plan");
		const user = userEvent.setup();
		const historyBackSpy = vi.spyOn(router.history, "back");

		await user.click(screen.getByTestId("meal-plan-row-plan-1"));
		await user.click(
			await screen.findByRole("button", { name: "Back to meal plans" }),
		);

		expect(historyBackSpy).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByRole("heading", { name: "Meal Plan" }),
		).toBeInTheDocument();
	});
});

describe("Meal plan detail screen — draft", () => {
	it("hides the bottom tab bar and shows the suggested entries", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");

		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("refines the draft and replaces the entries without a diff — a first-time draft has no prior meal to compare against", async () => {
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
		// A brand-new plan's first draft was never a real built meal, so
		// there's nothing to diff a refine against — the new suggestion just
		// replaces the old one outright, with no "Edited" badge and no
		// struck-through before value.
		expect(screen.getByText("Suggested · Breakfast")).toBeInTheDocument();
		expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
	});

	it("keeps replacing entries fresh across multiple refine rounds of a first-time draft, without diffing against an earlier round", async () => {
		refineMealPlanDraftMock
			.mockResolvedValueOnce({
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
			})
			.mockResolvedValueOnce({
				type: "success",
				entries: [
					{
						day: "2026-09-15",
						mealType: "breakfast",
						slotIndex: 0,
						title: "Chickpea Scramble",
						overview: "Spiced chickpeas with turmeric and peppers.",
					},
				],
			});
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();
		const input = screen.getByLabelText("Describe a change to this plan");
		const submit = screen.getByRole("button", { name: "Refine plan" });

		await user.type(input, "make it vegan");
		await user.click(submit);
		await screen.findByText("Tofu Scramble");

		await user.type(input, "swap the tofu for chickpeas");
		await user.click(submit);

		expect(await screen.findByText("Chickpea Scramble")).toBeInTheDocument();
		expect(screen.getByText("Suggested · Breakfast")).toBeInTheDocument();
		expect(screen.queryByText(/Edited/)).not.toBeInTheDocument();
		expect(screen.queryByText("Tofu Scramble")).not.toBeInTheDocument();
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

	it("still shows diff highlighting for an in-progress adjustment after navigating back into it", async () => {
		// Simulates the persisted state right after a refine from an EARLIER
		// mount of this screen (e.g. the user adjusted a meal, then navigated
		// away and back) — preAdjustEntries/entries come straight from
		// storage, not from any local component state set up by this test.
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(
			loadMealPlans(),
			makePlan({
				status: "draft",
				builtBefore: true,
				preAdjustEntries: [
					makeEntry({ id: "e1", status: "ready", recipeId: "recipe-1" }),
				],
				entries: [
					makeEntry({
						id: "e1",
						suggestedTitle: "Tofu Scramble",
						suggestedOverview: "Turmeric-spiced tofu with peppers.",
					}),
				],
			}),
		);
		await renderApp("/meal-plan/plan-1");

		expect(await screen.findByText("Edited · Breakfast")).toBeInTheDocument();
		const before = screen.getByText("Overnight Oats");
		expect(before).toBeInTheDocument();
		expect(before).toHaveClass("line-through");
		expect(
			screen.getByRole("button", { name: "Approve & build" }),
		).not.toBeDisabled();
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

	it("shows an adjusted plan's untouched entries with the default style, not as suggestions", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Adjust plan" }));

		// Nothing has been refined yet — these are the plan's own existing
		// entries, not new suggestions, so no "Suggested" badge should show.
		expect(await screen.findByText("Overnight Oats")).toBeInTheDocument();
		expect(screen.queryByText(/Suggested/)).not.toBeInTheDocument();
		expect(screen.getByText("Breakfast")).toBeInTheDocument();
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

	it("only rebuilds the entry a refine actually changed, leaving untouched entries alone", async () => {
		const breakfastEntry = makeEntry({
			id: "e1",
			status: "ready",
			recipeId: "recipe-1",
		});
		const dinnerEntry = makeEntry({
			id: "e2",
			mealType: "dinner",
			status: "ready",
			recipeId: "recipe-2",
			suggestedTitle: "Pancakes",
			suggestedOverview: "Fluffy pancakes with syrup.",
		});
		refineMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				// Echoed back byte-for-byte — the refine instruction only targets
				// dinner, so this slot must be classified "unchanged".
				{
					day: breakfastEntry.day,
					mealType: breakfastEntry.mealType,
					slotIndex: breakfastEntry.slotIndex,
					title: breakfastEntry.suggestedTitle,
					overview: breakfastEntry.suggestedOverview,
				},
				{
					day: dinnerEntry.day,
					mealType: dinnerEntry.mealType,
					slotIndex: dinnerEntry.slotIndex,
					title: "Veggie Stir Fry",
					overview: "Tofu and vegetables in a savory sauce.",
				},
			],
		});
		generateRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: {
				title: "Veggie Stir Fry",
				overview: "Tofu and vegetables in a savory sauce.",
				baseServings: 2,
				difficulty: "quick_and_easy",
				estimatedMinutes: 20,
				caloriesPerServing: 350,
				ingredients: [],
				steps: [],
			},
			truncated: false,
		});
		saveRecipe(loadRecipes(), makeRecipe({ id: "recipe-1" }));
		saveRecipe(
			loadRecipes(),
			makeRecipe({ id: "recipe-2", title: "Pancakes" }),
		);
		saveMealPlan(
			loadMealPlans(),
			makePlan({
				status: "ready",
				builtBefore: true,
				entries: [breakfastEntry, dinnerEntry],
			}),
		);
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Adjust plan" }));
		await user.type(
			screen.getByLabelText("Describe a change to this plan"),
			"swap dinner for something vegetarian",
		);
		await user.click(screen.getByRole("button", { name: "Refine plan" }));
		await screen.findByText("Veggie Stir Fry");
		// The untouched slot renders with its original entry, not a fresh
		// "Suggested" one — confirms the diff-aware carryover kicked in before
		// build even starts.
		expect(screen.queryByText(/Suggested/)).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Approve & build" }));

		await screen.findByText("Servings for this plan");
		expect(generateRecipeMock).toHaveBeenCalledTimes(1);
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		const rebuiltBreakfast = stored[0].entries.find(
			(entry) => entry.mealType === "breakfast",
		);
		const rebuiltDinner = stored[0].entries.find(
			(entry) => entry.mealType === "dinner",
		);
		// Untouched entry keeps its identity and recipe link entirely.
		expect(rebuiltBreakfast).toMatchObject({
			id: "e1",
			status: "ready",
			recipeId: "recipe-1",
		});
		// Changed entry gets a genuinely new recipe, not the old one.
		expect(rebuiltDinner?.status).toBe("ready");
		expect(rebuiltDinner?.recipeId).not.toBe("recipe-2");
	});
});

describe("Meal plan detail screen — ready — stale grocery list", () => {
	function readyPlan(overrides: Partial<MealPlan> = {}): MealPlan {
		return makePlan({
			status: "ready",
			builtBefore: true,
			entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
			...overrides,
		});
	}

	it("shows no banner when the grocery list still matches the plan", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveGroceryList(loadGroceryLists(), makeGroceryList());
		saveMealPlan(
			loadMealPlans(),
			readyPlan({
				groceryListId: "list-1",
				groceryListSnapshot: ["recipe-1@4"],
			}),
		);
		await renderApp("/meal-plan/plan-1");

		expect(await screen.findByText("Overnight Oats")).toBeInTheDocument();
		expect(
			screen.queryByText(/meal plan changed since this grocery list/i),
		).not.toBeInTheDocument();
	});

	it("shows an Update banner once a swap makes the built list stale, and clears it after updating", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveRecipe(
			loadRecipes(),
			makeRecipe({ id: "recipe-2", title: "Pancakes", currentServings: 4 }),
		);
		saveGroceryList(loadGroceryLists(), makeGroceryList());
		saveMealPlan(
			loadMealPlans(),
			// Snapshot reflects the ORIGINAL recipe-1 entry — current entries
			// (set below) point at recipe-2 instead, so it's stale from the
			// very first render, same as a swap made after the list was built.
			readyPlan({
				entries: [makeEntry({ status: "ready", recipeId: "recipe-2" })],
				groceryListId: "list-1",
				groceryListSnapshot: ["recipe-1@4"],
			}),
		);
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		expect(
			await screen.findByText(/meal plan changed since this grocery list/i),
		).toBeInTheDocument();

		await user.click(
			screen.getByRole("button", { name: "Update grocery list" }),
		);

		expect(
			screen.queryByText(/meal plan changed since this grocery list/i),
		).not.toBeInTheDocument();
		const storedLists = JSON.parse(
			window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
		) as GroceryList[];
		expect(storedLists).toHaveLength(1);
		expect(storedLists[0].recipeIds).toEqual(["recipe-2"]);
		const storedPlans = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(storedPlans[0].groceryListSnapshot).toEqual(["recipe-2@4"]);
	});

	it("preserves a previously confirmed merge decision when refreshing a stale grocery list", async () => {
		saveRecipe(
			loadRecipes(),
			makeRecipe({
				id: "recipe-1",
				currentServings: 4,
				ingredients: [
					{
						id: "ing-onion",
						text: "onion",
						quantity: 300,
						unit: "g",
						checked: false,
					},
					{
						id: "ing-yellow-onion",
						text: "yellow onion",
						quantity: 500,
						unit: "g",
						checked: false,
					},
				],
			}),
		);
		// The saved list already has the two ingredients merged into one
		// "onion" item (confirmed via the merge-suggestion banner) — a fresh
		// aggregation from the recipe would otherwise split them back into two
		// items, since aggregateGroceryItems groups strictly by base name.
		saveGroceryList(
			loadGroceryLists(),
			makeGroceryList({
				items: [
					{
						id: "item-onion",
						text: "onion",
						quantity: 800,
						unit: "g",
						checked: false,
						source: "recipe",
						origins: [
							{ recipeId: "recipe-1", ingredientId: "ing-onion" },
							{ recipeId: "recipe-1", ingredientId: "ing-yellow-onion" },
						],
					},
				],
				confirmedMergeKeys: ["onion::yellow onion"],
			}),
		);
		saveMealPlan(
			loadMealPlans(),
			readyPlan({
				entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
				groceryListId: "list-1",
				// Stale relative to the recipe's actual currentServings (4) above.
				groceryListSnapshot: ["recipe-1@2"],
			}),
		);
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(
			await screen.findByRole("button", { name: "Update grocery list" }),
		);

		const storedLists = JSON.parse(
			window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
		) as GroceryList[];
		expect(storedLists).toHaveLength(1);
		expect(storedLists[0].items).toHaveLength(1);
		expect(storedLists[0].items[0]).toEqual(
			expect.objectContaining({ text: "onion", quantity: 800, unit: "g" }),
		);
		expect(storedLists[0].confirmedMergeKeys).toEqual(["onion::yellow onion"]);
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
			screen.queryByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).not.toBeInTheDocument();
		expect(
			screen.queryByRole("dialog", { name: "Change recipe" }),
		).not.toBeInTheDocument();

		fireEvent.touchStart(entry, { touches: [{ clientX: 100, clientY: 0 }] });
		fireEvent.touchEnd(entry, {
			changedTouches: [{ clientX: 40, clientY: 120 }],
		});
		expect(
			screen.queryByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).not.toBeInTheDocument();
	});

	it("live-drags the card via touchmove and snaps back if released before the swipe threshold", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 170, clientY: 0 }] });
		expect(entry.style.transform).toBe("translateX(-30px)");

		fireEvent.touchEnd(entry, {
			changedTouches: [{ clientX: 170, clientY: 0 }],
		});
		// Settles back to the (unchanged) closed resting position — driven by
		// the same inline transform as the drag itself, not an empty style.
		expect(entry.style.transform).toBe("translateX(0px)");
		expect(
			screen.queryByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).not.toBeInTheDocument();
	});

	it("clamps the live drag offset to the drag limit", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 300, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 0, clientY: 0 }] });
		expect(entry.style.transform).toBe("translateX(-72px)");
		// Cancel rather than end the touch — releasing here would also cross
		// the (lower) swipe threshold and trigger delete, which isn't what
		// this test is about.
		fireEvent.touchCancel(entry);
	});

	it("ignores a mostly-vertical touchmove (leaves the resting position untouched)", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchMove(entry, {
			touches: [{ clientX: 180, clientY: 100 }],
		});
		expect(entry.style.transform).toBe("");
		fireEvent.touchEnd(entry, {
			changedTouches: [{ clientX: 180, clientY: 100 }],
		});
	});

	it("settles back to the resting position if a touchend arrives with no changed touches mid-drag", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 150, clientY: 0 }] });
		expect(entry.style.transform).toBe("translateX(-50px)");

		fireEvent.touchEnd(entry, { changedTouches: [] });
		expect(entry.style.transform).toBe("translateX(0px)");
	});

	it("resets the live drag on touchcancel", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 150, clientY: 0 }] });
		expect(entry.style.transform).toBe("translateX(-50px)");

		fireEvent.touchCancel(entry);
		expect(entry.style.transform).toBe("translateX(0px)");
	});

	it("no-ops on edge-case touch sequences with nothing to settle", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		// touchstart with no touch point at all.
		fireEvent.touchStart(entry, { touches: [] });
		expect(entry.style.transform).toBe("");

		// A second touchmove within the same drag, once already dragging.
		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 180, clientY: 0 }] });
		fireEvent.touchMove(entry, { touches: [{ clientX: 160, clientY: 0 }] });
		expect(entry.style.transform).toBe("translateX(-40px)");
		fireEvent.touchCancel(entry);

		// touchend with no changed touches and no drag in progress — nothing
		// to settle, and no delta to evaluate as a swipe either.
		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchEnd(entry, { changedTouches: [] });
		expect(
			screen.queryByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).not.toBeInTheDocument();

		// touchcancel with no drag in progress.
		fireEvent.touchStart(entry, { touches: [{ clientX: 200, clientY: 0 }] });
		fireEvent.touchCancel(entry);
		expect(
			screen.queryByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).not.toBeInTheDocument();
	});

	it("suppresses navigation on the click immediately following a triggering swipe", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const entry = screen.getByTestId("meal-plan-entry-e1");

		swipeLeft(entry);
		expect(
			await screen.findByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).toBeInTheDocument();

		fireEvent.click(entry);

		// Still on the meal plan (the swipe's own synthetic click didn't
		// navigate to the recipe), and the confirmation is still open.
		expect(screen.getByText("Servings for this plan")).toBeInTheDocument();
		expect(
			screen.getByRole("alertdialog", {
				name: "Remove this dish from the plan?",
			}),
		).toBeInTheDocument();
	});

	it("swiping left past the threshold opens the delete confirmation, and keeps the entry if cancelled", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(await screen.findByRole("button", { name: "Cancel" }));

		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
	});

	it("swiping left past the threshold and confirming removes the entry", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeLeft(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(await screen.findByRole("button", { name: "Remove" }));

		expect(screen.queryByText("Overnight Oats")).not.toBeInTheDocument();
		expect(
			screen.getByText(/no dishes left in this plan/i),
		).toBeInTheDocument();
		const stored = JSON.parse(
			window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
		) as MealPlan[];
		expect(stored[0].entries).toHaveLength(0);
	});

	it("swiping right past the threshold opens the change-recipe dialog, which can be closed without changing anything", async () => {
		saveRecipe(loadRecipes(), makeRecipe());
		saveMealPlan(loadMealPlans(), readyPlan());
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		swipeRight(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(await screen.findByRole("button", { name: "Close" }));

		expect(
			screen.queryByRole("dialog", { name: "Change recipe" }),
		).not.toBeInTheDocument();
		expect(screen.getByText("Overnight Oats")).toBeInTheDocument();
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

		swipeRight(screen.getByTestId("meal-plan-entry-e1"));
		await user.type(
			await screen.findByLabelText("Search recipes to swap in"),
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

		swipeRight(screen.getByTestId("meal-plan-entry-e1"));
		await user.click(
			await screen.findByRole("button", { name: "Generate new" }),
		);
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

	it("shows no sync icon while the plan is still a draft", async () => {
		saveMealPlan(loadMealPlans(), makePlan({ status: "draft" }));
		await renderApp("/meal-plan/plan-1");

		expect(
			screen.queryByRole("button", { name: "Start syncing" }),
		).not.toBeInTheDocument();
	});

	it("starts syncing a ready plan via its sync icon", async () => {
		const plan = makePlan({
			status: "ready",
			entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
		});
		saveMealPlan(loadMealPlans(), plan);
		ensureDeviceIdentityMock.mockImplementation(async () => {
			const identity = { deviceId: "device-1" };
			getDeviceIdentityMock.mockReturnValue(identity);
			return identity;
		});
		await renderApp("/meal-plan/plan-1");
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Start syncing" }));

		await waitFor(() => expect(ensureDeviceIdentityMock).toHaveBeenCalled());
		await waitFor(() => expect(runSyncMock).toHaveBeenCalled());
		expect(
			await screen.findByRole("button", { name: "Syncing" }),
		).toBeInTheDocument();
	});

	// Every paired device is a symmetric co-owner (see CLAUDE.md's Ownership
	// section) — delete is always "Delete," never a device-scoped "Remove."
	it("labels delete as Delete for a ready shared plan", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveMealPlan(
			loadMealPlans(),
			makePlan({
				status: "ready",
				entries: [makeEntry({ status: "ready", recipeId: "recipe-1" })],
				sharedAt: "2026-09-15T12:00:00.000Z",
			}),
		);
		await renderApp("/meal-plan/plan-1");

		expect(
			screen.getByRole("button", { name: "Delete this meal plan" }),
		).toBeInTheDocument();
	});
});
