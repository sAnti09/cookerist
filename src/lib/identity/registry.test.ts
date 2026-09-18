// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
	createPairingCode,
	mintAccessToken,
	redeemPairingCode,
	registerDevice,
} from "./registry";

const insertUserMock = vi.fn();
const insertDeviceMock = vi.fn();
const findDeviceByIdMock = vi.fn();
const touchDeviceLastSeenMock = vi.fn();
const insertPairingCodeMock = vi.fn();
const claimPairingCodeMock = vi.fn();

vi.mock("#/lib/supabase/admin", () => ({
	insertUser: (...args: unknown[]) => insertUserMock(...args),
	insertDevice: (...args: unknown[]) => insertDeviceMock(...args),
	findDeviceById: (...args: unknown[]) => findDeviceByIdMock(...args),
	touchDeviceLastSeen: (...args: unknown[]) => touchDeviceLastSeenMock(...args),
	insertPairingCode: (...args: unknown[]) => insertPairingCodeMock(...args),
	claimPairingCode: (...args: unknown[]) => claimPairingCodeMock(...args),
}));

const signDeviceAccessTokenMock = vi.fn();

vi.mock("#/lib/identity/jwt", () => ({
	loadSigningKeyFromEnv: () => ({ kid: "kid", privateJwk: {} }),
	signDeviceAccessToken: (...args: unknown[]) =>
		signDeviceAccessTokenMock(...args),
}));

beforeEach(() => {
	insertUserMock.mockReset();
	insertDeviceMock.mockReset();
	findDeviceByIdMock.mockReset();
	touchDeviceLastSeenMock.mockReset();
	insertPairingCodeMock.mockReset();
	claimPairingCodeMock.mockReset();
	signDeviceAccessTokenMock.mockReset();
});

describe("registerDevice", () => {
	it("creates a user then a device tied to it, returning the plaintext secret", async () => {
		insertUserMock.mockResolvedValueOnce({ id: "user-1" });
		insertDeviceMock.mockResolvedValueOnce({ id: "device-1" });

		const result = await registerDevice();

		expect(result.userId).toBe("user-1");
		expect(result.deviceId).toBe("device-1");
		expect(result.deviceSecret).toMatch(/^[A-Za-z0-9_-]+$/);
		expect(insertDeviceMock).toHaveBeenCalledWith("user-1", expect.any(String));
		// The stored hash must not be the plaintext secret itself.
		expect(insertDeviceMock.mock.calls[0][1]).not.toBe(result.deviceSecret);
	});
});

describe("mintAccessToken", () => {
	it("signs a token for the device's owning user when the secret matches", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "user-1",
			secretHash: await hashForTest(deviceSecret),
		});
		signDeviceAccessTokenMock.mockResolvedValueOnce({
			token: "signed.jwt.token",
			expiresAt: 1700000000,
		});

		const result = await mintAccessToken({
			deviceId: "device-1",
			deviceSecret,
		});

		expect(result).toEqual({
			accessToken: "signed.jwt.token",
			expiresAt: 1700000000,
		});
		expect(signDeviceAccessTokenMock).toHaveBeenCalledWith(
			expect.objectContaining({ userId: "user-1" }),
		);
		expect(touchDeviceLastSeenMock).toHaveBeenCalledWith("device-1");
	});

	it("rejects a wrong secret without signing anything", async () => {
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "user-1",
			secretHash: await hashForTest("correct-secret"),
		});

		await expect(
			mintAccessToken({ deviceId: "device-1", deviceSecret: "wrong-secret" }),
		).rejects.toThrow(/Invalid device credentials/);
		expect(signDeviceAccessTokenMock).not.toHaveBeenCalled();
	});

	it("rejects an unknown device id", async () => {
		findDeviceByIdMock.mockResolvedValueOnce(null);

		await expect(
			mintAccessToken({ deviceId: "missing", deviceSecret: "anything" }),
		).rejects.toThrow(/Invalid device credentials/);
	});
});

describe("createPairingCode", () => {
	it("authenticates the device then stores a code for its user", async () => {
		const deviceSecret = "correct-secret";
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "user-1",
			secretHash: await hashForTest(deviceSecret),
		});

		const result = await createPairingCode({
			deviceId: "device-1",
			deviceSecret,
		});

		expect(result.code).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{8}$/);
		expect(insertPairingCodeMock).toHaveBeenCalledWith(
			"user-1",
			expect.any(String),
			result.expiresAt,
		);
	});

	it("rejects a wrong secret without creating a code", async () => {
		findDeviceByIdMock.mockResolvedValueOnce({
			userId: "user-1",
			secretHash: await hashForTest("correct-secret"),
		});

		await expect(
			createPairingCode({ deviceId: "device-1", deviceSecret: "wrong" }),
		).rejects.toThrow(/Invalid device credentials/);
		expect(insertPairingCodeMock).not.toHaveBeenCalled();
	});
});

describe("redeemPairingCode", () => {
	it("creates a new device under the claimed code's user", async () => {
		claimPairingCodeMock.mockResolvedValueOnce({ userId: "user-1" });
		insertDeviceMock.mockResolvedValueOnce({ id: "device-2" });

		const result = await redeemPairingCode({ code: "ABCD1234" });

		expect(result).toEqual({
			userId: "user-1",
			deviceId: "device-2",
			deviceSecret: expect.any(String),
		});
		expect(insertDeviceMock).toHaveBeenCalledWith("user-1", expect.any(String));
	});

	it("rejects an invalid or already-used code", async () => {
		claimPairingCodeMock.mockResolvedValueOnce(null);

		await expect(redeemPairingCode({ code: "STALE000" })).rejects.toThrow(
			/Invalid or expired pairing code/,
		);
		expect(insertDeviceMock).not.toHaveBeenCalled();
	});
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
