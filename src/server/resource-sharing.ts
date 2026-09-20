import { createServerFn } from "@tanstack/react-start";
import {
	cascadeResourceSharesForOwner as cascadeResourceSharesForOwnerCore,
	createResourceShareCode as createResourceShareCodeCore,
	redeemResourceShareCode as redeemResourceShareCodeCore,
} from "#/lib/identity/resource-share-registry";
import type { SyncTable } from "#/lib/sync/sync-client";

export const createResourceShareCode = createServerFn({ method: "POST" })
	.validator(
		(data: {
			deviceId: string;
			deviceSecret: string;
			table: SyncTable;
			id: string;
		}) => data,
	)
	.handler(({ data }) => createResourceShareCodeCore(data));

export const redeemResourceShareCode = createServerFn({ method: "POST" })
	.validator(
		(data: { deviceId: string; deviceSecret: string; code: string }) => data,
	)
	.handler(({ data }) => redeemResourceShareCodeCore(data));

export const cascadeResourceShares = createServerFn({ method: "POST" })
	.validator(
		(data: {
			deviceId: string;
			deviceSecret: string;
			table: SyncTable;
			id: string;
		}) => data,
	)
	.handler(({ data }) => cascadeResourceSharesForOwnerCore(data));
