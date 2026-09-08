import type { GroceryList } from "#/lib/grocery-list";

const STORAGE_KEY = "cookerist:grocery-lists";

function isGroceryList(value: unknown): value is GroceryList {
	if (typeof value !== "object" || value === null) return false;
	const l = value as Record<string, unknown>;
	return (
		typeof l.id === "string" &&
		typeof l.createdAt === "string" &&
		typeof l.name === "string" &&
		Array.isArray(l.recipeIds) &&
		Array.isArray(l.items)
	);
}

export function loadGroceryLists(): GroceryList[] {
	const raw = window.localStorage.getItem(STORAGE_KEY);
	if (!raw) return [];
	try {
		const parsed = JSON.parse(raw);
		if (!Array.isArray(parsed)) return [];
		return parsed.filter(isGroceryList);
	} catch {
		return [];
	}
}

function persist(lists: GroceryList[]): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lists));
}

export function saveGroceryList(list: GroceryList): GroceryList[] {
	const next = [list, ...loadGroceryLists()];
	persist(next);
	return next;
}

export function deleteGroceryList(id: string): GroceryList[] {
	const next = loadGroceryLists().filter((list) => list.id !== id);
	persist(next);
	return next;
}

export function updateGroceryList(list: GroceryList): GroceryList[] {
	const next = loadGroceryLists().map((l) => (l.id === list.id ? list : l));
	persist(next);
	return next;
}

export function setExpandedGroceryList(id: string | null): GroceryList[] {
	const next = loadGroceryLists().map((l) => ({ ...l, expanded: l.id === id }));
	persist(next);
	return next;
}
