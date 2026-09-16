import { createFileRoute, Outlet, useMatches } from "@tanstack/react-router";
import { BottomTabBar } from "#/components/bottom-tab-bar";
import { GroceryListCreateForm } from "#/components/grocery-list-create-form";
import { InAppBrowserBanner } from "#/components/in-app-browser-banner";
import { SplashScreen } from "#/components/splash-screen";
import { AppDataProvider, useAppData } from "#/lib/app-data-context";
import { cn } from "#/lib/utils";

// The two full-screen detail routes replace the tab bar with their own
// sticky "Start Cooking"/"Start Shopping" bar (per the nav-overhaul mockup)
// instead of sharing the bottom of the screen with it.
const DETAIL_ROUTE_IDS = new Set([
	"/_tabs/recipes_/$recipeId",
	"/_tabs/grocery_/$listId",
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

	return (
		<>
			<SplashScreen ready={ready} />
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
			{creatingGroceryList || editingGroceryList ? (
				<GroceryListCreateForm
					recipes={recipes}
					editingList={editingGroceryList ?? undefined}
					onUpdateRecipe={updateRecipe}
					onSave={saveGroceryListForm}
					onClose={closeGroceryListForm}
				/>
			) : null}
		</>
	);
}
