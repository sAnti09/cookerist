import { useEffect, useRef } from "react";

// Wake Lock isn't in every target's DOM lib yet (and jsdom never implements
// it), so this stays feature-detected via `"wakeLock" in navigator` rather
// than typed — see AC5 (graceful fallback) on TEST-257.
type WakeLockSentinelLike = { release: () => Promise<void> };
type NavigatorWithWakeLock = Navigator & {
	wakeLock: { request: (type: "screen") => Promise<WakeLockSentinelLike> };
};

// Keeps the screen on for as long as the calling component is mounted — every
// full-screen, hands-busy overlay (CookMode, GroceryMode) uses this so the
// screen doesn't lock mid-step/mid-shop.
export function useWakeLock() {
	const wakeLockRef = useRef<WakeLockSentinelLike | null>(null);

	useEffect(() => {
		let cancelled = false;

		async function acquireWakeLock() {
			if (!("wakeLock" in navigator)) return;
			try {
				const sentinel = await (
					navigator as NavigatorWithWakeLock
				).wakeLock.request("screen");
				if (cancelled) {
					sentinel.release().catch(() => {});
					return;
				}
				wakeLockRef.current = sentinel;
			} catch {
				// Wake lock can be refused (e.g. low battery, backgrounded tab) —
				// the overlay still works, it just won't keep the screen awake.
			}
		}

		acquireWakeLock();

		function handleVisibilityChange() {
			if (document.visibilityState === "visible") acquireWakeLock();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);

		return () => {
			cancelled = true;
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			wakeLockRef.current?.release().catch(() => {});
			wakeLockRef.current = null;
		};
	}, []);
}
