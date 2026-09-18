import {
	loadSigningKeyFromEnv,
	signDeviceAccessToken,
} from "#/lib/identity/jwt";
import {
	constantTimeEqual,
	generateDeviceSecret,
	generatePairingCode,
	hashToken,
} from "#/lib/identity/secret";
import {
	claimPairingCode,
	findDeviceById,
	insertDevice,
	insertPairingCode,
	insertUser,
	touchDeviceLastSeen,
} from "#/lib/supabase/admin";

// Server-only core logic behind src/server/identity.ts's server functions --
// see CLAUDE.md's "Account-less identity layer".

const PAIRING_CODE_TTL_SECONDS = 10 * 60;
const ACCESS_TOKEN_TTL_SECONDS = 60 * 60;

export type DeviceCredentials = {
	userId: string;
	deviceId: string;
	deviceSecret: string;
};

// Creates a brand-new identity (one userId) and its first device. Called
// lazily the first time a device needs one -- never on every install, see
// src/lib/identity/device.ts.
export async function registerDevice(): Promise<DeviceCredentials> {
	const user = await insertUser();
	const deviceSecret = generateDeviceSecret();
	const device = await insertDevice(user.id, await hashToken(deviceSecret));
	return { userId: user.id, deviceId: device.id, deviceSecret };
}

async function authenticateDevice(
	deviceId: string,
	deviceSecret: string,
): Promise<string> {
	const device = await findDeviceById(deviceId);
	if (
		!device ||
		!constantTimeEqual(device.secretHash, await hashToken(deviceSecret))
	) {
		throw new Error("Invalid device credentials");
	}
	return device.userId;
}

export async function mintAccessToken(input: {
	deviceId: string;
	deviceSecret: string;
}): Promise<{ accessToken: string; expiresAt: number }> {
	const userId = await authenticateDevice(input.deviceId, input.deviceSecret);
	await touchDeviceLastSeen(input.deviceId);
	const { token, expiresAt } = await signDeviceAccessToken({
		userId,
		signingKey: loadSigningKeyFromEnv(),
		ttlSeconds: ACCESS_TOKEN_TTL_SECONDS,
	});
	return { accessToken: token, expiresAt };
}

export async function createPairingCode(input: {
	deviceId: string;
	deviceSecret: string;
}): Promise<{ code: string; expiresAt: string }> {
	const userId = await authenticateDevice(input.deviceId, input.deviceSecret);
	const code = generatePairingCode();
	const expiresAt = new Date(
		Date.now() + PAIRING_CODE_TTL_SECONDS * 1000,
	).toISOString();
	await insertPairingCode(userId, await hashToken(code), expiresAt);
	return { code, expiresAt };
}

// Redeems a pairing code minted by an existing device, creating a new
// device row (its own independently-revocable secret) under that same
// userId -- see CLAUDE.md's "Account-less identity layer" for why this is
// a brand-new device credential rather than a cloned session.
export async function redeemPairingCode(input: {
	code: string;
}): Promise<DeviceCredentials> {
	const claim = await claimPairingCode(await hashToken(input.code));
	if (!claim) throw new Error("Invalid or expired pairing code");
	const deviceSecret = generateDeviceSecret();
	const device = await insertDevice(
		claim.userId,
		await hashToken(deviceSecret),
	);
	return { userId: claim.userId, deviceId: device.id, deviceSecret };
}
