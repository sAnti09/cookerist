import { ChevronDown, CircleCheck, Pencil, Trash2 } from "lucide-react";
import { memo, useState } from "react";
import { GroceryListDetail } from "#/components/grocery-list-detail";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { type GroceryList, getGroceryListProgress } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

// Above this many recipes, listing every title would crowd the row — a count
// chip stays scannable.
const RECIPE_TITLES_INLINE_LIMIT = 3;

// Memoized so an unrelated grocery list's item check doesn't re-render every
// other row on the page — this only helps when the callback props below are
// themselves referentially stable (see the useCallback wrapping in
// routes/index.tsx). Note this row still re-renders whenever `recipes`
// changes, since checking a recipe-linked item updates that shared array —
// only a custom-item check or an edit/delete on an unrelated list fully
// skips re-rendering other rows.
export const GroceryListRow = memo(function GroceryListRow({
	list,
	recipes,
	onDelete,
	onEdit,
	onToggleExpand,
	onUpdate,
	onUpdateRecipes,
}: {
	list: GroceryList;
	recipes: Recipe[];
	onDelete: (id: string) => void;
	onEdit: (list: GroceryList) => void;
	onToggleExpand: (id: string) => void;
	onUpdate: (list: GroceryList) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
}) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const { checked, total, percent, completed } = getGroceryListProgress(list);
	const date = new Date(list.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const recipeTitles = list.recipeIds
		.map((id) => recipes.find((recipe) => recipe.id === id)?.title)
		.filter((title): title is string => Boolean(title));

	return (
		// Whole card acts as a click-anywhere expand/collapse target (mouse/touch
		// convenience only — not focusable itself). Keyboard/AT users get one
		// coherent path via the title/metadata button or the chevron button;
		// every other control inside stops propagation so it doesn't also toggle
		// expand, and so this outer handler doesn't fire the toggle a second time
		// when those controls already handle it themselves.
		// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: intentionally mouse/touch-only — this div is never focusable, so it adds no new keyboard/AT interaction; keyboard users already reach the same action via the header button, the progress-bar button, or the chevron button below.
		<div
			id={`grocery-list-${list.id}`}
			data-testid={`grocery-list-row-${list.id}`}
			className={cn(
				"group card scroll-mt-6 cursor-pointer p-4 transition-colors",
				list.expanded ? "bg-bg2" : "bg-card hover:bg-bg2",
			)}
			onClick={() => onToggleExpand(list.id)}
		>
			<div className="flex items-start justify-between gap-3">
				<button
					type="button"
					className="flex-1 cursor-pointer text-left outline-none"
					aria-expanded={list.expanded}
					onClick={(event) => {
						event.stopPropagation();
						onToggleExpand(list.id);
					}}
				>
					<h3 className="display-title text-lg">{list.name}</h3>
					<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
						{recipeTitles.length > 0 ? (
							recipeTitles.length <= RECIPE_TITLES_INLINE_LIMIT ? (
								<span>{recipeTitles.join(", ")}</span>
							) : (
								<span className="inline-flex items-center rounded-[10px] bg-bg2 px-2 py-0.5">
									{recipeTitles.length} recipes
								</span>
							)
						) : null}
						{completed ? (
							<span className="inline-flex items-center gap-1 rounded-[10px] bg-sage/15 px-2 py-0.5 font-medium text-sage">
								<CircleCheck className="size-3" aria-hidden="true" />
								Completed
							</span>
						) : null}
					</div>
				</button>
				<div
					className={cn(
						"flex shrink-0 items-center gap-1",
						!list.expanded &&
							"opacity-0 transition-opacity group-hover:opacity-100 group-focus-within:opacity-100",
					)}
				>
					<Button
						variant="secondary"
						className="shrink-0 rounded-[10px] px-2"
						aria-label={`Edit ${list.name}`}
						onClick={(event) => {
							event.stopPropagation();
							onEdit(list);
						}}
					>
						<Pencil className="size-4 text-ink-dim" aria-hidden="true" />
					</Button>
					<Button
						variant="secondary"
						className="group/delete shrink-0 rounded-[10px] px-2"
						aria-label={`Delete ${list.name}`}
						onClick={(event) => {
							event.stopPropagation();
							setConfirmingDelete(true);
						}}
					>
						<Trash2 className="size-4 text-ink-dim transition-colors group-hover/delete:text-warn" />
					</Button>
					<Button
						variant="secondary"
						className="shrink-0 rounded-[10px] px-2"
						aria-label={
							list.expanded ? `Collapse ${list.name}` : `Expand ${list.name}`
						}
						onClick={(event) => {
							event.stopPropagation();
							onToggleExpand(list.id);
						}}
					>
						<ChevronDown
							className={cn(
								"size-4 text-ink-dim transition-transform",
								list.expanded && "rotate-180",
							)}
						/>
					</Button>
				</div>
			</div>
			{/* A full-width row of its own — sharing the header's flex row with the
			icon buttons would keep the bar from ever reaching the card's right edge. */}
			<button
				type="button"
				className="mt-2 block w-full cursor-pointer text-left"
				aria-expanded={list.expanded}
				onClick={(event) => {
					event.stopPropagation();
					onToggleExpand(list.id);
				}}
			>
				<div
					role="progressbar"
					aria-label={`${list.name} items checked`}
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					className="h-1.5 w-full overflow-hidden rounded-full bg-bg2"
				>
					<div
						className="h-full rounded-full bg-sage transition-[width] duration-300 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
				<p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim tabular-nums">
					<span>{date}</span>
					<span>
						{checked}/{total} checked
					</span>
				</p>
			</button>
			{list.expanded ? (
				// Stops clicks inside the expanded detail (checkboxes, etc. — owned
				// by GroceryListDetail, out of this fix's scope) from bubbling up
				// and misfiring the card's expand-toggle handler.
				// biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only stops click-event propagation, adds no new interaction — GroceryListDetail's own controls remain the real, keyboard-accessible ones.
				<div
					className="mt-4 border-line border-t pt-4"
					onClick={(event) => event.stopPropagation()}
				>
					<GroceryListDetail
						list={list}
						recipes={recipes}
						onUpdate={onUpdate}
						onUpdateRecipes={onUpdateRecipes}
					/>
				</div>
			) : null}
			{/* Stops the dialog's own backdrop/confirm/cancel clicks from bubbling
			up to the card's expand-toggle handler above. */}
			{/* biome-ignore lint/a11y/noStaticElementInteractions lint/a11y/useKeyWithClickEvents: only stops click-event propagation, adds no new interaction — ConfirmDialog's own buttons remain the real, keyboard-accessible controls. */}
			<div onClick={(event) => event.stopPropagation()}>
				<ConfirmDialog
					open={confirmingDelete}
					title="Delete this grocery list?"
					description={`"${list.name}" will be permanently removed.`}
					confirmLabel="Delete"
					cancelLabel="Cancel"
					onConfirm={() => {
						setConfirmingDelete(false);
						onDelete(list.id);
					}}
					onCancel={() => setConfirmingDelete(false)}
				/>
			</div>
		</div>
	);
});
