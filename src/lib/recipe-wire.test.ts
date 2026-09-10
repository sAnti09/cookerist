import { describe, expect, it } from "vitest";
import type { Ingredient, Step } from "./recipe";
import { toWireIngredient, toWireStep } from "./recipe-wire";

describe("toWireIngredient", () => {
	it("uses baseName/description when present", () => {
		const ingredient: Ingredient = {
			id: "ing-1",
			text: "garlic, minced",
			baseName: "garlic",
			description: "minced",
			quantity: 4,
			unit: "cloves",
			checked: false,
		};

		expect(toWireIngredient(ingredient)).toEqual({
			baseName: "garlic",
			description: "minced",
			quantity: 4,
			unit: "cloves",
		});
	});

	it("falls back to text as baseName and empty description when both are absent (pre-TEST-255)", () => {
		const ingredient: Ingredient = {
			id: "ing-1",
			text: "shrimp",
			quantity: 300,
			unit: "g",
			checked: false,
		};

		expect(toWireIngredient(ingredient)).toEqual({
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
		});
	});
});

describe("toWireStep", () => {
	it("carries section, text, and estimatedMinutes through", () => {
		const step: Step = {
			id: "step-1",
			section: "Cook",
			text: "Simmer for 10 minutes.",
			checked: false,
			estimatedMinutes: 10,
		};

		expect(toWireStep(step)).toEqual({
			section: "Cook",
			text: "Simmer for 10 minutes.",
			estimatedMinutes: 10,
		});
	});

	it("defaults estimatedMinutes to null when absent", () => {
		const step: Step = {
			id: "step-1",
			section: null,
			text: "Mince the garlic.",
			checked: false,
		};

		expect(toWireStep(step)).toEqual({
			section: null,
			text: "Mince the garlic.",
			estimatedMinutes: null,
		});
	});
});
