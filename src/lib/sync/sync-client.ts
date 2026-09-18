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
	updated_at: string;
	deleted_at: string | null;
};

// Upserts every row at once under this device's account (owner_id) — a
// no-op if this device has no identity yet or there's nothing to push, so a
// solo/never-shared user's data never touches Supabase (see
// CLAUDE.md's "Sharing feature" roadmap item).
export async function pushEntities(
	table: SyncTable,
	rows: Array<{ id: string }>,
): Promise<void> {
	const identity = getDeviceIdentity();
	if (!identity || rows.length === 0) return;
	const { error } = await supabase.from(table).upsert(
		rows.map((row) => ({
			id: row.id,
			owner_id: identity.userId,
			data: row as unknown as Json,
		})),
	);
	if (error) throw error;
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
		.select("id, data, updated_at, deleted_at")
		.gt("updated_at", sinceIso);
	if (error) throw error;
	return data ?? [];
}
