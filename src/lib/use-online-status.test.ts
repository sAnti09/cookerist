import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useOnlineStatus } from "./use-online-status";

function stubOnLine(value: boolean) {
	vi.stubGlobal("navigator", {
		...window.navigator,
		onLine: value,
	});
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useOnlineStatus", () => {
	it("starts reflecting navigator.onLine", () => {
		stubOnLine(false);
		const { result } = renderHook(() => useOnlineStatus());

		expect(result.current).toBe(false);
	});

	it("defaults to online when navigator.onLine is true", () => {
		stubOnLine(true);
		const { result } = renderHook(() => useOnlineStatus());

		expect(result.current).toBe(true);
	});

	it("flips to false when the offline event fires", () => {
		stubOnLine(true);
		const { result } = renderHook(() => useOnlineStatus());

		act(() => {
			window.dispatchEvent(new Event("offline"));
		});

		expect(result.current).toBe(false);
	});

	it("flips back to true when the online event fires", () => {
		stubOnLine(false);
		const { result } = renderHook(() => useOnlineStatus());

		act(() => {
			window.dispatchEvent(new Event("online"));
		});

		expect(result.current).toBe(true);
	});
});
