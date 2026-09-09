import { describe, expect, it } from "vitest";
import { parseCustomIngredientInput } from "./parse-custom-ingredient";

describe("parseCustomIngredientInput", () => {
	it("returns null for blank input", () => {
		expect(parseCustomIngredientInput("")).toBeNull();
		expect(parseCustomIngredientInput("   ")).toBeNull();
	});

	it("parses '<qty> <unit> <item>' into all three attributes", () => {
		expect(parseCustomIngredientInput("1 pc chicken")).toEqual({
			quantity: 1,
			unit: "pc",
			text: "chicken",
		});
	});

	it("parses a multi-word item after the unit", () => {
		expect(parseCustomIngredientInput("5 kl vegetable oil")).toEqual({
			quantity: 5,
			unit: "kl",
			text: "vegetable oil",
		});
	});

	it("parses '<qty> <item>' with no recognized unit, defaulting to piece", () => {
		expect(parseCustomIngredientInput("5 tuna sardines")).toEqual({
			quantity: 5,
			unit: "piece",
			text: "tuna sardines",
		});
	});

	it("parses a bare item name, defaulting quantity to 1 and unit to piece", () => {
		expect(parseCustomIngredientInput("table")).toEqual({
			quantity: 1,
			unit: "piece",
			text: "table",
		});
	});

	it("recognizes a unit case-insensitively", () => {
		expect(parseCustomIngredientInput("2 PC chicken")).toEqual({
			quantity: 2,
			unit: "PC",
			text: "chicken",
		});
	});

	it("recognizes an extra unit supplied via knownUnits", () => {
		expect(parseCustomIngredientInput("3 stalks celery", ["stalks"])).toEqual({
			quantity: 3,
			unit: "stalks",
			text: "celery",
		});
	});

	it("supports a decimal quantity", () => {
		expect(parseCustomIngredientInput("1.5 kg flour")).toEqual({
			quantity: 1.5,
			unit: "kg",
			text: "flour",
		});
	});

	it("collapses extra internal whitespace", () => {
		expect(parseCustomIngredientInput("  1   pc   chicken  ")).toEqual({
			quantity: 1,
			unit: "pc",
			text: "chicken",
		});
	});

	it("does not treat a recognized unit word as the unit when nothing follows it", () => {
		expect(parseCustomIngredientInput("1 pc")).toEqual({
			quantity: 1,
			unit: "piece",
			text: "pc",
		});
	});

	it("treats a lone number as a bare item name (no item text to pair it with)", () => {
		expect(parseCustomIngredientInput("5")).toEqual({
			quantity: 1,
			unit: "piece",
			text: "5",
		});
	});
});
