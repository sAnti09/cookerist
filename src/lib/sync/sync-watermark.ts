import type { SyncTable } from "#/lib/sync/sync-client";

const PULL_STORAGE_KEY = "cookerist:sync-watermark";
const PUSH_STORAGE_KEY = "cookerist:sync-push-watermark";
const EPOCH = new Date(0).toISOString();

type Watermarks = Record<SyncTable, string>;

function load(key: string): Watermarks {
	try {
		const raw = window.localStorage.getItem(key);
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

function save(key: string, watermarks: Watermarks): void {
	window.localStorage.setItem(key, JSON.stringify(watermarks));
}

// Per-table "last successful pull" cursor — sync-engine.ts only ever asks
// Supabase for rows changed since this, rather than re-pulling everything on
// every sync-on-open. Defaults to the epoch so a brand-new/just-paired device
// pulls everything on its first sync.
export function getWatermark(table: SyncTable): string {
	return load(PULL_STORAGE_KEY)[table];
}

export function setWatermark(table: SyncTable, iso: string): void {
	const current = load(PULL_STORAGE_KEY);
	current[table] = iso;
	save(PULL_STORAGE_KEY, current);
}

// Per-table "last successfully pushed" cursor, mirroring the pull watermark
// above. sync-engine.ts only re-uploads a shared entity whose `updatedAt` is
// newer than this, instead of re-uploading every already-shared entity on
// every sync cycle regardless of whether anything actually changed — see the
// "why does it sync with no changes" investigation in this codebase's history
// for why that mattered on Supabase's free tier. Only advanced to the max
// `updatedAt` across everything shared in the table after a push actually
// succeeds; a failed push must leave it alone so the next cycle retries the
// same entities instead of silently giving up on them.
export function getPushWatermark(table: SyncTable): string {
	return load(PUSH_STORAGE_KEY)[table];
}

export function setPushWatermark(table: SyncTable, iso: string): void {
	const current = load(PUSH_STORAGE_KEY);
	current[table] = iso;
	save(PUSH_STORAGE_KEY, current);
}
