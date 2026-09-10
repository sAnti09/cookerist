import { useEffect, useState } from "react";

function getIsOnline(): boolean {
	// Server-side (Node) ships a global `navigator` without an `onLine`
	// property, so checking `navigator` alone reads as offline during SSR
	// and flashes the banner on hydration. `window` is genuinely absent
	// server-side, so it's the reliable "are we in a browser" check here.
	if (typeof window === "undefined") return true;
	return navigator.onLine;
}

export function useOnlineStatus(): boolean {
	const [isOnline, setIsOnline] = useState(getIsOnline);

	useEffect(() => {
		function handleOnline() {
			setIsOnline(true);
		}
		function handleOffline() {
			setIsOnline(false);
		}
		window.addEventListener("online", handleOnline);
		window.addEventListener("offline", handleOffline);
		return () => {
			window.removeEventListener("online", handleOnline);
			window.removeEventListener("offline", handleOffline);
		};
	}, []);

	return isOnline;
}
