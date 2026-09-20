import { beforeEach, describe, expect, it, vi } from "vitest";

const registerDeviceMock = vi.fn();
const createResourceShareCodeMock = vi.fn();
const redeemResourceShareCodeMock = vi.fn();
const cascadeResourceSharesMock = vi.fn();

vi.mock("#/server/identity", () => ({
	registerDevice: (...args: unknown[]) => registerDeviceMock(...args),
	mintAccessToken: vi.fn(),
	createPairingCode: vi.fn(),
	redeemPairingCode: vi.fn(),
}));

vi.mock("#/server/resource-sharing", () => ({
	createResourceShareCode: (...args: unknown[]) =>
		createResourceShareCodeMock(...args),
	redeemResourceShareCode: (...args: unknown[]) =>
		redeemResourceShareCodeMock(...args),
	cascadeResourceShares: (...args: unknown[]) =>
		cascadeResourceSharesMock(...args),
}));

const SAMPLE_IDENTITY = {
	userId: "user-1",
	deviceId: "device-1",
	deviceSecret: "secret-1",
};

beforeEach(() => {
	vi.resetModules();
	window.localStorage.clear();
	registerDeviceMock.mockReset();
	createResourceShareCodeMock.mockReset();
	redeemResourceShareCodeMock.mockReset();
	cascadeResourceSharesMock.mockReset();
});

describe("createShareCodeForResource", () => {
	it("ensures an identity exists, then requests a code for the resource", async () => {
		registerDeviceMock.mockResolvedValueOnce(SAMPLE_IDENTITY);
		createResourceShareCodeMock.mockResolvedValueOnce({
			code: "ABCD1234",
			expiresAt: "2026-01-01T00:00:00.000Z",
		});
		const { createShareCodeForResource } = await import("./resource-sharing");

		const result = await createShareCodeForResource("recipes", "r1");

		expect(result.code).toBe("ABCD1234");
		expect(createResourceShareCodeMock).toHaveBeenCalledWith({
			data: {
				deviceId: "device-1",
				deviceSecret: "secret-1",
				table: "recipes",
				id: "r1",
			},
		});
	});

	it("reuses an already-existing identity without registering again", async () => {
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify(SAMPLE_IDENTITY),
		);
		createResourceShareCodeMock.mockResolvedValueOnce({
			code: "ABCD1234",
			expiresAt: "2026-01-01T00:00:00.000Z",
		});
		const { createShareCodeForResource } = await import("./resource-sharing");

		await createShareCodeForResource("grocery_lists", "list-1");

		expect(registerDeviceMock).not.toHaveBeenCalled();
	});
});

describe("redeemShareCode", () => {
	it("ensures an identity exists, then redeems the code", async () => {
		registerDeviceMock.mockResolvedValueOnce(SAMPLE_IDENTITY);
		redeemResourceShareCodeMock.mockResolvedValueOnce({
			resourceTable: "recipes",
			resourceId: "r1",
		});
		const { redeemShareCode } = await import("./resource-sharing");

		const result = await redeemShareCode("ABCD1234");

		expect(result).toEqual({ resourceTable: "recipes", resourceId: "r1" });
		expect(redeemResourceShareCodeMock).toHaveBeenCalledWith({
			data: {
				deviceId: "device-1",
				deviceSecret: "secret-1",
				code: "ABCD1234",
			},
		});
	});
});

describe("cascadeSharesForResource", () => {
	it("does nothing when this device has no identity yet", async () => {
		const { cascadeSharesForResource } = await import("./resource-sharing");

		await cascadeSharesForResource("grocery_lists", "list-1");

		expect(cascadeResourceSharesMock).not.toHaveBeenCalled();
	});

	it("re-derives cascaded grants using this device's existing identity", async () => {
		window.localStorage.setItem(
			"cookerist:device-identity",
			JSON.stringify(SAMPLE_IDENTITY),
		);
		cascadeResourceSharesMock.mockResolvedValueOnce(undefined);
		const { cascadeSharesForResource } = await import("./resource-sharing");

		await cascadeSharesForResource("grocery_lists", "list-1");

		expect(cascadeResourceSharesMock).toHaveBeenCalledWith({
			data: {
				deviceId: "device-1",
				deviceSecret: "secret-1",
				table: "grocery_lists",
				id: "list-1",
			},
		});
	});
});
