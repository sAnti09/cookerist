import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useWakeLock } from "./use-wake-lock";

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleaning up a test-only navigator patch
	delete (navigator as any).wakeLock;
});

describe("useWakeLock", () => {
	it("requests a screen wake lock on mount and releases it on unmount, when supported", async () => {
		const release = vi.fn().mockResolvedValue(undefined);
		const request = vi.fn().mockResolvedValue({ release });
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		});

		const { unmount } = renderHook(() => useWakeLock());
		await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));

		unmount();
		await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
	});

	it("re-acquires the wake lock when the page becomes visible again", async () => {
		const request = vi
			.fn()
			.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		});

		renderHook(() => useWakeLock());
		await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

		document.dispatchEvent(new Event("visibilitychange"));

		await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
	});

	it("does nothing when the Wake Lock API isn't supported", () => {
		expect(() => renderHook(() => useWakeLock())).not.toThrow();
	});

	it("releases the lock immediately if it resolves after the component has already unmounted", async () => {
		let resolveRequest!: (sentinel: { release: () => Promise<void> }) => void;
		const release = vi.fn().mockResolvedValue(undefined);
		const request = vi.fn(
			() =>
				new Promise<{ release: () => Promise<void> }>((resolve) => {
					resolveRequest = resolve;
				}),
		);
		Object.defineProperty(navigator, "wakeLock", {
			configurable: true,
			value: { request },
		});

		const { unmount } = renderHook(() => useWakeLock());
		await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
		unmount();

		resolveRequest({ release });

		await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
	});
});
