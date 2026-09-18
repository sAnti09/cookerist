import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Menu, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { GroceryListRow } from "#/components/grocery-list-row";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { IconButton } from "#/components/ui/icon-button";
import { SearchInput } from "#/components/ui/search-input";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useAppData } from "#/lib/app-data-context";
import { filterGroceryLists } from "#/lib/filter-grocery-lists";

export const Route = createFileRoute("/_tabs/grocery")({
	component: GroceryScreen,
});

function GroceryScreen() {
	const navigate = useNavigate();
	const {
		groceryLists,
		openCreateGroceryList,
		deleteGroceryList,
		openAccountDrawer,
	} = useAppData();
	const [search, setSearch] = useState("");
	const [deletingListId, setDeletingListId] = useState<string | null>(null);
	const filteredLists = useMemo(
		() => filterGroceryLists(groceryLists, search),
		[groceryLists, search],
	);

	return (
		<div className="px-5 pt-5">
			<div className="flex items-center gap-3">
				<IconButton aria-label="Account & sync" onClick={openAccountDrawer}>
					<Menu className="size-4 text-ink-dim" aria-hidden="true" />
				</IconButton>
				<h1 className="display-title flex-1 text-[22px] font-semibold text-ink">
					Grocery Lists
				</h1>
				<ThemeToggle />
			</div>

			{groceryLists.length > 0 ? (
				<div className="mt-4">
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search grocery lists…"
						aria-label="Search grocery lists"
						clearLabel="Clear grocery list search"
					/>
				</div>
			) : null}

			<div className="mt-4 flex flex-col gap-2.5 pb-4">
				{groceryLists.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No grocery lists yet — create one from your saved recipes.
					</p>
				) : filteredLists.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No grocery lists match "{search.trim()}".
					</p>
				) : (
					filteredLists.map((list) => (
						<GroceryListRow
							key={list.id}
							list={list}
							onDelete={() => setDeletingListId(list.id)}
							onShop={
								list.items.length > 0
									? () =>
											navigate({
												to: "/grocery/$listId",
												params: { listId: list.id },
												search: { autoStart: "shop" },
											})
									: undefined
							}
						/>
					))
				)}
			</div>

			<button
				type="button"
				aria-label="Create grocery list"
				onClick={openCreateGroceryList}
				className="fixed right-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-40 flex size-14 items-center justify-center rounded-full bg-accent text-primary-foreground shadow-[0_10px_20px_-6px_rgba(33,28,22,0.35)] transition-opacity hover:opacity-90"
			>
				<Plus className="size-[22px]" aria-hidden="true" />
			</button>

			<ConfirmDialog
				open={deletingListId != null}
				title="Delete this grocery list?"
				description={
					deletingListId
						? `"${groceryLists.find((l) => l.id === deletingListId)?.name}" will be permanently removed.`
						: undefined
				}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					if (deletingListId) deleteGroceryList(deletingListId);
					setDeletingListId(null);
				}}
				onCancel={() => setDeletingListId(null)}
			/>
		</div>
	);
}
