import {
	createPairingCodeForThisDevice,
	ensureDeviceIdentity,
	getAccessToken,
	getDeviceIdentity,
	linkDeviceWithPairingCode,
} from "#/lib/identity/device";

// Dev-only console helpers for exercising the identity layer against the
// real dev Supabase project while `pnpm dev` is running -- the account
// drawer (src/components/account-drawer.tsx) now covers the normal
// pairing/linking flow through the UI, but this stays useful for driving
// individual identity calls directly through the actual server-function/HTTP
// path (not just calling the core logic directly, the way the throwaway
// vitest smoke test does) when debugging.
//
// Usage in the browser devtools console:
//   await __cookeristIdentity.ensureDeviceIdentity()
//   await __cookeristIdentity.getAccessToken()
//   await __cookeristIdentity.createPairingCodeForThisDevice()
//   await __cookeristIdentity.linkDeviceWithPairingCode("ABCD1234")
//
// import.meta.env.DEV is statically false in a production build, so this
// whole module (and the window assignment) is dead-code-eliminated out of
// the shipped bundle.
const identityDevTools = {
	ensureDeviceIdentity,
	getAccessToken,
	getDeviceIdentity,
	createPairingCodeForThisDevice,
	linkDeviceWithPairingCode,
};

declare global {
	interface Window {
		__cookeristIdentity?: typeof identityDevTools;
	}
}

if (import.meta.env.DEV && typeof window !== "undefined") {
	window.__cookeristIdentity = identityDevTools;
}
