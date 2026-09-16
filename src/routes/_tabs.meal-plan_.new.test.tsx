import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MAX_PLAN_DAYS, toIsoDate } from "#/lib/meal-plan";
import { generateMealPlanDraft } from "#/server/meal-plan";
import { renderApp } from "#/test-utils/render-app";

function addDaysIso(days: number): string {
	const date = new Date();
	date.setDate(date.getDate() + days);
	return toIsoDate(date);
}

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));
vi.mock("#/server/meal-plan", () => ({
	generateMealPlanDraft: vi.fn(),
	refineMealPlanDraft: vi.fn(),
}));

const generateMealPlanDraftMock = vi.mocked(generateMealPlanDraft);

beforeEach(() => {
	window.localStorage.clear();
	generateMealPlanDraftMock.mockReset();
});

describe("New meal plan wizard", () => {
	it("hides the bottom tab bar", async () => {
		await renderApp("/meal-plan/new");

		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
	});

	it("starts with breakfast/lunch/dinner enabled and a non-zero dish count", async () => {
		await renderApp("/meal-plan/new");

		expect(
			screen.getByRole("button", { name: "Generate draft plan" }),
		).not.toBeDisabled();
	});

	it("disables submit once every meal is toggled off", async () => {
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();

		// Default grid: breakfast/lunch/dinner enabled for every visible day.
		// Toggling each enabled cell twice (1 dish -> 2 dishes -> off) turns
		// the whole grid off.
		const cells = screen
			.getAllByRole("button", { pressed: true })
			.filter((el) =>
				el.getAttribute("aria-label")?.match(/breakfast|lunch|dinner/i),
			);
		for (const cell of cells) {
			await user.click(cell);
			await user.click(cell);
		}

		expect(
			screen.getByRole("button", { name: "Generate draft plan" }),
		).toBeDisabled();
	});

	it("toggles a whole meal-type column via its header, for every day at once", async () => {
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();
		const breakfastHeader = screen.getByRole("button", {
			name: "Toggle Breakfast for every day",
		});
		const breakfastCells = () =>
			screen
				.getAllByRole("button")
				.filter((el) => el.getAttribute("aria-label")?.match(/^Breakfast,/));

		expect(breakfastHeader).toHaveAttribute("aria-pressed", "true");
		expect(
			breakfastCells().every(
				(el) => el.getAttribute("aria-pressed") === "true",
			),
		).toBe(true);

		await user.click(breakfastHeader);

		expect(breakfastHeader).toHaveAttribute("aria-pressed", "false");
		expect(
			breakfastCells().every(
				(el) => el.getAttribute("aria-pressed") === "false",
			),
		).toBe(true);

		await user.click(breakfastHeader);

		expect(breakfastHeader).toHaveAttribute("aria-pressed", "true");
		expect(
			breakfastCells().every(
				(el) => el.getAttribute("aria-pressed") === "true",
			),
		).toBe(true);
	});

	it("turns a column on via its header when only some days already have it on", async () => {
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();
		const afternoonSnackHeader = screen.getByRole("button", {
			name: "Toggle Afternoon snack for every day",
		});
		// Snacks start off for every day — turn just one day's afternoon snack
		// on first, leaving the column only partially on.
		await user.click(
			screen
				.getAllByRole("button")
				.find((el) =>
					el.getAttribute("aria-label")?.match(/^Afternoon snack,/),
				) as HTMLElement,
		);
		expect(afternoonSnackHeader).toHaveAttribute("aria-pressed", "false");

		await user.click(afternoonSnackHeader);

		expect(afternoonSnackHeader).toHaveAttribute("aria-pressed", "true");
		expect(
			screen
				.getAllByRole("button")
				.filter((el) =>
					el.getAttribute("aria-label")?.match(/^Afternoon snack,/),
				)
				.every((el) => el.getAttribute("aria-pressed") === "true"),
		).toBe(true);
	});

	it("extends the end date to match when the start date moves past it", async () => {
		await renderApp("/meal-plan/new");
		const farStart = addDaysIso(30);

		fireEvent.change(screen.getByLabelText("Plan start date"), {
			target: { value: farStart },
		});

		expect(screen.getByLabelText("Plan end date")).toHaveValue(farStart);
		expect(screen.getByText(/^1 day ·/)).toBeInTheDocument();
	});

	it("caps the range at MAX_PLAN_DAYS when the start date moves far enough back", async () => {
		await renderApp("/meal-plan/new");
		const farPastStart = addDaysIso(-30);

		fireEvent.change(screen.getByLabelText("Plan start date"), {
			target: { value: farPastStart },
		});

		expect(
			screen.getByText(new RegExp(`^${MAX_PLAN_DAYS} days ·`)),
		).toBeInTheDocument();
	});

	it("ignores an end date set before the start date", async () => {
		await renderApp("/meal-plan/new");
		const before = addDaysIso(-1);

		fireEvent.change(screen.getByLabelText("Plan end date"), {
			target: { value: before },
		});

		expect(screen.getByText(/^7 days ·/)).toBeInTheDocument();
	});

	it("caps the range at MAX_PLAN_DAYS when the end date moves far enough forward", async () => {
		await renderApp("/meal-plan/new");
		const farEnd = addDaysIso(30);

		fireEvent.change(screen.getByLabelText("Plan end date"), {
			target: { value: farEnd },
		});

		expect(
			screen.getByText(new RegExp(`^${MAX_PLAN_DAYS} days ·`)),
		).toBeInTheDocument();
	});

	it("lets the description field be typed into", async () => {
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();

		await user.type(
			screen.getByLabelText("Describe the week"),
			"Mostly vegetarian",
		);

		expect(screen.getByLabelText("Describe the week")).toHaveValue(
			"Mostly vegetarian",
		);
	});

	it("creates a draft plan and navigates to its detail screen on success", async () => {
		generateMealPlanDraftMock.mockResolvedValueOnce({
			type: "success",
			entries: [
				{
					day: "2026-09-15",
					mealType: "breakfast",
					slotIndex: 0,
					title: "Overnight Oats",
					overview: "Oats soaked overnight with berries.",
				},
			],
		});
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Generate draft plan" }),
		);

		expect(await screen.findByText("Overnight Oats")).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:meal-plans")).not.toBeNull();
	});

	it("shows an inline error and stays on the wizard when generation fails", async () => {
		generateMealPlanDraftMock.mockResolvedValueOnce({
			type: "error",
			message: "Groq is down",
		});
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Generate draft plan" }),
		);

		expect(await screen.findByText("Groq is down")).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:meal-plans")).toBeNull();
	});

	it("navigates back to the meal plan list via the back button", async () => {
		await renderApp("/meal-plan/new");
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: "Back to meal plans" }),
		);

		expect(
			await screen.findByRole("heading", { name: "Meal Plan" }),
		).toBeInTheDocument();
	});
});
