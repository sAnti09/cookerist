import { ChevronDown, Clock, Flame, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { RecipeDetail } from "#/components/recipe-detail";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import { formatEstimatedTime, type Recipe } from "#/lib/recipe";
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
	onToggleFavorite,
	onUpdate,
}: {
	recipe: Recipe;
	onDelete: (id: string) => void;
	onToggleExpand: (id: string) => void;
	onToggleFavorite: (id: string) => void;
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
				"group card cursor-pointer p-4 transition-colors",
				recipe.expanded ? "bg-bg2" : "bg-card hover:bg-bg2",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				{/* biome-ignore lint/a11y/useSemanticElements: a nested <button> (favorite) can't live inside a <button> */}
				<div
					role="button"
					tabIndex={0}
					className="flex-1 cursor-pointer text-left"
					aria-expanded={recipe.expanded}
					onClick={() => onToggleExpand(recipe.id)}
					onKeyDown={(event) => {
						if (event.key === "Enter" || event.key === " ") {
							event.preventDefault();
							onToggleExpand(recipe.id);
						}
					}}
				>
					<h3 className="display-title text-lg">{recipe.title}</h3>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
						<span>{date}</span>
						{recipe.difficulty ? (
							<DifficultyBadge difficulty={recipe.difficulty} />
						) : null}
						{recipe.estimatedMinutes != null ? (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<Clock className="size-3" aria-hidden="true" />
								{formatEstimatedTime(recipe.estimatedMinutes)}
							</span>
						) : null}
						<Button
							variant="secondary"
							className={cn(
								"group/favorite shrink-0 rounded-[10px] p-1 transition-opacity",
								!recipe.expanded &&
									!recipe.favorite &&
									"opacity-0 group-hover:opacity-100 group-focus-within:opacity-100",
							)}
							aria-label={
								recipe.favorite
									? `Unfavorite ${recipe.title}`
									: `Favorite ${recipe.title}`
							}
							aria-pressed={recipe.favorite}
							onClick={(event) => {
								event.stopPropagation();
								onToggleFavorite(recipe.id);
							}}
						>
							<Star
								className={cn(
									"size-3 transition-colors",
									recipe.favorite
										? "fill-accent text-accent"
										: "text-ink-dim group-hover/favorite:text-accent",
								)}
							/>
						</Button>
					</div>
				</div>
				<div
					className={cn(
						"flex shrink-0 items-center gap-1",
						!recipe.expanded &&
							"opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
					)}
				>
					<Button
						variant="secondary"
						className="group/delete shrink-0 rounded-[10px] px-2"
						aria-label={`Delete ${recipe.title}`}
						onClick={() => setConfirmingDelete(true)}
					>
						<Trash2 className="size-4 text-ink-dim transition-colors group-hover/delete:text-warn" />
					</Button>
					<Button
						variant="secondary"
						className="shrink-0 rounded-[10px] px-2"
						aria-label={
							recipe.expanded
								? `Collapse ${recipe.title}`
								: `Expand ${recipe.title}`
						}
						onClick={() => onToggleExpand(recipe.id)}
					>
						<ChevronDown
							className={cn(
								"size-4 text-ink-dim transition-transform",
								recipe.expanded && "rotate-180",
							)}
						/>
					</Button>
				</div>
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
