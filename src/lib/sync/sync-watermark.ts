import type { SyncTable } from "#/lib/sync/sync-client";

const STORAGE_KEY = "cookerist:sync-watermark";
const EPOCH = new Date(0).toISOString();

type Watermarks = Record<SyncTable, string>;

function load(): Watermarks {
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		const parsed = raw ? JSON.parse(raw) : {};
		return {
			recipes: parsed.recipes ?? EPOCH,
			grocery_lists: parsed.grocery_lists ?? EPOCH,
			meal_plans: parsed.meal_plans ?? EPOCH,
		};
	} catch {
		return { recipes: EPOCH, grocery_lists: EPOCH, meal_plans: EPOCH };
	}
}

// Per-table "last successful pull" cursor — sync-engine.ts only ever asks
// Supabase for rows changed since this, rather than re-pulling everything on
// every sync-on-open. Defaults to the epoch so a brand-new/just-paired device
// pulls everything on its first sync.
export function getWatermark(table: SyncTable): string {
	return load()[table];
}

export function setWatermark(table: SyncTable, iso: string): void {
	const current = load();
	current[table] = iso;
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
}
