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
		// Excludes a detached entity (sharedAt null, ownerDeviceId still set —
		// see stampForSync above) from the push entirely, not just from
		// re-stamping: once the owner has tombstoned it, this device has no
		// business uploading its own copy of it ever again. Of the remaining
		// shared entities, only pushes ones that changed locally since the
		// last successful push (`updatedAt` past the push watermark) — without
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
					mergeRecipe,
					identity.deviceId,
				)
			: undefined,
		wanted.has("grocery_lists")
			? syncTable(
					"grocery_lists",
					loadGroceryLists,
					upsertGroceryLists,
					mergeGroceryList,
					identity.deviceId,
				)
			: undefined,
		wanted.has("meal_plans")
			? syncTable(
					"meal_plans",
					loadMealPlans,
					upsertMealPlans,
					mergeMealPlan,
					identity.deviceId,
				)
			: undefined,
	]);

	return { recipes, groceryLists, mealPlans };
}
