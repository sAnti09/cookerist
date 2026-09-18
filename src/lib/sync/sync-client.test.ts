import { beforeEach, describe, expect, it, vi } from "vitest";

const getDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

const upsertMock = vi.fn();
const eqSelectMock = vi.fn();
const eqMock = vi.fn(() => ({ select: eqSelectMock }));
const updateMock = vi.fn(() => ({ eq: eqMock }));
const gtMock = vi.fn();
// Same shape a real supabase-js query builder has: pullChangedSince chains
// .gt() off select(), pullOne chains .eq().maybeSingle() off the same
// select() call — both need to be available on whatever select() returns.
const maybeSingleMock = vi.fn();
const singleEqMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
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
	update: updateMock,
	delete: deleteMock,
	select: selectMock,
}));
vi.mock("#/lib/supabase/client", () => ({
	supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
	vi.resetModules();
	getDeviceIdentityMock.mockReset();
	upsertMock.mockReset();
	eqSelectMock.mockReset();
	eqMock.mockClear();
	updateMock.mockClear();
	gtMock.mockReset();
	maybeSingleMock.mockReset();
	singleEqMock.mockClear();
	selectMock.mockClear();
	fromMock.mockClear();
	deleteEqSelectMock.mockReset();
	deleteEq3Mock.mockClear();
	deleteEq2Mock.mockClear();
	deleteEq1Mock.mockClear();
	deleteMock.mockClear();
	upsertMock.mockResolvedValue({ error: null });
	eqSelectMock.mockResolvedValue({ data: [{ id: "r1" }], error: null });
	gtMock.mockResolvedValue({ data: [], error: null });
	maybeSingleMock.mockResolvedValue({ data: null, error: null });
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
		upsertMock.mockResolvedValue({ error: new Error("boom") });
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
	it("soft-deletes the row by id", async () => {
		const { pushTombstone } = await import("./sync-client");

		await pushTombstone("recipes", "r1");

		expect(fromMock).toHaveBeenCalledWith("recipes");
		expect(updateMock).toHaveBeenCalledWith(
			expect.objectContaining({ deleted_at: expect.any(String) }),
		);
		expect(eqMock).toHaveBeenCalledWith("id", "r1");
		expect(eqSelectMock).toHaveBeenCalledWith("id");
	});

	it("throws when Supabase returns an error", async () => {
		eqSelectMock.mockResolvedValue({ data: null, error: new Error("boom") });
		const { pushTombstone } = await import("./sync-client");

		await expect(pushTombstone("recipes", "r1")).rejects.toThrow("boom");
	});

	// PostgREST returns error: null just as readily when the update's WHERE/RLS
	// predicate matches zero rows (stale JWT, or the row was never pushed to
	// Supabase in the first place) as when it succeeds — without this check a
	// no-op update looked identical to a real tombstone, so the caller deleted
	// the entity locally while Supabase kept serving it to every paired device.
	it("throws when the update matches no row, so a silent no-op isn't mistaken for success", async () => {
		eqSelectMock.mockResolvedValue({ data: [], error: null });
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
