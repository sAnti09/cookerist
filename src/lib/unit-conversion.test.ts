import { describe, expect, it } from "vitest";
import {
	convertFromBase,
	convertToBase,
	getUnitDimension,
	pickDisplayUnit,
	resolveUnit,
} from "./unit-conversion";

describe("resolveUnit / getUnitDimension", () => {
	it("resolves common mass units to the mass dimension", () => {
		for (const unit of ["mg", "g", "gram", "grams", "kg", "oz", "lb", "lbs"]) {
			expect(getUnitDimension(unit)).toBe("mass");
		}
	});

	it("resolves common volume units to the volume dimension", () => {
		for (const unit of [
			"ml",
			"l",
			"liter",
			"tsp",
			"teaspoon",
			"tbsp",
			"tablespoon",
			"cup",
			"cups",
			"pt",
			"qt",
			"gal",
			"fl oz",
			"floz",
		]) {
			expect(getUnitDimension(unit)).toBe("volume");
		}
	});

	it("is case/whitespace/period-insensitive", () => {
		expect(getUnitDimension("  Tbsp ")).toBe("volume");
		expect(getUnitDimension("FL. OZ.")).toBe("volume");
		expect(getUnitDimension("Kg")).toBe("mass");
	});

	it("resolves common length units to the length dimension", () => {
		for (const unit of [
			"mm",
			"cm",
			"centimeter",
			"centimeters",
			"in",
			"inch",
			"inches",
		]) {
			expect(getUnitDimension(unit)).toBe("length");
		}
		expect(convertToBase(1, "in")).toBeCloseTo(2.54);
		expect(convertToBase(1, "cm")).toBe(1);
		expect(convertToBase(10, "mm")).toBeCloseTo(1);
	});

	it("resolves generic count units to the count dimension with exact multipliers", () => {
		expect(getUnitDimension("piece")).toBe("count");
		expect(getUnitDimension("whole")).toBe("count");
		expect(getUnitDimension("egg")).toBe("count");
		expect(getUnitDimension("head")).toBe("count");
		expect(getUnitDimension("loaf")).toBe("count");
		expect(convertToBase(1, "dozen")).toBe(12);
		expect(convertToBase(1, "half dozen")).toBe(6);
		expect(convertToBase(1, "half-dozen")).toBe(6);
		expect(convertToBase(1, "piece")).toBe(1);
	});

	it("resolves an empty (unitless) string to the count dimension, same as 'whole'/'piece'", () => {
		// Groq's prompt asks for unit "" on a genuinely unitless whole item
		// (e.g. "1 onion") but doesn't forbid "whole"/"piece" for the exact
		// same kind of item, so the two forms show up interchangeably across
		// generations -- they need to land in the same dimension or grocery
		// merging silently fails for otherwise-identical items.
		expect(getUnitDimension("")).toBe("count");
		expect(convertToBase(1, "")).toBe(1);
	});

	it("returns null for ingredient-specific count units and unrecognized units", () => {
		// "clove"/"bunch" aren't generic count units -- they're only meaningful
		// relative to a specific ingredient's container (see
		// ingredient-piece-ratio.ts), so this module has no entry for them.
		expect(getUnitDimension("clove")).toBeNull();
		expect(getUnitDimension("can")).toBeNull();
		expect(getUnitDimension("bunch")).toBeNull();
		expect(resolveUnit("clove")).toBeNull();
	});
});

describe("convertToBase / convertFromBase", () => {
	it("converts volume units to milliliters", () => {
		expect(convertToBase(1, "l")).toBeCloseTo(1000);
		expect(convertToBase(1, "tbsp")).toBeCloseTo(14.7868);
		expect(convertToBase(2, "cup")).toBeCloseTo(473.176);
	});

	it("converts mass units to grams", () => {
		expect(convertToBase(1, "kg")).toBeCloseTo(1000);
		expect(convertToBase(1, "lb")).toBeCloseTo(453.592);
	});

	it("returns null for a unit that doesn't resolve", () => {
		expect(convertToBase(1, "clove")).toBeNull();
	});

	it("round-trips through base and back to the same unit", () => {
		const base = convertToBase(3, "tbsp");
		expect(base).not.toBeNull();
		expect(convertFromBase(base as number, "tbsp")).toBeCloseTo(3);
	});

	it("converts a base quantity into a different unit of the same dimension", () => {
		// 1 cup + 1 tbsp worth of ml, read back out as cups.
		const totalMl =
			(convertToBase(1, "cup") ?? 0) + (convertToBase(1, "tbsp") ?? 0);
		expect(convertFromBase(totalMl, "cup")).toBeCloseTo(1.0625, 3);
	});

	it("falls back to returning the base quantity unconverted for an unresolvable unit", () => {
		expect(convertFromBase(100, "clove")).toBe(100);
	});
});

describe("pickDisplayUnit", () => {
	it("picks the unit with the largest conversion factor among those given", () => {
		expect(pickDisplayUnit(["tbsp", "cup"])).toBe("cup");
		expect(pickDisplayUnit(["cup", "tbsp"])).toBe("cup");
		expect(pickDisplayUnit(["g", "kg", "mg"])).toBe("kg");
	});

	it("returns the only unit when just one is given", () => {
		expect(pickDisplayUnit(["tbsp"])).toBe("tbsp");
	});
});
