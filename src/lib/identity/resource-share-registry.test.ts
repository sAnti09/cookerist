// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createResourceShareCode,
	redeemResourceShareCode,
} from "./resource-share-registry";

const findDeviceByIdMock = vi.fn();
const findResourceOwnerMock = vi.fn();
const insertResourceShareCodeMock = vi.fn();
const claimResourceShareCodeMock = vi.fn();
const insertResourceShareMock = vi.fn();

vi.mock("#/lib/supabase/admin", () => ({
	findDeviceById: (...args: unknown[]) => findDeviceByIdMock(...args),
	touchDeviceLastSeen: vi.fn(),
	findResourceOwner: (...args: unknown[]) => findResourceOwnerMock(...args),
	insertResourceShareCode: (...args: unknown[]) =>
		insertResourceShareCodeMock(...args),
	claimResourceShareCode: (...args: unknown[]) =>
		claimResourceShareCodeMock(...args),
	insertResourceShare: (...args: unknown[]) => insertResourceShareMock(...args),
}));

beforeEach(() => {
	findDeviceByIdMock.mockReset();
	findResourceOwnerMock.mockReset();
	insertResourceShareCodeMock.mockReset();
	claimResourceShareCodeMock.mockReset();
	insertResourceShareMock.mockReset();
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
});
