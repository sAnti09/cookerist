import { afterEach, describe, expect, it, vi } from "vitest";
import { canShareNatively, shareNatively } from "./share-native";

afterEach(() => {
	// @ts-expect-error -- deleting a test-only stub, not a real DOM property
	delete navigator.share;
});

describe("canShareNatively", () => {
	it("is false when navigator.share doesn't exist", () => {
		expect(canShareNatively()).toBe(false);
	});

	it("is true when navigator.share exists", () => {
		Object.defineProperty(navigator, "share", {
			value: vi.fn(),
			configurable: true,
		});

		expect(canShareNatively()).toBe(true);
	});
});

describe("shareNatively", () => {
	it("calls navigator.share with the given title and text", async () => {
		const shareMock = vi.fn().mockResolvedValue(undefined);
		Object.defineProperty(navigator, "share", {
			value: shareMock,
			configurable: true,
		});

		await shareNatively({ title: "A title", text: "Some text" });

		expect(shareMock).toHaveBeenCalledWith({
			title: "A title",
			text: "Some text",
		});
	});

	it("resolves quietly when the person dismisses the share sheet", async () => {
		const shareMock = vi
			.fn()
			.mockRejectedValue(new DOMException("cancelled", "AbortError"));
		Object.defineProperty(navigator, "share", {
			value: shareMock,
			configurable: true,
		});

		await expect(
			shareNatively({ title: "A title", text: "Some text" }),
		).resolves.toBeUndefined();
	});

	it("rethrows a genuine share failure", async () => {
		const shareMock = vi.fn().mockRejectedValue(new Error("boom"));
		Object.defineProperty(navigator, "share", {
			value: shareMock,
			configurable: true,
		});

		await expect(
			shareNatively({ title: "A title", text: "Some text" }),
		).rejects.toThrow("boom");
	});
});
