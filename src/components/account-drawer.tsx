import { useNavigate } from "@tanstack/react-router";
import {
	Check,
	CheckCircle2,
	ChevronDown,
	Copy,
	KeyRound,
	Link2,
	RefreshCw,
	Share,
	Users,
	X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { Wordmark } from "#/components/wordmark";
import { useAppData } from "#/lib/app-data-context";
import { canShareNatively, shareNatively } from "#/lib/share-native";
import { RESOURCE_TABLE_LABEL } from "#/lib/sync/share-status";
import type { SyncTable } from "#/lib/sync/sync-client";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

type AccountDrawerProps = {
	open: boolean;
	onClose: () => void;
};

type RowKey = "device" | "link" | "redeem";

// The account/pairing UI — a slide-in side panel rather than a settings
// route or a 4th tab (per the user's own call, matching this codebase's
// existing preference for an overlay over a new nav destination — see
// cook-mode.tsx). No device roster/unlinking UI yet.
//
// Redesigned (TEST-post-per-resource-sharing session) from four
// always-expanded cards — each with its own heading and paragraph, all
// visible at once — into one status line plus a single grouped accordion
// list, one row per action, expanding in place like this app's own recipe
// rows: only one row's explanation is on screen at a time, and only one row
// is open at once (opening a second closes whichever was open). "Link this
// device" doesn't replace "Add another device" — a device with no identity
// yet can start from either (generating a code lazily creates an identity
// too, same as linking does), so both rows coexist until this device has
// one, then "Link this device" drops out.
export function AccountDrawer({ open, onClose }: AccountDrawerProps) {
	const navigate = useNavigate();
	const {
		hasDeviceIdentity,
		createPairingCode,
		linkDevice,
		syncNow,
		redeemShareCode,
	} = useAppData();
	const [openRow, setOpenRow] = useState<RowKey | null>(null);
	const [pairingCode, setPairingCode] = useState<{
		code: string;
		expiresAt: string;
	} | null>(null);
	const [generating, setGenerating] = useState(false);
	const [generateError, setGenerateError] = useState<string | null>(null);
	const [pairingCodeCopied, setPairingCodeCopied] = useState(false);
	const [codeInput, setCodeInput] = useState("");
	const [linking, setLinking] = useState(false);
	const [linkError, setLinkError] = useState<string | null>(null);
	const [syncing, setSyncing] = useState(false);
	const [syncMessage, setSyncMessage] = useState<string | null>(null);
	const [shareCodeInput, setShareCodeInput] = useState("");
	const [redeeming, setRedeeming] = useState(false);
	const [redeemError, setRedeemError] = useState<string | null>(null);
	const [redeemed, setRedeemed] = useState<{
		table: SyncTable;
		id: string;
		title: string;
	} | null>(null);

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

	function toggleRow(row: RowKey) {
		setOpenRow((current) => (current === row ? null : row));
	}

	async function handleGenerateCode() {
		setGenerating(true);
		setGenerateError(null);
		setPairingCodeCopied(false);
		try {
			const result = await createPairingCode();
			setPairingCode(result);
		} catch {
			setGenerateError("Couldn't generate a code. Please try again.");
		} finally {
			setGenerating(false);
		}
	}

	async function handleCopyPairingCode() {
		if (!pairingCode) return;
		try {
			await navigator.clipboard.writeText(pairingCode.code);
			setPairingCodeCopied(true);
			setTimeout(() => setPairingCodeCopied(false), 2000);
		} catch {
			// Clipboard access can be denied/unavailable — the code is still
			// visible on screen either way, so there's nothing more to do.
		}
	}

	async function handleSharePairingCode() {
		if (!pairingCode) return;
		await shareNatively({
			title: "Cookerist pairing code",
			text: `Sync your data to another device using the code ${pairingCode.code}.`,
		});
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

	async function handleRedeemShareCode() {
		const code = shareCodeInput.trim();
		if (!code) return;
		setRedeeming(true);
		setRedeemError(null);
		try {
			const result = await redeemShareCode(code);
			setRedeemed(result);
			setShareCodeInput("");
		} catch {
			setRedeemError("That code didn't work — check it and try again.");
		} finally {
			setRedeeming(false);
		}
	}

	function handleViewRedeemed() {
		if (!redeemed) return;
		onClose();
		if (redeemed.table === "recipes") {
			navigate({ to: "/recipes/$recipeId", params: { recipeId: redeemed.id } });
		} else if (redeemed.table === "grocery_lists") {
			navigate({ to: "/grocery/$listId", params: { listId: redeemed.id } });
		} else {
			navigate({ to: "/meal-plan/$planId", params: { planId: redeemed.id } });
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
				className="relative flex h-full w-full max-w-xs flex-col gap-4 overflow-y-auto bg-surface p-5 shadow-xl"
				style={{ paddingTop: "calc(1.25rem + env(safe-area-inset-top, 0px))" }}
			>
				<div className="flex items-center justify-between">
					<h2
						id="account-drawer-title"
						className="text-lg"
						aria-label="Account & sync"
					>
						<Wordmark />
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

				<div className="flex items-center gap-2.5 rounded-[14px] bg-bg2 px-3.5 py-3">
					{hasDeviceIdentity ? (
						<CheckCircle2
							className="size-[18px] shrink-0 text-sage"
							aria-hidden="true"
						/>
					) : (
						<Link2
							className="size-[18px] shrink-0 text-ink-dim"
							aria-hidden="true"
						/>
					)}
					<div className="min-w-0">
						<div className="text-sm">
							{hasDeviceIdentity ? "Syncs automatically" : "Not synced yet"}
						</div>
						<div className="text-ink-dim text-xs">
							{syncMessage ??
								(hasDeviceIdentity
									? "Recipes, grocery lists, and meal plans stay in sync."
									: "Pick an option below to start.")}
						</div>
					</div>
					{hasDeviceIdentity ? (
						<button
							type="button"
							aria-label="Sync now"
							onClick={handleSyncNow}
							disabled={syncing}
							className="ml-auto flex size-[30px] shrink-0 items-center justify-center rounded-[10px] text-ink-dim hover:bg-line disabled:opacity-60"
						>
							<RefreshCw
								className={`size-4 ${syncing ? "animate-spin" : ""}`}
								aria-hidden="true"
							/>
						</button>
					) : null}
				</div>

				<div className="card overflow-hidden">
					<AccordionRow
						icon={<Link2 className="size-[17px]" aria-hidden="true" />}
						title="Add another device"
						subtitle="Get a code to enter on your other device"
						open={openRow === "device"}
						onToggle={() => toggleRow("device")}
						bordered
					>
						{pairingCode ? (
							<div className="text-center">
								<span className="display-title block text-2xl tracking-widest">
									{pairingCode.code}
								</span>
								<span className="text-ink-dim text-xs">
									Expires{" "}
									{new Date(pairingCode.expiresAt).toLocaleTimeString(
										undefined,
										{ hour: "numeric", minute: "2-digit" },
									)}
								</span>
								<div className="mt-2.5 flex flex-col items-center gap-1.5">
									<div className="flex gap-2">
										<button
											type="button"
											aria-label="Copy code"
											onClick={handleCopyPairingCode}
											className="flex size-9 items-center justify-center rounded-full border border-line bg-bg2 text-ink hover:bg-line"
										>
											{pairingCodeCopied ? (
												<Check className="size-4" aria-hidden="true" />
											) : (
												<Copy className="size-4" aria-hidden="true" />
											)}
										</button>
										{canShareNatively() ? (
											<button
												type="button"
												aria-label="Share"
												onClick={handleSharePairingCode}
												className="flex size-9 items-center justify-center rounded-full border border-line bg-bg2 text-ink hover:bg-line"
											>
												<Share className="size-4" aria-hidden="true" />
											</button>
										) : null}
									</div>
									{pairingCodeCopied ? (
										<span className="text-sage text-xs">Copied</span>
									) : null}
								</div>
							</div>
						) : (
							<Button
								variant="secondary"
								className="w-full"
								onClick={handleGenerateCode}
								disabled={generating}
							>
								{generating ? "Generating…" : "Generate pairing code"}
							</Button>
						)}
						{generateError ? (
							<p className="mt-2 text-warn text-xs">{generateError}</p>
						) : null}
					</AccordionRow>

					{!hasDeviceIdentity ? (
						<AccordionRow
							icon={<KeyRound className="size-[17px]" aria-hidden="true" />}
							title="Link this device"
							subtitle="Paste a code from your other device"
							open={openRow === "link"}
							onToggle={() => toggleRow("link")}
							bordered
						>
							<input
								value={codeInput}
								onChange={(event) =>
									setCodeInput(event.target.value.toUpperCase())
								}
								placeholder="Enter code"
								aria-label="Pairing code"
								className="w-full rounded-full border border-line bg-bg px-4 py-2 text-center text-sm tracking-widest outline-none"
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
						</AccordionRow>
					) : null}

					<AccordionRow
						icon={<Users className="size-[17px]" aria-hidden="true" />}
						title="Redeem a share code"
						subtitle="Add something someone shared with you"
						open={openRow === "redeem"}
						onToggle={() => toggleRow("redeem")}
					>
						<input
							value={shareCodeInput}
							onChange={(event) =>
								setShareCodeInput(event.target.value.toUpperCase())
							}
							placeholder="Enter code"
							aria-label="Share code"
							className="w-full rounded-full border border-line bg-bg px-4 py-2 text-center text-sm tracking-widest outline-none"
						/>
						<Button
							className="mt-2 w-full"
							onClick={handleRedeemShareCode}
							disabled={redeeming || shareCodeInput.trim().length === 0}
						>
							{redeeming ? "Redeeming…" : "Redeem code"}
						</Button>
						<p className="mt-2 text-ink-dim text-xs">
							You'll be able to view and edit it, but not re-share or delete it.
						</p>
						{redeemError ? (
							<p className="mt-2 text-warn text-xs">{redeemError}</p>
						) : null}
						{redeemed ? (
							<div className="mt-2 flex items-center justify-between gap-2 text-xs">
								<p className="text-ink-dim">
									Added the {RESOURCE_TABLE_LABEL[redeemed.table]} "
									{redeemed.title}".
								</p>
								<button
									type="button"
									onClick={handleViewRedeemed}
									className="shrink-0 font-medium text-accent underline underline-offset-2"
								>
									View
								</button>
							</div>
						) : null}
					</AccordionRow>
				</div>
			</div>
		</div>
	);
}

type AccordionRowProps = {
	icon: React.ReactNode;
	title: string;
	subtitle: string;
	open: boolean;
	onToggle: () => void;
	bordered?: boolean;
	children: React.ReactNode;
};

function AccordionRow({
	icon,
	title,
	subtitle,
	open,
	onToggle,
	bordered,
	children,
}: AccordionRowProps) {
	return (
		<div className={bordered ? "border-b border-line px-3.5" : "px-3.5"}>
			<button
				type="button"
				onClick={onToggle}
				aria-expanded={open}
				className="flex w-full items-center gap-3 py-3.5 text-left"
			>
				<span className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-bg2 text-accent">
					{icon}
				</span>
				<span className="min-w-0">
					<div className="font-semibold text-sm">{title}</div>
					<div className="text-ink-dim text-xs">{subtitle}</div>
				</span>
				<ChevronDown
					className={`ml-auto size-4 shrink-0 text-ink-dim transition-transform duration-200 ${
						open ? "rotate-180" : ""
					}`}
					aria-hidden="true"
				/>
			</button>
			{open ? <div className="pb-4 pl-[46px]">{children}</div> : null}
		</div>
	);
}
