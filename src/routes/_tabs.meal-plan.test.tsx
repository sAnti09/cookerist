import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlan } from "#/lib/meal-plan";
import { loadMealPlans, saveMealPlan } from "#/lib/meal-plan-storage";
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

beforeEach(() => {
	window.localStorage.clear();
});

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: "plan-1",
		createdAt: "2026-09-15T12:00:00.000Z",
		startDate: "2026-09-15",
		endDate: "2026-09-21",
		description: "",
		defaultServings: 4,
		status: "draft",
		entries: [
			{
				id: "e1",
				day: "2026-09-15",
				mealType: "breakfast",
				slotIndex: 0,
				status: "suggested",
				suggestedTitle: "Oats",
				suggestedOverview: "Overnight oats.",
			},
		],
		refineInstructions: [],
		...overrides,
	};
}

describe("Meal Plan screen", () => {
	it("shows the bottom tab bar", async () => {
		await renderApp("/meal-plan");

		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("shows a distinct empty state with a create entry point when no plans exist", async () => {
		await renderApp("/meal-plan");

		expect(screen.getByText(/no meal plans yet/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "New meal plan" }),
		).toBeInTheDocument();
	});

	it("lists saved meal plans with a status chip and dish count", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan");

		expect(screen.getByText("Sep 15 – Sep 21")).toBeInTheDocument();
		expect(screen.getByText("Draft")).toBeInTheDocument();
		expect(screen.getByText("0/1 dish")).toBeInTheDocument();
	});

	it("shows a plain dish count (not ready/total) for a ready plan", async () => {
		saveMealPlan(
			loadMealPlans(),
			makePlan({
				status: "ready",
				entries: [
					{
						id: "e1",
						day: "2026-09-15",
						mealType: "breakfast",
						slotIndex: 0,
						status: "ready",
						suggestedTitle: "Oats",
						suggestedOverview: "Overnight oats.",
						recipeId: "recipe-1",
					},
					{
						id: "e2",
						day: "2026-09-15",
						mealType: "dinner",
						slotIndex: 0,
						status: "ready",
						suggestedTitle: "Stir-Fry",
						suggestedOverview: "Veggie stir-fry.",
						recipeId: "recipe-2",
					},
				],
			}),
		);
		await renderApp("/meal-plan");

		expect(screen.getByText("Ready")).toBeInTheDocument();
		expect(screen.getByText("2 dishes")).toBeInTheDocument();
	});

	it("omits the dish count entirely for a plan with no entries", async () => {
		saveMealPlan(loadMealPlans(), makePlan({ entries: [] }));
		await renderApp("/meal-plan");

		expect(screen.queryByText(/dish/)).not.toBeInTheDocument();
	});

	it("filters plans by search (matching on description, since the row doesn't show it directly)", async () => {
		const withoutDescriptions = saveMealPlan(loadMealPlans(), makePlan());
		saveMealPlan(
			withoutDescriptions,
			makePlan({
				id: "plan-2",
				startDate: "2026-10-01",
				endDate: "2026-10-07",
				description: "Big Sunday roast",
			}),
		);
		await renderApp("/meal-plan");
		const user = userEvent.setup();

		await user.type(
			screen.getByRole("searchbox", { name: "Search meal plans" }),
			"roast",
		);

		expect(screen.getByText("Oct 1 – Oct 7")).toBeInTheDocument();
		expect(screen.queryByText("Sep 15 – Sep 21")).not.toBeInTheDocument();
	});

	it("shows a no-match state when search matches nothing", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan");
		const user = userEvent.setup();

		await user.type(
			screen.getByRole("searchbox", { name: "Search meal plans" }),
			"nonexistent",
		);

		expect(screen.getByText(/no meal plans match/i)).toBeInTheDocument();
	});

	it("navigates to the wizard from the FAB", async () => {
		await renderApp("/meal-plan");
		const user = userEvent.setup();

		await user.click(screen.getByRole("link", { name: "New meal plan" }));

		expect(
			await screen.findByRole("heading", { name: "New meal plan" }),
		).toBeInTheDocument();
	});

	it("navigates to a plan's detail screen from its row", async () => {
		saveMealPlan(loadMealPlans(), makePlan());
		await renderApp("/meal-plan");
		const user = userEvent.setup();

		await user.click(screen.getByText("Sep 15 – Sep 21"));

		expect(await screen.findByText("Oats")).toBeInTheDocument();
	});
});
