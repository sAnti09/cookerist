import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InstallAppButton } from "./install-app-button";

function dispatchBeforeInstallPrompt() {
	const event = new Event("beforeinstallprompt", { cancelable: true });
	const prompt = vi.fn();
	Object.assign(event, {
		prompt,
		userChoice: Promise.resolve({ outcome: "accepted" as const }),
	});
	window.dispatchEvent(event);
	return prompt;
}

function stubUserAgent(userAgent: string) {
	vi.stubGlobal("navigator", { ...window.navigator, userAgent });
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("InstallAppButton", () => {
	it("triggers the native install prompt directly when the browser supports it", async () => {
		render(<InstallAppButton />);
		const prompt = dispatchBeforeInstallPrompt();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));

		expect(prompt).toHaveBeenCalledTimes(1);
		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("falls back to manual instructions covering both platforms when no native prompt is available", async () => {
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));

		expect(
			screen.getByRole("heading", { name: "Install Cookerist" }),
		).toBeInTheDocument();
		expect(screen.getByText(/android \(chrome\)/i)).toBeInTheDocument();
		expect(screen.getByText(/ios \(safari\)/i)).toBeInTheDocument();
	});

	it("shows only the iOS steps when on an iOS device with no native prompt available", async () => {
		stubUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
		);
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));

		expect(screen.getByText(/add to home screen/i)).toBeInTheDocument();
		expect(screen.queryByText(/android \(chrome\)/i)).not.toBeInTheDocument();
	});

	it("shows an in-app browser warning with the app name when detected", async () => {
		stubUserAgent(
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0]",
		);
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));

		expect(screen.getByText(/facebook's in-app browser/i)).toBeInTheDocument();
		expect(screen.getByText(/open in browser/i)).toBeInTheDocument();
	});

	it("does not show an in-app browser warning in an ordinary browser", async () => {
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));

		expect(screen.queryByText(/in-app browser/i)).not.toBeInTheDocument();
	});

	it("closes the instructions dialog via the Got it button", async () => {
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));
		await user.click(screen.getByRole("button", { name: "Got it" }));

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("closes the instructions dialog on Escape", async () => {
		render(<InstallAppButton />);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Install app" }));
		expect(screen.getByRole("dialog")).toBeInTheDocument();

		await user.keyboard("{Escape}");

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("shows an installed message instead of a button when already running standalone", () => {
		vi.stubGlobal("navigator", { ...window.navigator, standalone: true });
		render(<InstallAppButton />);

		expect(screen.getByText(/already installed/i)).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Install app" }),
		).not.toBeInTheDocument();
	});
});
