import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { Menu } from "lucide-react";
import { useState } from "react";
import { AccountDrawer } from "#/components/account-drawer";
import { BottomTabBar } from "#/components/bottom-tab-bar";
import { GroceryListCreateForm } from "#/components/grocery-list-create-form";
import { InAppBrowserBanner } from "#/components/in-app-browser-banner";
import { SplashScreen } from "#/components/splash-screen";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { AppDataProvider, useAppData } from "#/lib/app-data-context";
import { useServiceWorkerUpdate } from "#/lib/use-service-worker-update";
import { cn } from "#/lib/utils";

// The two full-screen detail routes replace the tab bar with their own
// sticky "Start Cooking"/"Start Shopping" bar (per the nav-overhaul mockup)
// instead of sharing the bottom of the screen with it.
const DETAIL_ROUTE_IDS = new Set([
	"/_tabs/recipes_/$recipeId",
	"/_tabs/grocery_/$listId",
	"/_tabs/meal-plan_/new",
	"/_tabs/meal-plan_/$planId",
]);

export const Route = createFileRoute("/_tabs")({
	component: TabsLayout,
});

// Pathless layout shared by every tab: mounts the app-wide data provider
// (recipes/grocery lists + their CRUD, shared across the list and detail
// routes nested under it), the splash gate, the bottom tab bar, and the
// grocery list create/edit modal (triggered from either the Grocery list
// screen's FAB or a grocery detail screen's edit icon).
function TabsLayout() {
	return (
		<AppDataProvider>
			<TabsLayoutContent />
		</AppDataProvider>
	);
}

function TabsLayoutContent() {
	const {
		ready,
		recipes,
		creatingGroceryList,
		editingGroceryList,
		closeGroceryListForm,
		saveGroceryListForm,
		updateRecipe,
	} = useAppData();
	const matches = useMatches();
	const onDetailRoute = matches.some((match) =>
		DETAIL_ROUTE_IDS.has(match.routeId),
	);
	const { updateAvailable, applyUpdate, dismiss } = useServiceWorkerUpdate();
	const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);

	return (
		<>
			<SplashScreen ready={ready} />
			{onDetailRoute ? null : (
				// Bottom-left, mirroring the Grocery/Meal Plan FABs' bottom-right
				// position — deliberately not top-left/top-right, which would
				// overlap every tab root screen's own <h1>/ThemeToggle header row.
				<button
					type="button"
					aria-label="Account & sync"
					onClick={() => setAccountDrawerOpen(true)}
					className="fixed left-5 bottom-[calc(5.5rem+env(safe-area-inset-bottom,0px))] z-30 flex size-11 items-center justify-center rounded-full border border-line bg-surface text-ink-dim shadow-[0_10px_20px_-6px_rgba(33,28,22,0.25)]"
				>
					<Menu className="size-[18px]" aria-hidden="true" />
				</button>
			)}
			<div
				className={cn(
					"mx-auto min-h-screen w-full max-w-2xl",
					!onDetailRoute && "pb-28",
				)}
			>
				<InAppBrowserBanner />
				<Outlet />
			</div>
			{onDetailRoute ? null : <BottomTabBar />}
			<AccountDrawer
				open={accountDrawerOpen}
				onClose={() => setAccountDrawerOpen(false)}
			/>
			{creatingGroceryList || editingGroceryList ? (
				<GroceryListCreateForm
					recipes={recipes}
					editingList={editingGroceryList ?? undefined}
					onUpdateRecipe={updateRecipe}
					onSave={saveGroceryListForm}
					onClose={closeGroceryListForm}
				/>
			) : null}
			<ConfirmDialog
				open={updateAvailable}
				title="Update available"
				description="A new version of Cookerist is ready — reload to get it?"
				confirmLabel="Reload"
				cancelLabel="Later"
				onConfirm={applyUpdate}
				onCancel={dismiss}
			/>
		</>
	);
}
