import { Check, Copy, Share, X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { useAppData } from "#/lib/app-data-context";
import { canShareNatively, shareNatively } from "#/lib/share-native";
import { RESOURCE_TABLE_LABEL } from "#/lib/sync/share-status";
import type { SyncTable } from "#/lib/sync/sync-client";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

type ShareResourceDialogProps = {
	open: boolean;
	onClose: () => void;
	table: SyncTable;
	id: string;
	title: string;
};

// Shared across all three detail screens (recipe/grocery-list/meal-plan) —
// see CLAUDE.md's "Per-resource sharing" roadmap item. Generates a
// single-use, 10-minute code the owner reads out or copies to the other
// person, who redeems it via the account drawer's generic "Redeem a share
// code" field (works for all three resource types, since the code itself
// encodes which one it points to). Deliberately its own dialog rather than
// reusing ConfirmDialog — this one needs to display a generated code and
// hold copy/error state, not just confirm an action.
export function ShareResourceDialog({
	open,
	onClose,
	table,
	id,
	title,
}: ShareResourceDialogProps) {
	const { shareResource } = useAppData();
	const [generating, setGenerating] = useState(false);
	const [result, setResult] = useState<{
		code: string;
		expiresAt: string;
	} | null>(null);
	const [error, setError] = useState<string | null>(null);
	const [copied, setCopied] = useState(false);

	useBodyScrollLock(open);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	// Reset so re-opening the dialog for a different resource (or the same
	// one, later) never shows a stale code.
	useEffect(() => {
		if (!open) {
			setResult(null);
			setError(null);
			setCopied(false);
		}
	}, [open]);

	if (!open) return null;

	async function handleGenerate() {
		setGenerating(true);
		setError(null);
		try {
			const code = await shareResource(table, id);
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
			// Clipboard access can be denied/unavailable — the code is still
			// visible on screen either way, so there's nothing more to do.
		}
	}

	async function handleShare() {
		if (!result) return;
		await shareNatively({
			title: "Cookerist share code",
			text: `The ${RESOURCE_TABLE_LABEL[table]} "${title}" has been shared and can be redeemed using the code ${result.code}.`,
		});
	}

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
				aria-labelledby="share-resource-dialog-title"
				className="card relative w-full max-w-sm bg-card p-5"
			>
				<div className="flex items-center justify-between">
					<h2
						id="share-resource-dialog-title"
						className="display-title text-lg"
					>
						Share "{title}"
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
				<p className="mt-2 text-sm text-ink-dim">
					Generate a code, then share it with the other person — they redeem it
					under Account &amp; sync → Redeem a share code. They'll be able to
					view and edit it, but can't re-share it or delete it for you.
				</p>
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
					</div>
				) : (
					<Button
						className="mt-4 w-full"
						onClick={handleGenerate}
						disabled={generating}
					>
						{generating ? "Generating…" : "Generate share code"}
					</Button>
				)}
				{error ? <p className="mt-2 text-warn text-xs">{error}</p> : null}
			</div>
		</div>
	);
}
