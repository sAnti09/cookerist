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
		return parsed.filter(isMealPlan);
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

export function updateMealPlan(plans: MealPlan[], plan: MealPlan): MealPlan[] {
	const next = plans.map((p) => (p.id === plan.id ? plan : p));
	persist(next);
	return next;
}
