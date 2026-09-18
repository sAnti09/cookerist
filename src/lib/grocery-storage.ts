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
		return parsed.filter(isGroceryList).map((list) => ({
			...list,
			updatedAt: list.updatedAt ?? list.createdAt,
			sharedAt: list.sharedAt ?? null,
			ownerId: list.ownerId ?? null,
		}));
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

// Bulk version of deleteGroceryList — used by the sync engine (src/lib/sync/)
// to drop every locally-held list a pull just found tombstoned upstream in
// one persist() call, rather than one call per id.
export function removeGroceryLists(
	lists: GroceryList[],
	ids: string[],
): GroceryList[] {
	if (ids.length === 0) return lists;
	const idSet = new Set(ids);
	const next = lists.filter((list) => !idSet.has(list.id));
	persist(next);
	return next;
}

// Stamps `updatedAt` on every write below (except setExpandedGroceryList,
// which is pure UI state — see grocery-list.ts) so the sync engine's
// last-write-wins merge (src/lib/sync/) has an accurate clock for content
// changes.
function touch(list: GroceryList): GroceryList {
	return { ...list, updatedAt: new Date().toISOString() };
}

export function updateGroceryList(
	lists: GroceryList[],
	list: GroceryList,
): GroceryList[] {
	const touched = touch(list);
	const next = lists.map((l) => (l.id === touched.id ? touched : l));
	persist(next);
	return next;
}

// Bulk-overwrites every stored list at once, bypassing the per-list mutation
// helpers above — used by one-time data migrations (see
// src/lib/migrations/) that need to rewrite many lists' items together
// without a separate persist() call (and full array re-serialization) per
// list. Deliberately does NOT bump updatedAt — a migration corrects
// already-stored content in place, it isn't a new user edit worth a sync
// round-trip.
export function replaceGroceryLists(lists: GroceryList[]): GroceryList[] {
	persist(lists);
	return lists;
}

// Insert-or-replace-by-id for every entity in `incoming` at once, re-sorted
// newest-first by createdAt — used by the sync engine (src/lib/sync/) to
// write a batch of pull-merged lists back in one persist() call, same as
// recipes-storage.ts's upsertRecipes.
export function upsertGroceryLists(
	lists: GroceryList[],
	incoming: GroceryList[],
): GroceryList[] {
	if (incoming.length === 0) return lists;
	const byId = new Map(lists.map((list) => [list.id, list]));
	for (const list of incoming) byId.set(list.id, list);
	const next = Array.from(byId.values()).sort((a, b) =>
		b.createdAt.localeCompare(a.createdAt),
	);
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
