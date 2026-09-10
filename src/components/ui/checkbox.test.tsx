import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Checkbox } from "./checkbox";

describe("Checkbox", () => {
	it("calls onChange with the new checked value", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<Checkbox checked={false} onChange={onChange} label="Flour" />);

		await user.click(screen.getByRole("checkbox", { name: "Flour" }));

		expect(onChange).toHaveBeenCalledWith(true);
	});

	it("shows a checkmark only once checked", () => {
		const { rerender } = render(
			<Checkbox checked={false} onChange={vi.fn()} label="Flour" />,
		);
		expect(document.querySelector("svg")).not.toBeInTheDocument();

		rerender(<Checkbox checked={true} onChange={vi.fn()} label="Flour" />);
		expect(document.querySelector("svg")).toBeInTheDocument();
	});

	// Regression guard: the label previously had no explicit vertical-align,
	// which left the surrounding <li>'s line-box height at the mercy of the
	// browser's inline-baseline computation — adding the checkmark icon
	// (present only while checked) shifted that baseline just enough to
	// shrink the row by a few pixels, nudging every row below it up when a
	// box got checked (and back down when unchecked). `align-top` pins the
	// label to the top of its line box regardless of its content, so the
	// row's height no longer depends on checked state.
	it("keeps the label's vertical alignment stable across checked states, so rows don't shift height on toggle", () => {
		const { rerender } = render(
			<Checkbox checked={false} onChange={vi.fn()} label="Flour" />,
		);
		expect(
			screen.getByRole("checkbox", { name: "Flour" }).closest("label"),
		).toHaveClass("align-top");

		rerender(<Checkbox checked={true} onChange={vi.fn()} label="Flour" />);
		expect(
			screen.getByRole("checkbox", { name: "Flour" }).closest("label"),
		).toHaveClass("align-top");
	});
});
