import type { GroceryList } from "#/lib/grocery-list";
import {
	loadGroceryLists,
	removeGroceryLists,
	upsertGroceryLists,
} from "#/lib/grocery-storage";
import { getDeviceIdentity } from "#/lib/identity/device";
import type { MealPlan } from "#/lib/meal-plan";
import {
	loadMealPlans,
	removeMealPlans,
	upsertMealPlans,
} from "#/lib/meal-plan-storage";
import type { Recipe } from "#/lib/recipe";
import {
	loadRecipes,
	removeRecipes,
	upsertRecipes,
} from "#/lib/recipes-storage";
import {
	getPendingTombstones,
	removePendingTombstone,
} from "#/lib/sync/pending-tombstones";
import {
	pullChangedSince,
	pushEntities,
	pushTombstone,
	type SyncRow,
	type SyncTable,
} from "#/lib/sync/sync-client";
import {
	mergeGroceryList,
	mergeMealPlan,
	mergeRecipe,
} from "#/lib/sync/sync-merge";
import {
	getPushWatermark,
	getWatermark,
	setPushWatermark,
	setWatermark,
} from "#/lib/sync/sync-watermark";

// A caller that only cares about one entity type (e.g. an edit to a single
// recipe) can ask for just that table — see runSync below. A table that
// wasn't asked for is simply absent from the result, not reset to empty, so
// callers must only apply the fields that are actually present.
export type SyncResult = {
	recipes?: Recipe[];
	groceryLists?: GroceryList[];
	mealPlans?: MealPlan[];
};

const ALL_TABLES: SyncTable[] = ["recipes", "grocery_lists", "meal_plans"];

type Syncable = {
	id: string;
	updatedAt: string;
	sharedAt: string | null;
};

// Every local entity syncs once this device has an identity — there's no
// per-entity opt-in anymore (see CLAUDE.md's "Sharing feature" section for
// why: an earlier per-item "Share" toggle plus a separate "sync everything"
// action was confusing in practice and didn't match how people actually
// think about syncing two of their own devices). Every device paired under
// the same account is a symmetric co-owner — there's no per-device
// "owner"/"leave" distinction (that was an earlier design, reverted: it
// conflated "my own second device" with "someone else's device," which are
// meant to be the same trust level here — see CLAUDE.md's Ownership section).
// `sharedAt` is the only bookkeeping field left, stamped automatically here
// the first time an entity is ever synced.
function stampForSync<T extends Syncable>(entity: T): T {
	if (entity.sharedAt != null) return entity;
	return { ...entity, sharedAt: new Date().toISOString() };
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
	remove: (current: T[], ids: string[]) => T[],
	merge: (local: T, remote: T) => T,
): Promise<T[]> {
	// Retry any delete this device couldn't confirm as landed last cycle (see
	// pending-tombstones.ts) before pulling — deliberately before, not after:
	// a retry that succeeds here means the pull just below already sees
	// deleted_at set, so the merge loop's normal removal handling covers it.
	// A retry that still fails leaves the id in `stillPending`, which the
	// merge loop consults to avoid resurrecting an entity this device already
	// removed locally just because Supabase hasn't caught up yet.
	const stillPending = new Set(getPendingTombstones(table));
	for (const id of stillPending) {
		try {
			await pushTombstone(table, id);
			removePendingTombstone(table, id);
			stillPending.delete(id);
		} catch (error) {
			console.error(
				`Retry of pending tombstone failed for ${table}/${id}:`,
				error,
			);
		}
	}

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
		// Every paired device is a symmetric co-owner (see stampForSync above)
		// — a tombstoned row means the entity is gone everywhere, not merely
		// unshared from this device, so it's dropped from `merged` below
		// rather than kept as a detached private copy.
		const deletedIds = new Set<string>();
		for (const row of rows) {
			if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
			const remote = row.data as unknown as T;
			const localEntity = byId.get(remote.id);
			if (row.deleted_at) {
				deletedIds.add(remote.id);
				continue;
			}
			// This device already deleted this entity locally and its own
			// tombstone retry above just failed again — don't let this pull
			// resurrect it before the next retry gets a chance to land.
			if (stillPending.has(remote.id)) continue;
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
		if (deletedIds.size > 0) {
			merged = remove(merged, Array.from(deletedIds));
		}
		setWatermark(table, maxUpdatedAt);
	}

	try {
		const stamped = merged.map((entity) => stampForSync(entity));
		// Entities newly stamped this cycle (first-ever share) always need
		// pushing regardless of the watermark below — stamping doesn't bump
		// `updatedAt`, so the watermark check alone would never catch them.
		const newlyStampedIds = new Set(
			stamped
				.filter((entity, index) => entity !== merged[index])
				.map((entity) => entity.id),
		);
		if (newlyStampedIds.size > 0) {
			merged = upsert(merged, stamped);
		}
		// Only pushes a shared entity that changed locally since the last
		// successful push (`updatedAt` past the push watermark) — without
		// this, every sync cycle (mount, focus, every debounced edit) would
		// re-upload the entire shared set even when nothing actually changed.
		const pushWatermark = getPushWatermark(table);
		const toPush = stamped.filter(
			(entity) =>
				entity.sharedAt != null &&
				(newlyStampedIds.has(entity.id) || entity.updatedAt > pushWatermark),
		);
		await pushEntities(table, toPush);
		// Advance the watermark to the max `updatedAt` across every currently
		// shared entity, not just the ones actually pushed this cycle — an
		// entity already below the old watermark contributes nothing new to
		// that max, and one pushed just now is now known to match Supabase.
		// Only done after a successful push; a thrown push must leave the
		// watermark alone so the next cycle retries the same entities.
		const sharedEntities = stamped.filter((entity) => entity.sharedAt != null);
		if (sharedEntities.length > 0) {
			const maxUpdatedAt = sharedEntities.reduce(
				(max, entity) => (entity.updatedAt > max ? entity.updatedAt : max),
				pushWatermark,
			);
			setPushWatermark(table, maxUpdatedAt);
		}
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
//
// `tables` defaults to all three (the "I came back to the app, catch me up
// on everything" case — mount/focus/visibilitychange in app-data-context.tsx
// use this). A caller that knows exactly what changed (e.g. the debounced
// sync after editing one recipe) can pass just that table, so editing a
// grocery list never has to also touch recipes/meal_plans — see the "why
// does opening a recipe pull grocery lists too" investigation this came
// from.
export async function runSync(
	tables: SyncTable[] = ALL_TABLES,
): Promise<SyncResult | null> {
	const identity = getDeviceIdentity();
	if (!identity) return null;

	const wanted = new Set(tables);
	const [recipes, groceryLists, mealPlans] = await Promise.all([
		wanted.has("recipes")
			? syncTable(
					"recipes",
					loadRecipes,
					upsertRecipes,
					removeRecipes,
					mergeRecipe,
				)
			: undefined,
		wanted.has("grocery_lists")
			? syncTable(
					"grocery_lists",
					loadGroceryLists,
					upsertGroceryLists,
					removeGroceryLists,
					mergeGroceryList,
				)
			: undefined,
		wanted.has("meal_plans")
			? syncTable(
					"meal_plans",
					loadMealPlans,
					upsertMealPlans,
					removeMealPlans,
					mergeMealPlan,
				)
			: undefined,
	]);

	return { recipes, groceryLists, mealPlans };
}
