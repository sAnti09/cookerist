import { Link } from "@tanstack/react-router";
import { CircleCheck } from "lucide-react";
import { type GroceryList, getGroceryListProgress } from "#/lib/grocery-list";

// Collapsed-only row — tapping navigates to the list's full-screen detail
// page (/grocery/$listId) instead of expanding in place. Per the
// nav-overhaul mockup, edit/delete moved to the detail page's header, and
// the row shows a recipe *count* chip rather than listing titles inline.
export function GroceryListRow({ list }: { list: GroceryList }) {
	const { checked, total, percent, completed } = getGroceryListProgress(list);
	const date = new Date(list.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<Link
			to="/grocery/$listId"
			params={{ listId: list.id }}
			id={`grocery-list-${list.id}`}
			data-testid={`grocery-list-row-${list.id}`}
			className="card block scroll-mt-6 bg-card p-4 text-ink no-underline transition-colors hover:bg-bg2"
		>
			<div className="flex items-center gap-1.5">
				<h3 className="display-title text-lg text-ink">{list.name}</h3>
				{completed ? (
					<CircleCheck
						className="size-[15px] shrink-0 text-sage"
						aria-label="Completed"
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
	);
}
