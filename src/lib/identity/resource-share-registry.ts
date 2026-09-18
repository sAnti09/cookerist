import { authenticateDevice } from "#/lib/identity/registry";
import { generatePairingCode, hashToken } from "#/lib/identity/secret";
import {
	claimResourceShareCode,
	findResourceOwner,
	insertResourceShare,
	insertResourceShareCode,
} from "#/lib/supabase/admin";
import type { SyncTable } from "#/lib/sync/sync-client";

// Server-only core logic behind src/server/resource-sharing.ts's server
// functions -- sharing one recipe/grocery-list/meal-plan with a different
// account, distinct from device pairing (src/lib/identity/registry.ts),
// which shares a whole account across its own devices. See CLAUDE.md's
// "Per-resource sharing" roadmap item.

const SHARE_CODE_TTL_SECONDS = 10 * 60;

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
	return { resourceTable: claim.resourceTable, resourceId: claim.resourceId };
}
