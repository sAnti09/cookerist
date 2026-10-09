import { afterEach, describe, expect, it, vi } from "vitest";
import { trackMetaPixelEvent } from "#/lib/meta-pixel";

describe("trackMetaPixelEvent", () => {
	afterEach(() => {
		delete (window as unknown as { fbq?: unknown }).fbq;
	});

	it("calls window.fbq with a trackCustom event when fbq is present", () => {
		const fbq = vi.fn();
		(window as unknown as { fbq: typeof fbq }).fbq = fbq;

		trackMetaPixelEvent("RecipeGenerated");

		expect(fbq).toHaveBeenCalledWith("trackCustom", "RecipeGenerated");
	});

	it("does not throw when window.fbq is missing (ad blocker, dev, test)", () => {
		expect(() => trackMetaPixelEvent("RecipeGenerated")).not.toThrow();
	});
});
