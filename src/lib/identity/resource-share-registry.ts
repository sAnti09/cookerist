import { authenticateDevice } from "#/lib/identity/registry";
import { generatePairingCode, hashToken } from "#/lib/identity/secret";
import {
	claimResourceShareCode,
	findResourceOwner,
	findResourceRow,
	insertResourceShare,
	insertResourceShareCode,
	listResourceShareGrantees,
} from "#/lib/supabase/admin";
import type { SyncTable } from "#/lib/sync/sync-client";

// Server-only core logic behind src/server/resource-sharing.ts's server
// functions -- sharing one recipe/grocery-list/meal-plan with a different
// account, distinct from device pairing (src/lib/identity/registry.ts),
// which shares a whole account across its own devices. See CLAUDE.md's
// "Per-resource sharing" roadmap item.

const SHARE_CODE_TTL_SECONDS = 10 * 60;

type ResourceRef = { table: SyncTable; id: string };

function dedupeRefs(refs: ResourceRef[]): ResourceRef[] {
	const seen = new Map<string, ResourceRef>();
	for (const ref of refs) seen.set(`${ref.table}:${ref.id}`, ref);
	return Array.from(seen.values());
}

// A grocery list's recipes, or a meal plan's recipes plus (transitively) its
// linked grocery list's own recipes -- the id-only references a grocery-list
// or meal-plan row carries (GroceryList.recipeIds, MealPlanEntry.recipeId,
// MealPlan.groceryListId; see grocery-list.ts/meal-plan.ts) with zero
// embedded recipe content anywhere, client-side or in Supabase's `data`
// jsonb. Granting access to the parent row alone leaves every one of these
// unreadable -- this is the missing piece. A recipe has nothing to cascade
// into, so it always returns [].
async function referencedResources(
	table: SyncTable,
	id: string,
): Promise<ResourceRef[]> {
	if (table === "recipes") return [];
	const row = await findResourceRow(table, id);
	if (!row) return [];
	const data = row.data as Record<string, unknown>;
	const refs: ResourceRef[] = [];
	if (table === "grocery_lists") {
		const recipeIds = Array.isArray(data.recipeIds) ? data.recipeIds : [];
		for (const recipeId of recipeIds) {
			if (typeof recipeId === "string")
				refs.push({ table: "recipes", id: recipeId });
		}
	} else {
		const entries = Array.isArray(data.entries) ? data.entries : [];
		for (const entry of entries) {
			const recipeId = (entry as { recipeId?: unknown } | null)?.recipeId;
			if (typeof recipeId === "string")
				refs.push({ table: "recipes", id: recipeId });
		}
		const groceryListId = data.groceryListId;
		if (typeof groceryListId === "string") {
			refs.push({ table: "grocery_lists", id: groceryListId });
			refs.push(...(await referencedResources("grocery_lists", groceryListId)));
		}
	}
	return dedupeRefs(refs);
}

// Grants `granteeId` access to everything `table`/`id` references (see
// referencedResources above), alongside the resource itself -- the caller
// has already verified ownership and granted the primary resource.
// insertResourceShare is its own idempotent upsert, so calling this again
// for an already-cascaded grantee is a cheap no-op, not an error.
async function cascadeGrants(
	table: SyncTable,
	id: string,
	ownerId: string,
	granteeId: string,
): Promise<void> {
	const refs = await referencedResources(table, id);
	for (const ref of refs) {
		await insertResourceShare(ref.table, ref.id, ownerId, granteeId);
	}
}

// Mints a single-use, resource-scoped code -- but only for a resource the
// calling device's account actually owns. This is the real authorization
// check: it runs under the service role (src/lib/supabase/admin.ts bypasses
// RLS entirely), so nothing else would stop a device from minting a code
// for someone else's resource otherwise.
export async function createResourceShareCode(input: {
	deviceId: string;
	deviceSecret: string;
	table: SyncTable;
	id: string;
}): Promise<{ code: string; expiresAt: string }> {
	const userId = await authenticateDevice(input.deviceId, input.deviceSecret);
	const owner = await findResourceOwner(input.table, input.id);
	if (!owner || owner.ownerId !== userId) {
		throw new Error("You don't own this resource");
	}
	const code = generatePairingCode();
	const expiresAt = new Date(
		Date.now() + SHARE_CODE_TTL_SECONDS * 1000,
	).toISOString();
	await insertResourceShareCode(
		userId,
		input.table,
		input.id,
		await hashToken(code),
		expiresAt,
	);
	return { code, expiresAt };
}

// Redeems a code minted by createResourceShareCode above, granting the
// calling device's account access to that one resource (see
// src/lib/sync/sync-client.ts / sync-engine.ts for how that grant then
// actually surfaces the resource locally). Never lets an owner redeem their
// own code -- there'd be nothing to grant, and it would otherwise silently
// "succeed" while doing nothing useful.
export async function redeemResourceShareCode(input: {
	deviceId: string;
	deviceSecret: string;
	code: string;
}): Promise<{ resourceTable: SyncTable; resourceId: string }> {
	const userId = await authenticateDevice(input.deviceId, input.deviceSecret);
	const claim = await claimResourceShareCode(await hashToken(input.code));
	if (!claim) throw new Error("Invalid or expired share code");
	if (claim.ownerId === userId) {
		throw new Error("You can't redeem your own share code");
	}
	await insertResourceShare(
		claim.resourceTable,
		claim.resourceId,
		claim.ownerId,
		userId,
	);
	// Also grant every recipe (and, for a meal plan, its linked grocery list
	// and that list's recipes) the redeemed resource references -- see
	// referencedResources above. The recipient's next sync picks these up via
	// sync-engine.ts's grant reconciliation (pullGrantedResourceIds), which
	// doesn't depend on the watermark the way a normal pull does, so an
	// already-existing, untouched recipe still surfaces even though its own
	// `updated_at` predates the recipient's watermark.
	await cascadeGrants(
		claim.resourceTable,
		claim.resourceId,
		claim.ownerId,
		userId,
	);
	return { resourceTable: claim.resourceTable, resourceId: claim.resourceId };
}

// Re-derives and mints any cascaded grants that should exist for a resource
// this device's account owns but don't yet -- e.g. the owner added a new
// recipe to an already-shared grocery list after the original share code was
// redeemed. Called opportunistically after every push of a grocery
// list/meal plan this device owns (see sync-engine.ts) -- cheap and a no-op
// for the common case of a resource nobody has ever redeemed a share code
// for (no existing grantees, so nothing to cascade to).
export async function cascadeResourceSharesForOwner(input: {
	deviceId: string;
	deviceSecret: string;
	table: SyncTable;
	id: string;
}): Promise<void> {
	const userId = await authenticateDevice(input.deviceId, input.deviceSecret);
	const owner = await findResourceOwner(input.table, input.id);
	if (!owner || owner.ownerId !== userId) return;
	const grantees = await listResourceShareGrantees(
		input.table,
		input.id,
		userId,
	);
	for (const granteeId of grantees) {
		await cascadeGrants(input.table, input.id, userId, granteeId);
	}
}
