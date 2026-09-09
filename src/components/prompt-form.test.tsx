import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { PromptForm } from "./prompt-form";

// PromptForm is a controlled component — this wrapper stands in for the
// parent (routes/index.tsx) so typing/clearing behaves like it would for a
// real caller, without needing to render the whole route.
function ControlledPromptForm({
	onSubmit,
	disabled,
	initialValue = "",
}: {
	onSubmit: (prompt: string) => void;
	disabled?: boolean;
	initialValue?: string;
}) {
	const [value, setValue] = useState(initialValue);
	return (
		<PromptForm
			value={value}
			onChange={setValue}
			onSubmit={onSubmit}
			disabled={disabled}
		/>
	);
}

describe("PromptForm", () => {
	it("clears the textarea and calls onSubmit with the trimmed prompt", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<ControlledPromptForm onSubmit={onSubmit} />);

		const textarea = screen.getByLabelText("Describe a dish");
		await user.type(textarea, "  shrimp pasta for 2  ");
		await user.click(screen.getByRole("button", { name: "Get recipe" }));

		expect(onSubmit).toHaveBeenCalledWith("shrimp pasta for 2");
		expect(textarea).toHaveValue("");
	});

	it("does not submit an empty or whitespace-only prompt", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<ControlledPromptForm onSubmit={onSubmit} />);

		await user.type(screen.getByLabelText("Describe a dish"), "   ");

		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("ignores a direct form submit while the value is empty", () => {
		const onSubmit = vi.fn();
		const { container } = render(<ControlledPromptForm onSubmit={onSubmit} />);

		// biome-ignore lint/style/noNonNullAssertion: form is always rendered
		fireEvent.submit(container.querySelector("form")!);

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("disables the textarea and button when disabled", () => {
		render(<ControlledPromptForm onSubmit={vi.fn()} disabled />);

		expect(screen.getByLabelText("Describe a dish")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
	});

	it("submits on Enter, same as clicking the button", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<ControlledPromptForm onSubmit={onSubmit} />);

		const textarea = screen.getByLabelText("Describe a dish");
		await user.type(textarea, "shrimp pasta for 2{Enter}");

		expect(onSubmit).toHaveBeenCalledWith("shrimp pasta for 2");
		expect(textarea).toHaveValue("");
	});

	it("does not submit on Enter while the value is empty", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<ControlledPromptForm onSubmit={onSubmit} />);

		await user.type(screen.getByLabelText("Describe a dish"), "{Enter}");

		expect(onSubmit).not.toHaveBeenCalled();
	});

	it("inserts a newline instead of submitting on Shift+Enter", async () => {
		const onSubmit = vi.fn();
		const user = userEvent.setup();
		render(<ControlledPromptForm onSubmit={onSubmit} />);

		const textarea = screen.getByLabelText("Describe a dish");
		await user.type(textarea, "line one{Shift>}{Enter}{/Shift}line two");

		expect(onSubmit).not.toHaveBeenCalled();
		expect(textarea).toHaveValue("line one\nline two");
	});

	it("reflects a value set from outside (e.g. a parent refilling it)", () => {
		render(
			<ControlledPromptForm onSubmit={vi.fn()} initialValue="reheat this" />,
		);

		expect(screen.getByLabelText("Describe a dish")).toHaveValue("reheat this");
	});
});
