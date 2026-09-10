import { useEffect } from "react";
import { Button } from "#/components/ui/button";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";

type ConfirmDialogProps = {
	open: boolean;
	title: string;
	description?: string;
	confirmLabel?: string;
	cancelLabel?: string;
	onConfirm: () => void;
	onCancel: () => void;
};

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	useBodyScrollLock(open);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onCancel();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onCancel]);

	if (!open) return null;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Dismiss dialog"
				className="absolute inset-0 bg-black/40"
				onClick={onCancel}
			/>
			<div
				role="alertdialog"
				aria-modal="true"
				aria-labelledby="confirm-dialog-title"
				className="card relative w-full max-w-sm bg-card p-5"
			>
				<h2 id="confirm-dialog-title" className="display-title text-lg">
					{title}
				</h2>
				{description ? (
					<p className="mt-2 text-sm text-ink-dim">{description}</p>
				) : null}
				<div className="mt-4 flex justify-end gap-2">
					<Button variant="secondary" onClick={onCancel}>
						{cancelLabel}
					</Button>
					<Button onClick={onConfirm}>{confirmLabel}</Button>
				</div>
			</div>
		</div>
	);
}
