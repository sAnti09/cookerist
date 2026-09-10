import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";
import { useInstallPrompt } from "#/lib/use-install-prompt";

function InstallInstructionsDialog({
	open,
	isIOS,
	onClose,
}: {
	open: boolean;
	isIOS: boolean;
	onClose: () => void;
}) {
	useBodyScrollLock(open);

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
	const { installed, canPromptNatively, isIOS, promptInstall } =
		useInstallPrompt();
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
				onClose={() => setShowInstructions(false)}
			/>
		</>
	);
}
