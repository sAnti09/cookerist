// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	cascadeResourceSharesForOwner,
	createResourceShareCode,
	redeemResourceShareCode,
} from "./resource-share-registry";

const findDeviceByIdMock = vi.fn();
const findResourceOwnerMock = vi.fn();
const findResourceRowMock = vi.fn();
const insertResourceShareCodeMock = vi.fn();
const claimResourceShareCodeMock = vi.fn();
const insertResourceShareMock = vi.fn();
const listResourceShareGranteesMock = vi.fn();

vi.mock("#/lib/supabase/admin", () => ({
	findDeviceById: (...args: unknown[]) => findDeviceByIdMock(...args),
	touchDeviceLastSeen: vi.fn(),
	findResourceOwner: (...args: unknown[]) => findResourceOwnerMock(...args),
	findResourceRow: (...args: unknown[]) => findResourceRowMock(...args),
	insertResourceShareCode: (...args: unknown[]) =>
		insertResourceShareCodeMock(...args),
	claimResourceShareCode: (...args: unknown[]) =>
		claimResourceShareCodeMock(...args),
	insertResourceShare: (...args: unknown[]) => insertResourceShareMock(...args),
	listResourceShareGrantees: (...args: unknown[]) =>
		listResourceShareGranteesMock(...args),
}));

beforeEach(() => {
	findDeviceByIdMock.mockReset();
	findResourceOwnerMock.mockReset();
	findResourceRowMock.mockReset();
	insertResourceShareCodeMock.mockReset();
	claimResourceShareCodeMock.mockReset();
	insertResourceShareMock.mockReset();
	listResourceShareGranteesMock.mockReset();
});

async function hashForTest(token: string): Promise<string> {
	const digest = await crypto.subtle.digest(
		"SHA-256",
		new TextEncoder().encode(token),
	);
	return Array.from(new Uint8Array(digest), (byte) =>
		byte.toString(16).padStart(2, "0"),
	).join("");
}

describe("createResourceShareCode", () => {
	it("mints a code when the authenticated device's account owns the resource", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce({ ownerId: "owner-1" });

		const result = await createResourceShareCode({
			deviceId: "device-1",
			deviceSecret,
			table: "recipes",
			id: "recipe-1",
		});

		expect(result.code).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{8}$/);
		expect(insertResourceShareCodeMock).toHaveBeenCalledWith(
			"owner-1",
			"recipes",
			"recipe-1",
			expect.any(String),
			result.expiresAt,
		);
	});

	it("rejects a device whose account doesn't own the resource", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "not-the-owner",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce({ ownerId: "owner-1" });

		await expect(
			createResourceShareCode({
				deviceId: "device-1",
				deviceSecret,
				table: "recipes",
				id: "recipe-1",
			}),
		).rejects.toThrow(/don't own this resource/);
		expect(insertResourceShareCodeMock).not.toHaveBeenCalled();
	});

	it("rejects when the resource doesn't exist", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce(null);

		await expect(
			createResourceShareCode({
				deviceId: "device-1",
				deviceSecret,
				table: "recipes",
				id: "missing",
			}),
		).rejects.toThrow(/don't own this resource/);
		expect(insertResourceShareCodeMock).not.toHaveBeenCalled();
	});

	it("rejects a wrong device secret without touching the resource", async () => {
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest("correct-secret"),
		});

		await expect(
			createResourceShareCode({
				deviceId: "device-1",
				deviceSecret: "wrong-secret",
				table: "recipes",
				id: "recipe-1",
			}),
		).rejects.toThrow(/Invalid device credentials/);
		expect(findResourceOwnerMock).not.toHaveBeenCalled();
	});
});

describe("redeemResourceShareCode", () => {
	it("grants the redeeming account access and returns the resource location", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "recipes",
			resourceId: "recipe-1",
		});

		const result = await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		expect(result).toEqual({
			resourceTable: "recipes",
			resourceId: "recipe-1",
		});
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-1",
			"owner-1",
			"grantee-1",
		);
	});

	it("rejects an invalid or already-used code", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce(null);

		await expect(
			redeemResourceShareCode({
				deviceId: "device-2",
				deviceSecret,
				code: "STALE000",
			}),
		).rejects.toThrow(/Invalid or expired share code/);
		expect(insertResourceShareMock).not.toHaveBeenCalled();
	});

	it("rejects the owner's own device redeeming its own code", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "recipes",
			resourceId: "recipe-1",
		});

		await expect(
			redeemResourceShareCode({
				deviceId: "device-1",
				deviceSecret,
				code: "OWNCODE1",
			}),
		).rejects.toThrow(/can't redeem your own share code/);
		expect(insertResourceShareMock).not.toHaveBeenCalled();
	});

	it("cascades grants to a grocery list's recipes", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "grocery_lists",
			resourceId: "list-1",
		});
		findResourceRowMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			data: { recipeIds: ["recipe-1", "recipe-2"] },
		});

		await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"grocery_lists",
			"list-1",
			"owner-1",
			"grantee-1",
		);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-1",
			"owner-1",
			"grantee-1",
		);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-2",
			"owner-1",
			"grantee-1",
		);
	});

	it("cascades grants to a meal plan's recipes and its linked grocery list", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "meal_plans",
			resourceId: "plan-1",
		});
		findResourceRowMock.mockImplementation(
			async (table: string, id: string) => {
				if (table === "meal_plans" && id === "plan-1") {
					return {
						ownerId: "owner-1",
						data: {
							entries: [{ recipeId: "recipe-1" }, { status: "suggested" }],
							groceryListId: "list-1",
						},
					};
				}
				if (table === "grocery_lists" && id === "list-1") {
					return {
						ownerId: "owner-1",
						data: { recipeIds: ["recipe-1", "recipe-3"] },
					};
				}
				return null;
			},
		);

		await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		const grantedTargets = insertResourceShareMock.mock.calls.map(
			([table, id]) => `${table}:${id}`,
		);
		expect(grantedTargets).toEqual(
			expect.arrayContaining([
				"meal_plans:plan-1",
				"recipes:recipe-1",
				"grocery_lists:list-1",
				"recipes:recipe-3",
			]),
		);
		// recipe-1 is referenced both directly by an entry and via the linked
		// grocery list -- cascadeGrants dedupes before granting, so it's only
		// granted once.
		expect(
			grantedTargets.filter((target) => target === "recipes:recipe-1"),
		).toHaveLength(1);
	});

	it("grants only the primary resource when its row can no longer be found for cascading", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "grocery_lists",
			resourceId: "list-1",
		});
		findResourceRowMock.mockResolvedValueOnce(null);

		await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		expect(insertResourceShareMock).toHaveBeenCalledTimes(1);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"grocery_lists",
			"list-1",
			"owner-1",
			"grantee-1",
		);
	});

	it("ignores a non-string or missing recipe id instead of granting garbage", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "grocery_lists",
			resourceId: "list-1",
		});
		findResourceRowMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			data: { recipeIds: ["recipe-1", 42, null] },
		});

		await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		expect(insertResourceShareMock).toHaveBeenCalledTimes(2);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-1",
			"owner-1",
			"grantee-1",
		);
	});

	it("treats a missing/malformed recipeIds or entries field as empty rather than throwing", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "grantee-1",
			secretHash: await hashForTest(deviceSecret),
		});
		claimResourceShareCodeMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			resourceTable: "meal_plans",
			resourceId: "plan-1",
		});
		findResourceRowMock.mockResolvedValueOnce({
			ownerId: "owner-1",
			// No `entries` array and no `groceryListId` -- a meal plan with
			// neither, or one whose data predates either field.
			data: {},
		});

		await redeemResourceShareCode({
			deviceId: "device-2",
			deviceSecret,
			code: "ABCD1234",
		});

		expect(insertResourceShareMock).toHaveBeenCalledTimes(1);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"meal_plans",
			"plan-1",
			"owner-1",
			"grantee-1",
		);
	});
});

describe("cascadeResourceSharesForOwner", () => {
	it("re-grants every existing grantee against the resource's current references", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce({ ownerId: "owner-1" });
		listResourceShareGranteesMock.mockResolvedValueOnce([
			"grantee-1",
			"grantee-2",
		]);
		findResourceRowMock.mockResolvedValue({
			ownerId: "owner-1",
			data: { recipeIds: ["recipe-1"] },
		});

		await cascadeResourceSharesForOwner({
			deviceId: "device-1",
			deviceSecret,
			table: "grocery_lists",
			id: "list-1",
		});

		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-1",
			"owner-1",
			"grantee-1",
		);
		expect(insertResourceShareMock).toHaveBeenCalledWith(
			"recipes",
			"recipe-1",
			"owner-1",
			"grantee-2",
		);
	});

	it("no-ops when the resource has never been shared to anyone", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "owner-1",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce({ ownerId: "owner-1" });
		listResourceShareGranteesMock.mockResolvedValueOnce([]);

		await cascadeResourceSharesForOwner({
			deviceId: "device-1",
			deviceSecret,
			table: "grocery_lists",
			id: "list-1",
		});

		expect(findResourceRowMock).not.toHaveBeenCalled();
		expect(insertResourceShareMock).not.toHaveBeenCalled();
	});

	it("no-ops when the calling device's account doesn't own the resource", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "not-the-owner",
			secretHash: await hashForTest(deviceSecret),
		});
		findResourceOwnerMock.mockResolvedValueOnce({ ownerId: "owner-1" });

		await cascadeResourceSharesForOwner({
			deviceId: "device-1",
			deviceSecret,
			table: "grocery_lists",
			id: "list-1",
		});

		expect(listResourceShareGranteesMock).not.toHaveBeenCalled();
		expect(insertResourceShareMock).not.toHaveBeenCalled();
	});
});
