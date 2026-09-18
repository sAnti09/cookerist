import {
	createPairingCode,
	mintAccessToken,
	redeemPairingCode,
	registerDevice,
} from "#/server/identity";

// Client-side half of the account-less identity layer -- see CLAUDE.md's
// "Account-less identity layer". Persists this device's credentials in
// localStorage and hands out short-lived access tokens for the Supabase
// client's `accessToken` option (src/lib/supabase/client.ts).

const STORAGE_KEY = "cookerist:device-identity";
// Refresh a bit before actual expiry so a request never races an
// almost-expired token.
const REFRESH_BUFFER_SECONDS = 60;

export type DeviceIdentity = {
	userId: string;
	deviceId: string;
	deviceSecret: string;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function loadIdentity(): DeviceIdentity | null {
	if (typeof window === "undefined") return null;
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY);
		return raw ? (JSON.parse(raw) as DeviceIdentity) : null;
	} catch {
		return null;
	}
}

function saveIdentity(identity: DeviceIdentity): void {
	window.localStorage.setItem(STORAGE_KEY, JSON.stringify(identity));
	cachedToken = null;
}

export function getDeviceIdentity(): DeviceIdentity | null {
	return loadIdentity();
}

// Lazily creates a brand-new identity for this device the first time one is
// needed (sharing something, or generating a pairing code) -- deliberately
// never called just from opening the app, so a solo user who never shares
// anything never gets a row in Supabase at all.
export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
	const existing = loadIdentity();
	if (existing) return existing;
	const identity = await registerDevice({ data: {} });
	saveIdentity(identity);
	return identity;
}

// The Supabase client's `accessToken` callback -- returns undefined until a
// device identity actually exists, so an unidentified device talks to
// Supabase with no user session at all (every recipes/grocery_lists/
// meal_plans RLS policy requires `to authenticated`, so this just means no
// rows are visible/writable yet, which is correct pre-sharing).
export async function getAccessToken(): Promise<string | undefined> {
	const identity = loadIdentity();
	if (!identity) return undefined;
	const nowSeconds = Math.floor(Date.now() / 1000);
	if (
		cachedToken &&
		cachedToken.expiresAt - REFRESH_BUFFER_SECONDS > nowSeconds
	) {
		return cachedToken.token;
	}
	const { accessToken, expiresAt } = await mintAccessToken({
		data: { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret },
	});
	cachedToken = { token: accessToken, expiresAt };
	return accessToken;
}

export async function createPairingCodeForThisDevice(): Promise<{
	code: string;
	expiresAt: string;
}> {
	const identity = await ensureDeviceIdentity();
	return createPairingCode({
		data: { deviceId: identity.deviceId, deviceSecret: identity.deviceSecret },
	});
}

// Links this device to an existing identity via a pairing code generated on
// another device -- overwrites any identity this device already had. Only
// a fresh, never-yet-identified device is a supported case for now;
// re-linking an already-shared device is a future concern (item 3).
export async function linkDeviceWithPairingCode(
	code: string,
): Promise<DeviceIdentity> {
	const identity = await redeemPairingCode({ data: { code } });
	saveIdentity(identity);
	return identity;
}
