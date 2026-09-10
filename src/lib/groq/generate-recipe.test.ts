import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	continueRecipe,
	generateRecipe,
	modifyRecipe,
} from "./generate-recipe";
import type { RecipeResponse } from "./schema";

const createMock = vi.fn();

vi.mock("./client", () => ({
	getGroqClient: () => ({
		chat: { completions: { create: createMock } },
	}),
}));

function jsonResponse(content: unknown, finishReason = "stop") {
	return {
		choices: [
			{
				message: { content: JSON.stringify(content) },
				finish_reason: finishReason,
			},
		],
	};
}

function rawResponse(content: string, finishReason = "stop") {
	return {
		choices: [{ message: { content }, finish_reason: finishReason }],
	};
}

const validRecipe: RecipeResponse = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy",
	estimatedMinutes: 25,
	caloriesPerServing: 620,
	ingredients: [
		{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
	],
	steps: [{ section: null, text: "Cook the pasta." }],
};

beforeEach(() => {
	createMock.mockReset();
});

describe("generateRecipe", () => {
	it("returns off_topic and skips the recipe call when the classifier says no", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ on_topic: false }));

		const result = await generateRecipe("what's the capital of France?");

		expect(result).toEqual({ type: "off_topic" });
		expect(createMock).toHaveBeenCalledTimes(1);
	});

	it("returns an error (not a silent off_topic) when the classifier JSON is invalid", async () => {
		createMock.mockResolvedValueOnce({
			choices: [{ message: { content: "not json" } }],
		});

		const result = await generateRecipe("hello");

		expect(result.type).toBe("error");
		expect(createMock).toHaveBeenCalledTimes(1);
	});

	it("returns an error (not a silent off_topic) when the classifier JSON doesn't match the schema", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ on_topic: "yes" }));

		const result = await generateRecipe("hello");

		expect(result).toEqual({
			type: "error",
			message: "Malformed on-topic classification response from Groq",
		});
		expect(createMock).toHaveBeenCalledTimes(1);
	});

	it("returns a parsed recipe for an on-topic prompt", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(validRecipe));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "success",
			recipe: validRecipe,
			truncated: false,
		});
		expect(createMock).toHaveBeenCalledTimes(2);
	});

	it("passes a generous max_completion_tokens for the recipe call", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(validRecipe));

		await generateRecipe("shrimp pasta for 2");

		const recipeCallArgs = createMock.mock.calls[1]?.[0];
		expect(recipeCallArgs.max_completion_tokens).toBeGreaterThanOrEqual(4096);
	});

	it("marks the result truncated when finish_reason is length, even if the JSON happens to be complete", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(validRecipe, "length"));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "success",
			recipe: validRecipe,
			truncated: true,
		});
	});

	it("repairs a truncated recipe response and still returns the complete leading ingredients/steps", async () => {
		const elaborateRecipe = {
			...validRecipe,
			ingredients: [
				{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
				{
					baseName: "garlic",
					description: "minced",
					quantity: 4,
					unit: "cloves",
				},
			],
			steps: [
				{ section: "Prep", text: "Peel and devein the shrimp." },
				{ section: "Cook", text: "Cook the pasta until al dente." },
			],
		};
		const full = JSON.stringify(elaborateRecipe);
		// Cut off partway through the last step's text — simulates Groq
		// stopping mid-JSON — while the first ingredient/step stay intact.
		const cutAt = full.indexOf("al dente");
		const truncatedContent = full.slice(0, cutAt + 2);

		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(rawResponse(truncatedContent, "length"));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(result.truncated).toBe(true);
			expect(result.recipe.title).toBe(validRecipe.title);
			expect(result.recipe.ingredients).toEqual(elaborateRecipe.ingredients);
			expect(result.recipe.steps).toEqual([elaborateRecipe.steps[0]]);
		}
	});

	it("returns an error when truncation cuts off before any complete ingredient/step survives repair", async () => {
		const truncatedContent =
			'{"title":"T","overview":"O","baseServings":2,"difficulty":"hard","estimatedMinutes":10,"ingredients":[{"text":"a"';

		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(rawResponse(truncatedContent, "length"));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when the recipe response is malformed", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(
				jsonResponse({ title: "Missing everything else" }),
			);

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when the recipe response is missing difficulty/estimatedMinutes", async () => {
		const { difficulty, estimatedMinutes, ...withoutNewFields } = validRecipe;

		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(withoutNewFields));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when the recipe response is missing caloriesPerServing", async () => {
		const { caloriesPerServing, ...withoutCalories } = validRecipe;

		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(withoutCalories));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when caloriesPerServing is not positive", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(
				jsonResponse({ ...validRecipe, caloriesPerServing: 0 }),
			);

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("accepts a step with an estimated duration and a step with none (null)", async () => {
		const recipeWithTimedStep = {
			...validRecipe,
			steps: [
				{ section: "Prep", text: "Mince the garlic.", estimatedMinutes: null },
				{ section: "Cook", text: "Simmer the sauce.", estimatedMinutes: 10 },
			],
		};
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(recipeWithTimedStep));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "success",
			recipe: recipeWithTimedStep,
			truncated: false,
		});
	});

	it("accepts a step that omits estimatedMinutes entirely", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(jsonResponse(validRecipe));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result.type).toBe("success");
	});

	it("returns an error when a step's estimatedMinutes is not positive", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(
				jsonResponse({
					...validRecipe,
					steps: [{ section: null, text: "Simmer.", estimatedMinutes: 0 }],
				}),
			);

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when difficulty is not one of the known values", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockResolvedValueOnce(
				jsonResponse({ ...validRecipe, difficulty: "impossible" }),
			);

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
	});

	it("returns an error when the classifier response has no content", async () => {
		createMock.mockResolvedValueOnce({
			choices: [{ message: { content: null } }],
		});

		const result = await generateRecipe("hello");

		expect(result).toEqual({
			type: "error",
			message: "Empty response from Groq",
		});
	});

	it("returns an error when the on-topic call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("network down"));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({ type: "error", message: "network down" });
	});

	it("returns an error when the recipe call throws", async () => {
		createMock
			.mockResolvedValueOnce(jsonResponse({ on_topic: true }))
			.mockRejectedValueOnce(new Error("timeout"));

		const result = await generateRecipe("shrimp pasta for 2");

		expect(result).toEqual({ type: "error", message: "timeout" });
	});
});

describe("continueRecipe", () => {
	const soFar = {
		ingredients: validRecipe.ingredients,
		steps: validRecipe.steps,
	};

	it("returns the remaining ingredients/steps on success", async () => {
		const remaining = {
			ingredients: [
				{ baseName: "parmesan", description: "", quantity: 50, unit: "g" },
			],
			steps: [{ section: null, text: "Plate and serve." }],
		};
		createMock.mockResolvedValueOnce(jsonResponse(remaining));

		const result = await continueRecipe("shrimp pasta for 2", soFar);

		expect(result).toEqual({
			type: "success",
			ingredients: remaining.ingredients,
			steps: remaining.steps,
			truncated: false,
		});
		expect(createMock).toHaveBeenCalledTimes(1);
		const callArgs = createMock.mock.calls[0]?.[0];
		expect(callArgs.max_completion_tokens).toBeGreaterThan(0);
		expect(callArgs.messages[1].content).toContain("shrimp pasta for 2");
		expect(callArgs.messages[1].content).toContain("shrimp");
	});

	it("allows both arrays to come back empty", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ ingredients: [], steps: [] }),
		);

		const result = await continueRecipe("shrimp pasta for 2", {
			ingredients: [],
			steps: [],
		});

		expect(result).toEqual({
			type: "success",
			ingredients: [],
			steps: [],
			truncated: false,
		});
	});

	it("marks the result truncated when finish_reason is length", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ ingredients: [], steps: [] }, "length"),
		);

		const result = await continueRecipe("shrimp pasta for 2", soFar);

		expect(result).toEqual({
			type: "success",
			ingredients: [],
			steps: [],
			truncated: true,
		});
	});

	it("repairs a truncated continuation response", async () => {
		const remaining = {
			ingredients: [
				{ baseName: "parmesan", description: "", quantity: 50, unit: "g" },
			],
			steps: [{ section: null, text: "Plate and serve." }],
		};
		const full = JSON.stringify(remaining);
		const truncatedContent = full.slice(0, full.length - 5);
		createMock.mockResolvedValueOnce(rawResponse(truncatedContent, "length"));

		const result = await continueRecipe("shrimp pasta for 2", soFar);

		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(result.truncated).toBe(true);
			expect(result.ingredients).toEqual(remaining.ingredients);
		}
	});

	it("returns an error when the continuation response is malformed", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ ingredients: "not an array", steps: [] }),
		);

		const result = await continueRecipe("shrimp pasta for 2", soFar);

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe continuation response from Groq",
		});
	});

	it("returns an error when the continuation call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("timeout"));

		const result = await continueRecipe("shrimp pasta for 2", soFar);

		expect(result).toEqual({ type: "error", message: "timeout" });
	});
});

describe("modifyRecipe", () => {
	it("returns the revised recipe on success", async () => {
		const revised = {
			...validRecipe,
			ingredients: [
				{
					baseName: "chicken breast",
					description: "",
					quantity: 300,
					unit: "g",
				},
			],
		};
		createMock.mockResolvedValueOnce(jsonResponse(revised));

		const result = await modifyRecipe("swap shrimp for chicken", validRecipe);

		expect(result).toEqual({
			type: "success",
			recipe: revised,
			truncated: false,
		});
		expect(createMock).toHaveBeenCalledTimes(1);
		const callArgs = createMock.mock.calls[0]?.[0];
		expect(callArgs.max_completion_tokens).toBeGreaterThanOrEqual(4096);
		expect(callArgs.messages[1].content).toContain(validRecipe.title);
		expect(callArgs.messages[1].content).toContain("swap shrimp for chicken");
		expect(callArgs.messages[1].content).toContain(
			"Current calories per serving: 620",
		);
	});

	it("marks the result truncated when finish_reason is length", async () => {
		createMock.mockResolvedValueOnce(jsonResponse(validRecipe, "length"));

		const result = await modifyRecipe("make it spicier", validRecipe);

		expect(result).toEqual({
			type: "success",
			recipe: validRecipe,
			truncated: true,
		});
	});

	it("repairs a truncated modification response and still returns the complete leading ingredients/steps", async () => {
		const elaborateRecipe: RecipeResponse = {
			...validRecipe,
			ingredients: [
				{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
				{
					baseName: "garlic",
					description: "minced",
					quantity: 4,
					unit: "cloves",
				},
			],
			steps: [
				{ section: "Prep", text: "Peel and devein the shrimp." },
				{ section: "Cook", text: "Cook the pasta until al dente." },
			],
		};
		const full = JSON.stringify(elaborateRecipe);
		const cutAt = full.indexOf("al dente");
		const truncatedContent = full.slice(0, cutAt + 2);

		createMock.mockResolvedValueOnce(rawResponse(truncatedContent, "length"));

		const result = await modifyRecipe("make it spicier", validRecipe);

		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(result.truncated).toBe(true);
			expect(result.recipe.title).toBe(validRecipe.title);
			expect(result.recipe.ingredients).toEqual(elaborateRecipe.ingredients);
			expect(result.recipe.steps).toEqual([elaborateRecipe.steps[0]]);
		}
	});

	it("returns an error when the modification response is malformed", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ title: "Missing everything else" }),
		);

		const result = await modifyRecipe("make it spicier", validRecipe);

		expect(result).toEqual({
			type: "error",
			message: "Malformed recipe modification response from Groq",
		});
	});

	it("returns an error when the modification call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("timeout"));

		const result = await modifyRecipe("make it spicier", validRecipe);

		expect(result).toEqual({ type: "error", message: "timeout" });
	});
});
