import { ensureDeviceIdentity } from "#/lib/identity/device";
import type { SyncTable } from "#/lib/sync/sync-client";
import {
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
