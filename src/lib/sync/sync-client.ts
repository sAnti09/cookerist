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

// Soft-deletes a row this device owns (see src/lib/sync/ownership.ts) — RLS
// still requires owner_id = auth.uid(), so this only ever succeeds for a row
// actually owned by this device's account; deliberately not conditioned on
// ownerDeviceId here (that's a client-side concept the DB doesn't know
// about) since the caller (app-data-context.tsx) already gates on
// isOwnedByThisDevice before ever calling this.
export async function pushTombstone(
	table: SyncTable,
	id: string,
): Promise<void> {
	const { error } = await supabase
		.from(table)
		.update({ deleted_at: new Date().toISOString() })
		.eq("id", id);
	if (error) throw error;
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
