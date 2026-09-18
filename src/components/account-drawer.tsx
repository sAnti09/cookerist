import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useAppData } from "#/lib/app-data-context";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

type AccountDrawerProps = {
	open: boolean;
	onClose: () => void;
};

// The account/pairing UI — a slide-in side panel rather than a settings
// route or a 4th tab (per the user's own call, matching this codebase's
// existing preference for an overlay over a new nav destination — see
// cook-mode.tsx). No device roster/unlinking UI yet, and no "am I online"
// niceties beyond a manual Sync now button — this is the minimal slice that
// makes pairing/sharing actually usable (see CLAUDE.md's "Sharing feature"
// roadmap item).
export function AccountDrawer({ open, onClose }: AccountDrawerProps) {
	const { hasDeviceIdentity, createPairingCode, linkDevice, syncNow } =
		useAppData();
	const [pairingCode, setPairingCode] = useState<{
		code: string;
		expiresAt: string;
	} | null>(null);
	const [generating, setGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [codeInput, setCodeInput] = useState("");
	const [linking, setLinking] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState<string | null>(null);

	useBodyScrollLock(open);

	useEffect(() => {
		if (!open) return;
		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [open, onClose]);

	if (!open) return null;

	async function handleGenerateCode() {
		setGenerating(true);
		setGenerateError(null);
		try {
			const result = await createPairingCode();
			setPairingCode(result);
		} catch {
			setGenerateError("Couldn't generate a code. Please try again.");
		} finally {
			setGenerating(false);
		}
	}

	async function handleLinkDevice() {
		const code = codeInput.trim();
		if (!code) return;
		setLinking(true);
		setLinkError(null);
		try {
			await linkDevice(code);
			setCodeInput("");
		} catch {
			setLinkError("That code didn't work — check it and try again.");
		} finally {
			setLinking(false);
		}
	}

	async function handleSyncNow() {
		setSyncing(true);
		setSyncMessage(null);
		try {
			const didSync = await syncNow();
			setSyncMessage(didSync ? "Synced." : "Nothing to sync yet.");
		} catch {
			setSyncMessage("Sync failed — try again.");
		} finally {
			setSyncing(false);
		}
	}

	return (
		<div className="fixed inset-0 z-50 flex">
			<button
				type="button"
				aria-label="Close account panel"
				className="absolute inset-0 bg-black/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="account-drawer-title"
				className="relative flex h-full w-full max-w-xs flex-col gap-5 overflow-y-auto bg-surface p-5 shadow-xl"
				style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))" }}
			>
				<div className="flex items-center justify-between">
					<h2 id="account-drawer-title" className="display-title text-lg">
						Account & sync
					</h2>
					<button
						type="button"
						aria-label="Close"
						onClick={onClose}
						className="flex size-8 items-center justify-center rounded-[10px] hover:bg-bg2"
					>
						<X className="size-4" aria-hidden="true" />
					</button>
				</div>

				<p className="text-sm text-ink-dim">
					{hasDeviceIdentity
						? "This device can share recipes, grocery lists, and meal plans with another one of your devices."
						: "Share a recipe, grocery list, or meal plan (via its Share icon) to get started — this panel is for linking a second device afterward."}
				</p>

				<section className="card bg-card p-4">
					<h3 className="font-semibold text-sm">Link another device</h3>
					<p className="mt-1 text-ink-dim text-xs">
						Generate a code here, then enter it on the other device.
					</p>
					<Button
						variant="secondary"
						className="mt-3 w-full"
						onClick={handleGenerateCode}
						disabled={generating}
					>
						{generating ? "Generating…" : "Generate pairing code"}
					</Button>
					{pairingCode ? (
						<p className="mt-3 text-center">
							<span className="display-title block text-2xl tracking-widest">
								{pairingCode.code}
							</span>
							<span className="text-ink-dim text-xs">
								Expires{" "}
								{new Date(pairingCode.expiresAt).toLocaleTimeString(undefined, {
									hour: "numeric",
									minute: "2-digit",
								})}
							</span>
						</p>
					) : null}
					{generateError ? (
						<p className="mt-2 text-warn text-xs">{generateError}</p>
					) : null}
				</section>

				<section className="card bg-card p-4">
					<h3 className="font-semibold text-sm">Have a code?</h3>
					<p className="mt-1 text-ink-dim text-xs">
						Enter a code generated on another device to link this one to that
						account — anything you've already got here comes along too.
					</p>
					<input
						value={codeInput}
						onChange={(event) => setCodeInput(event.target.value.toUpperCase())}
						placeholder="Enter code"
						aria-label="Pairing code"
						className="mt-3 w-full rounded-full border border-line bg-bg px-4 py-2 text-center text-sm tracking-widest outline-none"
					/>
					<Button
						className="mt-2 w-full"
						onClick={handleLinkDevice}
						disabled={linking || codeInput.trim().length === 0}
					>
						{linking ? "Linking…" : "Link this device"}
					</Button>
					{linkError ? (
						<p className="mt-2 text-warn text-xs">{linkError}</p>
					) : null}
				</section>

				{hasDeviceIdentity ? (
					<section className="card bg-card p-4">
						<h3 className="font-semibold text-sm">Sync</h3>
						<p className="mt-1 text-ink-dim text-xs">
							Cookerist syncs automatically whenever you open the app — use this
							if you don't want to wait.
						</p>
						<Button
							variant="secondary"
							className="mt-3 w-full"
							onClick={handleSyncNow}
							disabled={syncing}
						>
							{syncing ? "Syncing…" : "Sync now"}
						</Button>
						{syncMessage ? (
							<p className="mt-2 text-ink-dim text-xs">{syncMessage}</p>
						) : null}
					</section>
				) : null}
			</div>
		</div>
	);
}
