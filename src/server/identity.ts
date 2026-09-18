import { createServerFn } from "@tanstack/react-start";
import {
	createPairingCode as createPairingCodeCore,
	mintAccessToken as mintAccessTokenCore,
	redeemPairingCode as redeemPairingCodeCore,
	registerDevice as registerDeviceCore,
} from "#/lib/identity/registry";

export const registerDevice = createServerFn({ method: "POST" })
	.validator((data: Record<string, never>) => data)
	.handler(() => registerDeviceCore());

export const mintAccessToken = createServerFn({ method: "POST" })
	.validator((data: { deviceId: string; deviceSecret: string }) => data)
	.handler(({ data }) => mintAccessTokenCore(data));

export const createPairingCode = createServerFn({ method: "POST" })
	.validator((data: { deviceId: string; deviceSecret: string }) => data)
	.handler(({ data }) => createPairingCodeCore(data));

export const redeemPairingCode = createServerFn({ method: "POST" })
	.validator((data: { code: string }) => data)
	.handler(({ data }) => redeemPairingCodeCore(data));
