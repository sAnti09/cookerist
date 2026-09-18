import { beforeEach, describe, expect, it, vi } from "vitest";

const getDeviceIdentityMock = vi.fn();

vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

beforeEach(() => {
	getDeviceIdentityMock.mockReset();
});

describe("isOwnedByThisDevice", () => {
	it("treats an entity with no ownerDeviceId as deletable (legacy/local-only)", async () => {
		const { isOwnedByThisDevice } = await import("./ownership");
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });

		expect(isOwnedByThisDevice({})).toBe(true);
	});

	it("returns true when ownerDeviceId matches this device", async () => {
		const { isOwnedByThisDevice } = await import("./ownership");
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });

		expect(isOwnedByThisDevice({ ownerDeviceId: "device-1" })).toBe(true);
	});

	it("returns false when ownerDeviceId belongs to a different device", async () => {
		const { isOwnedByThisDevice } = await import("./ownership");
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });

		expect(isOwnedByThisDevice({ ownerDeviceId: "device-2" })).toBe(false);
	});

	it("returns false when there's an owner but this device has no identity at all", async () => {
		const { isOwnedByThisDevice } = await import("./ownership");
		getDeviceIdentityMock.mockReturnValue(null);

		expect(isOwnedByThisDevice({ ownerDeviceId: "device-2" })).toBe(false);
	});
});
