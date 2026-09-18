import { getDeviceIdentity } from "#/lib/identity/device";

type Owned = { ownerDeviceId?: string };

// Only an entity's owner (the device that first shared it — see
// share-actions.ts) can delete it everywhere; every other paired device can
// only remove its own copy ("leave" — see app-data-context.tsx's delete
// handlers). An entity with no ownerDeviceId at all is either still
// local-only (never shared, so this predicate is moot — callers only
// consult it once `sharedAt` is set) or predates this feature and was never
// backfilled with one (see add-sync-metadata.ts's own comment on why
// ownerDeviceId isn't backfilled) — treated as deletable in that case, the
// same "no entry beats a wrong guess, but don't lock the user out of their
// own data" trade-off used elsewhere in this codebase.
export function isOwnedByThisDevice(entity: Owned): boolean {
	if (entity.ownerDeviceId == null) return true;
	return entity.ownerDeviceId === getDeviceIdentity()?.deviceId;
}
