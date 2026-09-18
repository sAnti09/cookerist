import type { GroceryList } from "#/lib/grocery-list";
import { upsertGroceryLists } from "#/lib/grocery-storage";
import { ensureDeviceIdentity } from "#/lib/identity/device";
import type { MealPlan } from "#/lib/meal-plan";
import { upsertMealPlans } from "#/lib/meal-plan-storage";
import type { Recipe } from "#/lib/recipe";
import { upsertRecipes } from "#/lib/recipes-storage";
import {
	resolveGroceryListShare,
	resolveMealPlanShare,
	resolveRecipeShare,
	type ShareCascade,
} from "#/lib/sync/sync-cascade";
import { pushEntities } from "#/lib/sync/sync-client";
import { runSync } from "#/lib/sync/sync-engine";

// The "Share" action for a recipe/grocery-list/meal-plan, and the bulk
// version pairing a second device runs (see CLAUDE.md's "Sharing feature"
// roadmap item). Everything here operates on the caller's full in-memory
// arrays and returns updated ones — app-data-context.tsx just does
// `setRecipes(result.recipes)` etc. after each call, same shape as
// sync-engine.ts's SyncResult.
export type LocalData = {
	recipes: Recipe[];
	groceryLists: GroceryList[];
	mealPlans: MealPlan[];
};

type Stampable = { sharedAt: string | null; ownerDeviceId?: string };

// Only claims ownership/a shared timestamp the first time — an entity
// already shared (or already owned by some other device, e.g. one dragged
// into this cascade that a *different* device originally shared) keeps what
// it has. See src/lib/sync/ownership.ts for how ownerDeviceId is used later.
function stamp<T extends Stampable>(
	entity: T,
	deviceId: string,
	now: string,
): T {
	return {
		...entity,
		sharedAt: entity.sharedAt ?? now,
		ownerDeviceId: entity.ownerDeviceId ?? deviceId,
	};
}

async function stampAndPush(
	cascade: ShareCascade,
	deviceId: string,
): Promise<ShareCascade> {
	const now = new Date().toISOString();
	const stamped: ShareCascade = {
		recipes: cascade.recipes.map((recipe) => stamp(recipe, deviceId, now)),
		groceryLists: cascade.groceryLists.map((list) =>
			stamp(list, deviceId, now),
		),
		mealPlans: cascade.mealPlans.map((plan) => stamp(plan, deviceId, now)),
	};
	await Promise.all([
		pushEntities("recipes", stamped.recipes),
		pushEntities("grocery_lists", stamped.groceryLists),
		pushEntities("meal_plans", stamped.mealPlans),
	]);
	return stamped;
}

// Writes a resolved cascade into local storage (each upsertX call persists
// as it goes — see recipes-storage.ts/grocery-storage.ts/meal-plan-storage.ts)
// and returns the updated in-memory arrays.
function applyCascade(local: LocalData, cascade: ShareCascade): LocalData {
	return {
		recipes:
			cascade.recipes.length > 0
				? upsertRecipes(local.recipes, cascade.recipes)
				: local.recipes,
		groceryLists:
			cascade.groceryLists.length > 0
				? upsertGroceryLists(local.groceryLists, cascade.groceryLists)
				: local.groceryLists,
		mealPlans:
			cascade.mealPlans.length > 0
				? upsertMealPlans(local.mealPlans, cascade.mealPlans)
				: local.mealPlans,
	};
}

export async function shareRecipe(
	local: LocalData,
	recipeId: string,
): Promise<LocalData> {
	const recipe = local.recipes.find((r) => r.id === recipeId);
	if (!recipe) return local;
	const identity = await ensureDeviceIdentity();
	const cascade = await stampAndPush(
		resolveRecipeShare(recipe),
		identity.deviceId,
	);
	return applyCascade(local, cascade);
}

export async function shareGroceryList(
	local: LocalData,
	listId: string,
): Promise<LocalData> {
	const list = local.groceryLists.find((l) => l.id === listId);
	if (!list) return local;
	const identity = await ensureDeviceIdentity();
	const recipeById = new Map(
		local.recipes.map((recipe) => [recipe.id, recipe]),
	);
	const cascade = await stampAndPush(
		resolveGroceryListShare(list, recipeById),
		identity.deviceId,
	);
	return applyCascade(local, cascade);
}

export async function shareMealPlan(
	local: LocalData,
	planId: string,
): Promise<LocalData> {
	const plan = local.mealPlans.find((p) => p.id === planId);
	if (!plan) return local;
	const identity = await ensureDeviceIdentity();
	const recipeById = new Map(
		local.recipes.map((recipe) => [recipe.id, recipe]),
	);
	const groceryListById = new Map(
		local.groceryLists.map((list) => [list.id, list]),
	);
	const cascade = await stampAndPush(
		resolveMealPlanShare(plan, recipeById, groceryListById),
		identity.deviceId,
	);
	return applyCascade(local, cascade);
}

// Run once, right after linking this device to an existing account (see
// src/lib/identity/device.ts's linkDeviceWithPairingCode) — marks every
// local entity as shared (claiming ownership for whatever doesn't already
// have one) and pushes it, then runs a full sync so anything already shared
// under that account comes down too. This is the "reuses this feature's
// merge logic when the other device is your own" behavior from CLAUDE.md's
// roadmap: a device that already had local data before pairing doesn't lose
// it, it unions into the account via the exact same push/pull/merge path as
// any other sync-on-open.
export async function shareAllLocalData(local: LocalData): Promise<LocalData> {
	const identity = await ensureDeviceIdentity();
	const cascade = await stampAndPush(
		{
			recipes: local.recipes,
			groceryLists: local.groceryLists,
			mealPlans: local.mealPlans,
		},
		identity.deviceId,
	);
	const merged = applyCascade(local, cascade);
	const result = await runSync();
	return result ?? merged;
}
