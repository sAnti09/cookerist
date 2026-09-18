import type { SyncTable } from "#/lib/sync/sync-client";

// Whether a recipe/grocery-list/meal-plan is a copy shared *to* this
// device's account by someone else, rather than something this account
// owns — see CLAUDE.md's "Per-resource sharing" roadmap item. Centralized
// here so every "am I the owner" check (hiding the re-share icon, labeling
// Delete as Remove, showing the "Shared" row badge) agrees on the same
// definition instead of re-deriving it.
export function isSharedWithMe(
	entity: { ownerId: string | null },
	myUserId: string | null,
): boolean {
	return entity.ownerId != null && entity.ownerId !== myUserId;
}

// Human-readable noun for each resource type — used in the account
// drawer's redeem-result message and in the share-code text handed to the
// OS share sheet (see share-resource-dialog.tsx / share-native.ts).
export const RESOURCE_TABLE_LABEL: Record<SyncTable, string> = {
	recipes: "recipe",
	grocery_lists: "grocery list",
	meal_plans: "meal plan",
};
