import { beforeEach, describe, expect, it, vi } from "vitest";

const getDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

// upsert() is used two ways in sync-client.ts: pushEntities awaits it bare
// (no further chaining), while pushTombstone chains .select("id") off it
// before awaiting — so the mock's return value needs to be both directly
// awaitable (resolving to upsertResolvedValue) *and* expose a chainable
// .select(), same as the real supabase-js query builder.
let upsertResolvedValue: { error: unknown } = { error: null };
const upsertSelectMock = vi.fn();
const upsertMock = vi.fn(() => {
	const promise = Promise.resolve(upsertResolvedValue) as Promise<{
		error: unknown;
	}> & { select: typeof upsertSelectMock };
	promise.select = upsertSelectMock;
	return promise;
});
const gtMock = vi.fn();
// Same shape a real supabase-js query builder has: pullChangedSince chains
// .gt() off select(), pullOne chains .eq().maybeSingle() off the same
// select() call, and pullGrantedResourceIds chains .eq().eq() (resolving
// directly, no .maybeSingle()) off it too — all three need to be available
// on whatever the first .eq() call returns.
const maybeSingleMock = vi.fn();
const grantedIdsSecondEqMock = vi.fn();
const singleEqMock = vi.fn(() => ({
	maybeSingle: maybeSingleMock,
	eq: grantedIdsSecondEqMock,
}));
const selectMock = vi.fn(() => ({ gt: gtMock, eq: singleEqMock }));
// resource_shares delete chain: .delete().eq().eq().eq().select() — three
// chained eq() calls (resource_table, resource_id, grantee_id) before the
// final select() confirmation, unlike pushTombstone's single eq().
const deleteEqSelectMock = vi.fn();
const deleteEq3Mock = vi.fn(() => ({ select: deleteEqSelectMock }));
const deleteEq2Mock = vi.fn(() => ({ eq: deleteEq3Mock }));
const deleteEq1Mock = vi.fn(() => ({ eq: deleteEq2Mock }));
const deleteMock = vi.fn(() => ({ eq: deleteEq1Mock }));
const fromMock = vi.fn((_table: string) => ({
	upsert: upsertMock,
	delete: deleteMock,
	select: selectMock,
}));
vi.mock("#/lib/supabase/client", () => ({
	supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
	vi.resetModules();
	getDeviceIdentityMock.mockReset();
	upsertMock.mockClear();
	upsertResolvedValue = { error: null };
	upsertSelectMock.mockReset();
	gtMock.mockReset();
	maybeSingleMock.mockReset();
	grantedIdsSecondEqMock.mockReset();
	singleEqMock.mockClear();
	selectMock.mockClear();
	fromMock.mockClear();
	deleteEqSelectMock.mockReset();
	deleteEq3Mock.mockClear();
	deleteEq2Mock.mockClear();
	deleteEq1Mock.mockClear();
	deleteMock.mockClear();
	upsertSelectMock.mockResolvedValue({ data: [{ id: "r1" }], error: null });
	gtMock.mockResolvedValue({ data: [], error: null });
	maybeSingleMock.mockResolvedValue({ data: null, error: null });
	grantedIdsSecondEqMock.mockResolvedValue({ data: [], error: null });
	deleteEqSelectMock.mockResolvedValue({
		data: [{ id: "share-1" }],
		error: null,
	});
});

describe("pushEntities", () => {
	it("does nothing when this device has no identity", async () => {
		getDeviceIdentityMock.mockReturnValue(null);
		const { pushEntities } = await import("./sync-client");

		await pushEntities("recipes", [{ id: "r1" }]);

		expect(fromMock).not.toHaveBeenCalled();
	});

	it("does nothing when there's nothing to push", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		const { pushEntities } = await import("./sync-client");

		await pushEntities("recipes", []);

		expect(fromMock).not.toHaveBeenCalled();
	});

	it("upserts every row tagged with this device's owner_id", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		const { pushEntities } = await import("./sync-client");

		await pushEntities("recipes", [{ id: "r1" }, { id: "r2" }]);

		expect(fromMock).toHaveBeenCalledWith("recipes");
		expect(upsertMock).toHaveBeenCalledWith([
			{ id: "r1", owner_id: "u1", data: { id: "r1" } },
			{ id: "r2", owner_id: "u1", data: { id: "r2" } },
		]);
	});

	it("throws when Supabase returns an error", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		upsertResolvedValue = { error: new Error("boom") };
		const { pushEntities } = await import("./sync-client");

		await expect(pushEntities("recipes", [{ id: "r1" }])).rejects.toThrow(
			"boom",
		);
	});

	// A resource shared *to* this account (see "Per-resource sharing" in
	// CLAUDE.md) must keep pushing under its true owner's id, never this
	// device's own — the database's own prevent_owner_id_change trigger would
	// reject a mismatch anyway, but the client must not even attempt it.
	it("pushes a row carrying its own ownerId under that owner, not this device's account", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		const { pushEntities } = await import("./sync-client");

		await pushEntities("recipes", [
			{ id: "owned", ownerId: null },
			{ id: "shared-to-me", ownerId: "owner-2" },
		]);

		expect(upsertMock).toHaveBeenCalledWith([
			{ id: "owned", owner_id: "u1", data: { id: "owned", ownerId: null } },
			{
				id: "shared-to-me",
				owner_id: "owner-2",
				data: { id: "shared-to-me", ownerId: "owner-2" },
			},
		]);
	});
});

describe("pushShareRevocation", () => {
	it("does nothing when this device has no identity", async () => {
		getDeviceIdentityMock.mockReturnValue(null);
		const { pushShareRevocation } = await import("./sync-client");

		await pushShareRevocation("recipes", "r1");

		expect(fromMock).not.toHaveBeenCalled();
	});

	it("deletes only this account's own grant on the resource", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "grantee-1" });
		const { pushShareRevocation } = await import("./sync-client");

		await pushShareRevocation("recipes", "r1");

		expect(fromMock).toHaveBeenCalledWith("resource_shares");
		expect(deleteMock).toHaveBeenCalled();
		expect(deleteEq1Mock).toHaveBeenCalledWith("resource_table", "recipes");
		expect(deleteEq2Mock).toHaveBeenCalledWith("resource_id", "r1");
		expect(deleteEq3Mock).toHaveBeenCalledWith("grantee_id", "grantee-1");
		expect(deleteEqSelectMock).toHaveBeenCalledWith("id");
	});

	it("throws when Supabase returns an error", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "grantee-1" });
		deleteEqSelectMock.mockResolvedValue({
			data: null,
			error: new Error("boom"),
		});
		const { pushShareRevocation } = await import("./sync-client");

		await expect(pushShareRevocation("recipes", "r1")).rejects.toThrow("boom");
	});

	it("throws when the delete matches no grant, so a silent no-op isn't mistaken for success", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "grantee-1" });
		deleteEqSelectMock.mockResolvedValue({ data: [], error: null });
		const { pushShareRevocation } = await import("./sync-client");

		await expect(pushShareRevocation("recipes", "r1")).rejects.toThrow(
			"matched no grant",
		);
	});
});

describe("pullOne", () => {
	it("fetches a single row by id", async () => {
		maybeSingleMock.mockResolvedValue({
			data: {
				id: "r1",
				data: {},
				owner_id: "owner-1",
				updated_at: "x",
				deleted_at: null,
			},
			error: null,
		});
		const { pullOne } = await import("./sync-client");

		const row = await pullOne("recipes", "r1");

		expect(fromMock).toHaveBeenCalledWith("recipes");
		expect(singleEqMock).toHaveBeenCalledWith("id", "r1");
		expect(row?.owner_id).toBe("owner-1");
	});

	it("returns null when no row matches", async () => {
		maybeSingleMock.mockResolvedValue({ data: null, error: null });
		const { pullOne } = await import("./sync-client");

		expect(await pullOne("recipes", "missing")).toBeNull();
	});

	it("throws when Supabase returns an error", async () => {
		maybeSingleMock.mockResolvedValue({ data: null, error: new Error("boom") });
		const { pullOne } = await import("./sync-client");

		await expect(pullOne("recipes", "r1")).rejects.toThrow("boom");
	});
});

describe("pushTombstone", () => {
	it("does nothing when this device has no identity", async () => {
		getDeviceIdentityMock.mockReturnValue(null);
		const { pushTombstone } = await import("./sync-client");

		await pushTombstone("recipes", "r1");

		expect(fromMock).not.toHaveBeenCalled();
	});

	// Upserts (rather than a plain conditional UPDATE) so the tombstone lands
	// even when the row never actually reached Supabase in the first place —
	// see the function's own comment in sync-client.ts for the resurrection
	// bug this fixes. `data` only needs to satisfy the table's own
	// `(data->>'id')::uuid = id` check; its exact shape is never read back,
	// since a pulled row with deleted_at set skips straight to removal
	// (sync-engine.ts) without ever looking at `data`.
	it("upserts the row already tombstoned, owned by this device's account", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		const { pushTombstone } = await import("./sync-client");

		await pushTombstone("recipes", "r1");

		expect(fromMock).toHaveBeenCalledWith("recipes");
		expect(upsertMock).toHaveBeenCalledWith({
			id: "r1",
			owner_id: "u1",
			data: { id: "r1" },
			deleted_at: expect.any(String),
		});
		expect(upsertSelectMock).toHaveBeenCalledWith("id");
	});

	it("throws when Supabase returns an error", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		upsertSelectMock.mockResolvedValue({
			data: null,
			error: new Error("boom"),
		});
		const { pushTombstone } = await import("./sync-client");

		await expect(pushTombstone("recipes", "r1")).rejects.toThrow("boom");
	});

	// PostgREST returns error: null just as readily on an upsert an RLS policy
	// silently no-ops as on one that truly succeeded — without this check a
	// no-op looked identical to a real tombstone, so the caller deleted the
	// entity locally while Supabase kept serving it to every paired device.
	it("throws when the upsert matches no row, so a silent no-op isn't mistaken for success", async () => {
		getDeviceIdentityMock.mockReturnValue({ userId: "u1" });
		upsertSelectMock.mockResolvedValue({ data: [], error: null });
		const { pushTombstone } = await import("./sync-client");

		await expect(pushTombstone("recipes", "r1")).rejects.toThrow(
			"matched no row",
		);
	});
});

describe("pullChangedSince", () => {
	it("selects rows changed since the given watermark", async () => {
		gtMock.mockResolvedValue({ data: [{ id: "r1" }], error: null });
		const { pullChangedSince } = await import("./sync-client");

		const rows = await pullChangedSince("recipes", "2026-01-01T00:00:00.000Z");

		expect(fromMock).toHaveBeenCalledWith("recipes");
		expect(gtMock).toHaveBeenCalledWith(
			"updated_at",
			"2026-01-01T00:00:00.000Z",
		);
		expect(rows).toEqual([{ id: "r1" }]);
	});

	it("throws when Supabase returns an error", async () => {
		gtMock.mockResolvedValue({ data: null, error: new Error("boom") });
		const { pullChangedSince } = await import("./sync-client");

		await expect(
			pullChangedSince("recipes", "2026-01-01T00:00:00.000Z"),
		).rejects.toThrow("boom");
	});
});

describe("pullGrantedResourceIds", () => {
	it("selects every resource id granted to this account on the given table", async () => {
		grantedIdsSecondEqMock.mockResolvedValue({
			data: [{ resource_id: "recipe-1" }, { resource_id: "recipe-2" }],
			error: null,
		});
		const { pullGrantedResourceIds } = await import("./sync-client");

		const ids = await pullGrantedResourceIds("recipes", "grantee-1");

		expect(fromMock).toHaveBeenCalledWith("resource_shares");
		expect(singleEqMock).toHaveBeenCalledWith("resource_table", "recipes");
		expect(grantedIdsSecondEqMock).toHaveBeenCalledWith(
			"grantee_id",
			"grantee-1",
		);
		expect(ids).toEqual(["recipe-1", "recipe-2"]);
	});

	it("returns an empty array when nothing has been granted", async () => {
		grantedIdsSecondEqMock.mockResolvedValue({ data: null, error: null });
		const { pullGrantedResourceIds } = await import("./sync-client");

		expect(await pullGrantedResourceIds("recipes", "grantee-1")).toEqual([]);
	});

	it("throws when Supabase returns an error", async () => {
		grantedIdsSecondEqMock.mockResolvedValue({
			data: null,
			error: new Error("boom"),
		});
		const { pullGrantedResourceIds } = await import("./sync-client");

		await expect(
			pullGrantedResourceIds("recipes", "grantee-1"),
		).rejects.toThrow("boom");
	});
});
