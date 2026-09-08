import { Flame, Trash2 } from "lucide-react";
import { useState } from "react";
import { RecipeDetail } from "#/components/recipe-detail";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

export type PendingRow = {
	localId: string;
	prompt: string;
	status: "loading" | "error";
	message?: string;
};

export function PendingResultRow({
	row,
	onRetry,
}: {
	row: PendingRow;
	onRetry: (prompt: string, localId: string) => void;
}) {
	if (row.status === "loading") {
		return (
			<output className="card flex items-center gap-3 bg-card p-4">
				<Flame
					className="flame-flicker size-5 shrink-0 text-accent"
					fill="currentColor"
					aria-hidden="true"
				/>
				<p className="text-sm text-ink-dim">Simmering your “{row.prompt}”…</p>
			</output>
		);
	}

	return (
		<div className="card border-warn bg-warn-wash p-4">
			<p className="text-sm text-warn">{row.message}</p>
			<Button
				variant="secondary"
				className="mt-3"
				onClick={() => onRetry(row.prompt, row.localId)}
			>
				Retry
			</Button>
		</div>
	);
}

export function RecipeResultRow({
	recipe,
	onDelete,
	onToggleExpand,
	onUpdate,
}: {
	recipe: Recipe;
	onDelete: (id: string) => void;
	onToggleExpand: (id: string) => void;
	onUpdate: (recipe: Recipe) => void;
}) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const date = new Date(recipe.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<div
			className={cn(
				"card cursor-pointer p-4 transition-colors",
				recipe.expanded ? "bg-bg2" : "bg-card hover:bg-bg2",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<button
					type="button"
					className="flex-1 cursor-pointer text-left"
					aria-expanded={recipe.expanded}
					onClick={() => onToggleExpand(recipe.id)}
				>
					<h3 className="display-title text-lg">{recipe.title}</h3>
					<p className="mt-1 text-xs text-ink-dim">{date}</p>
				</button>
				<Button
					variant="secondary"
					className="group shrink-0 rounded-[10px] px-2"
					aria-label={`Delete ${recipe.title}`}
					onClick={() => setConfirmingDelete(true)}
				>
					<Trash2 className="size-4 text-ink-dim transition-colors group-hover:text-warn" />
				</Button>
			</div>
			{recipe.expanded ? (
				<div className="mt-4 border-line border-t pt-4">
					<RecipeDetail recipe={recipe} onUpdate={onUpdate} />
				</div>
			) : null}
			<ConfirmDialog
				open={confirmingDelete}
				title="Delete this recipe?"
				description={`"${recipe.title}" will be permanently removed.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					setConfirmingDelete(false);
					onDelete(recipe.id);
				}}
				onCancel={() => setConfirmingDelete(false)}
			/>
		</div>
	);
}
