import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useRef,
	useState,
} from "react";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	saveGroceryList,
	updateGroceryList,
} from "#/lib/grocery-storage";
import {
	createPairingCodeForThisDevice,
	getDeviceIdentity,
	linkDeviceWithPairingCode,
} from "#/lib/identity/device";
import type { MealPlan } from "#/lib/meal-plan";
import {
	deleteMealPlan,
	loadMealPlans,
	saveMealPlan,
	updateMealPlan,
} from "#/lib/meal-plan-storage";
import { MIGRATIONS, runMigrations } from "#/lib/migrations";
import type { Recipe } from "#/lib/recipe";
import {
	deleteRecipe,
	loadRecipes,
	saveRecipe,
	toggleFavoriteRecipe,
	updateRecipe,
	updateRecipes,
} from "#/lib/recipes-storage";
import { isOwnedByThisDevice } from "#/lib/sync/ownership";
import {
	type LocalData,
	shareAllLocalData,
	shareGroceryList as shareGroceryListAction,
	shareMealPlan as shareMealPlanAction,
	shareRecipe as shareRecipeAction,
} from "#/lib/sync/share-actions";
import { pushTombstone } from "#/lib/sync/sync-client";
import { runSync } from "#/lib/sync/sync-engine";

// The shared source of truth for recipes/grocery lists across every route —
// the old single-page app kept this as local useState in routes/index.tsx,
// but now that the Recipes list, a recipe's own detail page, the Grocery
// Lists list, and a grocery list's own detail page are all separate routes
// (separate component trees under the router), they need one place to read
// and mutate the same data without prop-drilling through route params.
// Plain React Context is enough here (small data, single tab, no cross-tab
// sync requirement) — no need for TanStack Store.
type AppDataContextValue = {
	recipes: Recipe[];
	groceryLists: GroceryList[];
	mealPlans: MealPlan[];
	// True once the initial localStorage load (and migration kickoff) has
	// run — the splash screen stays up until this flips true.
	ready: boolean;
	deleteRecipe: (id: string) => void;
	toggleFavoriteRecipe: (id: string) => void;
	updateRecipe: (recipe: Recipe) => void;
	updateRecipes: (recipes: Recipe[]) => void;
	createRecipe: (recipe: Recipe) => void;
	deleteGroceryList: (id: string) => void;
	updateGroceryList: (list: GroceryList) => void;
	creatingGroceryList: boolean;
	editingGroceryList: GroceryList | null;
	openCreateGroceryList: () => void;
	openEditGroceryList: (list: GroceryList) => void;
	closeGroceryListForm: () => void;
	saveGroceryListForm: (list: GroceryList) => void;
	createMealPlan: (plan: MealPlan) => void;
	updateMealPlan: (plan: MealPlan) => void;
	deleteMealPlan: (id: string) => void;
	// See CLAUDE.md's "Sharing feature" roadmap item / src/lib/sync/.
	hasDeviceIdentity: boolean;
	shareRecipe: (id: string) => Promise<void>;
	shareGroceryList: (id: string) => Promise<void>;
	shareMealPlan: (id: string) => Promise<void>;
	createPairingCode: () => Promise<{ code: string; expiresAt: string }>;
	linkDevice: (code: string) => Promise<void>;
	// Manually triggers a sync (see triggerSync below) and reports whether one
	// actually ran (false when this device has no identity yet — nothing to
	// sync) — used by the account drawer's "Sync now" button, which needs to
	// know whether to show a result message.
	syncNow: () => Promise<boolean>;
};

const AppDataContext = createContext<AppDataContextValue | null>(null);

export function AppDataProvider({ children }: { children: ReactNode }) {
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [groceryLists, setGroceryLists] = useState<GroceryList[]>([]);
	const [mealPlans, setMealPlans] = useState<MealPlan[]>([]);
	const [ready, setReady] = useState(false);
	const [creatingGroceryList, setCreatingGroceryList] = useState(false);
	const [editingGroceryList, setEditingGroceryList] =
		useState<GroceryList | null>(null);
	const [hasDeviceIdentity, setHasDeviceIdentity] = useState(
		() => getDeviceIdentity() != null,
	);
	// Guards against two sync-on-open runs overlapping (e.g. a visibilitychange
	// and a focus event firing back to back) — see triggerSync below.
	const syncInFlightRef = useRef(false);

	// Returns whether a sync actually ran (false if one was already in flight,
	// or this device has no identity yet — nothing to sync). Exposed as
	// `syncNow` on the context for the account drawer's manual button;
	// `triggerSync` below is the fire-and-forget wrapper the mount/
	// visibility/focus effects use.
	const syncNow = useCallback(async (): Promise<boolean> => {
		if (syncInFlightRef.current || !getDeviceIdentity()) return false;
		syncInFlightRef.current = true;
		try {
			const result = await runSync();
			if (!result) return false;
			setRecipes(result.recipes);
			setGroceryLists(result.groceryLists);
			setMealPlans(result.mealPlans);
			return true;
		} finally {
			syncInFlightRef.current = false;
		}
	}, []);

	const triggerSync = useCallback(() => {
		syncNow().catch((error) => {
			console.error("Sync failed:", error);
		});
	}, [syncNow]);

	useEffect(() => {
		// Deliberately not awaited — see run-migrations.ts / CLAUDE.md's
		// migrations section. A synchronous migration's localStorage writes
		// still land before loadRecipes()/loadGroceryLists() below since its
		// whole body runs before runMigrations' first `await` yields control
		// back here; a genuinely async migration's effect only shows up on the
		// next reload.
		runMigrations(MIGRATIONS).catch((error) => {
			console.error("Migration run failed:", error);
		});
		setRecipes(loadRecipes());
		setGroceryLists(loadGroceryLists());
		setMealPlans(loadMealPlans());
		setReady(true);
		// Also deliberately not awaited (same reasoning as migrations above) —
		// a no-op when this device has never shared anything (see
		// sync-engine.ts's runSync).
		triggerSync();
	}, [triggerSync]);

	// Sync-on-open: re-sync whenever the tab regains focus/visibility, not
	// just at mount — the whole point of "sync on open" is picking up changes
	// another device made while this tab sat in the background.
	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState === "visible") triggerSync();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", triggerSync);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", triggerSync);
		};
	}, [triggerSync]);

	// Shared entities need to check ownership (src/lib/sync/ownership.ts)
	// before deleting: the owner's delete tombstones it everywhere (pushed to
	// Supabase), anyone else's just removes their own copy ("leave" — see
	// CLAUDE.md's "Sharing feature" roadmap item). Either way the local
	// removal below is the same; only whether a tombstone gets pushed differs.
	const handleDeleteRecipe = useCallback(
		(id: string) => {
			const recipe = recipes.find((r) => r.id === id);
			if (recipe?.sharedAt != null && isOwnedByThisDevice(recipe)) {
				pushTombstone("recipes", id).catch((error) => {
					console.error("Failed to push recipe tombstone:", error);
				});
			}
			setRecipes((current) => deleteRecipe(current, id));
		},
		[recipes],
	);

	const handleToggleFavoriteRecipe = useCallback((id: string) => {
		setRecipes((current) => toggleFavoriteRecipe(current, id));
	}, []);

	const handleUpdateRecipe = useCallback((recipe: Recipe) => {
		setRecipes((current) => updateRecipe(current, recipe));
	}, []);

	const handleUpdateRecipes = useCallback((recipesToUpdate: Recipe[]) => {
		setRecipes((current) => updateRecipes(current, recipesToUpdate));
	}, []);

	const handleCreateRecipe = useCallback((recipe: Recipe) => {
		setRecipes((current) => saveRecipe(current, recipe));
	}, []);

	const handleDeleteGroceryList = useCallback(
		(id: string) => {
			const list = groceryLists.find((l) => l.id === id);
			if (list?.sharedAt != null && isOwnedByThisDevice(list)) {
				pushTombstone("grocery_lists", id).catch((error) => {
					console.error("Failed to push grocery list tombstone:", error);
				});
			}
			setGroceryLists((current) => deleteGroceryList(current, id));
		},
		[groceryLists],
	);

	const handleUpdateGroceryList = useCallback((list: GroceryList) => {
		setGroceryLists((current) => updateGroceryList(current, list));
	}, []);

	const openCreateGroceryList = useCallback(() => {
		setCreatingGroceryList(true);
	}, []);

	const openEditGroceryList = useCallback((list: GroceryList) => {
		setEditingGroceryList(list);
	}, []);

	const closeGroceryListForm = useCallback(() => {
		setCreatingGroceryList(false);
		setEditingGroceryList(null);
	}, []);

	const saveGroceryListForm = useCallback(
		(list: GroceryList) => {
			setGroceryLists((current) =>
				editingGroceryList
					? updateGroceryList(current, list)
					: saveGroceryList(current, list),
			);
			setCreatingGroceryList(false);
			setEditingGroceryList(null);
		},
		[editingGroceryList],
	);

	const handleCreateMealPlan = useCallback((plan: MealPlan) => {
		setMealPlans((current) => saveMealPlan(current, plan));
	}, []);

	const handleUpdateMealPlan = useCallback((plan: MealPlan) => {
		setMealPlans((current) => updateMealPlan(current, plan));
	}, []);

	const handleDeleteMealPlan = useCallback(
		(id: string) => {
			const plan = mealPlans.find((p) => p.id === id);
			if (plan?.sharedAt != null && isOwnedByThisDevice(plan)) {
				pushTombstone("meal_plans", id).catch((error) => {
					console.error("Failed to push meal plan tombstone:", error);
				});
			}
			setMealPlans((current) => deleteMealPlan(current, id));
		},
		[mealPlans],
	);

	const localData = useCallback(
		(): LocalData => ({ recipes, groceryLists, mealPlans }),
		[recipes, groceryLists, mealPlans],
	);

	const handleShareRecipe = useCallback(
		async (id: string) => {
			const result = await shareRecipeAction(localData(), id);
			setRecipes(result.recipes);
			setGroceryLists(result.groceryLists);
			setMealPlans(result.mealPlans);
		},
		[localData],
	);

	const handleShareGroceryList = useCallback(
		async (id: string) => {
			const result = await shareGroceryListAction(localData(), id);
			setRecipes(result.recipes);
			setGroceryLists(result.groceryLists);
			setMealPlans(result.mealPlans);
		},
		[localData],
	);

	const handleShareMealPlan = useCallback(
		async (id: string) => {
			const result = await shareMealPlanAction(localData(), id);
			setRecipes(result.recipes);
			setGroceryLists(result.groceryLists);
			setMealPlans(result.mealPlans);
		},
		[localData],
	);

	const handleCreatePairingCode = useCallback(async () => {
		const result = await createPairingCodeForThisDevice();
		setHasDeviceIdentity(true);
		return result;
	}, []);

	// Linking to an existing account brings this device's pre-existing local
	// data with it — see share-actions.ts's shareAllLocalData and CLAUDE.md's
	// "Sharing feature" roadmap item ("reuses this feature's merge logic when
	// the other device is your own").
	const handleLinkDevice = useCallback(
		async (code: string) => {
			await linkDeviceWithPairingCode(code);
			setHasDeviceIdentity(true);
			const result = await shareAllLocalData(localData());
			setRecipes(result.recipes);
			setGroceryLists(result.groceryLists);
			setMealPlans(result.mealPlans);
		},
		[localData],
	);

	const value: AppDataContextValue = {
		recipes,
		groceryLists,
		mealPlans,
		ready,
		deleteRecipe: handleDeleteRecipe,
		toggleFavoriteRecipe: handleToggleFavoriteRecipe,
		updateRecipe: handleUpdateRecipe,
		updateRecipes: handleUpdateRecipes,
		createRecipe: handleCreateRecipe,
		deleteGroceryList: handleDeleteGroceryList,
		updateGroceryList: handleUpdateGroceryList,
		creatingGroceryList,
		editingGroceryList,
		openCreateGroceryList,
		openEditGroceryList,
		closeGroceryListForm,
		saveGroceryListForm,
		createMealPlan: handleCreateMealPlan,
		updateMealPlan: handleUpdateMealPlan,
		deleteMealPlan: handleDeleteMealPlan,
		hasDeviceIdentity,
		shareRecipe: handleShareRecipe,
		shareGroceryList: handleShareGroceryList,
		shareMealPlan: handleShareMealPlan,
		createPairingCode: handleCreatePairingCode,
		linkDevice: handleLinkDevice,
		syncNow,
	};

	return (
		<AppDataContext.Provider value={value}>{children}</AppDataContext.Provider>
	);
}

export function useAppData(): AppDataContextValue {
	const context = useContext(AppDataContext);
	if (!context) {
		throw new Error("useAppData must be used within an AppDataProvider");
	}
	return context;
}
