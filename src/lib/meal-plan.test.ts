import { describe, expect, it } from "vitest";
import {
	applyMealPlanDateRange,
	cycleSlot,
	DEFAULT_ENABLED_MEAL_TYPES,
	defaultSlots,
	diffMealPlanEntries,
	enabledSlots,
	enumerateDays,
	filterMealPlanDaysBySearch,
	formatMealPlanDateRange,
	formatMealPlanDay,
	groceryListSignature,
	groupMealPlanEntriesByDay,
	groupMealPlanEntryDiffsByDay,
	isEntryServingsEdited,
	isGroceryListStale,
	MAX_DISH_COUNT_PER_SLOT,
	MAX_PLAN_DAYS,
	type MealPlan,
	type MealPlanDraftLikeEntry,
	type MealPlanEntry,
	type MealSlotConfig,
	resizeSlotsForDays,
	summarizeMealPlanEntries,
	toggleMealTypeColumn,
	toggleSlotInList,
	totalDishCount,
} from "./meal-plan";
import type { Recipe } from "./recipe";

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

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		prompt: "a dish",
		title: "Veggie Stir-Fry",
		overview: "overview",
		baseServings: 4,
		currentServings: 4,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		startDate: "2026-09-15",
		endDate: "2026-09-15",
		description: "",
		defaultServings: 4,
		status: "ready",
		entries: [makeEntry()],
		refineInstructions: [],
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

describe("applyMealPlanDateRange", () => {
	it("resizes the slot grid to exactly match the picked range", () => {
		const current = defaultSlots(["2026-09-15"]);

		const change = applyMealPlanDateRange(current, "2026-09-20", "2026-09-22");

		expect(change.startDate).toBe("2026-09-20");
		expect(change.endDate).toBe("2026-09-22");
		expect(change.slots).toHaveLength(15); // 3 days * 5 meal types
		expect(new Set(change.slots.map((slot) => slot.day))).toEqual(
			new Set(["2026-09-20", "2026-09-21", "2026-09-22"]),
		);
	});

	it("accepts a single-day range unchanged", () => {
		const change = applyMealPlanDateRange([], "2026-09-20", "2026-09-20");

		expect(change.startDate).toBe("2026-09-20");
		expect(change.endDate).toBe("2026-09-20");
		expect(change.slots).toHaveLength(5); // 1 day * 5 meal types
	});

	it("caps the range at MAX_PLAN_DAYS, keeping startDate fixed and pulling endDate back in", () => {
		const farEnd = enumerateDays("2026-09-01", "2026-09-30")[MAX_PLAN_DAYS + 5];
		if (!farEnd) throw new Error("test setup: expected a far-end date");

		const change = applyMealPlanDateRange([], "2026-09-01", farEnd);

		expect(change.startDate).toBe("2026-09-01");
		expect(enumerateDays(change.startDate, change.endDate)).toHaveLength(
			MAX_PLAN_DAYS,
		);
	});

	it("preserves existing per-day toggles for days that stay in range", () => {
		const current = toggleSlotInList(
			defaultSlots(["2026-09-15", "2026-09-16"]),
			"2026-09-15",
			"morning_snack",
		);

		const change = applyMealPlanDateRange(current, "2026-09-15", "2026-09-16");

		const snack = change.slots.find(
			(slot) => slot.day === "2026-09-15" && slot.mealType === "morning_snack",
		);
		expect(snack?.enabled).toBe(true);
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

function makeDraftLikeEntry(
	overrides: Partial<MealPlanDraftLikeEntry> = {},
): MealPlanDraftLikeEntry {
	return {
		day: "2026-09-15",
		mealType: "dinner",
		slotIndex: 0,
		title: "Veggie Stir-Fry",
		overview: "Crisp vegetables in a garlic-ginger sauce.",
		...overrides,
	};
}

describe("diffMealPlanEntries", () => {
	it("marks a same-slot entry with identical title/overview as unchanged", () => {
		const entry = makeDraftLikeEntry();

		const diffs = diffMealPlanEntries([entry], [entry]);

		expect(diffs).toEqual([{ ...entry, status: "unchanged" }]);
	});

	it("marks a same-slot entry with a different title or overview as edited, keeping the before values", () => {
		const before = makeDraftLikeEntry({ title: "Overnight Oats" });
		const after = makeDraftLikeEntry({ title: "Tofu Scramble" });

		const diffs = diffMealPlanEntries([before], [after]);

		expect(diffs).toEqual([
			{
				...after,
				status: "edited",
				previousTitle: "Overnight Oats",
				previousOverview: after.overview,
			},
		]);
	});

	it("marks a slot present only in the next list as inserted", () => {
		const inserted = makeDraftLikeEntry({ slotIndex: 1 });

		const diffs = diffMealPlanEntries([], [inserted]);

		expect(diffs).toEqual([{ ...inserted, status: "inserted" }]);
	});

	it("marks a slot present only in the previous list as removed", () => {
		const removed = makeDraftLikeEntry({ slotIndex: 1 });

		const diffs = diffMealPlanEntries([removed], []);

		expect(diffs).toEqual([{ ...removed, status: "removed" }]);
	});

	it("classifies every slot independently across a mixed before/after pair", () => {
		const unchanged = makeDraftLikeEntry({
			mealType: "breakfast",
			title: "Same Dish",
		});
		const editedBefore = makeDraftLikeEntry({
			mealType: "lunch",
			title: "Old Lunch",
		});
		const editedAfter = makeDraftLikeEntry({
			mealType: "lunch",
			title: "New Lunch",
		});
		const removed = makeDraftLikeEntry({ mealType: "dinner" });
		const inserted = makeDraftLikeEntry({ mealType: "afternoon_snack" });

		const diffs = diffMealPlanEntries(
			[unchanged, editedBefore, removed],
			[unchanged, editedAfter, inserted],
		);

		const byMealType = new Map(diffs.map((d) => [d.mealType, d.status]));
		expect(byMealType.get("breakfast")).toBe("unchanged");
		expect(byMealType.get("lunch")).toBe("edited");
		expect(byMealType.get("dinner")).toBe("removed");
		expect(byMealType.get("afternoon_snack")).toBe("inserted");
	});
});

describe("groupMealPlanEntryDiffsByDay", () => {
	it("groups by day and orders by meal type then slotIndex, including a removed entry in its original slot", () => {
		const diffs = diffMealPlanEntries(
			[
				makeDraftLikeEntry({ day: "2026-09-16", mealType: "dinner" }),
				makeDraftLikeEntry({ day: "2026-09-15", mealType: "lunch" }),
			],
			[makeDraftLikeEntry({ day: "2026-09-15", mealType: "breakfast" })],
		);

		const days = groupMealPlanEntryDiffsByDay(diffs);

		expect(days.map((d) => d.day)).toEqual(["2026-09-15", "2026-09-16"]);
		expect(
			days.find((d) => d.day === "2026-09-15")?.entries.map((e) => e.status),
		).toEqual(["inserted", "removed"]);
		expect(
			days.find((d) => d.day === "2026-09-16")?.entries.map((e) => e.status),
		).toEqual(["removed"]);
	});
});

describe("groceryListSignature / isGroceryListStale", () => {
	const chickenRecipe = makeRecipe({ id: "r1", currentServings: 4 });
	const tofuRecipe = makeRecipe({ id: "r2", currentServings: 2 });
	const recipeById = new Map([
		[chickenRecipe.id, chickenRecipe],
		[tofuRecipe.id, tofuRecipe],
	]);

	it("produces one sorted recipeId@servings token per resolved entry", () => {
		const entries = [
			makeEntry({ id: "e1", recipeId: tofuRecipe.id }),
			makeEntry({ id: "e2", recipeId: chickenRecipe.id }),
			makeEntry({ id: "e3", recipeId: undefined }),
		];

		expect(groceryListSignature(entries, recipeById)).toEqual(["r1@4", "r2@2"]);
	});

	it("is not stale when no grocery list has been built yet", () => {
		const plan = makePlan({ groceryListId: undefined });
		expect(isGroceryListStale(plan, recipeById)).toBe(false);
	});

	it("is not stale when the snapshot predates this field", () => {
		const plan = makePlan({
			groceryListId: "list1",
			groceryListSnapshot: undefined,
		});
		expect(isGroceryListStale(plan, recipeById)).toBe(false);
	});

	it("is not stale when entries still match the stored snapshot", () => {
		const entries = [makeEntry({ recipeId: chickenRecipe.id })];
		const plan = makePlan({
			entries,
			groceryListId: "list1",
			groceryListSnapshot: groceryListSignature(entries, recipeById),
		});
		expect(isGroceryListStale(plan, recipeById)).toBe(false);
	});

	it("is stale once a dish is swapped for a different recipe", () => {
		const plan = makePlan({
			entries: [makeEntry({ recipeId: chickenRecipe.id })],
			groceryListId: "list1",
			groceryListSnapshot: [`${chickenRecipe.id}@4`],
		});
		const swapped = {
			...plan,
			entries: [makeEntry({ recipeId: tofuRecipe.id })],
		};
		expect(isGroceryListStale(swapped, recipeById)).toBe(true);
	});

	it("is stale once a linked recipe's servings change", () => {
		const entries = [makeEntry({ recipeId: chickenRecipe.id })];
		const plan = makePlan({
			entries,
			groceryListId: "list1",
			groceryListSnapshot: groceryListSignature(entries, recipeById),
		});
		const rescaledRecipeById = new Map(recipeById);
		rescaledRecipeById.set(chickenRecipe.id, {
			...chickenRecipe,
			currentServings: 8,
		});
		expect(isGroceryListStale(plan, rescaledRecipeById)).toBe(true);
	});
});

describe("filterMealPlanDaysBySearch", () => {
	const chickenRecipe = makeRecipe({ id: "r1", title: "Garlic Chicken" });
	const tofuRecipe = makeRecipe({ id: "r2", title: "Crispy Tofu" });
	const recipeById = new Map([
		[chickenRecipe.id, chickenRecipe],
		[tofuRecipe.id, tofuRecipe],
	]);
	const days = groupMealPlanEntriesByDay([
		makeEntry({ day: "2026-09-15", recipeId: chickenRecipe.id }),
		makeEntry({ day: "2026-09-16", recipeId: tofuRecipe.id }),
	]);

	it("returns every day unchanged when the query is blank", () => {
		expect(filterMealPlanDaysBySearch(days, recipeById, "  ")).toEqual(days);
	});

	it("matches case-insensitively against the linked recipe's title", () => {
		const result = filterMealPlanDaysBySearch(days, recipeById, "chicken");
		expect(result.map((d) => d.day)).toEqual(["2026-09-15"]);
	});

	it("drops a day entirely once none of its entries match", () => {
		const result = filterMealPlanDaysBySearch(days, recipeById, "tofu");
		expect(result).toHaveLength(1);
		expect(result[0].day).toBe("2026-09-16");
	});

	it("never matches an entry with no resolved recipe", () => {
		const unresolvedDays = groupMealPlanEntriesByDay([
			makeEntry({ day: "2026-09-17", recipeId: undefined }),
		]);
		expect(
			filterMealPlanDaysBySearch(unresolvedDays, recipeById, "anything"),
		).toEqual([]);
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
