import { chatCompletion } from "#/lib/ai/client";
import { MEAL_TYPE_LABELS, type MealType } from "#/lib/meal-plan";
import { extractJson } from "./extract-json";
import { regionHint } from "./region-hint";
import type { MealPlanDraftEntry } from "./schema";
import { mealPlanDraftResponseSchema } from "./schema";

// Generous headroom for a full 7-day (MAX_PLAN_DAYS), multi-meal,
// multi-dish plan — each entry's JSON is small
// (day/mealType/slotIndex/title/overview), but a maximal plan can still
// request several dozen of them.
const MEAL_PLAN_MAX_COMPLETION_TOKENS = 8192;

const MEAL_PLAN_ENTRY_SHAPE = `{ "day": string (ISO date, e.g. "2026-09-15" — must exactly match one of the requested dates), "mealType": "breakfast" | "morning_snack" | "lunch" | "afternoon_snack" | "dinner" (must exactly match the requested meal type), "slotIndex": number (0-based — when a slot asks for more than one dish, use 0, 1, 2, … for each one, otherwise 0), "title": string (a real dish title, not a restatement of the request), "overview": string (1-2 sentence description of the dish) }`;

const MEAL_PLAN_DRAFT_SYSTEM_PROMPT = `You are planning a week of meals. You'll be given a date range, a list of requested meal slots (each with a date, a meal type, and how many dishes that slot wants), and optional free-text notes from the user (dietary preferences, mood, constraints, etc.). Respond with ONLY a JSON object (no other text) matching exactly this shape:

{ "entries": [ ${MEAL_PLAN_ENTRY_SHAPE} ] }

Return exactly one entry per requested dish (i.e. for a slot asking for 2 dishes, return two entries with slotIndex 0 and 1). Aim for variety across the week — avoid repeating the same dish, and vary cuisines/proteins/cooking styles where reasonable — while honoring every constraint in the user's notes (e.g. "mostly vegetarian", "nothing too spicy for the kids"). Each entry is a lightweight suggestion only (title + overview) — do not include ingredients or steps.`;

const MEAL_PLAN_REFINE_SYSTEM_PROMPT = `You are refining a draft week-long meal plan based on a user's instruction (e.g. "for Tuesday, make it vegan", "swap out all the dinners for something lighter"). You'll be given the current suggested entries (day, meal type, title, overview), the original notes the user gave when this plan was first created (if any), and the requested change. Respond with ONLY a JSON object (no other text) matching exactly this shape:

{ "entries": [ ${MEAL_PLAN_ENTRY_SHAPE} ] }

Return the FULL revised list of entries — the same day/mealType/slotIndex slots as the current plan. For every entry the instruction does NOT affect, you MUST reproduce its "title" and "overview" fields character-for-character identical to what you were given — do not rephrase, restate, or "clean up" wording for a slot you weren't asked to change, even slightly. Apply the requested change thoroughly only to the entries it does affect (e.g. an instruction naming one day only affects that day's entries; an instruction with no day named applies plan-wide) while STILL honoring the original notes for every entry the instruction doesn't touch (e.g. if the original notes said "nothing too spicy for the kids", a change to Tuesday's dinner shouldn't make Wednesday's lunch spicy).`;

export type GenerateMealPlanDraftResult =
	| { type: "error"; message: string }
	| { type: "success"; entries: MealPlanDraftEntry[] };

export type RefineMealPlanDraftResult = GenerateMealPlanDraftResult;

export type MealPlanDraftSlotRequest = {
	day: string;
	mealType: MealType;
	dishCount: number;
};

function formatSlotsForPrompt(slots: MealPlanDraftSlotRequest[]): string {
	return slots
		.map(
			(slot) =>
				`- ${slot.day} ${MEAL_TYPE_LABELS[slot.mealType]}: ${slot.dishCount} dish${slot.dishCount === 1 ? "" : "es"}`,
		)
		.join("\n");
}

function formatEntriesForPrompt(entries: MealPlanDraftEntry[]): string {
	return entries
		.map(
			(entry) =>
				`- ${entry.day} ${MEAL_TYPE_LABELS[entry.mealType]} #${entry.slotIndex}: ${entry.title} — ${entry.overview}`,
		)
		.join("\n");
}

export async function generateMealPlanDraft(config: {
	startDate: string;
	endDate: string;
	slots: MealPlanDraftSlotRequest[];
	description: string;
	// IANA timezone (e.g. "Asia/Manila") — same soft regional-cuisine
	// tiebreaker used by generateRecipe, since this call is also inventing
	// dish/cuisine choices from scratch whenever the slots/description don't
	// already point to one. Deliberately NOT paired with portionSizeHint the
	// way generateRecipe is: this call never produces ingredient quantities
	// (title + overview only), so there's nothing for a portion-size hint to
	// act on — that only becomes relevant once a dish is actually built via
	// generateRecipe (see use-build-meal-plan.ts), which already gets it.
	timezone?: string;
}): Promise<GenerateMealPlanDraftResult> {
	const trimmedDescription = config.description.trim();
	const userPrompt =
		[
			`Date range: ${config.startDate} to ${config.endDate}`,
			"Requested meal slots:",
			formatSlotsForPrompt(config.slots),
			trimmedDescription ? `Notes from the user: ${trimmedDescription}` : "",
		]
			.filter(Boolean)
			.join("\n") + regionHint(config.timezone);

	try {
		const completion = await chatCompletion("mealPlanDraft", {
			response_format: { type: "json_object" },
			max_completion_tokens: MEAL_PLAN_MAX_COMPLETION_TOKENS,
			messages: [
				{ role: "system", content: MEAL_PLAN_DRAFT_SYSTEM_PROMPT },
				{ role: "user", content: userPrompt },
			],
		});
		const parsed = mealPlanDraftResponseSchema.safeParse(
			extractJson(completion.choices[0]?.message?.content),
		);
		if (!parsed.success) {
			return {
				type: "error",
				message: "Malformed meal plan draft response from Groq",
			};
		}
		return { type: "success", entries: parsed.data.entries };
	} catch (error) {
		return {
			type: "error",
			message:
				error instanceof Error
					? error.message
					: "Meal plan draft generation failed",
		};
	}
}

export async function refineMealPlanDraft(
	currentEntries: MealPlanDraftEntry[],
	instruction: string,
	// The wizard's original free-text notes (MealPlan.description), if any —
	// without this, a refine round has no way to know the plan was meant to
	// stay e.g. "mostly vegetarian" and could contradict it while satisfying
	// the new instruction.
	description = "",
	// Same regional-cuisine tiebreaker as generateMealPlanDraft — a refine
	// round can still introduce brand-new dishes (e.g. "swap Tuesday's
	// dinner for something else"), which benefits from the same soft nudge.
	// No portionSizeHint here either, for the same reason as above.
	timezone?: string,
): Promise<RefineMealPlanDraftResult> {
	const trimmedDescription = description.trim();
	const userPrompt =
		[
			"Current entries:",
			formatEntriesForPrompt(currentEntries),
			trimmedDescription
				? `Original notes from the user (still apply unless the requested change contradicts them): ${trimmedDescription}`
				: "",
			`Requested change: ${instruction}`,
		]
			.filter(Boolean)
			.join("\n") + regionHint(timezone);

	try {
		const completion = await chatCompletion("mealPlanRefine", {
			response_format: { type: "json_object" },
			max_completion_tokens: MEAL_PLAN_MAX_COMPLETION_TOKENS,
			messages: [
				{ role: "system", content: MEAL_PLAN_REFINE_SYSTEM_PROMPT },
				{ role: "user", content: userPrompt },
			],
		});
		const parsed = mealPlanDraftResponseSchema.safeParse(
			extractJson(completion.choices[0]?.message?.content),
		);
		if (!parsed.success) {
			return {
				type: "error",
				message: "Malformed meal plan refine response from Groq",
			};
		}
		return { type: "success", entries: parsed.data.entries };
	} catch (error) {
		return {
			type: "error",
			message:
				error instanceof Error ? error.message : "Meal plan refine failed",
		};
	}
}
