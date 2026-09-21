import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	DEFAULT_PLAN_DAYS,
	formatMealPlanDateRange,
	toIsoDate,
} from "#/lib/meal-plan";
import { generateMealPlanDraft } from "#/server/meal-plan";
import { renderApp } from "#/test-utils/render-app";

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));
// AppDataProvider imports this transitively (generateThumbnailForRecipe) —
// stubbed so it never hits the real DeepInfra/R2 modules, which pull in
// cloudflare:workers (unavailable outside a Workers/Miniflare runtime).
vi.mock("#/server/generate-recipe-thumbnail", () => ({
	// Never resolves — harmless no-op for the backfill migration (see
	// generate-recipe-thumbnails.ts), which every seeded-recipe mount here is
	// a candidate for; a resolved/rejected value would let the migration
	// write thumbnailAttempts changes into localStorage mid-test.
	generateRecipeThumbnail: vi.fn(() => new Promise(() => {})),
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

	// The date-range picker's own tap-to-select/clamp/chronological-order
	// behavior is covered at two other, faster and more reliable levels
	// instead of here:
	//  - meal-plan-date-range-picker.test.tsx drives the actual popover
	//    interaction (open, tap start, tap end, clamp) against the component
	//    in isolation.
	//  - meal-plan.test.ts unit-tests applyMealPlanDateRange, the pure
	//    function that turns a picked (start, end) into the clamped
	//    startDate/endDate/slot-grid the wizard actually renders.
	// Driving the same popover-open-then-tap-a-day flow through this route's
	// full app render (real router + tab layout) hung indefinitely under
	// jsdom in a way that didn't reproduce in either of those two narrower
	// contexts — floating-ui's positioning loop never settling once nested
	// this deep, as best as could be diagnosed. This test only checks that
	// the wizard renders the picker with the right default range, without
	// opening it.
	it("shows the default date range on the picker trigger", async () => {
		await renderApp("/meal-plan/new");

		const today = toIsoDate(new Date());
		const end = new Date(`${today}T00:00:00`);
		end.setDate(end.getDate() + DEFAULT_PLAN_DAYS - 1);
		const expectedLabel = formatMealPlanDateRange(today, toIsoDate(end));

		expect(
			screen.getByRole("button", { name: expectedLabel }),
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
