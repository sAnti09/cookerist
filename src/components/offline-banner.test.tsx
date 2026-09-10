import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { OfflineBanner } from "./offline-banner";

describe("OfflineBanner", () => {
	it("renders nothing while online", () => {
		render(<OfflineBanner isOnline={true} />);

		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("shows an offline notice while offline", () => {
		render(<OfflineBanner isOnline={false} />);

		expect(screen.getByRole("status")).toHaveTextContent(/you're offline/i);
	});
});
