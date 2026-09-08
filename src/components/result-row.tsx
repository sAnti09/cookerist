import { Trash2 } from "lucide-react";
import { useState } from "react";
import { RecipeDetail } from "#/components/recipe-detail";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import type { Recipe } from "#/lib/recipe";

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
			<output className="block rounded-[18px] border border-border bg-card p-4">
				<p className="text-sm text-muted-foreground">
					Simmering your “{row.prompt}”…
				</p>
			</output>
		);
	}

	return (
		<div className="rounded-[18px] border border-border bg-destructive/10 p-4">
			<p className="text-sm text-destructive">{row.message}</p>
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
		<div className="rounded-[18px] border border-border bg-card p-4">
			<div className="flex items-start justify-between gap-3">
				<button
					type="button"
					className="flex-1 text-left"
					aria-expanded={recipe.expanded}
					onClick={() => onToggleExpand(recipe.id)}
				>
					<h3 className="display-title text-lg">{recipe.title}</h3>
					<p className="mt-1 text-xs text-muted-foreground">{date}</p>
				</button>
				<Button
					variant="secondary"
					className="shrink-0 px-2"
					aria-label={`Delete ${recipe.title}`}
					onClick={() => setConfirmingDelete(true)}
				>
					<Trash2 className="size-4" />
				</Button>
			</div>
			{recipe.expanded ? (
				<div className="mt-4 border-border border-t pt-4">
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
