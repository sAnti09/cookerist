import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InAppBrowserBanner } from "./in-app-browser-banner";

function stubUserAgent(userAgent: string) {
	vi.stubGlobal("navigator", { ...window.navigator, userAgent });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("InAppBrowserBanner", () => {
	it("renders nothing in an ordinary browser", () => {
		render(<InAppBrowserBanner />);

		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("auto-attempts the Android escape once and shows a tappable fallback link", () => {
		stubUserAgent(
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0]",
		);
		const navigate = vi.fn();

		render(<InAppBrowserBanner navigate={navigate} />);

		expect(navigate).toHaveBeenCalledTimes(1);
		expect(navigate).toHaveBeenCalledWith(expect.stringContaining("intent://"));
		expect(screen.getByText(/facebook's in-app browser/i)).toBeInTheDocument();
		const link = screen.getByRole("link", { name: /open in chrome/i });
		expect(link).toHaveAttribute("href", navigate.mock.calls[0][0]);
	});

	it("shows manual instructions with no auto-attempt on iOS", () => {
		stubUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0.0",
		);
		const navigate = vi.fn();

		render(<InAppBrowserBanner navigate={navigate} />);

		expect(navigate).not.toHaveBeenCalled();
		expect(screen.getByText(/instagram's in-app browser/i)).toBeInTheDocument();
		expect(screen.getByText("Share")).toBeInTheDocument();
		expect(
			screen.queryByRole("link", { name: /open in chrome/i }),
		).not.toBeInTheDocument();
	});
});
