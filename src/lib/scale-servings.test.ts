import { describe, expect, it } from "vitest";
import {
	formatIngredientLine,
	formatQuantity,
	scaleQuantity,
} from "./scale-servings";

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

describe("formatIngredientLine", () => {
	it("joins quantity, unit, and text with single spaces", () => {
		expect(formatIngredientLine(4, "cloves", "garlic")).toBe("4 cloves garlic");
		expect(formatIngredientLine(300, "g", "shrimp")).toBe("300 g shrimp");
	});

	it("omits the unit when it exactly duplicates the ingredient text", () => {
		expect(formatIngredientLine(1, "egg", "egg")).toBe("1 egg");
	});

	it("omits the unit when it duplicates the text case-insensitively", () => {
		expect(formatIngredientLine(1, "Egg", "egg")).toBe("1 egg");
		expect(formatIngredientLine(1, "EGG", "Egg")).toBe("1 Egg");
	});

	it("omits the unit when it duplicates the text ignoring surrounding whitespace", () => {
		expect(formatIngredientLine(1, "  egg  ", "egg")).toBe("1 egg");
	});

	it("omits a singular unit that duplicates a plural ingredient text", () => {
		expect(formatIngredientLine(2, "egg", "eggs")).toBe("2 eggs");
	});

	it("omits a plural unit that duplicates a singular ingredient text", () => {
		expect(formatIngredientLine(1, "eggs", "egg")).toBe("1 egg");
	});

	it("omits a unit that duplicates the text via a simple -es plural", () => {
		expect(formatIngredientLine(3, "tomatoes", "tomato")).toBe("3 tomato");
		expect(formatIngredientLine(3, "tomato", "tomatoes")).toBe("3 tomatoes");
	});

	it("keeps a real unit that is not a duplicate of the text", () => {
		expect(formatIngredientLine(2, "cloves", "garlic, minced")).toBe(
			"2 cloves garlic, minced",
		);
	});

	it("omits the unit entirely when it is empty, without a double space", () => {
		expect(formatIngredientLine(1, "", "salt")).toBe("1 salt");
	});

	it("omits the unit when it is only whitespace", () => {
		expect(formatIngredientLine(1, "   ", "salt")).toBe("1 salt");
	});

	it("uses the formatted (rounded) quantity", () => {
		expect(formatIngredientLine(1 / 3, "cups", "flour")).toBe(
			"0.33 cups flour",
		);
	});
});
