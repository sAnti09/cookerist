import { createServerFn } from "@tanstack/react-start";
import {
	generateMealPlanDraft as generateMealPlanDraftCore,
	type MealPlanDraftSlotRequest,
	refineMealPlanDraft as refineMealPlanDraftCore,
} from "#/lib/groq/generate-meal-plan";
import type { MealPlanDraftEntry } from "#/lib/groq/schema";

export const generateMealPlanDraft = createServerFn({ method: "POST" })
	.validator(
		(data: {
			startDate: string;
			endDate: string;
			slots: MealPlanDraftSlotRequest[];
			description: string;
			timezone?: string;
		}) => data,
	)
	.handler(async ({ data }) =>
		generateMealPlanDraftCore({
			startDate: data.startDate,
			endDate: data.endDate,
			slots: data.slots,
			description: data.description,
			timezone: data.timezone,
		}),
	);

export const refineMealPlanDraft = createServerFn({ method: "POST" })
	.validator(
		(data: {
			currentEntries: MealPlanDraftEntry[];
			instruction: string;
			description?: string;
			timezone?: string;
		}) => data,
	)
	.handler(async ({ data }) =>
		refineMealPlanDraftCore(
			data.currentEntries,
			data.instruction,
			data.description,
			data.timezone,
		),
	);
