import { ArrowRight, Check, Copy, Share, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useAppData } from "#/lib/app-data-context";
import { canShareNatively, shareNatively } from "#/lib/share-native";
import { NEW_SITE_URL, OLD_SITE_HOSTNAME } from "#/lib/site-domain";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

const DISMISSED_KEY = "cookerist:old-site-notice-dismissed";

// Cookerist moved from this workers.dev URL to cookerist.com (see
// CLAUDE.md's "Custom domain added" note) and this link is slated to be
// retired eventually. Recipes/grocery lists/meal plans live in this
// browser's localStorage, scoped to the exact origin they were saved
// under, so a hard redirect to the new domain would make a visitor's whole
// library look like it vanished (a different origin is a completely
// separate localStorage store) and would also kick an installed PWA out of
// standalone mode (its manifest scope is origin-bound) -- see the
// conversation that led to this file for the full reasoning. Instead of
// redirecting, this is a one-time, dismissible, instructions-only popup --
// shown only when this device is actually visiting the old hostname --
// that walks the user through the *existing* device-pairing flow (built
// for syncing two of your own devices) as the sanctioned way to bring this
// browser's library over to the new domain without losing anything.
export function OldSiteMigrationNotice() {
	const { createPairingCode } = useAppData();
	const [open, setOpen] = useState(false);
	const [generating, setGenerating] = useState(false);
	const [result, setResult] = useState<{
		code: string;
		expiresAt: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useEffect(() => {
		if (window.location.hostname !== OLD_SITE_HOSTNAME) return;
		try {
			if (window.localStorage.getItem(DISMISSED_KEY) === "1") return;
		} catch {
			// If localStorage is unavailable, err on the side of showing it --
			// worse to silently never mention the move than to ask again.
		}
		setOpen(true);
	}, []);

	useBodyScrollLock(open);

	const handleDismiss = useCallback(() => {
		try {
			window.localStorage.setItem(DISMISSED_KEY, "1");
		} catch {
			// Same tolerance as everywhere else this app touches localStorage --
			// worst case it just asks again next visit.
		}
		setOpen(false);
	}, []);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") handleDismiss();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, handleDismiss]);

	if (!open) return null;

	async function handleGenerate() {
		setGenerating(true);
		setError(null);
		try {
			const code = await createPairingCode();
			setResult(code);
		} catch {
			setError("Couldn't generate a code. Please try again.");
		} finally {
			setGenerating(false);
		}
	}

	async function handleCopy() {
		if (!result) return;
		try {
			await navigator.clipboard.writeText(result.code);
			setCopied(true);
			setTimeout(() => setCopied(false), 2000);
		} catch {
			// Clipboard access can be denied/unavailable -- the code is still
			// visible on screen either way, so there's nothing more to do.
		}
	}

	async function handleShare() {
		if (!result) return;
		await shareNatively({
			title: "Move to cookerist.com",
			text: `Bring your Cookerist recipes over to the new site using the code ${result.code} at ${NEW_SITE_URL}.`,
		});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Dismiss"
				className="absolute inset-0 bg-black/40"
				onClick={handleDismiss}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="old-site-notice-title"
				className="card relative w-full max-w-sm bg-card p-5"
			>
				<div className="flex items-center justify-between">
					<h2 id="old-site-notice-title" className="display-title text-lg">
						Cookerist has moved
					</h2>
					<button
						type="button"
						aria-label="Close"
						onClick={handleDismiss}
						className="flex size-8 items-center justify-center rounded-[10px] hover:bg-bg2"
					>
						<X className="size-4" aria-hidden="true" />
					</button>
				</div>
				<p className="mt-2 text-sm text-ink-dim">
					This link is moving to{" "}
					<span className="font-medium text-ink">cookerist.com</span> and will
					eventually stop working. Bring your recipes, grocery lists, and meal
					plans over first — nothing is lost.
				</p>
				<ol className="mt-3 list-decimal space-y-1 pl-4 text-sm text-ink-dim">
					<li>Generate a code below.</li>
					<li>
						Open{" "}
						<a
							href={NEW_SITE_URL}
							target="_blank"
							rel="noreferrer"
							className="font-medium text-accent underline underline-offset-2"
						>
							cookerist.com
						</a>{" "}
						(this device or any other).
					</li>
					<li>Tap the menu icon → "Link this device" → enter the code.</li>
				</ol>
				{result ? (
					<div className="mt-4 text-center">
						<span className="display-title block text-2xl tracking-widest">
							{result.code}
						</span>
						<span className="text-ink-dim text-xs">
							Expires{" "}
							{new Date(result.expiresAt).toLocaleTimeString(undefined, {
								hour: "numeric",
								minute: "2-digit",
							})}
						</span>
						<div className="mt-3 flex gap-2">
							<Button
								variant="secondary"
								className="flex-1"
								onClick={handleCopy}
							>
								{copied ? (
									<>
										<Check className="size-4" aria-hidden="true" /> Copied
									</>
								) : (
									<>
										<Copy className="size-4" aria-hidden="true" /> Copy code
									</>
								)}
							</Button>
							{canShareNatively() ? (
								<Button
									variant="secondary"
									className="flex-1"
									onClick={handleShare}
								>
									<Share className="size-4" aria-hidden="true" /> Share
								</Button>
							) : null}
						</div>
						<a
							href={NEW_SITE_URL}
							target="_blank"
							rel="noreferrer"
							className="mt-3 inline-flex items-center gap-1 font-medium text-accent text-sm underline underline-offset-2"
						>
							Open cookerist.com{" "}
							<ArrowRight className="size-3.5" aria-hidden="true" />
						</a>
					</div>
				) : (
					<Button
						className="mt-4 w-full"
						onClick={handleGenerate}
						disabled={generating}
					>
						{generating ? "Generating…" : "Generate code"}
					</Button>
				)}
				{error ? <p className="mt-2 text-warn text-xs">{error}</p> : null}
				<button
					type="button"
					onClick={handleDismiss}
					className="mt-3 w-full text-center text-ink-dim text-xs underline underline-offset-2"
				>
					Not now
				</button>
			</div>
		</div>
	);
}
