import { describe, expect, it } from "vitest";
import { portionSizeHint, regionHint } from "./region-hint";

describe("regionHint", () => {
	it("returns an empty string when no timezone is given", () => {
		expect(regionHint(undefined)).toBe("");
	});

	it("mentions the timezone and frames it as a soft, overridable tiebreaker", () => {
		const hint = regionHint("Asia/Manila");

		expect(hint).toContain("Asia/Manila");
		expect(hint).toMatch(/soft tiebreaker/i);
		expect(hint).toMatch(/context only|not an instruction/i);
	});
});

describe("portionSizeHint", () => {
	it("returns an empty string when no timezone is given", () => {
		expect(portionSizeHint(undefined)).toBe("");
	});

	it("mentions the timezone and frames portion sizing as unconditional, unlike regionHint", () => {
		const hint = portionSizeHint("Asia/Manila");

		expect(hint).toContain("Asia/Manila");
		expect(hint).toMatch(/regardless of which dish/i);
		expect(hint).toMatch(/serving/i);
	});
});
