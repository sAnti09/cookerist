import { ExternalLink } from "lucide-react";
import { useEffect, useRef } from "react";
import { useInstallPrompt } from "#/lib/use-install-prompt";

type InAppBrowserBannerProps = {
	navigate?: (url: string) => void;
};

function defaultNavigate(url: string) {
	window.location.href = url;
}

// Facebook/Messenger/Instagram etc. open a shared link in their own in-app
// WebView, which blocks `beforeinstallprompt` entirely — there's no install
// path at all until the user is in a real browser. On Android we silently
// attempt the `intent://` escape (see use-install-prompt.ts) once per mount,
// but since nothing confirms it worked, we always also show a tappable link
// as a manual fallback; iOS has no escape trick at all, so it's instructions
// only there.
export function InAppBrowserBanner({
	navigate = defaultNavigate,
}: InAppBrowserBannerProps) {
	const { inAppBrowserName, isAndroid, isIOS, escapeUrl } = useInstallPrompt();
	const attemptedRef = useRef(false);

	useEffect(() => {
		if (attemptedRef.current || !escapeUrl) return;
		attemptedRef.current = true;
		navigate(escapeUrl);
	}, [escapeUrl, navigate]);

	if (!inAppBrowserName) return null;

	return (
		<output className="card mb-4 flex items-start gap-2 border-warn bg-warn-wash p-3">
			<ExternalLink
				className="mt-0.5 size-4 shrink-0 text-warn"
				aria-hidden="true"
			/>
			<p className="text-sm text-warn">
				You're viewing this in {inAppBrowserName}'s in-app browser, which can't
				install apps.{" "}
				{isAndroid && escapeUrl ? (
					<a
						href={escapeUrl}
						className="font-semibold underline underline-offset-2"
					>
						Tap here to open in Chrome
					</a>
				) : (
					<>
						Tap the{" "}
						<span className="font-medium">
							{isIOS ? "Share" : "••• (or ⋮)"}
						</span>{" "}
						menu, choose <span className="font-medium">"Open in Browser"</span>
					</>
				)}{" "}
				— Cookerist will reopen there, where you can install it as an app for
				better experience.
			</p>
		</output>
	);
}
