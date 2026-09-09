import { describe, expect, it } from "vitest";
import { stripSizeDescriptor } from "./size-descriptor";

describe("stripSizeDescriptor", () => {
	it("strips a leading size word and returns it lowercase", () => {
		expect(stripSizeDescriptor("medium onion")).toEqual({
			mergeKey: "onion",
			extractedSizeDescriptor: "medium",
		});
	});

	it("preserves the original casing of the remaining name", () => {
		expect(stripSizeDescriptor("Large Onion")).toEqual({
			mergeKey: "Onion",
			extractedSizeDescriptor: "large",
		});
	});

	it("strips a trailing size word", () => {
		expect(stripSizeDescriptor("onion large")).toEqual({
			mergeKey: "onion",
			extractedSizeDescriptor: "large",
		});
	});

	it("strips a two-word size phrase without leaving a stray leftover word", () => {
		expect(stripSizeDescriptor("extra large eggs")).toEqual({
			mergeKey: "eggs",
			extractedSizeDescriptor: "extra large",
		});
		expect(stripSizeDescriptor("extra-small shrimp")).toEqual({
			mergeKey: "shrimp",
			extractedSizeDescriptor: "extra-small",
		});
	});

	it("strips size words even for ingredients where size could denote a different product (deliberate simplification)", () => {
		expect(stripSizeDescriptor("jumbo shrimp")).toEqual({
			mergeKey: "shrimp",
			extractedSizeDescriptor: "jumbo",
		});
		expect(stripSizeDescriptor("small pasta shells")).toEqual({
			mergeKey: "pasta shells",
			extractedSizeDescriptor: "small",
		});
	});

	it("leaves a name with no size word unchanged", () => {
		expect(stripSizeDescriptor("garlic")).toEqual({
			mergeKey: "garlic",
			extractedSizeDescriptor: null,
		});
	});

	it("does not strip a bare size word with nothing left to merge on", () => {
		expect(stripSizeDescriptor("large")).toEqual({
			mergeKey: "large",
			extractedSizeDescriptor: null,
		});
	});

	it("returns an empty mergeKey and no descriptor for an empty name", () => {
		expect(stripSizeDescriptor("")).toEqual({
			mergeKey: "",
			extractedSizeDescriptor: null,
		});
		expect(stripSizeDescriptor("   ")).toEqual({
			mergeKey: "",
			extractedSizeDescriptor: null,
		});
	});

	it("is case-insensitive when matching the size word itself", () => {
		expect(stripSizeDescriptor("MEDIUM Onion")).toEqual({
			mergeKey: "Onion",
			extractedSizeDescriptor: "medium",
		});
	});
});
