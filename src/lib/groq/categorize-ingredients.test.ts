import { beforeEach, describe, expect, it, vi } from "vitest";
import { categorizeIngredients } from "./categorize-ingredients";

const createMock = vi.fn();

vi.mock("./client", () => ({
	getGroqClient: () => ({
		chat: { completions: { create: createMock } },
	}),
}));

function jsonResponse(content: unknown) {
	return { choices: [{ message: { content: JSON.stringify(content) } }] };
}

beforeEach(() => {
	createMock.mockReset();
});

describe("categorizeIngredients", () => {
	it("returns the categorized/corrected items on success", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({
				items: [
					{
						id: 0,
						baseName: "chicken breast",
						description: "",
						category: "Meat & Seafood",
					},
				],
			}),
		);

		const result = await categorizeIngredients([
			{ id: 0, baseName: "chicken breast", description: "" },
		]);

		expect(result).toEqual({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "chicken breast",
					description: "",
					category: "Meat & Seafood",
					approxGramsPerUnit: null,
				},
			],
		});
	});

	it("passes an approxGramsPerUnit value through unchanged", async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({
				items: [
					{
						id: 0,
						baseName: "onion",
						description: "",
						category: "Produce",
						approxGramsPerUnit: 150,
					},
				],
			}),
		);

		const result = await categorizeIngredients([
			{ id: 0, baseName: "onion", description: "" },
		]);

		expect(result).toEqual({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "onion",
					description: "",
					category: "Produce",
					approxGramsPerUnit: 150,
				},
			],
		});
	});

	it("sends the input items as the user message content", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ items: [] }));
		const items = [
			{ id: 0, baseName: "garlic, chopped", description: "" },
			{ id: 1, baseName: "onion", description: "" },
		];

		await categorizeIngredients(items);

		const userContent = createMock.mock.calls[0]?.[0].messages[1].content;
		expect(JSON.parse(userContent)).toEqual(items);
	});

	it("sends the baseName/category rules in the system prompt", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ items: [] }));

		await categorizeIngredients([]);

		const systemContent = createMock.mock.calls[0]?.[0].messages[0].content;
		expect(systemContent).toContain("baseName rule");
		expect(systemContent).toContain("category rule");
		expect(systemContent).toContain("approxGramsPerUnit rule");
		expect(systemContent).toContain("Meat & Seafood");
	});

	it('falls back an unrecognized category to "Other" instead of failing the batch', async () => {
		createMock.mockResolvedValueOnce(
			jsonResponse({
				items: [
					{
						id: 0,
						baseName: "mystery item",
						description: "",
						category: "Not A Real Category",
					},
				],
			}),
		);

		const result = await categorizeIngredients([
			{ id: 0, baseName: "mystery item", description: "" },
		]);

		expect(result).toEqual({
			type: "success",
			items: [
				{
					id: 0,
					baseName: "mystery item",
					description: "",
					category: "Other",
					approxGramsPerUnit: null,
				},
			],
		});
	});

	it("returns an error when the response is malformed", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ items: "not an array" }));

		const result = await categorizeIngredients([
			{ id: 0, baseName: "garlic", description: "" },
		]);

		expect(result).toEqual({
			type: "error",
			message: "Malformed categorize-ingredients response from Groq",
		});
	});

	it("returns an error when the call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("timeout"));

		const result = await categorizeIngredients([
			{ id: 0, baseName: "garlic", description: "" },
		]);

		expect(result).toEqual({ type: "error", message: "timeout" });
	});
});
