import { createClient } from "@supabase/supabase-js";
import type { Database } from "#/lib/supabase/database.types";

// Server-only: the service role key must never reach the client bundle.
// Only imported (transitively) from src/server/identity.ts's server
// functions -- see CLAUDE.md's "Account-less identity layer". Every export
// here is a small named operation (never the raw query builder) so
// src/lib/identity/registry.ts stays trivially mockable in tests, the same
// seam pattern as src/lib/ai/client.ts's chatCompletion.

let cachedClient: ReturnType<typeof createClient<Database>> | null = null;

function getClient() {
	if (cachedClient) return cachedClient;
	const url = import.meta.env.VITE_SUPABASE_URL;
	const secretKey = process.env.SUPABASE_SECRET_KEY;
	if (!url || !secretKey) {
		throw new Error(
			"Missing VITE_SUPABASE_URL / SUPABASE_SECRET_KEY -- see CLAUDE.md's Environment / secrets section.",
		);
	}
	cachedClient = createClient<Database>(url, secretKey, {
		auth: { persistSession: false },
	});
	return cachedClient;
}

export async function insertUser(): Promise<{ id: string }> {
	const { data, error } = await getClient()
		.from("users")
		.insert({})
		.select("id")
		.single();
	if (error || !data) {
		throw new Error(error?.message ?? "Failed to create user");
	}
	return { id: data.id };
}

export async function insertDevice(
	userId: string,
	secretHash: string,
): Promise<{ id: string }> {
	const { data, error } = await getClient()
		.from("devices")
		.insert({ user_id: userId, secret_hash: secretHash })
		.select("id")
		.single();
	if (error || !data) {
		throw new Error(error?.message ?? "Failed to create device");
	}
	return { id: data.id };
}

export async function findDeviceById(
	deviceId: string,
): Promise<{ userId: string; secretHash: string } | null> {
	const { data, error } = await getClient()
		.from("devices")
		.select("user_id,secret_hash")
		.eq("id", deviceId)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? { userId: data.user_id, secretHash: data.secret_hash } : null;
}

export async function touchDeviceLastSeen(deviceId: string): Promise<void> {
	const { error } = await getClient()
		.from("devices")
		.update({ last_seen_at: new Date().toISOString() })
		.eq("id", deviceId);
	if (error) throw new Error(error.message);
}

export async function insertPairingCode(
	userId: string,
	codeHash: string,
	expiresAt: string,
): Promise<void> {
	const { error } = await getClient()
		.from("pairing_codes")
		.insert({ user_id: userId, code_hash: codeHash, expires_at: expiresAt });
	if (error) throw new Error(error.message);
}

// Atomically claims an unused, unexpired pairing code by marking it used --
// the conditional update (`is used_at null`, `gt expires_at now`) is a
// single statement at the database, so two simultaneous redeem attempts for
// the same code can't both succeed.
export async function claimPairingCode(
	codeHash: string,
): Promise<{ userId: string } | null> {
	const nowIso = new Date().toISOString();
	const { data, error } = await getClient()
		.from("pairing_codes")
		.update({ used_at: nowIso })
		.eq("code_hash", codeHash)
		.is("used_at", null)
		.gt("expires_at", nowIso)
		.select("user_id")
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? { userId: data.user_id } : null;
}
