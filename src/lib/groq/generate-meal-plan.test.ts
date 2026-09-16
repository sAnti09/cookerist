import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	generateMealPlanDraft,
	refineMealPlanDraft,
} from "./generate-meal-plan";
import type { MealPlanDraftEntry } from "./schema";

const createMock = vi.fn();

vi.mock("./client", () => ({
	getGroqClient: () => ({
		chat: { completions: { create: createMock } },
	}),
}));

function jsonResponse(content: unknown) {
	return {
		choices: [{ message: { content: JSON.stringify(content) } }],
	};
}

const validEntry: MealPlanDraftEntry = {
	day: "2026-09-15",
	mealType: "breakfast",
	slotIndex: 0,
	title: "Overnight Oats",
	overview: "Oats soaked overnight with berries.",
};

beforeEach(() => {
	createMock.mockReset();
});

describe("generateMealPlanDraft", () => {
	const config = {
		startDate: "2026-09-15",
		endDate: "2026-09-15",
		slots: [
			{ day: "2026-09-15", mealType: "breakfast" as const, dishCount: 1 },
		],
		description: "Mostly vegetarian",
	};

	it("returns the parsed entries on success", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		const result = await generateMealPlanDraft(config);

		expect(result).toEqual({ type: "success", entries: [validEntry] });
	});

	it("returns an error for a malformed response", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ nope: true }));

		const result = await generateMealPlanDraft(config);

		expect(result).toEqual({
			type: "error",
			message: "Malformed meal plan draft response from Groq",
		});
	});

	it("returns an error when the Groq call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("network down"));

		const result = await generateMealPlanDraft(config);

		expect(result).toEqual({ type: "error", message: "network down" });
	});

	it("returns a generic error message for a non-Error throw", async () => {
		createMock.mockRejectedValueOnce("boom");

		const result = await generateMealPlanDraft(config);

		expect(result).toEqual({
			type: "error",
			message: "Meal plan draft generation failed",
		});
	});

	it("omits the notes line from the prompt when the description is blank", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		await generateMealPlanDraft({ ...config, description: "   " });

		const userMessage = createMock.mock.calls[0][0].messages[1].content;
		expect(userMessage).not.toMatch(/Notes from the user/);
	});

	it("includes the region hint in the prompt when a timezone is given", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		await generateMealPlanDraft({ ...config, timezone: "Asia/Manila" });

		const userMessage = createMock.mock.calls[0][0].messages[1].content;
		expect(userMessage).toContain("Asia/Manila");
	});

	it("omits the region hint when no timezone is given", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		await generateMealPlanDraft(config);

		const userMessage = createMock.mock.calls[0][0].messages[1].content;
		expect(userMessage).not.toMatch(/timezone/i);
	});
});

describe("refineMealPlanDraft", () => {
	it("returns the parsed entries on success", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		const result = await refineMealPlanDraft([validEntry], "make it vegan");

		expect(result).toEqual({ type: "success", entries: [validEntry] });
	});

	it("returns an error for a malformed response", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ nope: true }));

		const result = await refineMealPlanDraft([validEntry], "make it vegan");

		expect(result).toEqual({
			type: "error",
			message: "Malformed meal plan refine response from Groq",
		});
	});

	it("returns an error when the Groq call throws", async () => {
		createMock.mockRejectedValueOnce(new Error("network down"));

		const result = await refineMealPlanDraft([validEntry], "make it vegan");

		expect(result).toEqual({ type: "error", message: "network down" });
	});

	it("returns a generic error message for a non-Error throw", async () => {
		createMock.mockRejectedValueOnce("boom");

		const result = await refineMealPlanDraft([validEntry], "make it vegan");

		expect(result).toEqual({
			type: "error",
			message: "Meal plan refine failed",
		});
	});

	it("includes the plan's original notes in the prompt so a refine round still honors them", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		await refineMealPlanDraft(
			[validEntry],
			"make Monday vegan",
			"Mostly vegetarian, nothing too spicy for the kids",
		);

		const userMessage = createMock.mock.calls[0][0].messages[1].content;
		expect(userMessage).toContain(
			"Original notes from the user (still apply unless the requested change contradicts them): Mostly vegetarian, nothing too spicy for the kids",
		);
	});

	it("omits the original-notes line when no description was given", async () => {
		createMock.mockResolvedValueOnce(jsonResponse({ entries: [validEntry] }));

		await refineMealPlanDraft([validEntry], "make Monday vegan");

		const userMessage = createMock.mock.calls[0][0].messages[1].content;
		expect(userMessage).not.toMatch(/Original notes from the user/);
	});
});
