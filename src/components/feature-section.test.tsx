import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeatureSection } from "./feature-section";

describe("FeatureSection", () => {
	it("renders a tile for every feature", () => {
		render(<FeatureSection onResetData={vi.fn()} />);

		for (const title of [
			"AI-powered recipes",
			"Refine any recipe",
			"Cook mode",
			"Plan your week",
			"Grocery lists",
			"Take it anywhere",
			"Sync & share",
			"Private by design",
		]) {
			expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
		}
	});

	it("calls onResetData when the reset action in the privacy tile is clicked", async () => {
		const onResetData = vi.fn();
		render(<FeatureSection onResetData={onResetData} />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "reset all data" }));

		expect(onResetData).toHaveBeenCalledTimes(1);
	});
});
