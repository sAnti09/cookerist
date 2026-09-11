import { beforeEach, describe, expect, it, vi } from "vitest";
import { identifyDish } from "./identify-dish";

const createMock = vi.fn();

vi.mock("./client", () => ({
	getGroqClient: () => ({
		chat: { completions: { create: createMock } },
	}),
}));

function jsonResponse(content: unknown) {
	return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

const SAMPLE_DATA_URL = "data:image/jpeg;base64,AAAA";

beforeEach(() => {
	createMock.mockReset();
});

describe("identifyDish", () => {
	it("returns success with the description for a recognized dish", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({
				is_food: true,
				description: "creamy garlic butter shrimp pasta with parmesan",
			}),
		);

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result).toEqual({
			type: "success",
			description: "creamy garlic butter shrimp pasta with parmesan",
		});
	});

	it("sends the image as a data URL content part alongside the system prompt", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: true, description: "pancakes with syrup" }),
		);

		await identifyDish(SAMPLE_DATA_URL);

		const callArgs = createMock.mock.calls[0]?.[0];
		expect(callArgs.messages[0].role).toBe("system");
		const userContent = callArgs.messages[1].content;
		expect(userContent).toEqual(
			expect.arrayContaining([
				expect.objectContaining({
					type: "image_url",
					image_url: { url: SAMPLE_DATA_URL },
				}),
			]),
		);
	});

	it("does not append a region hint when no timezone is given", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: true, description: "pancakes with syrup" }),
		);

		await identifyDish(SAMPLE_DATA_URL);

		const callArgs = createMock.mock.calls[0]?.[0];
		const textPart = callArgs.messages[1].content[0];
		expect(textPart.text).toBe("Identify the dish in this photo.");
	});

	it("appends a region hint to the prompt text when a timezone is given", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: true, description: "pancakes with syrup" }),
		);

		await identifyDish(SAMPLE_DATA_URL, "Asia/Manila");

		const callArgs = createMock.mock.calls[0]?.[0];
		const textPart = callArgs.messages[1].content[0];
		expect(textPart.text).toContain("Identify the dish in this photo.");
		expect(textPart.text).toContain("Asia/Manila");
	});

	it("caps output tokens and disables reasoning, to stay under this model's output-token rate limit", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: true, description: "pancakes with syrup" }),
		);

		await identifyDish(SAMPLE_DATA_URL);

		const callArgs = createMock.mock.calls[0]?.[0];
		expect(callArgs.reasoning_effort).toBe("none");
		expect(callArgs.max_completion_tokens).toBeLessThanOrEqual(1000);
	});

	it("returns not_food when the classifier says it isn't food", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: false, description: "" }),
		);

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result).toEqual({ type: "not_food" });
	});

	it("returns not_food when is_food is true but the description is blank", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({ is_food: true, description: "   " }),
		);

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result).toEqual({ type: "not_food" });
	});

	it("returns an error when the response JSON is malformed", async () => {
		createMock.mockResolvedValueOnce({
			choices: [{ message: { content: "not json" } }],
		});

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result.type).toBe("error");
	});

	it("returns an error when the response doesn't match the schema", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ is_food: "yes" }));

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result).toEqual({
			type: "error",
			message: "Malformed dish identification response from Groq",
		});
	});

	it("returns an error when the Groq call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("network down"));

		const result = await identifyDish(SAMPLE_DATA_URL);

		expect(result).toEqual({ type: "error", message: "network down" });
	});
});
