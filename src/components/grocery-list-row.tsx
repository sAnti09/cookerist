import { ChevronDown, CircleCheck, Trash2 } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { type GroceryList, getGroceryListProgress } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

// Above this many recipes, listing every title would crowd the row — a count
// chip stays scannable.
const RECIPE_TITLES_INLINE_LIMIT = 3;

export function GroceryListRow({
	list,
	recipes,
	onDelete,
	onToggleExpand,
}: {
	list: GroceryList;
	recipes: Recipe[];
	onDelete: (id: string) => void;
	onToggleExpand: (id: string) => void;
}) {
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const { checked, total, percent, completed } = getGroceryListProgress(list);
	const recipeTitles = list.recipeIds
		.map((id) => recipes.find((recipe) => recipe.id === id)?.title)
		.filter((title): title is string => Boolean(title));

	return (
		<div
			className={cn(
				"group card cursor-pointer p-4 transition-colors",
				list.expanded ? "bg-bg2" : "bg-card hover:bg-bg2",
			)}
		>
			<div className="flex items-start justify-between gap-3">
				<button
					type="button"
					className="flex-1 cursor-pointer text-left"
					aria-expanded={list.expanded}
					onClick={() => onToggleExpand(list.id)}
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
					<div
						role="progressbar"
						aria-label={`${list.name} items checked`}
						aria-valuenow={percent}
						aria-valuemin={0}
						aria-valuemax={100}
						className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-bg2"
					>
						<div
							className="h-full rounded-full bg-sage transition-[width] duration-300 ease-out"
							style={{ width: `${percent}%` }}
						/>
					</div>
					<p className="mt-1 text-xs text-ink-dim tabular-nums">
						{checked}/{total} checked
					</p>
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
						className="group/delete shrink-0 rounded-[10px] px-2"
						aria-label={`Delete ${list.name}`}
						onClick={() => setConfirmingDelete(true)}
					>
						<Trash2 className="size-4 text-ink-dim transition-colors group-hover/delete:text-warn" />
					</Button>
					<Button
						variant="secondary"
						className="shrink-0 rounded-[10px] px-2"
						aria-label={
							list.expanded ? `Collapse ${list.name}` : `Expand ${list.name}`
						}
						onClick={() => onToggleExpand(list.id)}
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
			{list.expanded ? (
				<div className="mt-4 border-line border-t pt-4">
					<p className="text-sm text-ink-dim">
						Full grocery list detail is coming soon.
					</p>
				</div>
			) : null}
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
	);
}
