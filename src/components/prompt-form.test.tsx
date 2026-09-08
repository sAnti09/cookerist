import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PromptForm } from "./prompt-form";

describe("PromptForm", () => {
	it("clears the textarea and calls onSubmit with the trimmed prompt", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<PromptForm onSubmit={onSubmit} />);

		const textarea = screen.getByLabelText("Describe a dish");
		await user.type(textarea, "  shrimp pasta for 2  ");
		await user.click(screen.getByRole("button", { name: "Get recipe" }));

		expect(onSubmit).toHaveBeenCalledWith("shrimp pasta for 2");
		expect(textarea).toHaveValue("");
	});

	it("does not submit an empty or whitespace-only prompt", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<PromptForm onSubmit={onSubmit} />);

		await user.type(screen.getByLabelText("Describe a dish"), "   ");

		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("ignores a direct form submit while the value is empty", () => {
		const onSubmit = vi.fn();
		const { container } = render(<PromptForm onSubmit={onSubmit} />);

		// biome-ignore lint/style/noNonNullAssertion: form is always rendered
		fireEvent.submit(container.querySelector("form")!);

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("disables the textarea and button when disabled", () => {
		render(<PromptForm onSubmit={vi.fn()} disabled />);

		expect(screen.getByLabelText("Describe a dish")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
	});
});
