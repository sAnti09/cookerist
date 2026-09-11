import { describe, expect, it } from "vitest";
import { regionHint } from "./region-hint";

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
