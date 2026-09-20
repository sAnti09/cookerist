import { createClient } from "@supabase/supabase-js";
import type { Database } from "#/lib/supabase/database.types";
import type { SyncTable } from "#/lib/sync/sync-client";

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

// Backs the authorization check in resource-share-registry.ts's
// createResourceShareCode -- this runs under the service role (bypasses
// RLS entirely), so verifying the caller actually owns the resource before
// minting a code is the only thing standing in for RLS here.
export async function findResourceOwner(
	table: SyncTable,
	id: string,
): Promise<{ ownerId: string } | null> {
	const { data, error } = await getClient()
		.from(table)
		.select("owner_id")
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? { ownerId: data.owner_id } : null;
}

export async function insertResourceShareCode(
	ownerId: string,
	table: SyncTable,
	id: string,
	codeHash: string,
	expiresAt: string,
): Promise<void> {
	const { error } = await getClient().from("resource_share_codes").insert({
		owner_id: ownerId,
		resource_table: table,
		resource_id: id,
		code_hash: codeHash,
		expires_at: expiresAt,
	});
	if (error) throw new Error(error.message);
}

// Same atomic-claim pattern as claimPairingCode, but also hands back which
// resource the code pointed to so the caller can grant access to it.
export async function claimResourceShareCode(codeHash: string): Promise<{
	ownerId: string;
	resourceTable: SyncTable;
	resourceId: string;
} | null> {
	const nowIso = new Date().toISOString();
	const { data, error } = await getClient()
		.from("resource_share_codes")
		.update({ used_at: nowIso })
		.eq("code_hash", codeHash)
		.is("used_at", null)
		.gt("expires_at", nowIso)
		.select("owner_id, resource_table, resource_id")
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data
		? {
				ownerId: data.owner_id,
				resourceTable: data.resource_table as SyncTable,
				resourceId: data.resource_id,
			}
		: null;
}

// Like findResourceOwner, but also hands back the row's own `data` jsonb —
// used by resource-share-registry.ts's referencedResources to discover which
// recipes/grocery-list a grocery-list/meal-plan share needs to cascade into
// (see CLAUDE.md's "Per-resource sharing" section: a grant on the parent
// resource alone leaves everything it references unreadable, since those are
// bare id references with no embedded content).
export async function findResourceRow(
	table: SyncTable,
	id: string,
): Promise<{ ownerId: string; data: unknown } | null> {
	const { data, error } = await getClient()
		.from(table)
		.select("owner_id, data")
		.eq("id", id)
		.maybeSingle();
	if (error) throw new Error(error.message);
	return data ? { ownerId: data.owner_id, data: data.data } : null;
}

// Every account this resource has already been granted to (by this owner) —
// used to re-derive cascaded grants (e.g. a new recipe added to an
// already-shared grocery list) without needing a fresh share-code redemption.
export async function listResourceShareGrantees(
	table: SyncTable,
	id: string,
	ownerId: string,
): Promise<string[]> {
	const { data, error } = await getClient()
		.from("resource_shares")
		.select("grantee_id")
		.eq("resource_table", table)
		.eq("resource_id", id)
		.eq("owner_id", ownerId);
	if (error) throw new Error(error.message);
	return (data ?? []).map((row) => row.grantee_id);
}

// Idempotent: redeeming a second code for a resource this account was
// already granted just no-ops instead of erroring (the unique constraint
// on (resource_table, resource_id, grantee_id) would otherwise conflict).
export async function insertResourceShare(
	table: SyncTable,
	id: string,
	ownerId: string,
	granteeId: string,
): Promise<void> {
	const { error } = await getClient().from("resource_shares").upsert(
		{
			resource_table: table,
			resource_id: id,
			owner_id: ownerId,
			grantee_id: granteeId,
		},
		{
			onConflict: "resource_table,resource_id,grantee_id",
			ignoreDuplicates: true,
		},
	);
	if (error) throw new Error(error.message);
}
