// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

type ChainResult = { data: unknown; error: unknown };

function createQueryChain(result: ChainResult) {
	// biome-ignore lint/suspicious/noExplicitAny: minimal fluent-chain stand-in for supabase-js's PostgrestQueryBuilder
	const chain: any = {
		insert: vi.fn(() => chain),
		upsert: vi.fn(() => chain),
		select: vi.fn(() => chain),
		update: vi.fn(() => chain),
		eq: vi.fn(() => chain),
		is: vi.fn(() => chain),
		gt: vi.fn(() => chain),
		single: vi.fn(() => Promise.resolve(result)),
		maybeSingle: vi.fn(() => Promise.resolve(result)),
		// The real PostgrestFilterBuilder is itself thenable -- some call
		// sites (touchDeviceLastSeen) await the builder directly without a
		// terminal .single()/.maybeSingle().
		// biome-ignore lint/suspicious/noThenProperty: mimics supabase-js's own thenable query builder
		then: (
			resolve: (value: ChainResult) => unknown,
			reject?: (reason: unknown) => unknown,
		) => Promise.resolve(result).then(resolve, reject),
	};
	return chain;
}

let nextChainResult: ChainResult = { data: null, error: null };
const fromMock = vi.fn(() => createQueryChain(nextChainResult));
const createClientMock = vi.fn((..._args: unknown[]) => ({ from: fromMock }));

vi.mock("@supabase/supabase-js", () => ({
	createClient: (...args: unknown[]) => createClientMock(...args),
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(async () => {
	vi.resetModules();
	process.env = { ...ORIGINAL_ENV, SUPABASE_SECRET_KEY: "secret-key" };
	fromMock.mockClear();
	createClientMock.mockClear();
});

async function loadAdmin() {
	return import("./admin");
}

describe("insertUser", () => {
	it("inserts into users and returns the new id", async () => {
		nextChainResult = { data: { id: "user-1" }, error: null };
		const { insertUser } = await loadAdmin();

		await expect(insertUser()).resolves.toEqual({ id: "user-1" });
		expect(fromMock).toHaveBeenCalledWith("users");
	});

	it("throws when the insert fails", async () => {
		nextChainResult = { data: null, error: { message: "boom" } };
		const { insertUser } = await loadAdmin();

		await expect(insertUser()).rejects.toThrow("boom");
	});
});

describe("insertDevice", () => {
	it("inserts a device row tied to the given user", async () => {
		nextChainResult = { data: { id: "device-1" }, error: null };
		const { insertDevice } = await loadAdmin();

		await expect(insertDevice("user-1", "hash")).resolves.toEqual({
			id: "device-1",
		});
		expect(fromMock).toHaveBeenCalledWith("devices");
	});

	it("throws when the insert fails", async () => {
		nextChainResult = { data: null, error: null };
		const { insertDevice } = await loadAdmin();

		await expect(insertDevice("user-1", "hash")).rejects.toThrow(
			"Failed to create device",
		);
	});
});

describe("findDeviceById", () => {
	it("returns the device's user id and secret hash when found", async () => {
		nextChainResult = {
			data: { user_id: "user-1", secret_hash: "hash" },
			error: null,
		};
		const { findDeviceById } = await loadAdmin();

		await expect(findDeviceById("device-1")).resolves.toEqual({
			userId: "user-1",
			secretHash: "hash",
		});
	});

	it("returns null when no device matches", async () => {
		nextChainResult = { data: null, error: null };
		const { findDeviceById } = await loadAdmin();

		await expect(findDeviceById("missing")).resolves.toBeNull();
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { findDeviceById } = await loadAdmin();

		await expect(findDeviceById("device-1")).rejects.toThrow("db down");
	});
});

describe("touchDeviceLastSeen", () => {
	it("updates last_seen_at without throwing on success", async () => {
		nextChainResult = { data: null, error: null };
		const { touchDeviceLastSeen } = await loadAdmin();

		await expect(touchDeviceLastSeen("device-1")).resolves.toBeUndefined();
		expect(fromMock).toHaveBeenCalledWith("devices");
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { touchDeviceLastSeen } = await loadAdmin();

		await expect(touchDeviceLastSeen("device-1")).rejects.toThrow("db down");
	});
});

describe("insertPairingCode", () => {
	it("inserts a pairing code row", async () => {
		nextChainResult = { data: null, error: null };
		const { insertPairingCode } = await loadAdmin();

		await expect(
			insertPairingCode("user-1", "hash", "2026-01-01T00:00:00.000Z"),
		).resolves.toBeUndefined();
		expect(fromMock).toHaveBeenCalledWith("pairing_codes");
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { insertPairingCode } = await loadAdmin();

		await expect(
			insertPairingCode("user-1", "hash", "2026-01-01T00:00:00.000Z"),
		).rejects.toThrow("db down");
	});
});

describe("claimPairingCode", () => {
	it("returns the owning user id when a matching unused code is claimed", async () => {
		nextChainResult = { data: { user_id: "user-1" }, error: null };
		const { claimPairingCode } = await loadAdmin();

		await expect(claimPairingCode("hash")).resolves.toEqual({
			userId: "user-1",
		});
	});

	it("returns null when no unused, unexpired code matches", async () => {
		nextChainResult = { data: null, error: null };
		const { claimPairingCode } = await loadAdmin();

		await expect(claimPairingCode("hash")).resolves.toBeNull();
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { claimPairingCode } = await loadAdmin();

		await expect(claimPairingCode("hash")).rejects.toThrow("db down");
	});
});

describe("findResourceOwner", () => {
	it("returns the owner id when the resource exists", async () => {
		nextChainResult = { data: { owner_id: "owner-1" }, error: null };
		const { findResourceOwner } = await loadAdmin();

		await expect(findResourceOwner("recipes", "r1")).resolves.toEqual({
			ownerId: "owner-1",
		});
		expect(fromMock).toHaveBeenCalledWith("recipes");
	});

	it("returns null when no resource matches", async () => {
		nextChainResult = { data: null, error: null };
		const { findResourceOwner } = await loadAdmin();

		await expect(findResourceOwner("recipes", "missing")).resolves.toBeNull();
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { findResourceOwner } = await loadAdmin();

		await expect(findResourceOwner("recipes", "r1")).rejects.toThrow("db down");
	});
});

describe("insertResourceShareCode", () => {
	it("inserts a resource share code row", async () => {
		nextChainResult = { data: null, error: null };
		const { insertResourceShareCode } = await loadAdmin();

		await expect(
			insertResourceShareCode(
				"owner-1",
				"recipes",
				"r1",
				"hash",
				"2026-01-01T00:00:00.000Z",
			),
		).resolves.toBeUndefined();
		expect(fromMock).toHaveBeenCalledWith("resource_share_codes");
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { insertResourceShareCode } = await loadAdmin();

		await expect(
			insertResourceShareCode(
				"owner-1",
				"recipes",
				"r1",
				"hash",
				"2026-01-01T00:00:00.000Z",
			),
		).rejects.toThrow("db down");
	});
});

describe("claimResourceShareCode", () => {
	it("returns the resource location when a matching unused code is claimed", async () => {
		nextChainResult = {
			data: {
				owner_id: "owner-1",
				resource_table: "recipes",
				resource_id: "r1",
			},
			error: null,
		};
		const { claimResourceShareCode } = await loadAdmin();

		await expect(claimResourceShareCode("hash")).resolves.toEqual({
			ownerId: "owner-1",
			resourceTable: "recipes",
			resourceId: "r1",
		});
	});

	it("returns null when no unused, unexpired code matches", async () => {
		nextChainResult = { data: null, error: null };
		const { claimResourceShareCode } = await loadAdmin();

		await expect(claimResourceShareCode("hash")).resolves.toBeNull();
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { claimResourceShareCode } = await loadAdmin();

		await expect(claimResourceShareCode("hash")).rejects.toThrow("db down");
	});
});

describe("insertResourceShare", () => {
	it("upserts a grant row", async () => {
		nextChainResult = { data: null, error: null };
		const { insertResourceShare } = await loadAdmin();

		await expect(
			insertResourceShare("recipes", "r1", "owner-1", "grantee-1"),
		).resolves.toBeUndefined();
		expect(fromMock).toHaveBeenCalledWith("resource_shares");
	});

	it("throws on a query error", async () => {
		nextChainResult = { data: null, error: { message: "db down" } };
		const { insertResourceShare } = await loadAdmin();

		await expect(
			insertResourceShare("recipes", "r1", "owner-1", "grantee-1"),
		).rejects.toThrow("db down");
	});
});
