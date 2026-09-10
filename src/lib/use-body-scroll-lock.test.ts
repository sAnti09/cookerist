import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useBodyScrollLock } from "./use-body-scroll-lock";

afterEach(() => {
	document.body.style.position = "";
	document.body.style.top = "";
	document.body.style.width = "";
	document.body.style.overflow = "";
	window.scrollTo(0, 0);
});

describe("useBodyScrollLock", () => {
	it("does nothing while inactive", () => {
		renderHook(() => useBodyScrollLock(false));

		expect(document.body.style.overflow).toBe("");
	});

	it("locks the body in place while active, and restores it on release", () => {
		// jsdom's window.scrollTo doesn't actually move scrollY, so stub the
		// getter directly to simulate an already-scrolled page.
		vi.spyOn(window, "scrollY", "get").mockReturnValue(240);
		const scrollToSpy = vi
			.spyOn(window, "scrollTo")
			.mockImplementation(() => {});
		const { unmount } = renderHook(() => useBodyScrollLock(true));

		expect(document.body.style.overflow).toBe("hidden");
		expect(document.body.style.position).toBe("fixed");
		expect(document.body.style.top).toBe("-240px");

		unmount();

		expect(document.body.style.overflow).toBe("");
		expect(document.body.style.position).toBe("");
		expect(scrollToSpy).toHaveBeenCalledWith(0, 240);
	});

	it("stays locked while a nested lock is still active, and only releases once both are", () => {
		const outer = renderHook(() => useBodyScrollLock(true));
		const inner = renderHook(() => useBodyScrollLock(true));

		outer.unmount();
		expect(document.body.style.overflow).toBe("hidden");

		inner.unmount();
		expect(document.body.style.overflow).toBe("");
	});

	it("locks and unlocks in response to the active flag changing, not just mount/unmount", () => {
		const { rerender } = renderHook(({ active }) => useBodyScrollLock(active), {
			initialProps: { active: false },
		});
		expect(document.body.style.overflow).toBe("");

		rerender({ active: true });
		expect(document.body.style.overflow).toBe("hidden");

		rerender({ active: false });
		expect(document.body.style.overflow).toBe("");
	});
});
