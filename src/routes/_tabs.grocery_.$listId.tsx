import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChevronLeft,
	Pencil,
	Share2,
	ShoppingCart,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { GroceryListDetail } from "#/components/grocery-list-detail";
import { GroceryMode } from "#/components/grocery-mode";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { IconButton } from "#/components/ui/icon-button";
import { useAppData } from "#/lib/app-data-context";
import { getGroceryListProgress } from "#/lib/grocery-list";
import { useGoBack } from "#/lib/use-go-back";
import { cn } from "#/lib/utils";

type GroceryDetailSearch = {
	// Set when this route was opened via a right-swipe "Shop" on a grocery
	// list row (see grocery-list-row.tsx) so Shop Mode opens immediately
	// instead of requiring a second tap on "Start Shopping" — only ever set
	// for a list with items, since that's the only case the row offers the
	// swipe at all.
	autoStart?: "shop";
};

export const Route = createFileRoute("/_tabs/grocery_/$listId")({
	validateSearch: (search: Record<string, unknown>): GroceryDetailSearch => ({
		autoStart: search.autoStart === "shop" ? "shop" : undefined,
	}),
	component: GroceryDetailScreen,
});

function GroceryDetailScreen() {
	const { listId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const goBack = useGoBack();
	const {
		groceryLists,
		recipes,
		deleteGroceryList,
		updateGroceryList,
		updateRecipes,
		openEditGroceryList,
		hasDeviceIdentity,
		enableSync,
	} = useAppData();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [groceryModeOpen, setGroceryModeOpen] = useState(
		search.autoStart === "shop",
	);
	const [sharing, setSharing] = useState(false);
	const list = groceryLists.find((l) => l.id === listId);

	async function handleShare() {
		if (sharing) return;
		setSharing(true);
		try {
			await enableSync();
		} finally {
			setSharing(false);
		}
	}

	if (!list) {
		return (
			<div className="flex flex-col items-center gap-3 px-5 pt-16 text-center">
				<p className="text-sm text-ink-dim">
					This grocery list couldn't be found — it may have been deleted.
				</p>
				<Link
					to="/grocery"
					className="font-medium text-accent underline underline-offset-2"
				>
					Back to grocery lists
				</Link>
			</div>
		);
	}

	const { checked, total, percent } = getGroceryListProgress(list);
	const date = new Date(list.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});

	return (
		<div>
			<div className="sticky top-0 z-10 flex items-center gap-2 border-line border-b bg-bg px-4 py-3.5">
				<IconButton
					aria-label="Back to grocery lists"
					onClick={() => goBack(() => navigate({ to: "/grocery" }))}
				>
					<ChevronLeft className="size-[18px]" aria-hidden="true" />
				</IconButton>
				<div className="display-title flex-1 truncate text-[15px] font-semibold">
					Grocery
				</div>
				<div className="flex shrink-0 gap-1.5">
					<IconButton
						aria-label={`Edit ${list.name}`}
						onClick={() => openEditGroceryList(list)}
					>
						<Pencil className="size-4 text-ink-dim" aria-hidden="true" />
					</IconButton>
					<IconButton
						aria-label={hasDeviceIdentity ? "Syncing" : "Start syncing"}
						onClick={handleShare}
						disabled={sharing}
					>
						<Share2
							className={cn(
								"size-4",
								hasDeviceIdentity ? "text-sage" : "text-ink-dim",
							)}
						/>
					</IconButton>
					<IconButton
						aria-label={`Delete ${list.name}`}
						onClick={() => setConfirmingDelete(true)}
					>
						<Trash2 className="size-4 text-ink-dim" />
					</IconButton>
				</div>
			</div>

			<div
				className={cn("px-5 pt-5", list.items.length > 0 ? "pb-28" : "pb-6")}
			>
				<h1 className="display-title text-2xl font-semibold leading-tight">
					{list.name}
				</h1>
				<div
					role="progressbar"
					aria-label={`${list.name} items checked`}
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					className="mt-3.5 h-1.5 w-full overflow-hidden rounded-full bg-bg2"
				>
					<div
						className="h-full rounded-full bg-sage transition-[width] duration-300 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
				<div className="mt-2 flex items-center justify-between gap-2 text-xs text-ink-dim tabular-nums">
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
				<div className="mt-5">
					<GroceryListDetail
						list={list}
						recipes={recipes}
						onUpdate={updateGroceryList}
						onUpdateRecipes={updateRecipes}
					/>
				</div>
			</div>

			<ConfirmDialog
				open={confirmingDelete}
				title="Delete this grocery list?"
				description={`"${list.name}" will be permanently removed.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					setConfirmingDelete(false);
					deleteGroceryList(list.id);
					navigate({ to: "/grocery" });
				}}
				onCancel={() => setConfirmingDelete(false)}
			/>

			{list.items.length > 0 ? (
				<div
					className="fixed inset-x-0 bottom-0 z-40 border-line border-t bg-bg px-5 pt-3.5 shadow-[0_-8px_22px_-18px_rgba(33,28,22,0.25)]"
					style={{
						paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
					}}
				>
					<button
						type="button"
						onClick={() => setGroceryModeOpen(true)}
						className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 font-semibold text-[15px] text-primary-foreground"
					>
						<ShoppingCart className="size-[17px]" aria-hidden="true" />
						Start Shopping
					</button>
				</div>
			) : null}
			{groceryModeOpen ? (
				<GroceryMode
					list={list}
					recipes={recipes}
					onUpdate={updateGroceryList}
					onUpdateRecipes={updateRecipes}
					onClose={() => setGroceryModeOpen(false)}
				/>
			) : null}
		</div>
	);
}
