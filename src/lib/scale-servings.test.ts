import { describe, expect, it } from "vitest";
import { formatQuantity, scaleQuantity } from "./scale-servings";

describe("scaleQuantity", () => {
	it("scales proportionally with the servings ratio", () => {
		expect(scaleQuantity(300, 2, 4)).toBe(600);
		expect(scaleQuantity(300, 2, 1)).toBe(150);
	});

	it("returns the quantity unchanged when servings match", () => {
		expect(scaleQuantity(2.5, 3, 3)).toBe(2.5);
	});

	it("falls back to the base quantity when baseServings is invalid", () => {
		expect(scaleQuantity(10, 0, 5)).toBe(10);
		expect(scaleQuantity(10, -1, 5)).toBe(10);
	});
});

describe("formatQuantity", () => {
	it("rounds to two decimal places", () => {
		expect(formatQuantity(1 / 3)).toBe("0.33");
	});

	it("strips unnecessary trailing zeros", () => {
		expect(formatQuantity(2)).toBe("2");
		expect(formatQuantity(2.5)).toBe("2.5");
	});
});
