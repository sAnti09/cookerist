import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { Home } from "./index";

describe("Home", () => {
	it("renders the Cookerist heading", () => {
		render(<Home />);

		expect(
			screen.getByRole("heading", { name: "Cookerist" }),
		).toBeInTheDocument();
	});
});
