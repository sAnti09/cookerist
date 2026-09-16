import { useCallback, useEffect, useRef, useState } from "react";

// Detects when a new service worker has finished installing behind the one
// currently controlling the page — a real update, not the very first
// install (sw.js no longer self-activates via skipWaiting, so an update
// actually parks in `registration.waiting` for this to catch) — and
// re-checks for one whenever the app returns to the foreground. The new
// worker only activates (and the page only reloads) once the caller
// confirms via `applyUpdate`, so a background/foreground cycle can surface
// an update-available prompt instead of silently swapping the worker out
// from under an already-open tab.
export function useServiceWorkerUpdate() {
	const [updateAvailable, setUpdateAvailable] = useState(false);
	const registrationRef = useRef<ServiceWorkerRegistration | null>(null);

	useEffect(() => {
		if (!("serviceWorker" in navigator)) return;
		// Captured once so cleanup below always tears down against the same
		// container it subscribed to, regardless of anything reassigning
		// `navigator.serviceWorker` later (only relevant in tests).
		const serviceWorker = navigator.serviceWorker;

		function watchInstallingWorker(worker: ServiceWorker) {
			function handleStateChange() {
				if (worker.state === "installed" && serviceWorker.controller) {
					setUpdateAvailable(true);
				}
			}
			worker.addEventListener("statechange", handleStateChange);
		}

		function handleUpdateFound() {
			const installing = registrationRef.current?.installing;
			if (installing) watchInstallingWorker(installing);
		}

		let cancelled = false;
		serviceWorker.ready.then((registration) => {
			if (cancelled) return;
			registrationRef.current = registration;
			// A worker can already be sitting in `waiting` from an update check
			// that finished on an earlier page load, before this effect ever ran.
			if (registration.waiting && serviceWorker.controller) {
				setUpdateAvailable(true);
			}
			registration.addEventListener("updatefound", handleUpdateFound);
		});

		function handleVisibilityChange() {
			if (document.visibilityState === "visible") {
				registrationRef.current?.update().catch(() => {});
			}
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);

		function handleControllerChange() {
			window.location.reload();
		}
		serviceWorker.addEventListener("controllerchange", handleControllerChange);

		return () => {
			cancelled = true;
			registrationRef.current?.removeEventListener(
				"updatefound",
				handleUpdateFound,
			);
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			serviceWorker.removeEventListener(
				"controllerchange",
				handleControllerChange,
			);
		};
	}, []);

	// Tells the waiting worker to activate — the controllerchange listener
	// above reloads the page once it does.
	const applyUpdate = useCallback(() => {
		registrationRef.current?.waiting?.postMessage({ type: "SKIP_WAITING" });
	}, []);

	const dismiss = useCallback(() => {
		setUpdateAvailable(false);
	}, []);

	return { updateAvailable, applyUpdate, dismiss };
}
