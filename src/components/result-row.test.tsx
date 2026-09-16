import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { PendingResultRow, type PendingRow } from "./result-row";

// RecipeResultRow's own rendering (title/date/difficulty/time/calories/
// favorite-star visibility, and navigating to /recipes/$recipeId) is covered
// via the Recipes screen route test (routes/_tabs.recipes.test.tsx) — it
// renders a <Link>, which needs a real router context to work at all, so
// it's exercised through the actual app router rather than in isolation
// here.

describe("PendingResultRow", () => {
	const baseRow: PendingRow = {
		localId: "row-1",
		prompt: "shrimp pasta for 2",
		status: "loading",
	};

	it("shows the flame icon and the typed prompt for a text-originated loading row", () => {
		const { container } = render(
			<PendingResultRow
				row={baseRow}
				onRetry={vi.fn()}
				onChoosePhoto={vi.fn()}
			/>,
		);

		expect(screen.getByText(/simmering your/i)).toHaveTextContent(
			baseRow.prompt,
		);
		expect(container.querySelector("img")).not.toBeInTheDocument();
	});

	it("shows the photo thumbnail and 'Identifying' copy while a photo is being identified", () => {
		const { container } = render(
			<PendingResultRow
				row={{
					...baseRow,
					prompt: "",
					photo: {
						previewUrl: "blob:preview",
						dataUrl: "data:image/jpeg;base64,AAAA",
						stage: "identifying",
					},
				}}
				onRetry={vi.fn()}
				onChoosePhoto={vi.fn()}
			/>,
		);

		expect(screen.getByText(/identifying your photo/i)).toBeInTheDocument();
		// A decorative thumbnail (alt="") — the adjacent text already conveys
		// the loading state — so it's queried directly rather than by role.
		expect(container.querySelector("img")).toHaveAttribute(
			"src",
			"blob:preview",
		);
	});

	it("keeps showing the photo thumbnail once generation starts, with the identified prompt", () => {
		const { container } = render(
			<PendingResultRow
				row={{
					...baseRow,
					prompt: "creamy garlic butter shrimp pasta",
					photo: {
						previewUrl: "blob:preview",
						dataUrl: "data:image/jpeg;base64,AAAA",
						stage: "generating",
					},
				}}
				onRetry={vi.fn()}
				onChoosePhoto={vi.fn()}
			/>,
		);

		expect(screen.getByText(/simmering your/i)).toHaveTextContent(
			"creamy garlic butter shrimp pasta",
		);
		expect(container.querySelector("img")).toHaveAttribute(
			"src",
			"blob:preview",
		);
	});

	it("shows the rejection message and a Retry button for a text-generation error", async () => {
		const onRetry = vi.fn();
		const user = userEvent.setup();
		render(
			<PendingResultRow
				row={{ ...baseRow, status: "error", message: "Something went wrong" }}
				onRetry={onRetry}
				onChoosePhoto={vi.fn()}
			/>,
		);

		expect(screen.getByText("Something went wrong")).toBeInTheDocument();
		await user.click(screen.getByRole("button", { name: "Retry" }));
		expect(onRetry).toHaveBeenCalledTimes(1);
	});

	it("shows Retry (not 'Choose another photo') for a photo identification error that isn't a rejection", () => {
		render(
			<PendingResultRow
				row={{
					...baseRow,
					status: "error",
					message: "Something went wrong identifying that photo.",
					photo: {
						previewUrl: "blob:preview",
						dataUrl: "data:image/jpeg;base64,AAAA",
						stage: "identifying",
					},
				}}
				onRetry={vi.fn()}
				onChoosePhoto={vi.fn()}
			/>,
		);

		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
		expect(screen.queryByText("Choose another photo")).not.toBeInTheDocument();
	});

	it("offers 'Choose another photo' instead of Retry when the photo wasn't food, and forwards the newly picked file", async () => {
		const onChoosePhoto = vi.fn();
		const row: PendingRow = {
			...baseRow,
			status: "error",
			message: "That doesn't look like a dish — try a clearer photo of food.",
			offTopic: true,
			photo: {
				previewUrl: "blob:preview",
				dataUrl: "data:image/jpeg;base64,AAAA",
				stage: "identifying",
			},
		};
		const { container } = render(
			<PendingResultRow
				row={row}
				onRetry={vi.fn()}
				onChoosePhoto={onChoosePhoto}
			/>,
		);

		expect(screen.getByText(/doesn't look like a dish/i)).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Retry" }),
		).not.toBeInTheDocument();
		const chooseControl = screen.getByText("Choose another photo");
		expect(chooseControl.closest("label")).toBeInTheDocument();

		const input =
			container.querySelector<HTMLInputElement>('input[type="file"]');
		if (!input) throw new Error("photo input not found");
		const file = new File(["data"], "new-dish.jpg", { type: "image/jpeg" });
		await userEvent.upload(input, file);

		expect(onChoosePhoto).toHaveBeenCalledWith(row, file);
	});
});
