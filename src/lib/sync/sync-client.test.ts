import { beforeEach, describe, expect, it, vi } from "vitest";

const getDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

const upsertMock = vi.fn();
const eqMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: eqMock }));
const gtMock = vi.fn();
const selectMock = vi.fn(() => ({ gt: gtMock }));
const fromMock = vi.fn((_table: string) => ({
	upsert: upsertMock,
	update: updateMock,
	select: selectMock,
}));
vi.mock("#/lib/supabase/client", () => ({
	supabase: { from: (table: string) => fromMock(table) },
}));

beforeEach(() => {
	vi.resetModules();
	getDeviceIdentityMock.mockReset();
	upsertMock.mockReset();
	eqMock.mockReset();
	updateMock.mockClear();
	gtMock.mockReset();
	selectMock.mockClear();
	fromMock.mockClear();
	upsertMock.mockResolvedValue({ error: null });
	eqMock.mockResolvedValue({ error: null });
	gtMock.mockResolvedValue({ data: [], error: null });
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
