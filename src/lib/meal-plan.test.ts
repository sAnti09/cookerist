import { describe, expect, it } from "vitest";
import {
	cycleSlot,
	DEFAULT_ENABLED_MEAL_TYPES,
	defaultSlots,
	enabledSlots,
	enumerateDays,
	formatMealPlanDateRange,
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	isEntryServingsEdited,
	MAX_DISH_COUNT_PER_SLOT,
	type MealPlanEntry,
	type MealSlotConfig,
	resizeSlotsForDays,
	summarizeMealPlanEntries,
	toggleMealTypeColumn,
	toggleSlotInList,
	totalDishCount,
} from "./meal-plan";

function makeEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
	return {
		id: crypto.randomUUID(),
		day: "2026-09-15",
		mealType: "dinner",
		slotIndex: 0,
		status: "suggested",
		suggestedTitle: "Veggie Stir-Fry",
		suggestedOverview: "Crisp vegetables in a garlic-ginger sauce.",
		...overrides,
	};
}

describe("enumerateDays / countPlanDays", () => {
	it("returns every ISO date from start to end inclusive", () => {
		expect(enumerateDays("2026-09-15", "2026-09-17")).toEqual([
			"2026-09-15",
			"2026-09-16",
			"2026-09-17",
		]);
	});

	it("returns a single day when start equals end", () => {
		expect(enumerateDays("2026-09-15", "2026-09-15")).toEqual(["2026-09-15"]);
	});
});

describe("defaultSlots", () => {
	it("enables breakfast/lunch/dinner with 1 dish and leaves snacks off", () => {
		const slots = defaultSlots(["2026-09-15"]);

		for (const slot of slots) {
			expect(slot.enabled).toBe(DEFAULT_ENABLED_MEAL_TYPES.has(slot.mealType));
			expect(slot.dishCount).toBe(slot.enabled ? 1 : 0);
		}
	});

	it("produces one slot per day per meal type", () => {
		const slots = defaultSlots(["2026-09-15", "2026-09-16"]);

		expect(slots).toHaveLength(10); // 2 days * 5 meal types
	});
});

describe("resizeSlotsForDays", () => {
	it("preserves existing configuration for days still in range", () => {
		const current = defaultSlots(["2026-09-15", "2026-09-16"]);
		const edited = toggleSlotInList(current, "2026-09-15", "morning_snack");

		const resized = resizeSlotsForDays(edited, ["2026-09-15", "2026-09-16"]);

		const snack = resized.find(
			(slot) => slot.day === "2026-09-15" && slot.mealType === "morning_snack",
		);
		expect(snack?.enabled).toBe(true);
		expect(snack?.dishCount).toBe(1);
	});

	it("drops days no longer in range and defaults newly added ones", () => {
		const current = defaultSlots(["2026-09-15"]);

		const resized = resizeSlotsForDays(current, ["2026-09-16"]);

		expect(resized.every((slot) => slot.day === "2026-09-16")).toBe(true);
		expect(resized).toHaveLength(5);
	});
});

describe("cycleSlot / toggleSlotInList", () => {
	it("cycles off -> 1 dish -> 2 dishes -> off", () => {
		const off: MealSlotConfig = {
			day: "2026-09-15",
			mealType: "afternoon_snack",
			enabled: false,
			dishCount: 0,
		};

		const oneDish = cycleSlot(off);
		expect(oneDish).toEqual({ ...off, enabled: true, dishCount: 1 });

		const twoDishes = cycleSlot(oneDish);
		expect(twoDishes).toEqual({ ...off, enabled: true, dishCount: 2 });
		expect(twoDishes.dishCount).toBe(MAX_DISH_COUNT_PER_SLOT);

		const backOff = cycleSlot(twoDishes);
		expect(backOff).toEqual({ ...off, enabled: false, dishCount: 0 });
	});

	it("only toggles the matching (day, mealType) cell", () => {
		const slots = defaultSlots(["2026-09-15"]);
		const before = slots.find((s) => s.mealType === "lunch");

		const result = toggleSlotInList(slots, "2026-09-15", "breakfast");

		const lunch = result.find((s) => s.mealType === "lunch");
		expect(lunch).toBe(before); // untouched reference preserved
		const breakfast = result.find((s) => s.mealType === "breakfast");
		expect(breakfast?.dishCount).toBe(2); // breakfast starts enabled at 1, cycles to 2
	});
});

describe("toggleMealTypeColumn", () => {
	it("turns every day off for that meal type when every day is already on", () => {
		const slots = defaultSlots(["2026-09-15", "2026-09-16"]); // breakfast on for both

		const result = toggleMealTypeColumn(slots, "breakfast");

		const breakfasts = result.filter((s) => s.mealType === "breakfast");
		expect(breakfasts.every((s) => !s.enabled && s.dishCount === 0)).toBe(true);
	});

	it("turns every day on for that meal type when only some days are on", () => {
		const base = defaultSlots(["2026-09-15", "2026-09-16"]);
		const oneOff = base.map((slot) =>
			slot.day === "2026-09-15" && slot.mealType === "breakfast"
				? { ...slot, enabled: false, dishCount: 0 }
				: slot,
		);

		const result = toggleMealTypeColumn(oneOff, "breakfast");

		const breakfasts = result.filter((s) => s.mealType === "breakfast");
		expect(breakfasts.every((s) => s.enabled && s.dishCount === 1)).toBe(true);
	});

	it("turns every day on for that meal type when every day is off", () => {
		const slots = defaultSlots(["2026-09-15", "2026-09-16"]); // afternoon_snack off for both

		const result = toggleMealTypeColumn(slots, "afternoon_snack");

		const snacks = result.filter((s) => s.mealType === "afternoon_snack");
		expect(snacks.every((s) => s.enabled && s.dishCount === 1)).toBe(true);
	});

	it("preserves an already-enabled day's dishCount when turning the rest of the column on", () => {
		const base = defaultSlots(["2026-09-15", "2026-09-16"]);
		const mixed = base.map((slot) =>
			slot.day === "2026-09-15" && slot.mealType === "breakfast"
				? { ...slot, dishCount: 2 }
				: slot.day === "2026-09-16" && slot.mealType === "breakfast"
					? { ...slot, enabled: false, dishCount: 0 }
					: slot,
		);

		const result = toggleMealTypeColumn(mixed, "breakfast");

		const sep15 = result.find(
			(s) => s.day === "2026-09-15" && s.mealType === "breakfast",
		);
		const sep16 = result.find(
			(s) => s.day === "2026-09-16" && s.mealType === "breakfast",
		);
		expect(sep15).toMatchObject({ enabled: true, dishCount: 2 });
		expect(sep16).toMatchObject({ enabled: true, dishCount: 1 });
	});

	it("leaves other meal types untouched", () => {
		const slots = defaultSlots(["2026-09-15"]);
		const lunchBefore = slots.find((s) => s.mealType === "lunch");

		const result = toggleMealTypeColumn(slots, "breakfast");

		expect(result.find((s) => s.mealType === "lunch")).toBe(lunchBefore);
	});
});

describe("enabledSlots / totalDishCount", () => {
	it("excludes disabled and zero-dish-count slots", () => {
		const slots = defaultSlots(["2026-09-15"]); // breakfast/lunch/dinner enabled

		expect(enabledSlots(slots)).toHaveLength(3);
		expect(totalDishCount(slots)).toBe(3);
	});

	it("counts multi-dish slots toward the total", () => {
		const slots = toggleSlotInList(
			defaultSlots(["2026-09-15"]),
			"2026-09-15",
			"breakfast",
		); // breakfast goes from 1 -> 2 dishes

		expect(totalDishCount(slots)).toBe(4);
	});
});

describe("isEntryServingsEdited", () => {
	it("is false when the recipe's servings match the plan default", () => {
		expect(isEntryServingsEdited(4, 4)).toBe(false);
	});

	it("is true when the recipe's servings diverge from the plan default", () => {
		expect(isEntryServingsEdited(1, 4)).toBe(true);
	});
});

describe("formatMealPlanDateRange / formatMealPlanDay", () => {
	it("formats a date range as a short month/day span", () => {
		expect(formatMealPlanDateRange("2026-09-15", "2026-09-21")).toBe(
			"Sep 15 – Sep 21",
		);
	});

	it("formats a single day with the weekday name", () => {
		expect(formatMealPlanDay("2026-09-15")).toMatch(/Tue.*Sep 15/);
	});
});

describe("groupMealPlanEntriesByDay", () => {
	it("groups entries by day, in day order", () => {
		const entries = [
			makeEntry({ day: "2026-09-16", mealType: "dinner" }),
			makeEntry({ day: "2026-09-15", mealType: "lunch" }),
			makeEntry({ day: "2026-09-15", mealType: "breakfast" }),
		];

		const days = groupMealPlanEntriesByDay(entries);

		expect(days.map((d) => d.day)).toEqual(["2026-09-15", "2026-09-16"]);
	});

	it("orders entries within a day by meal type, then slotIndex", () => {
		const entries = [
			makeEntry({ mealType: "dinner", slotIndex: 1 }),
			makeEntry({ mealType: "breakfast", slotIndex: 0 }),
			makeEntry({ mealType: "dinner", slotIndex: 0 }),
		];

		const [day] = groupMealPlanEntriesByDay(entries);

		expect(day.entries.map((e) => `${e.mealType}-${e.slotIndex}`)).toEqual([
			"breakfast-0",
			"dinner-0",
			"dinner-1",
		]);
	});
});

describe("summarizeMealPlanEntries", () => {
	it("counts ready/failed/pending and splits ready into reused/generated", () => {
		const entries = [
			makeEntry({ status: "ready", reused: true }),
			makeEntry({ status: "ready", reused: false }),
			makeEntry({ status: "failed" }),
			makeEntry({ status: "suggested" }),
		];

		expect(summarizeMealPlanEntries(entries)).toEqual({
			ready: 2,
			failed: 1,
			pending: 1,
			total: 4,
			reused: 1,
			generated: 1,
		});
	});

	it("returns all zeros for an empty entry list", () => {
		expect(summarizeMealPlanEntries([])).toEqual({
			ready: 0,
			failed: 0,
			pending: 0,
			total: 0,
			reused: 0,
			generated: 0,
		});
	});
});
