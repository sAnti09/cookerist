import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { ViewToggle } from "./view-toggle";

describe("ViewToggle", () => {
	it("renders icon-only controls, not text tabs", () => {
		render(<ViewToggle value="recipes" onChange={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Recipes" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Grocery lists" }),
		).toBeInTheDocument();
	});

	it("marks the current selection as pressed and the other as not", () => {
		render(<ViewToggle value="recipes" onChange={vi.fn()} />);

		expect(screen.getByRole("button", { name: "Recipes" })).toHaveAttribute(
			"aria-pressed",
			"true",
		);
		expect(
			screen.getByRole("button", { name: "Grocery lists" }),
		).toHaveAttribute("aria-pressed", "false");
	});

	it("calls onChange with the clicked view", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ViewToggle value="recipes" onChange={onChange} />);

		await user.click(screen.getByRole("button", { name: "Grocery lists" }));

		expect(onChange).toHaveBeenCalledWith("grocery");
	});

	it("is reachable and activatable by keyboard", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(<ViewToggle value="recipes" onChange={onChange} />);

		screen.getByRole("button", { name: "Grocery lists" }).focus();
		await user.keyboard("{Enter}");

		expect(onChange).toHaveBeenCalledWith("grocery");
	});

	it("reflects the grocery view as the active selection", () => {
		render(<ViewToggle value="grocery" onChange={vi.fn()} />);

		expect(
			screen.getByRole("button", { name: "Grocery lists" }),
		).toHaveAttribute("aria-pressed", "true");
		expect(screen.getByRole("button", { name: "Recipes" })).toHaveAttribute(
			"aria-pressed",
			"false",
		);
	});
});
