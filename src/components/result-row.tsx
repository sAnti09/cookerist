import { ChevronDown, Clock, Flame, Star, Trash2, Wand2 } from "lucide-react";
import { memo, useState } from "react";
import { RecipeDetail } from "#/components/recipe-detail";
import { RecipeModificationDialog } from "#/components/recipe-modification-dialog";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import {
	formatCaloriesPerServing,
	formatEstimatedTime,
	type Recipe,
} from "#/lib/recipe";
import { cn } from "#/lib/utils";

export type PendingRow = {
	localId: string;
	prompt: string;
	status: "loading" | "error";
	message?: string;
	// True when the error is Groq's on-topic rejection rather than a
	// generation failure — retrying the exact same prompt would just fail
	// the same way again, so this row's Retry behaves differently (see
	// PendingResultRow below).
	offTopic?: boolean;
};

export function PendingResultRow({
	row,
	onRetry,
}: {
	row: PendingRow;
	onRetry: (row: PendingRow) => void;
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
			<Button variant="secondary" className="mt-3" onClick={() => onRetry(row)}>
				Retry
			</Button>
		</div>
	);
}

// Memoized so an unrelated recipe's checkbox/servings/favorite change doesn't
// re-render every other row on the page — this only helps when the callback
// props below are themselves referentially stable (see the useCallback
// wrapping in routes/index.tsx).
export const RecipeResultRow = memo(function RecipeResultRow({
	recipe,
	onDelete,
	onToggleExpand,
	onToggleFavorite,
	onUpdate,
	onCreateRecipe,
}: {
	recipe: Recipe;
	onDelete: (id: string) => void;
	onToggleExpand: (id: string) => void;
	onToggleFavorite: (id: string) => void;
	onUpdate: (recipe: Recipe) => void;
	onCreateRecipe: (recipe: Recipe) => void;
}) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
	const date = new Date(recipe.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		// Whole card acts as a click-anywhere expand/collapse target (mouse/touch
		// convenience only — not focusable itself). Keyboard/AT users get one
		// coherent path via the title/metadata block below (role="button") or the
		// chevron button; every other control inside stops propagation so it
		// doesn't also toggle expand, and so this outer handler doesn't fire the
		// toggle a second time when those controls already handle it themselves.
		// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: intentionally mouse/touch-only — this div is never focusable, so it adds no new keyboard/AT interaction; keyboard users already reach the same action via the header (role="button") or the chevron button below.
		<div
			id={`recipe-${recipe.id}`}
			data-testid={`recipe-row-${recipe.id}`}
			className={cn(
				"group card scroll-mt-6 cursor-pointer p-4 transition-colors",
				recipe.expanded ? "bg-bg2" : "bg-card hover:bg-bg2",
			)}
			onClick={() => onToggleExpand(recipe.id)}
		>
			<div className="flex items-start justify-between gap-3">
				{/* biome-ignore lint/a11y/useSemanticElements: a nested <button> (favorite) can't live inside a <button> */}
				<div
					role="button"
					tabIndex={0}
					className="flex-1 cursor-pointer text-left outline-none"
					aria-expanded={recipe.expanded}
					onClick={(event) => {
						event.stopPropagation();
						onToggleExpand(recipe.id);
					}}
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
						{recipe.caloriesPerServing != null ? (
							<span className="inline-flex items-center gap-1 tabular-nums">
								<Flame className="size-3" aria-hidden="true" />
								{formatCaloriesPerServing(recipe.caloriesPerServing)}
							</span>
						) : null}
						<Button
							variant="secondary"
							className={cn(
								"group/favorite shrink-0 rounded-[10px] p-1 transition-opacity",
								!recipe.expanded &&
									!recipe.favorite &&
									// pointer-events-none while hidden — otherwise this still
									// intercepts taps on touch devices, which never trigger the
									// hover state that would normally reveal it first.
									"pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100",
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
				<div className="row-actions shrink-0">
					<Button
						variant="secondary"
						className={cn(
							"group/modify shrink-0 rounded-[10px] px-2 transition-opacity",
							!recipe.expanded &&
								// Hover-reveal only applies at sm+ (desktop, where hover
								// exists) — pointer-events-none while hidden there so it
								// doesn't intercept clicks before the hover state reveals
								// it. Always visible below sm (mobile/touch), since touch
								// has no hover state to reveal it with.
								"sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100",
						)}
						aria-label={`Modify ${recipe.title}`}
						onClick={(event) => {
							event.stopPropagation();
							setModifyDialogOpen(true);
						}}
					>
						<Wand2
							className={cn(
								"size-4 transition-colors group-hover/modify:text-accent",
								recipe.pendingModification ? "text-accent" : "text-ink-dim",
							)}
						/>
					</Button>
					<Button
						variant="secondary"
						className={cn(
							"group/delete shrink-0 rounded-[10px] px-2 transition-opacity",
							!recipe.expanded &&
								// See the Modify button above — hover-reveal is desktop-only
								// (sm+); always visible on mobile/touch.
								"sm:pointer-events-none sm:opacity-0 sm:group-hover:pointer-events-auto sm:group-hover:opacity-100 sm:group-focus-within:pointer-events-auto sm:group-focus-within:opacity-100",
						)}
						aria-label={`Delete ${recipe.title}`}
						onClick={(event) => {
							event.stopPropagation();
							setConfirmingDelete(true);
						}}
					>
						<Trash2 className="size-4 text-ink-dim transition-colors group-hover/delete:text-warn" />
					</Button>
					{/* Always visible (unlike Delete/Favorite above) — it's the one
					cue that the row itself is expandable, not just a hover nicety. */}
					<Button
						variant="secondary"
						className="shrink-0 rounded-[10px] px-2"
						aria-label={
							recipe.expanded
								? `Collapse ${recipe.title}`
								: `Expand ${recipe.title}`
						}
						onClick={(event) => {
							event.stopPropagation();
							onToggleExpand(recipe.id);
						}}
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
				// Stops clicks inside the expanded detail (checkboxes, servings
				// stepper, etc. — owned by RecipeDetail, out of this fix's scope)
				// from bubbling up and misfiring the card's expand-toggle handler.
				// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only stops click-event propagation, adds no new interaction — RecipeDetail's own controls remain the real, keyboard-accessible ones.
				<div
					className="mt-4 border-line border-t pt-4"
					onClick={(event) => event.stopPropagation()}
				>
					<RecipeDetail recipe={recipe} onUpdate={onUpdate} />
				</div>
			) : null}
			{/* Stops the dialog's own backdrop/confirm/cancel clicks from bubbling
			up to the card's expand-toggle handler above. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only stops click-event propagation, adds no new interaction — ConfirmDialog's own buttons remain the real, keyboard-accessible controls. */}
			<div onClick={(event) => event.stopPropagation()}>
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
			{/* Stops the dialog's own backdrop/form/button clicks from bubbling up
			to the card's expand-toggle handler above. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only stops click-event propagation, adds no new interaction — RecipeModificationDialog's own controls remain the real, keyboard-accessible ones. */}
			<div onClick={(event) => event.stopPropagation()}>
				<RecipeModificationDialog
					recipe={recipe}
					open={modifyDialogOpen}
					onClose={() => setModifyDialogOpen(false)}
					onUpdate={onUpdate}
					onCreateRecipe={onCreateRecipe}
				/>
			</div>
		</div>
	);
});
