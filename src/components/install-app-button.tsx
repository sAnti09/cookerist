import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";
import { useInstallPrompt } from "#/lib/use-install-prompt";

// The instructions inside this dialog point the user at their browser's own
// chrome (the ⋮/••• menu, the Share sheet) to finish the install. On mobile,
// locking body scroll (position: fixed) can cause that chrome to collapse or
// stay hidden, blocking the exact menu we're telling them to tap — so skip
// the lock on mobile viewports specifically for this dialog.
function isMobileViewport(): boolean {
	if (typeof window === "undefined") return false;
	try {
		return window.matchMedia("(max-width: 767px)").matches;
	} catch {
		return false;
	}
}

function InstallInstructionsDialog({
	open,
	isIOS,
	inAppBrowserName,
	onClose,
}: {
	open: boolean;
	isIOS: boolean;
	inAppBrowserName: string | null;
	onClose: () => void;
}) {
	useBodyScrollLock(open && !isMobileViewport());

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Dismiss dialog"
				className="absolute inset-0 bg-black/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="install-instructions-title"
				className="card relative w-full max-w-sm bg-card p-5"
			>
				<h2
					id="install-instructions-title"
					className="display-title text-lg text-ink"
				>
					Install Cookerist
				</h2>
				{inAppBrowserName && (
					<p className="card mt-3 border-warn bg-warn-wash p-3 text-sm text-warn">
						You're viewing this in {inAppBrowserName}'s in-app browser, which
						blocks app installs. Tap the{" "}
						<span className="font-medium">••• (or ⋮) menu</span>, choose{" "}
						<span className="font-medium">"Open in Browser"</span>, then come
						back here to install.
					</p>
				)}
				<ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-ink-dim">
					{isIOS ? (
						<li>
							Tap the <span className="font-medium text-ink">Share</span> icon,
							then choose{" "}
							<span className="font-medium text-ink">"Add to Home Screen"</span>
							.
						</li>
					) : (
						<>
							<li>
								<span className="font-medium text-ink">Android (Chrome):</span>{" "}
								tap the ⋮ menu, then choose "Install app" (or "Add to Home
								screen").
							</li>
							<li>
								<span className="font-medium text-ink">iOS (Safari):</span> tap
								the Share icon, then choose "Add to Home Screen".
							</li>
						</>
					)}
				</ul>
				<div className="mt-4 flex justify-end">
					<Button onClick={onClose}>Got it</Button>
				</div>
			</div>
		</div>
	);
}

export function InstallAppButton() {
	const {
		installed,
		canPromptNatively,
		isIOS,
		inAppBrowserName,
		promptInstall,
	} = useInstallPrompt();
	const [showInstructions, setShowInstructions] = useState(false);

	if (installed) {
		return (
			<p className="text-sm font-medium text-sage">
				Already installed on this device
			</p>
		);
	}

	function handleClick() {
		if (canPromptNatively) {
			promptInstall();
			return;
		}
		setShowInstructions(true);
	}

	return (
		<>
			<Button variant="primary" className="w-full" onClick={handleClick}>
				Install app
			</Button>
			<InstallInstructionsDialog
				open={showInstructions}
				isIOS={isIOS}
				inAppBrowserName={inAppBrowserName}
				onClose={() => setShowInstructions(false)}
			/>
		</>
	);
}
