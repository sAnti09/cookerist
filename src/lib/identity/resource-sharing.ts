import { ensureDeviceIdentity, getDeviceIdentity } from "#/lib/identity/device";
import type { SyncTable } from "#/lib/sync/sync-client";
import {
	cascadeResourceShares,
	createResourceShareCode,
	redeemResourceShareCode,
} from "#/server/resource-sharing";

// Client-side half of per-resource sharing -- mirrors device.ts's
// createPairingCodeForThisDevice/linkDeviceWithPairingCode. Both lazily
// create this device's identity if it doesn't have one yet (sharing
// something, or redeeming a share, are exactly the "needs an identity"
// moments ensureDeviceIdentity exists for).

export async function createShareCodeForResource(
	table: SyncTable,
	id: string,
): Promise<{ code: string; expiresAt: string }> {
	const identity = await ensureDeviceIdentity();
	return createResourceShareCode({
		data: {
			deviceId: identity.deviceId,
			deviceSecret: identity.deviceSecret,
			table,
			id,
		},
	});
}

export async function redeemShareCode(
	code: string,
): Promise<{ resourceTable: SyncTable; resourceId: string }> {
	const identity = await ensureDeviceIdentity();
	return redeemResourceShareCode({
		data: {
			deviceId: identity.deviceId,
			deviceSecret: identity.deviceSecret,
			code,
		},
	});
}

// Re-derives any cascaded grants a shared grocery list/meal plan should now
// have (see resource-share-registry.ts's cascadeResourceSharesForOwner) --
// called opportunistically by sync-engine.ts after this device pushes an
// update to a grocery list/meal plan it owns. A no-op (returns immediately,
// no request sent) if this device has no identity yet -- nothing it could
// own would be shared in that case.
export async function cascadeSharesForResource(
	table: SyncTable,
	id: string,
): Promise<void> {
	const identity = getDeviceIdentity();
	if (!identity) return;
	await cascadeResourceShares({
		data: {
			deviceId: identity.deviceId,
			deviceSecret: identity.deviceSecret,
			table,
			id,
		},
	});
}
