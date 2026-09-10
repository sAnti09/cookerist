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

// In-app webviews (opened from a chat/social app's own link preview) block
// beforeinstallprompt and can't be escaped via a menu the user already
// knows to look for, so we name the culprit and tell them to hop out to a
// real browser first. Order matters: Messenger's UA is a subset of the
// broader Facebook-family FBAN/FBAV/FB_IAB tokens, so it must be checked first.
function detectInAppBrowser(): string | null {
	if (typeof navigator === "undefined") return null;
	const ua = navigator.userAgent;
	if (/FBAN|FBAV|FB_IAB/i.test(ua)) {
		return /MESSENGER/i.test(ua) ? "Messenger" : "Facebook";
	}
	if (/Instagram/i.test(ua)) return "Instagram";
	if (/Line\//i.test(ua)) return "LINE";
	if (/MicroMessenger/i.test(ua)) return "WeChat";
	if (/musical_ly|BytedanceWebview|TikTok/i.test(ua)) return "TikTok";
	if (/LinkedInApp/i.test(ua)) return "LinkedIn";
	return null;
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
		inAppBrowserName: detectInAppBrowser(),
		promptInstall,
	};
}
