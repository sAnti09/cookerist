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

// See the equivalent comment in recipes-storage.ts: these take the caller's
// current in-memory list instead of reloading+reparsing the whole stored
// list on every call, and preserve untouched entries' object references so
// React can skip re-rendering rows that didn't change.

export function saveGroceryList(
	lists: GroceryList[],
	list: GroceryList,
): GroceryList[] {
	const next = [list, ...lists];
	persist(next);
	return next;
}

export function deleteGroceryList(
	lists: GroceryList[],
	id: string,
): GroceryList[] {
	const next = lists.filter((list) => list.id !== id);
	persist(next);
	return next;
}

export function updateGroceryList(
	lists: GroceryList[],
	list: GroceryList,
): GroceryList[] {
	const next = lists.map((l) => (l.id === list.id ? list : l));
	persist(next);
	return next;
}

export function setExpandedGroceryList(
	lists: GroceryList[],
	id: string | null,
): GroceryList[] {
	const next = lists.map((l) => {
		const expanded = l.id === id;
		return l.expanded === expanded ? l : { ...l, expanded };
	});
	persist(next);
	return next;
}
