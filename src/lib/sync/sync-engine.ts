import type { GroceryList } from "#/lib/grocery-list";
import { loadGroceryLists, upsertGroceryLists } from "#/lib/grocery-storage";
import { getDeviceIdentity } from "#/lib/identity/device";
import type { MealPlan } from "#/lib/meal-plan";
import { loadMealPlans, upsertMealPlans } from "#/lib/meal-plan-storage";
import type { Recipe } from "#/lib/recipe";
import { loadRecipes, upsertRecipes } from "#/lib/recipes-storage";
import {
	pullChangedSince,
	pushEntities,
	type SyncRow,
	type SyncTable,
} from "#/lib/sync/sync-client";
import {
	mergeGroceryList,
	mergeMealPlan,
	mergeRecipe,
} from "#/lib/sync/sync-merge";
import { getWatermark, setWatermark } from "#/lib/sync/sync-watermark";

export type SyncResult = {
	recipes: Recipe[];
	groceryLists: GroceryList[];
	mealPlans: MealPlan[];
};

type Syncable = {
	id: string;
	updatedAt: string;
	sharedAt: string | null;
	ownerDeviceId?: string;
};

// Every local entity syncs once this device has an identity — there's no
// per-entity opt-in anymore (see CLAUDE.md's "Sharing feature" section for
// why: an earlier per-item "Share" toggle plus a separate "sync everything"
// action was confusing in practice and didn't match how people actually
// think about syncing two of their own devices). `sharedAt`/`ownerDeviceId`
// still exist as bookkeeping — first-push timestamp and delete-authority
// owner (src/lib/sync/ownership.ts) — they're just stamped automatically
// here instead of being a manual toggle.
//
// Only stamps an entity that's NEVER been synced (`ownerDeviceId` unset) —
// checking `sharedAt` alone isn't enough, since a detached entity (the
// owner tombstoned it upstream — see the pull/merge loop below) also has
// `sharedAt: null` but keeps its original `ownerDeviceId`. Without this
// distinction, the very next push after a detach would immediately
// re-stamp and re-upload the entity this device was just told to stop
// syncing, resurrecting something the owner deleted.
function stampForSync<T extends Syncable>(entity: T, deviceId: string): T {
	if (entity.sharedAt != null || entity.ownerDeviceId != null) return entity;
	return {
		...entity,
		sharedAt: new Date().toISOString(),
		ownerDeviceId: deviceId,
	};
}

// Pulls+merges everything changed since the last successful pull FIRST,
// then pushes the (now-merged) local state — deliberately in that order.
// Pushing first (an earlier version of this function did) meant visiting a
// shared entity would immediately upsert this device's possibly-stale local
// copy over Supabase, clobbering a genuinely newer remote write before ever
// comparing the two — the next pull would then just read back the same
// stale data this device already had, making sync look like it never
// actually transferred anything. Pulling first means the merge (whole-record
// LWW, or item/entry-union — see sync-merge.ts) always resolves the correct
// winner before anything gets written back, so the push afterward is either
// a no-op-equivalent re-upload of what remote already had, or a genuine
// local change — never a downgrade.
async function syncTable<T extends Syncable>(
	table: SyncTable,
	load: () => T[],
	upsert: (current: T[], incoming: T[]) => T[],
	merge: (local: T, remote: T) => T,
	deviceId: string,
): Promise<T[]> {
	const since = getWatermark(table);
	let rows: SyncRow[];
	try {
		rows = await pullChangedSince(table, since);
	} catch (error) {
		console.error(`Sync pull failed for ${table}:`, error);
		// Can't safely push either without knowing whether remote has
		// something newer — skip this cycle entirely and retry next time.
		return load();
	}

	let merged = load();
	if (rows.length > 0) {
		const byId = new Map(merged.map((entity) => [entity.id, entity]));
		let maxUpdatedAt = since;
		const resolved: T[] = [];
		for (const row of rows) {
			if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
			const remote = row.data as unknown as T;
			const localEntity = byId.get(remote.id);
			if (row.deleted_at) {
				// Owner deleted it out from under us — detach rather than remove,
				// so whatever we have (including our own edits/checkmarks)
				// survives as an ordinary private local entity. Nothing to do if
				// we never had it.
				if (!localEntity) continue;
				resolved.push({ ...localEntity, sharedAt: null });
				continue;
			}
			resolved.push(
				localEntity
					? merge(localEntity, remote)
					: {
							...remote,
							sharedAt: remote.sharedAt ?? new Date().toISOString(),
						},
			);
		}
		merged = upsert(merged, resolved);
		setWatermark(table, maxUpdatedAt);
	}

	try {
		const stamped = merged.map((entity) => stampForSync(entity, deviceId));
		if (stamped.some((entity, index) => entity !== merged[index])) {
			merged = upsert(merged, stamped);
		}
		// Excludes a detached entity (sharedAt null, ownerDeviceId still set —
		// see stampForSync above) from the push entirely, not just from
		// re-stamping: once the owner has tombstoned it, this device has no
		// business uploading its own copy of it ever again.
		const toPush = stamped.filter((entity) => entity.sharedAt != null);
		await pushEntities(table, toPush);
	} catch (error) {
		console.error(`Sync push failed for ${table}:`, error);
	}

	return merged;
}

// No-ops entirely (returns null) if this device has no identity yet — a
// solo user who never starts syncing never gets a row in Supabase, matching
// the identity layer's own lazy-registration philosophy (see
// src/lib/identity/device.ts). Once an identity exists, everything syncs —
// see stampForSync above.
export async function runSync(): Promise<SyncResult | null> {
	const identity = getDeviceIdentity();
	if (!identity) return null;

	const [recipes, groceryLists, mealPlans] = await Promise.all([
		syncTable(
			"recipes",
			loadRecipes,
			upsertRecipes,
			mergeRecipe,
			identity.deviceId,
		),
		syncTable(
			"grocery_lists",
			loadGroceryLists,
			upsertGroceryLists,
			mergeGroceryList,
			identity.deviceId,
		),
		syncTable(
			"meal_plans",
			loadMealPlans,
			upsertMealPlans,
			mergeMealPlan,
			identity.deviceId,
		),
	]);

	return { recipes, groceryLists, mealPlans };
}
