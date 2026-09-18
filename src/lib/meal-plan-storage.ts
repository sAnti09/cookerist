import type { MealPlan } from "#/lib/meal-plan";

const STORAGE_KEY = "cookerist:meal-plans";

function isMealPlan(value: unknown): value is MealPlan {
	if (typeof value !== "object" || value === null) return false;
	const p = value as Record<string, unknown>;
	return (
		typeof p.id === "string" &&
		typeof p.createdAt === "string" &&
		typeof p.startDate === "string" &&
		typeof p.endDate === "string" &&
		typeof p.status === "string" &&
		Array.isArray(p.entries)
	);
}

export function loadMealPlans(): MealPlan[] {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isMealPlan).map((plan) => ({
			...plan,
			updatedAt: plan.updatedAt ?? plan.createdAt,
			sharedAt: plan.sharedAt ?? null,
		}));
	} catch {
		return [];
	}
}

function persist(plans: MealPlan[]): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(plans));
}

// See the equivalent comment in recipes-storage.ts/grocery-storage.ts: these
// take the caller's current in-memory list instead of reloading+reparsing
// the whole stored list on every call, and preserve untouched entries'
// object references so React can skip re-rendering rows that didn't change.

export function saveMealPlan(plans: MealPlan[], plan: MealPlan): MealPlan[] {
	const next = [plan, ...plans];
	persist(next);
	return next;
}

export function deleteMealPlan(plans: MealPlan[], id: string): MealPlan[] {
	const next = plans.filter((plan) => plan.id !== id);
	persist(next);
	return next;
}

// Bulk version of deleteMealPlan — used by the sync engine (src/lib/sync/) to
// drop every locally-held plan a pull just found tombstoned upstream in one
// persist() call, rather than one call per id.
export function removeMealPlans(plans: MealPlan[], ids: string[]): MealPlan[] {
	if (ids.length === 0) return plans;
	const idSet = new Set(ids);
	const next = plans.filter((plan) => !idSet.has(plan.id));
	persist(next);
	return next;
}

// Stamps `updatedAt` on every write below so the sync engine's
// last-write-wins merge (src/lib/sync/) has an accurate clock for content
// changes.
function touch(plan: MealPlan): MealPlan {
	return { ...plan, updatedAt: new Date().toISOString() };
}

export function updateMealPlan(plans: MealPlan[], plan: MealPlan): MealPlan[] {
	const touched = touch(plan);
	const next = plans.map((p) => (p.id === touched.id ? touched : p));
	persist(next);
	return next;
}

// Bulk-overwrites every stored plan at once, bypassing touch() above — used
// by one-time data migrations (see src/lib/migrations/) that need to
// backfill/correct fields without it looking like a fresh user edit (which
// would bump updatedAt to "now" and needlessly flag the plan for re-sync).
export function replaceMealPlans(plans: MealPlan[]): MealPlan[] {
	persist(plans);
	return plans;
}

// Insert-or-replace-by-id for every entity in `incoming` at once, re-sorted
// newest-first by createdAt — used by the sync engine (src/lib/sync/) to
// write a batch of pull-merged plans back in one persist() call, same as
// recipes-storage.ts's upsertRecipes.
export function upsertMealPlans(
	plans: MealPlan[],
	incoming: MealPlan[],
): MealPlan[] {
	if (incoming.length === 0) return plans;
	const byId = new Map(plans.map((plan) => [plan.id, plan]));
	for (const plan of incoming) byId.set(plan.id, plan);
	const next = Array.from(byId.values()).sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	);
	persist(next);
	return next;
}
