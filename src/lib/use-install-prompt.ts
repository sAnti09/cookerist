import { useEffect, useState } from "react";

// Chrome/Edge fire this instead of letting the browser handle install UI
// itself, so we can drive a single "Install app" button from it. It's not
// in the standard DOM lib types, so we shape it ourselves.
type BeforeInstallPromptEvent = Event & {
	prompt: () => void;
	userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandaloneDisplay(): boolean {
	if (typeof window === "undefined") return false;
	if (
		(window.navigator as Navigator & { standalone?: boolean }).standalone ===
		true
	) {
		return true;
	}
	try {
		return window.matchMedia("(display-mode: standalone)").matches;
	} catch {
		return false;
	}
}

function isIOSDevice(): boolean {
	if (typeof navigator === "undefined") return false;
	return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

export function useInstallPrompt() {
	const [deferredPrompt, setDeferredPrompt] =
		useState<BeforeInstallPromptEvent | null>(null);
	const [installed, setInstalled] = useState(isStandaloneDisplay);

	useEffect(() => {
		function handleBeforeInstallPrompt(event: Event) {
			event.preventDefault();
			setDeferredPrompt(event as BeforeInstallPromptEvent);
		}
		function handleAppInstalled() {
			setDeferredPrompt(null);
			setInstalled(true);
		}
		window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
		window.addEventListener("appinstalled", handleAppInstalled);
		return () => {
			window.removeEventListener(
				"beforeinstallprompt",
				handleBeforeInstallPrompt,
			);
			window.removeEventListener("appinstalled", handleAppInstalled);
		};
	}, []);

	async function promptInstall() {
		if (!deferredPrompt) return;
		deferredPrompt.prompt();
		await deferredPrompt.userChoice;
		// A BeforeInstallPromptEvent can only be prompted once.
		setDeferredPrompt(null);
	}

	return {
		installed,
		canPromptNatively: deferredPrompt !== null,
		isIOS: isIOSDevice(),
		promptInstall,
	};
}
