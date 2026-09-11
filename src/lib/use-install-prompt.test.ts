import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
	buildAndroidBrowserEscapeUrl,
	useInstallPrompt,
} from "./use-install-prompt";

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

	it("detects Facebook's in-app browser from the user agent", () => {
		stubUserAgent(
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0]",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.inAppBrowserName).toBe("Facebook");
	});

	it("distinguishes Messenger's in-app browser from the base Facebook app", () => {
		stubUserAgent(
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/MESSENGER;FBAV/440.0]",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.inAppBrowserName).toBe("Messenger");
	});

	it("detects Instagram's in-app browser from the user agent", () => {
		stubUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0.0",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.inAppBrowserName).toBe("Instagram");
	});

	it("does not flag an ordinary browser as an in-app browser", () => {
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.inAppBrowserName).toBeNull();
		expect(result.current.escapeUrl).toBeNull();
	});

	it("exposes an Android escape URL when in Facebook's in-app browser on Android", () => {
		stubUserAgent(
			"Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 [FB_IAB/FB4A;FBAV/440.0]",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.isAndroid).toBe(true);
		expect(result.current.escapeUrl).toBe(
			buildAndroidBrowserEscapeUrl(window.location.href),
		);
	});

	it("does not expose an escape URL for an in-app browser on iOS", () => {
		stubUserAgent(
			"Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Instagram 300.0.0.0.0",
		);
		const { result } = renderHook(() => useInstallPrompt());

		expect(result.current.isAndroid).toBe(false);
		expect(result.current.escapeUrl).toBeNull();
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

describe("buildAndroidBrowserEscapeUrl", () => {
	it("builds an intent URL targeting Chrome with the original URL as a fallback", () => {
		const url = buildAndroidBrowserEscapeUrl(
			"https://cookerist.example.com/some/path?q=1",
		);

		expect(url).toBe(
			"intent://cookerist.example.com/some/path?q=1#Intent;scheme=https;package=com.android.chrome;S.browser_fallback_url=https%3A%2F%2Fcookerist.example.com%2Fsome%2Fpath%3Fq%3D1;end",
		);
	});
});
