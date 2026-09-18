import { getDeviceIdentity } from "#/lib/identity/device";
import { supabase } from "#/lib/supabase/client";
import type { Json } from "#/lib/supabase/database.types";

// Thin wrapper around the RLS-protected `supabase` singleton
// (src/lib/supabase/client.ts) for the three sync-eligible tables — no
// server function needed here, same "public key, RLS not secrecy" exception
// that client already documents. Only identity minting (registerDevice,
// mintAccessToken, ...) needs the service-role key.
export type SyncTable = "recipes" | "grocery_lists" | "meal_plans";

export type SyncRow = {
	id: string;
	data: Json;
	owner_id: string;
	updated_at: string;
	deleted_at: string | null;
};

// Upserts every row at once, each under its own true owner (owner_id) — a
// no-op if this device has no identity yet or there's nothing to push, so a
// solo/never-shared user's data never touches Supabase (see
// CLAUDE.md's "Sharing feature" roadmap item). `ownerId` on a row defaults
// to this device's own account only when the entity has never been synced
// before (see sync-engine.ts's stampForSync) — a resource shared to this
// account (see "Per-resource sharing") already carries the real owner's id,
// and must keep pushing under that id, never this device's own, or the
// resource's `owner_id` column would need to change, which the database's
// own prevent_owner_id_change trigger forbids regardless.
export async function pushEntities(
	table: SyncTable,
	rows: Array<{ id: string; ownerId?: string | null }>,
): Promise<void> {
	const identity = getDeviceIdentity();
	if (!identity || rows.length === 0) return;
	const { error } = await supabase.from(table).upsert(
		rows.map((row) => ({
			id: row.id,
			owner_id: row.ownerId ?? identity.userId,
			data: row as unknown as Json,
		})),
	);
	if (error) throw error;
}

// Deletes this device's own account's grant on a resource shared to it —
// see "Per-resource sharing" in CLAUDE.md. Never touches the resource row
// itself (that would need owner rights); this only ever revokes this
// account's own access, never anyone else's, never the resource for anyone
// else. Same "confirm a row was actually touched" treatment as
// pushTombstone below, and for the same reason.
export async function pushShareRevocation(
	table: SyncTable,
	id: string,
): Promise<void> {
	const identity = getDeviceIdentity();
	if (!identity) return;
	const { data, error } = await supabase
		.from("resource_shares")
		.delete()
		.eq("resource_table", table)
		.eq("resource_id", id)
		.eq("grantee_id", identity.userId)
		.select("id");
	if (error) throw error;
	if (!data || data.length === 0) {
		throw new Error(
			`Share revocation matched no grant for ${table}/${id} (already revoked, or not owned by this account)`,
		);
	}
}

// Single-row fetch used once, right after a share code is redeemed (see
// src/lib/app-data-context.tsx's redeemShareCode) — the generic
// pullChangedSince below filters by `updated_at > watermark`, which could
// permanently miss a resource that just became visible via a brand-new
// grant if its own `updated_at` happens to be older than this device's
// already-advanced watermark. Not used anywhere else in the normal sync
// cycle.
export async function pullOne(
	table: SyncTable,
	id: string,
): Promise<SyncRow | null> {
	const { data, error } = await supabase
		.from(table)
		.select("id, data, owner_id, updated_at, deleted_at")
		.eq("id", id)
		.maybeSingle();
	if (error) throw error;
	return data ?? null;
}

// Soft-deletes a row belonging to this device's account — every paired
// device under one account is a symmetric co-owner (see CLAUDE.md's
// Ownership section), so RLS's owner_id = auth.uid() check is the only
// authority check that applies; there's no per-device ownership concept on
// the client side to also gate on.
//
// Explicitly verifies a row was actually touched via `.select("id")` on the
// update: PostgREST returns `error: null` just as readily when the
// `WHERE`/RLS predicate matches zero rows (a stale device JWT, or the row
// simply hasn't reached Supabase yet via pushEntities) as when it succeeds —
// without this check, a no-op update looked identical to a real tombstone,
// so the caller happily deleted the entity locally while Supabase kept
// serving it live to every paired device forever. Throwing here instead lets
// the pending-tombstones retry loop (see sync-engine.ts) pick it back up.
export async function pushTombstone(
	table: SyncTable,
	id: string,
): Promise<void> {
	const { data, error } = await supabase
		.from(table)
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id)
		.select("id");
	if (error) throw error;
	if (!data || data.length === 0) {
		throw new Error(
			`Tombstone push matched no row for ${table}/${id} (row missing or not owned by this account)`,
		);
	}
}

// Every row (including a tombstoned one — deleted_at is part of the select,
// never filtered out) whose Postgres `updated_at` is newer than the given
// watermark. The (owner_id, updated_at) index this table already has (see
// CLAUDE.md's "Sync backend" section) makes this the cheap query it needs to
// be for "everything owned by me that changed since I last looked".
export async function pullChangedSince(
	table: SyncTable,
	sinceIso: string,
): Promise<SyncRow[]> {
	const { data, error } = await supabase
		.from(table)
		.select("id, data, owner_id, updated_at, deleted_at")
		.gt("updated_at", sinceIso);
	if (error) throw error;
	return data ?? [];
}
