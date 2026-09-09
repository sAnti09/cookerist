import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useInstallPrompt } from "./use-install-prompt";

function dispatchBeforeInstallPrompt() {
	const event = new Event("beforeinstallprompt", { cancelable: true });
	const userChoice = Promise.resolve({ outcome: "accepted" as const });
	Object.assign(event, { prompt: vi.fn(), userChoice });
	window.dispatchEvent(event);
	return event as Event & { prompt: () => void; userChoice: typeof userChoice };
}

function stubUserAgent(userAgent: string) {
	vi.stubGlobal("navigator", {
		...window.navigator,
		userAgent,
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useInstallPrompt", () => {
	it("starts with no native prompt available and not installed", () => {
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.canPromptNatively).toBe(false);
		expect(result.current.installed).toBe(false);
	});

	it("detects iOS from the user agent", () => {
		stubUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.isIOS).toBe(true);
	});

	it("captures beforeinstallprompt and exposes a working promptInstall", async () => {
		const { result } = renderHook(() => useInstallPrompt());

		let event!: ReturnType<typeof dispatchBeforeInstallPrompt>;
		act(() => {
			event = dispatchBeforeInstallPrompt();
		});

		expect(result.current.canPromptNatively).toBe(true);

		await act(async () => {
			await result.current.promptInstall();
		});

		expect(event.prompt).toHaveBeenCalledTimes(1);
		// The captured event can only be prompted once.
		expect(result.current.canPromptNatively).toBe(false);
	});

	it("marks the app installed when the appinstalled event fires", () => {
		const { result } = renderHook(() => useInstallPrompt());

		act(() => {
			dispatchBeforeInstallPrompt();
		});
		expect(result.current.canPromptNatively).toBe(true);

		act(() => {
			window.dispatchEvent(new Event("appinstalled"));
		});

		expect(result.current.installed).toBe(true);
		expect(result.current.canPromptNatively).toBe(false);
	});

	it("does nothing if promptInstall is called with no captured event", async () => {
		const { result } = renderHook(() => useInstallPrompt());

		await act(async () => {
			await result.current.promptInstall();
		});

		expect(result.current.canPromptNatively).toBe(false);
	});
});
