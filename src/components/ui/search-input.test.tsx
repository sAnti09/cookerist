import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { SearchInput } from "./search-input";

describe("SearchInput", () => {
	it("does not show a clear button while empty", () => {
		render(
			<SearchInput
				value=""
				onChange={vi.fn()}
				placeholder="Search…"
				aria-label="Search"
			/>,
		);

		expect(
			screen.queryByRole("button", { name: "Clear search" }),
		).not.toBeInTheDocument();
	});

	it("shows a clear button once there's a value, and clears it on click", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<SearchInput
				value="shrimp"
				onChange={onChange}
				placeholder="Search…"
				aria-label="Search"
			/>,
		);

		const clearButton = screen.getByRole("button", { name: "Clear search" });
		await user.click(clearButton);

		expect(onChange).toHaveBeenCalledWith("");
	});

	it("supports a custom clear-button label", () => {
		render(
			<SearchInput
				value="shrimp"
				onChange={vi.fn()}
				placeholder="Search…"
				aria-label="Search"
				clearLabel="Clear item search"
			/>,
		);

		expect(
			screen.getByRole("button", { name: "Clear item search" }),
		).toBeInTheDocument();
	});

	it("forwards the ref to the underlying input", () => {
		const ref = createRef<HTMLInputElement>();
		render(
			<SearchInput
				ref={ref}
				value=""
				onChange={vi.fn()}
				placeholder="Search…"
				aria-label="Search"
			/>,
		);

		expect(ref.current).toBeInstanceOf(HTMLInputElement);
		ref.current?.focus();
		expect(ref.current).toHaveFocus();
	});

	it("calls onChange as the user types", async () => {
		const user = userEvent.setup();
		const onChange = vi.fn();
		render(
			<SearchInput
				value=""
				onChange={onChange}
				placeholder="Search…"
				aria-label="Search"
			/>,
		);

		await user.type(screen.getByLabelText("Search"), "abc");

		expect(onChange).toHaveBeenCalledTimes(3);
		expect(onChange).toHaveBeenLastCalledWith("c");
	});
});
