import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const registerDeviceMock = vi.fn();
const mintAccessTokenMock = vi.fn();
const createPairingCodeMock = vi.fn();
const redeemPairingCodeMock = vi.fn();

vi.mock("#/server/identity", () => ({
	registerDevice: (...args: unknown[]) => registerDeviceMock(...args),
	mintAccessToken: (...args: unknown[]) => mintAccessTokenMock(...args),
	createPairingCode: (...args: unknown[]) => createPairingCodeMock(...args),
	redeemPairingCode: (...args: unknown[]) => redeemPairingCodeMock(...args),
}));

const SAMPLE_IDENTITY = {
	userId: "user-1",
	deviceId: "device-1",
	deviceSecret: "secret-1",
};

beforeEach(() => {
	// device.ts keeps an in-memory token cache at module scope -- reset the
	// module registry so each test gets a fresh instance of it, rather than
	// leaking a cached token between tests.
	vi.resetModules();
	window.localStorage.clear();
	registerDeviceMock.mockReset();
	mintAccessTokenMock.mockReset();
	createPairingCodeMock.mockReset();
	redeemPairingCodeMock.mockReset();
	vi.useRealTimers();
});

afterEach(() => {
	vi.useRealTimers();
});

describe("ensureDeviceIdentity", () => {
	it("registers and persists a new identity when none exists yet", async () => {
		registerDeviceMock.mockResolvedValueOnce(SAMPLE_IDENTITY);
		const { ensureDeviceIdentity, getDeviceIdentity } = await import(
			"./device"
		);

		const identity = await ensureDeviceIdentity();

		expect(identity).toEqual(SAMPLE_IDENTITY);
		expect(registerDeviceMock).toHaveBeenCalledTimes(1);
		expect(getDeviceIdentity()).toEqual(SAMPLE_IDENTITY);
	});

	it("reuses the existing identity without registering again", async () => {
		const { ensureDeviceIdentity } = await import("./device");
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify(SAMPLE_IDENTITY),
		);

		const identity = await ensureDeviceIdentity();

		expect(identity).toEqual(SAMPLE_IDENTITY);
		expect(registerDeviceMock).not.toHaveBeenCalled();
	});
});

describe("getAccessToken", () => {
	it("returns undefined when no device identity exists", async () => {
		const { getAccessToken } = await import("./device");

		expect(await getAccessToken()).toBeUndefined();
		expect(mintAccessTokenMock).not.toHaveBeenCalled();
	});

	it("mints and caches a token, reusing it before it's near expiry", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify(SAMPLE_IDENTITY),
		);
		mintAccessTokenMock.mockResolvedValueOnce({
			accessToken: "token-1",
			expiresAt: 3600,
		});
		const { getAccessToken } = await import("./device");

		expect(await getAccessToken()).toBe("token-1");
		expect(await getAccessToken()).toBe("token-1");
		expect(mintAccessTokenMock).toHaveBeenCalledTimes(1);
		expect(mintAccessTokenMock).toHaveBeenCalledWith({
			data: { deviceId: "device-1", deviceSecret: "secret-1" },
		});
	});

	it("mints a fresh token once the cached one is near expiry", async () => {
		vi.useFakeTimers();
		vi.setSystemTime(0);
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify(SAMPLE_IDENTITY),
		);
		mintAccessTokenMock
			.mockResolvedValueOnce({ accessToken: "token-1", expiresAt: 100 })
			.mockResolvedValueOnce({ accessToken: "token-2", expiresAt: 5000 });
		const { getAccessToken } = await import("./device");

		expect(await getAccessToken()).toBe("token-1");
		vi.setSystemTime(90_000); // well past (expiresAt - buffer)
		expect(await getAccessToken()).toBe("token-2");
		expect(mintAccessTokenMock).toHaveBeenCalledTimes(2);
	});
});

describe("createPairingCodeForThisDevice", () => {
	it("ensures an identity exists, then requests a code for it", async () => {
		registerDeviceMock.mockResolvedValueOnce(SAMPLE_IDENTITY);
		createPairingCodeMock.mockResolvedValueOnce({
			code: "ABCD1234",
			expiresAt: "2026-01-01T00:00:00.000Z",
		});
		const { createPairingCodeForThisDevice } = await import("./device");

		const result = await createPairingCodeForThisDevice();

		expect(result.code).toBe("ABCD1234");
		expect(createPairingCodeMock).toHaveBeenCalledWith({
			data: { deviceId: "device-1", deviceSecret: "secret-1" },
		});
	});
});

describe("linkDeviceWithPairingCode", () => {
	it("persists the redeemed identity, replacing any prior one", async () => {
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify({ ...SAMPLE_IDENTITY, deviceId: "old-device" }),
		);
		redeemPairingCodeMock.mockResolvedValueOnce({
			userId: "user-1",
			deviceId: "device-2",
			deviceSecret: "secret-2",
		});
		const { linkDeviceWithPairingCode, getDeviceIdentity } = await import(
			"./device"
		);

		const identity = await linkDeviceWithPairingCode("ABCD1234");

		expect(redeemPairingCodeMock).toHaveBeenCalledWith({
			data: { code: "ABCD1234" },
		});
		expect(identity.deviceId).toBe("device-2");
		expect(getDeviceIdentity()?.deviceId).toBe("device-2");
	});
});
