import type { SyncTable } from "#/lib/sync/sync-client";

const STORAGE_KEY = "cookerist:pending-tombstones";

type PendingTombstones = Record<SyncTable, string[]>;

function load(): PendingTombstones {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return {
			recipes: Array.isArray(parsed.recipes) ? parsed.recipes : [],
			grocery_lists: Array.isArray(parsed.grocery_lists)
				? parsed.grocery_lists
				: [],
			meal_plans: Array.isArray(parsed.meal_plans) ? parsed.meal_plans : [],
		};
	} catch {
		return { recipes: [], grocery_lists: [], meal_plans: [] };
	}
}

function save(pending: PendingTombstones): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

// Durable record of "this device deleted this id and needs Supabase to know
// it" — set the moment a delete handler decides to push a tombstone, cleared
// only once pushTombstone actually confirms the row was touched. Exists
// because deletion, unlike every other mutation, has no local record left to
// retry from once app-data-context.tsx removes the entity from
// localStorage — without this, a tombstone push that fails or silently
// matches zero rows (see pushTombstone's own comment in sync-client.ts) is
// unrecoverable: nothing will ever tell Supabase or a paired device again.
export function getPendingTombstones(table: SyncTable): string[] {
	return load()[table];
}

export function addPendingTombstone(table: SyncTable, id: string): void {
	const current = load();
	if (current[table].includes(id)) return;
	current[table] = [...current[table], id];
	save(current);
}

export function removePendingTombstone(table: SyncTable, id: string): void {
	const current = load();
	if (!current[table].includes(id)) return;
	current[table] = current[table].filter((existing) => existing !== id);
	save(current);
}
