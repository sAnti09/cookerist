import { describe, expect, it } from "vitest";
import { isSizeWordUnit, stripSizeDescriptor } from "./size-descriptor";

describe("stripSizeDescriptor", () => {
	it("strips a leading size word", () => {
		expect(stripSizeDescriptor("medium onion")).toBe("onion");
	});

	it("preserves the original casing of the remaining name", () => {
		expect(stripSizeDescriptor("Large Onion")).toBe("Onion");
	});

	it("strips a trailing size word", () => {
		expect(stripSizeDescriptor("onion large")).toBe("onion");
	});

	it("strips a two-word size phrase without leaving a stray leftover word", () => {
		expect(stripSizeDescriptor("extra large eggs")).toBe("eggs");
		expect(stripSizeDescriptor("extra-small shrimp")).toBe("shrimp");
	});

	it("strips size words even for ingredients where size could denote a different product (deliberate simplification)", () => {
		expect(stripSizeDescriptor("jumbo shrimp")).toBe("shrimp");
		expect(stripSizeDescriptor("small pasta shells")).toBe("pasta shells");
	});

	it("leaves a name with no size word unchanged", () => {
		expect(stripSizeDescriptor("garlic")).toBe("garlic");
	});

	it("does not strip a bare size word with nothing left to merge on", () => {
		expect(stripSizeDescriptor("large")).toBe("large");
	});

	it("returns an empty string for an empty name", () => {
		expect(stripSizeDescriptor("")).toBe("");
		expect(stripSizeDescriptor("   ")).toBe("");
	});

	it("is case-insensitive when matching the size word itself", () => {
		expect(stripSizeDescriptor("MEDIUM Onion")).toBe("Onion");
	});
});

describe("isSizeWordUnit", () => {
	it("recognizes a unit string that is exactly a size word, case/whitespace-insensitive", () => {
		expect(isSizeWordUnit("large")).toBe(true);
		expect(isSizeWordUnit("Large")).toBe(true);
		expect(isSizeWordUnit("  medium  ")).toBe(true);
		expect(isSizeWordUnit("extra large")).toBe(true);
	});

	it("returns false for a real unit or an empty/unitless string", () => {
		expect(isSizeWordUnit("g")).toBe(false);
		expect(isSizeWordUnit("whole")).toBe(false);
		expect(isSizeWordUnit("")).toBe(false);
	});

	it("does not match a size word embedded in a longer unit string", () => {
		expect(isSizeWordUnit("large can")).toBe(false);
	});
});
