import type { Recipe } from "./recipe";

// Declared as a const tuple (not a plain string-literal union) so it can
// double as the source of truth for both the MealType type and the zod enum
// in groq/schema.ts.
export const MEAL_TYPES = [
	"breakfast",
	"morning_snack",
	"lunch",
	"afternoon_snack",
	"dinner",
] as const;

export type MealType = (typeof MEAL_TYPES)[number];

export const MEAL_TYPE_LABELS: Record<MealType, string> = {
	breakfast: "Breakfast",
	morning_snack: "Morning snack",
	lunch: "Lunch",
	afternoon_snack: "Afternoon snack",
	dinner: "Dinner",
};

export const MEAL_TYPE_ABBREVIATIONS: Record<MealType, string> = {
	breakfast: "B",
	morning_snack: "MS",
	lunch: "L",
	afternoon_snack: "AS",
	dinner: "D",
};

// Wizard-only state — never persisted on its own. One entry per (day ×
// mealType) in the chosen date range; `enabled`/`dishCount` drive the
// wizard's tap-to-cycle grid (see meal-plan-wizard-form.tsx).
export type MealSlotConfig = {
	day: string; // ISO date, e.g. "2026-09-15"
	mealType: MealType;
	enabled: boolean;
	dishCount: number;
};

export const MAX_DISH_COUNT_PER_SLOT = 2;
export const MAX_PLAN_DAYS = 7;
export const DEFAULT_PLAN_DAYS = 7;
export const DEFAULT_MEAL_PLAN_SERVINGS = 4;

// Meal types enabled by default when the wizard opens (or a day range grows)
// — a sensible starting shape the user can adjust from there.
export const DEFAULT_ENABLED_MEAL_TYPES: ReadonlySet<MealType> = new Set([
	"breakfast",
	"lunch",
	"dinner",
]);

export type MealPlanEntryStatus = "suggested" | "ready" | "failed";

export type MealPlanEntry = {
	id: string;
	day: string;
	mealType: MealType;
	// 0-based position within the slot when dishCount > 1.
	slotIndex: number;
	status: MealPlanEntryStatus;
	suggestedTitle: string;
	suggestedOverview: string;
	// Set once status is "ready" — the real, saved Recipe this entry resolved
	// to (either matched against an existing one or freshly generated).
	recipeId?: string;
	// True when this entry was resolved by matching an already-saved recipe
	// instead of spending a Groq generation call.
	reused?: boolean;
	// Set when status is "failed" — shown next to the entry's Retry action.
	buildError?: string;
};

export type MealPlanStatus = "draft" | "building" | "ready";

export type MealPlan = {
	id: string;
	createdAt: string;
	startDate: string; // ISO date
	endDate: string; // ISO date
	description: string;
	// Broadcast servings target for the plan — see recipe-servings-for-meal-plan
	// note below for how per-dish overrides interact with this.
	defaultServings: number;
	status: MealPlanStatus;
	entries: MealPlanEntry[];
	// Refine-round instruction log for the "draft" review screen, oldest
	// first — mirrors PendingModification.instructions (recipe.ts): lets a
	// refine call re-prompt against the still-current draft so edits
	// compound, and gives a simple audit trail.
	refineInstructions: string[];
	// Set once "Build grocery list" has run from the Ready screen — links to
	// the created GroceryList so the UI can offer "View grocery list"
	// instead of re-offering to build one.
	groceryListId?: string;
	// Snapshot of the (recipeId, servings) pairs the linked grocery list was
	// last built/refreshed from — see groceryListSignature/isGroceryListStale
	// below. Set alongside groceryListId, and again whenever the Ready
	// screen's "Update grocery list" action re-syncs the list. Undefined for
	// a grocery list built before this field existed — isGroceryListStale
	// treats that as "not stale" rather than guessing, since there's no
	// baseline to compare against; the next build/refresh backfills it.
	groceryListSnapshot?: string[];
	// True once this plan has been through "building" at least once — lets
	// the draft screen tell a brand-new plan's first review (Approve & build
	// is always available; Discard deletes the plan outright, there's
	// nothing built yet to lose) apart from re-entering "draft" via an
	// already-built plan's "Adjust plan" button (Approve & build stays
	// disabled until a refine actually changes something — re-approving an
	// unchanged plan would just waste a rebuild — and Discard becomes a
	// non-destructive "cancel adjustment" instead of deleting the plan; see
	// preAdjustEntries below).
	builtBefore?: boolean;
	// Snapshot of `entries` captured the moment "Adjust plan" was clicked —
	// only meaningful while status is "draft" and builtBefore is true.
	// Canceling the adjustment (Discard, in that state) restores this
	// verbatim instead of leaving the Ready screen pointing at entries a
	// refine has since replaced; approving clears it.
	preAdjustEntries?: MealPlanEntry[];
};

// One token per plan entry with a resolved recipe, capturing exactly what
// affects a built grocery list's ingredient quantities: which recipe, and at
// what serving size (a plan-wide or per-dish servings change rescales that
// recipe's ingredients same as a fresh build would). Sorted so two token
// lists compare correctly regardless of entry order.
export function groceryListSignature(
	entries: MealPlanEntry[],
	recipeById: Map<string, Recipe>,
): string[] {
	const tokens: string[] = [];
	for (const entry of entries) {
		if (!entry.recipeId) continue;
		const recipe = recipeById.get(entry.recipeId);
		if (!recipe) continue;
		tokens.push(`${entry.recipeId}@${recipe.currentServings}`);
	}
	return tokens.sort();
}

// True when the plan's current entries would produce a different grocery
// list than the one last built/refreshed (a dish was swapped, added,
// removed, or had its servings changed since) — drives the Ready screen's
// "meal plan changed" banner. False when no grocery list has been built yet
// (nothing to go stale) or groceryListSnapshot predates this field (no
// baseline to compare against — see its own comment on MealPlan).
export function isGroceryListStale(
	plan: MealPlan,
	recipeById: Map<string, Recipe>,
): boolean {
	if (!plan.groceryListId || !plan.groceryListSnapshot) return false;
	const current = groceryListSignature(plan.entries, recipeById);
	const snapshot = plan.groceryListSnapshot;
	return (
		current.length !== snapshot.length ||
		current.some((token, index) => token !== snapshot[index])
	);
}

// Filters a day-grouped entry list down to entries whose linked recipe title
// matches the typed search text, dropping any day left with no matches —
// lets the Ready screen answer "what date did I put that dish on again?".
// Entries with no resolved recipe (not yet built) never match, matching
// meal-plan-ready.tsx's own render skip for them.
export function filterMealPlanDaysBySearch(
	days: MealPlanDay[],
	recipeById: Map<string, Recipe>,
	query: string,
): MealPlanDay[] {
	const trimmed = query.trim().toLowerCase();
	if (!trimmed) return days;
	return days
		.map((day) => ({
			...day,
			entries: day.entries.filter((entry) => {
				const recipe = entry.recipeId
					? recipeById.get(entry.recipeId)
					: undefined;
				return recipe ? recipe.title.toLowerCase().includes(trimmed) : false;
			}),
		}))
		.filter((day) => day.entries.length > 0);
}

// Deliberately no per-entry `servings` field: an entry's servings *is* its
// linked Recipe's `currentServings`. Whether a dish has been individually
// "edited" away from the plan's shared default is a pure comparison, not
// stored state — see isEntryServingsEdited below and
// meal-plan-ready.tsx's use of it.
export function isEntryServingsEdited(
	recipeCurrentServings: number,
	planDefaultServings: number,
): boolean {
	return recipeCurrentServings !== planDefaultServings;
}

export function formatMealPlanDateRange(
	startDate: string,
	endDate: string,
): string {
	const start = new Date(`${startDate}T00:00:00`);
	const end = new Date(`${endDate}T00:00:00`);
	const startLabel = start.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
	const endLabel = end.toLocaleDateString(undefined, {
		month: "short",
		day: "numeric",
	});
	return `${startLabel} – ${endLabel}`;
}

export function formatMealPlanDay(day: string): string {
	return new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
		weekday: "long",
		month: "short",
		day: "numeric",
	});
}

// Formats a Date as a local-calendar-date "YYYY-MM-DD" string. Deliberately
// NOT `date.toISOString().slice(0, 10)` — that converts to UTC first, which
// silently shifts the date by a day for any timezone not equal to UTC (e.g.
// midnight local time in a negative-UTC-offset timezone is still the
// *previous* day in UTC). Every ISO-date string this module produces or
// consumes is meant as a local calendar date, not an instant, so this stays
// in the caller's local timezone throughout.
export function toIsoDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// Every ISO date from startDate to endDate inclusive.
export function enumerateDays(startDate: string, endDate: string): string[] {
	const days: string[] = [];
	const cursor = new Date(`${startDate}T00:00:00`);
	const end = new Date(`${endDate}T00:00:00`);
	while (cursor.getTime() <= end.getTime()) {
		days.push(toIsoDate(cursor));
		cursor.setDate(cursor.getDate() + 1);
	}
	return days;
}

export function countPlanDays(startDate: string, endDate: string): number {
	return enumerateDays(startDate, endDate).length;
}

// The default wizard grid for a set of days: Breakfast/Lunch/Dinner on (1
// dish each), snacks off.
export function defaultSlots(days: string[]): MealSlotConfig[] {
	const slots: MealSlotConfig[] = [];
	for (const day of days) {
		for (const mealType of MEAL_TYPES) {
			const enabled = DEFAULT_ENABLED_MEAL_TYPES.has(mealType);
			slots.push({ day, mealType, enabled, dishCount: enabled ? 1 : 0 });
		}
	}
	return slots;
}

// Rebuilds the full slot grid for a new day range, preserving any existing
// (day, mealType) configuration for days still in range and defaulting new
// days via defaultSlots — used when the wizard's date range changes so
// widening/narrowing it doesn't discard edits already made to days that
// stay in range.
export function resizeSlotsForDays(
	currentSlots: MealSlotConfig[],
	days: string[],
): MealSlotConfig[] {
	const byKey = new Map(
		currentSlots.map((slot) => [`${slot.day}|${slot.mealType}`, slot]),
	);
	return defaultSlots(days).map(
		(slot) => byKey.get(`${slot.day}|${slot.mealType}`) ?? slot,
	);
}

export type MealPlanDateRangeChange = {
	startDate: string;
	endDate: string;
	slots: MealSlotConfig[];
};

// Applies a newly picked (startDate, endDate) to the wizard's grid: clamps
// the span to MAX_PLAN_DAYS (keeping startDate fixed and pulling endDate
// back in, same as the date-range picker's own tap-order clamp) and resizes
// the slot grid to match. Pulled out as a pure function — separate from the
// date-range picker's own UI — specifically so this clamping logic has a
// fast, direct unit test path: driving it through an actual popover
// interaction in a full-app test is unreliable (see
// meal-plan-date-range-picker.test.tsx and _tabs.meal-plan_.new.test.tsx for
// what each level actually covers instead).
export function applyMealPlanDateRange(
	currentSlots: MealSlotConfig[],
	nextStart: string,
	nextEnd: string,
): MealPlanDateRangeChange {
	const nextDays = enumerateDays(nextStart, nextEnd);
	const boundedDays =
		nextDays.length > MAX_PLAN_DAYS
			? nextDays.slice(0, MAX_PLAN_DAYS)
			: nextDays;
	const boundedEnd = boundedDays[boundedDays.length - 1] ?? nextEnd;
	return {
		startDate: nextStart,
		endDate: boundedEnd,
		slots: resizeSlotsForDays(currentSlots, boundedDays),
	};
}

// Tap-cycles a single cell: off → 1 dish → 2 dishes (MAX_DISH_COUNT_PER_SLOT)
// → off.
export function cycleSlot(slot: MealSlotConfig): MealSlotConfig {
	if (!slot.enabled) return { ...slot, enabled: true, dishCount: 1 };
	if (slot.dishCount < MAX_DISH_COUNT_PER_SLOT) {
		return { ...slot, dishCount: slot.dishCount + 1 };
	}
	return { ...slot, enabled: false, dishCount: 0 };
}

export function toggleSlotInList(
	slots: MealSlotConfig[],
	day: string,
	mealType: MealType,
): MealSlotConfig[] {
	return slots.map((slot) =>
		slot.day === day && slot.mealType === mealType ? cycleSlot(slot) : slot,
	);
}

// Tapping a grid column header (e.g. "B" for Breakfast) toggles that meal
// type for every day at once — standard "select all" checkbox semantics: if
// every day already has it on, turn every day off; otherwise (some or none
// on) turn every day on. A day turning on keeps its existing dishCount if it
// already had one (e.g. was on with 2 dishes before being turned off),
// otherwise defaults to 1, mirroring cycleSlot's off→1-dish step.
export function toggleMealTypeColumn(
	slots: MealSlotConfig[],
	mealType: MealType,
): MealSlotConfig[] {
	const columnSlots = slots.filter((slot) => slot.mealType === mealType);
	const allEnabled =
		columnSlots.length > 0 && columnSlots.every((slot) => slot.enabled);
	return slots.map((slot) => {
		if (slot.mealType !== mealType) return slot;
		if (allEnabled) return { ...slot, enabled: false, dishCount: 0 };
		return {
			...slot,
			enabled: true,
			dishCount: slot.dishCount > 0 ? slot.dishCount : 1,
		};
	});
}

// The enabled (day, mealType, dishCount > 0) slots from a wizard grid, in
// day → mealType order — what actually gets sent to generateMealPlanDraft.
export function enabledSlots(slots: MealSlotConfig[]): MealSlotConfig[] {
	return slots.filter((slot) => slot.enabled && slot.dishCount > 0);
}

export function totalDishCount(slots: MealSlotConfig[]): number {
	return enabledSlots(slots).reduce((sum, slot) => sum + slot.dishCount, 0);
}

export type MealPlanEntriesSummary = {
	ready: number;
	failed: number;
	pending: number;
	total: number;
	reused: number;
	generated: number;
};

export function summarizeMealPlanEntries(
	entries: MealPlanEntry[],
): MealPlanEntriesSummary {
	let ready = 0;
	let failed = 0;
	let reused = 0;
	let generated = 0;
	for (const entry of entries) {
		if (entry.status === "ready") {
			ready += 1;
			if (entry.reused) reused += 1;
			else generated += 1;
		} else if (entry.status === "failed") {
			failed += 1;
		}
	}
	return {
		ready,
		failed,
		pending: entries.length - ready - failed,
		total: entries.length,
		reused,
		generated,
	};
}

export type MealPlanDay = {
	day: string;
	entries: MealPlanEntry[];
};

// Groups a plan's entries by day (in day order, then meal-type order) for
// the draft/building/ready screens' per-day sections.
export function groupMealPlanEntriesByDay(
	entries: MealPlanEntry[],
): MealPlanDay[] {
	const byDay = new Map<string, MealPlanEntry[]>();
	for (const entry of entries) {
		const list = byDay.get(entry.day);
		if (list) list.push(entry);
		else byDay.set(entry.day, [entry]);
	}
	const mealTypeOrder = new Map(MEAL_TYPES.map((type, index) => [type, index]));
	return Array.from(byDay.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, dayEntries]) => ({
			day,
			entries: [...dayEntries].sort((a, b) => {
				const typeDiff =
					(mealTypeOrder.get(a.mealType) ?? 0) -
					(mealTypeOrder.get(b.mealType) ?? 0);
				return typeDiff !== 0 ? typeDiff : a.slotIndex - b.slotIndex;
			}),
		}));
}

export type MealPlanEntryDiffStatus =
	| "unchanged"
	| "edited"
	| "inserted"
	| "removed";

// Structurally identical to groq/schema.ts's MealPlanDraftEntry (day,
// mealType, slotIndex, title, overview) — declared locally instead of
// imported from there to avoid a circular import (schema.ts imports
// MEAL_TYPES from this module). Callers can pass a MealPlanDraftEntry
// directly; TS structural typing accepts it.
export type MealPlanDraftLikeEntry = {
	day: string;
	mealType: MealType;
	slotIndex: number;
	title: string;
	overview: string;
};

export type MealPlanEntryDiff = MealPlanDraftLikeEntry & {
	status: MealPlanEntryDiffStatus;
	// Set only when status is "edited" — the pre-refine title/overview, so
	// the draft screen can render a struck-through before value next to the
	// new one.
	previousTitle?: string;
	previousOverview?: string;
};

function mealPlanSlotKey(entry: {
	day: string;
	mealType: MealType;
	slotIndex: number;
}): string {
	return `${entry.day}|${entry.mealType}|${entry.slotIndex}`;
}

// Compares a refine call's before/after entry lists to classify every slot
// as carried over unchanged, edited in place, newly inserted, or dropped —
// drives the draft screen's diff-indicator styling once a refine completes.
// Matches slots by (day, mealType, slotIndex) rather than entry id: ids are
// regenerated fresh on every refine (see meal-plan-draft.tsx), so the slot
// triple Groq echoes back is the only stable correlation key across a
// refine round.
export function diffMealPlanEntries(
	previous: MealPlanDraftLikeEntry[],
	next: MealPlanDraftLikeEntry[],
): MealPlanEntryDiff[] {
	const previousByKey = new Map(
		previous.map((entry) => [mealPlanSlotKey(entry), entry]),
	);
	const nextKeys = new Set(next.map((entry) => mealPlanSlotKey(entry)));

	const diffs: MealPlanEntryDiff[] = next.map((entry) => {
		const before = previousByKey.get(mealPlanSlotKey(entry));
		if (!before) return { ...entry, status: "inserted" };
		if (before.title !== entry.title || before.overview !== entry.overview) {
			return {
				...entry,
				status: "edited",
				previousTitle: before.title,
				previousOverview: before.overview,
			};
		}
		return { ...entry, status: "unchanged" };
	});

	for (const entry of previous) {
		if (!nextKeys.has(mealPlanSlotKey(entry))) {
			diffs.push({ ...entry, status: "removed" });
		}
	}

	return diffs;
}

export type MealPlanEntryDiffDay = {
	day: string;
	entries: MealPlanEntryDiff[];
};

// Same day/meal-type/slotIndex ordering as groupMealPlanEntriesByDay, for
// the diff-indicator variant of the draft list — a removed entry (absent
// from `next`) still sorts into its original slot position among its day's
// other entries.
export function groupMealPlanEntryDiffsByDay(
	diffs: MealPlanEntryDiff[],
): MealPlanEntryDiffDay[] {
	const byDay = new Map<string, MealPlanEntryDiff[]>();
	for (const diff of diffs) {
		const list = byDay.get(diff.day);
		if (list) list.push(diff);
		else byDay.set(diff.day, [diff]);
	}
	const mealTypeOrder = new Map(MEAL_TYPES.map((type, index) => [type, index]));
	return Array.from(byDay.entries())
		.sort(([a], [b]) => a.localeCompare(b))
		.map(([day, dayDiffs]) => ({
			day,
			entries: [...dayDiffs].sort((a, b) => {
				const typeDiff =
					(mealTypeOrder.get(a.mealType) ?? 0) -
					(mealTypeOrder.get(b.mealType) ?? 0);
				return typeDiff !== 0 ? typeDiff : a.slotIndex - b.slotIndex;
			}),
		}));
}
