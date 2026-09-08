import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateRecipe } from "./generate-recipe";

const createMock = vi.fn();

vi.mock("./client", () => ({
	getGroqClient: () => ({
		chat: { completions: { create: createMock } },
	}),
}));

function jsonResponse(content: unknown) {
	return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

const validRecipe = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy",
	estimatedMinutes: 25,
	ingredients: [{ text: "shrimp", quantity: 300, unit: "g" }],
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

		expect(result).toEqual({ type: "success", recipe: validRecipe });
		expect(createMock).toHaveBeenCalledTimes(2);
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
