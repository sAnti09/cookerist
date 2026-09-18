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

type Syncable = { id: string; updatedAt: string; sharedAt: string | null };

// Pushes every currently-shared entity, then pulls+merges everything changed
// since the last successful pull, re-reading local state right before both
// steps rather than trusting a snapshot passed in from the caller — sync
// does real network I/O, so a local edit could otherwise land in the gap and
// get clobbered by a stale write-back. Push/pull failures are logged and
// swallowed per table (never thrown) so one table's outage doesn't block the
// other two or crash whatever kicked off the sync (see app-data-context.tsx,
// which fires this without awaiting it).
async function syncTable<T extends Syncable>(
	table: SyncTable,
	load: () => T[],
	upsert: (current: T[], incoming: T[]) => T[],
	merge: (local: T, remote: T) => T,
): Promise<T[]> {
	try {
		const shared = load().filter((entity) => entity.sharedAt != null);
		await pushEntities(table, shared);
	} catch (error) {
		console.error(`Sync push failed for ${table}:`, error);
	}

	const since = getWatermark(table);
	let rows: SyncRow[];
	try {
		rows = await pullChangedSince(table, since);
	} catch (error) {
		console.error(`Sync pull failed for ${table}:`, error);
		return load();
	}
	if (rows.length === 0) return load();

	const fresh = load();
	const byId = new Map(fresh.map((entity) => [entity.id, entity]));
	let maxUpdatedAt = since;
	const resolved: T[] = [];
	for (const row of rows) {
		if (row.updated_at > maxUpdatedAt) maxUpdatedAt = row.updated_at;
		const remote = row.data as unknown as T;
		const localEntity = byId.get(remote.id);
		if (row.deleted_at) {
			// Owner deleted it out from under us — detach rather than remove, so
			// whatever we have (including our own edits/checkmarks) survives as
			// an ordinary private local entity. Nothing to do if we never had it.
			if (!localEntity) continue;
			resolved.push({ ...localEntity, sharedAt: null });
			continue;
		}
		resolved.push(
			localEntity
				? merge(localEntity, remote)
				: { ...remote, sharedAt: remote.sharedAt ?? new Date().toISOString() },
		);
	}

	const next = upsert(fresh, resolved);
	setWatermark(table, maxUpdatedAt);
	return next;
}

// No-ops entirely (returns null) if this device has no identity yet —
// nothing has ever been shared, so there's nothing in Supabase to sync,
// matching the identity layer's own lazy-registration philosophy (see
// src/lib/identity/device.ts).
export async function runSync(): Promise<SyncResult | null> {
	if (!getDeviceIdentity()) return null;

	const [recipes, groceryLists, mealPlans] = await Promise.all([
		syncTable("recipes", loadRecipes, upsertRecipes, mergeRecipe),
		syncTable(
			"grocery_lists",
			loadGroceryLists,
			upsertGroceryLists,
			mergeGroceryList,
		),
		syncTable("meal_plans", loadMealPlans, upsertMealPlans, mergeMealPlan),
	]);

	return { recipes, groceryLists, mealPlans };
}
