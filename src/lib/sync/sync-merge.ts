import type { GroceryList } from "#/lib/grocery-list";
import type { MealPlan } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";

// Merge rules for reconciling a local entity against the version pulled from
// Supabase during sync-on-open (see sync-engine.ts) — every local entity
// syncs once a device has an identity, so this runs for any recipe/list/plan
// that exists on more than one paired device, not just ones explicitly
// shared. Deliberately no CRDT machinery: every entity here is plain
// whole-record last-write-wins.
//
// Grocery lists and meal plans both used to merge their children (items /
// entries) by id instead — checking an item off is additive/idempotent in a
// way a whole-record LWW would risk clobbering, and a grocery list in
// particular has a real concurrent "both people in the store" use case (see
// CLAUDE.md's "Sharing feature" roadmap item) that per-item merging was
// meant to preserve. In practice it produced a steady stream of bugs, all
// tracing back to the same root cause: a plain array/OR-based union has no
// way to represent "deliberately changed to X" versus "hasn't synced yet" —
// an id churning across a rebuild looked like a duplicate; a removed
// entry/item resurrected from a stale remote copy; an unchecked item got
// checked again by a stale remote OR. Each fix (id stability,
// removedEntryIds/removedItemIds tombstones, per-item checkedAt) patched one
// symptom without addressing that the underlying model doesn't fit how this
// data actually gets edited. Whole-record LWW is a deliberate trade of that
// concurrent-editing nicety for reliability: a concurrent edit to a
// different part of the same list/plan from another device, made before
// syncing, is now fully discarded rather than merged — worth it given how
// much more this per-item merging cost to get right than it delivered.

export function mergeRecipe(local: Recipe, remote: Recipe): Recipe {
	return remote.updatedAt > local.updatedAt ? remote : local;
}

export function mergeGroceryList(
	local: GroceryList,
	remote: GroceryList,
): GroceryList {
	return remote.updatedAt > local.updatedAt ? remote : local;
}

export function mergeMealPlan(local: MealPlan, remote: MealPlan): MealPlan {
	return remote.updatedAt > local.updatedAt ? remote : local;
}
