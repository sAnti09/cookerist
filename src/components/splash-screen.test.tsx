import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SplashScreen } from "./splash-screen";

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("SplashScreen", () => {
	it("shows the Cookerist wordmark and tagline", () => {
		render(<SplashScreen ready={false} />);

		expect(
			screen.getByRole("heading", { name: "Cookerist" }),
		).toBeInTheDocument();
		expect(
			screen.getByText(/tell us what you want to cook/i),
		).toBeInTheDocument();
	});

	it("stays visible even once ready, until the minimum duration elapses", () => {
		const { rerender } = render(<SplashScreen ready={false} />);
		rerender(<SplashScreen ready={true} />);

		expect(screen.getByTestId("splash-screen")).toHaveAttribute(
			"aria-hidden",
			"false",
		);
	});

	it("hides once both ready and the minimum duration have elapsed", () => {
		render(<SplashScreen ready={true} />);
		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(screen.getByTestId("splash-screen")).toHaveAttribute(
			"aria-hidden",
			"true",
		);
	});

	it("does not hide on the minimum duration alone if data isn't ready yet", () => {
		render(<SplashScreen ready={false} />);
		act(() => {
			vi.advanceTimersByTime(1000);
		});

		expect(screen.getByTestId("splash-screen")).toHaveAttribute(
			"aria-hidden",
			"false",
		);
	});
});
