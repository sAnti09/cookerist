import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { MealPlanDateRangePicker } from "./meal-plan-date-range-picker";

const START = "2026-09-17";
const END = "2026-09-23";
const TRIGGER_NAME = "Sep 17 – Sep 23";

// The calendar popover renders through a Radix Portal into document.body, not
// under RTL's `container` — so day cells are looked up against the whole
// document instead.
function dayButton(iso: string): HTMLElement {
	const label = new Date(`${iso}T00:00:00`).toLocaleDateString();
	const button = document.querySelector(`button[data-day="${label}"]`);
	if (!(button instanceof HTMLElement)) {
		throw new Error(`No day button found for ${iso} (data-day="${label}")`);
	}
	return button;
}

describe("MealPlanDateRangePicker", () => {
	it("shows the formatted range on the trigger button", () => {
		render(
			<MealPlanDateRangePicker
				startDate={START}
				endDate={END}
				onChange={vi.fn()}
			/>,
		);
		expect(
			screen.getByRole("button", { name: TRIGGER_NAME }),
		).toBeInTheDocument();
	});

	// A longer-than-default timeout throughout this file: Radix Popover's
	// floating-ui positioning loop is markedly slower under jsdom than in a
	// real browser (no real layout to settle against), which pushes even a
	// single click well past Vitest's 5s default before it resolves.
	it("opens the calendar prompting to tap the first day", async () => {
		const user = userEvent.setup();
		render(
			<MealPlanDateRangePicker
				startDate={START}
				endDate={END}
				onChange={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));
		expect(
			screen.getByText("Tap the first day, then the last day"),
		).toBeInTheDocument();
	}, 45000);

	it("completes a range across two taps and reports it in chronological order", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<MealPlanDateRangePicker
				startDate={START}
				endDate={END}
				onChange={onChange}
			/>,
		);
		await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));

		await user.click(dayButton("2026-09-19"));
		expect(screen.getByText("Now tap the last day")).toBeInTheDocument();

		await user.click(dayButton("2026-09-22"));

		expect(onChange).toHaveBeenCalledWith("2026-09-19", "2026-09-22");
		expect(screen.queryByText("Now tap the last day")).not.toBeInTheDocument();
	}, 45000);

	it("orders the range chronologically even when the second tap lands before the first", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<MealPlanDateRangePicker
				startDate={START}
				endDate={END}
				onChange={onChange}
			/>,
		);
		await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));

		await user.click(dayButton("2026-09-22"));
		await user.click(dayButton("2026-09-19"));

		expect(onChange).toHaveBeenCalledWith("2026-09-19", "2026-09-22");
	}, 45000);

	it("forgets an in-progress pick once the popover closes without completing it", async () => {
		const user = userEvent.setup();
		render(
			<MealPlanDateRangePicker
				startDate={START}
				endDate={END}
				onChange={vi.fn()}
			/>,
		);
		await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));
		await user.click(dayButton("2026-09-19"));
		expect(screen.getByText("Now tap the last day")).toBeInTheDocument();

		await user.keyboard("{Escape}");
		expect(screen.queryByText("Now tap the last day")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: TRIGGER_NAME }));
		expect(
			screen.getByText("Tap the first day, then the last day"),
		).toBeInTheDocument();
	}, 45000);
});
