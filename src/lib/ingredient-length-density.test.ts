import { describe, expect, it } from "vitest";
import { lookupLengthDensity } from "./ingredient-length-density";

describe("lookupLengthDensity", () => {
	it("finds ginger's approximate grams-per-centimeter figure", () => {
		expect(lookupLengthDensity("ginger")).toBeCloseTo(15 / 2.54);
	});

	it("is case/whitespace-insensitive", () => {
		expect(lookupLengthDensity("  Ginger  ")).toBeCloseTo(15 / 2.54);
	});

	it("falls back to the generic match when a descriptive modifier precedes it", () => {
		expect(lookupLengthDensity("fresh ginger")).toBeCloseTo(15 / 2.54);
		expect(lookupLengthDensity("peeled fresh ginger")).toBeCloseTo(15 / 2.54);
	});

	it("returns null for an ingredient with no known length density", () => {
		expect(lookupLengthDensity("lemongrass")).toBeNull();
		expect(lookupLengthDensity("garlic")).toBeNull();
		expect(lookupLengthDensity("")).toBeNull();
	});
});
