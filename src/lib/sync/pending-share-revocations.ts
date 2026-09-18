import type { SyncTable } from "#/lib/sync/sync-client";

const STORAGE_KEY = "cookerist:pending-share-revocations";

type PendingShareRevocations = Record<SyncTable, string[]>;

function load(): PendingShareRevocations {
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

function save(pending: PendingShareRevocations): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(pending));
}

// Durable record of "this device revoked its own access to a shared
// resource and needs Supabase to know it" — the exact sibling of
// pending-tombstones.ts, for the same reason: once app-data-context.tsx
// removes the entity from localStorage, there's no local record left to
// retry a failed (or silently zero-row) resource_shares delete from. Kept
// as a separate table from pending-tombstones.ts because the two are
// different mutations (deleting a resource vs. deleting only this
// account's grant on someone else's resource) that must never be confused.
export function getPendingShareRevocations(table: SyncTable): string[] {
	return load()[table];
}

export function addPendingShareRevocation(table: SyncTable, id: string): void {
	const current = load();
	if (current[table].includes(id)) return;
	current[table] = [...current[table], id];
	save(current);
}

export function removePendingShareRevocation(
	table: SyncTable,
	id: string,
): void {
	const current = load();
	if (!current[table].includes(id)) return;
	current[table] = current[table].filter((existing) => existing !== id);
	save(current);
}
