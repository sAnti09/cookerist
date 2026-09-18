import { Link } from "@tanstack/react-router";
import { CircleCheck, ShoppingCart, Trash2, Users } from "lucide-react";
import { type GroceryList, getGroceryListProgress } from "#/lib/grocery-list";
import { useSwipeRowActions } from "#/lib/use-swipe-row-actions";

// Collapsed-only row — tapping navigates to the list's full-screen detail
// page (/grocery/$listId) instead of expanding in place. Per the
// nav-overhaul mockup, edit moved to the detail page's header; Delete and
// (when the list has items to shop) Shop are instead reached via swipe — see
// use-swipe-row-actions.ts — mirroring meal-plan-entry-row.tsx's gesture.
// `onShop` is omitted entirely for an empty list (nothing for "Start
// Shopping" to do), which also disables the right-swipe drag itself rather
// than revealing a dead panel.
export function GroceryListRow({
	list,
	shared = false,
	onDelete,
	onShop,
}: {
	list: GroceryList;
	// True when this list was shared *to* this account by someone else —
	// see CLAUDE.md's "Per-resource sharing" roadmap item.
	shared?: boolean;
	onDelete: () => void;
	onShop?: () => void;
}) {
	const { checked, total, percent, completed } = getGroceryListProgress(list);
	const date = new Date(list.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const swipe = useSwipeRowActions<HTMLAnchorElement>({
		onSwipeLeft: onDelete,
		onSwipeRight: onShop,
	});

	return (
		<div className="relative overflow-hidden rounded-[18px]">
			{onShop ? (
				<div
					aria-hidden="true"
					className="absolute inset-y-0 left-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-accent text-[11px] font-semibold text-primary-foreground"
				>
					<ShoppingCart className="size-4" aria-hidden="true" />
					Shop
				</div>
			) : null}
			<div
				aria-hidden="true"
				className="absolute inset-y-0 right-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-warn text-[11px] font-semibold text-warn-wash"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				Delete
			</div>
			<Link
				ref={swipe.ref}
				to="/grocery/$listId"
				params={{ listId: list.id }}
				id={`grocery-list-${list.id}`}
				data-testid={`grocery-list-row-${list.id}`}
				{...swipe.handlers}
				className="card block translate-x-0 scroll-mt-6 bg-card p-4 text-ink no-underline transition-transform duration-200"
			>
				<div className="flex items-center gap-1.5">
					<h3 className="display-title text-lg text-ink">{list.name}</h3>
					{completed ? (
						<CircleCheck
							className="size-[15px] shrink-0 text-sage"
							aria-label="Completed"
						/>
					) : null}
					{shared ? (
						<Users
							className="size-[15px] shrink-0 text-ink-dim"
							aria-label="Shared with you"
						/>
					) : null}
				</div>
				<div
					role="progressbar"
					aria-label={`${list.name} items checked`}
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-bg2"
				>
					<div
						className="h-full rounded-full bg-sage transition-[width] duration-300 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
				<div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-ink-dim tabular-nums">
					<span>
						{date} · {checked}/{total} checked
					</span>
					{list.recipeIds.length > 0 ? (
						<span className="whitespace-nowrap rounded-[10px] bg-bg2 px-2 py-0.5">
							{list.recipeIds.length}{" "}
							{list.recipeIds.length === 1 ? "recipe" : "recipes"}
						</span>
					) : null}
				</div>
			</Link>
		</div>
	);
}
