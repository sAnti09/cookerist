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
	ensureDeviceIdentity,
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
	// See CLAUDE.md's "Sharing feature" roadmap item / src/lib/sync/. There's
	// no per-item opt-in anymore — every recipe/grocery-list/meal-plan syncs
	// automatically once this device has an identity (see sync-engine.ts's
	// stampForSync). `enableSync` is what a per-item Share icon calls: it's
	// really "start syncing this device" (creating the identity if needed),
	// which happens to also push/pull everything, including whatever item
	// the tap came from.
	hasDeviceIdentity: boolean;
	enableSync: () => Promise<void>;
	createPairingCode: () => Promise<{ code: string; expiresAt: string }>;
	// Only pairs this device to the code's account and syncs — never bulk
	// uploads this device's own data on its own (see enableSync above for
	// that; entering a code and having your whole library dumped into
	// someone else's account by surprise was a real bug this avoids).
	linkDevice: (code: string) => Promise<void>;
	// Manually triggers a sync (see triggerSync below) and reports whether one
	// actually ran (false when this device has no identity yet — nothing to
	// sync) — used by the account drawer's "Sync now" button, which needs to
	// know whether to show a result message.
	syncNow: () => Promise<boolean>;
	// The account drawer's open/close state lives here (not local state in
	// _tabs.tsx) because the hamburger icon that opens it lives on each tab
	// root screen's own header row (see _tabs.recipes.tsx and its siblings),
	// not on the shared layout itself.
	accountDrawerOpen: boolean;
	openAccountDrawer: () => void;
	closeAccountDrawer: () => void;
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
	const [accountDrawerOpen, setAccountDrawerOpen] = useState(false);
	const openAccountDrawer = useCallback(() => setAccountDrawerOpen(true), []);
	const closeAccountDrawer = useCallback(() => setAccountDrawerOpen(false), []);
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

	// Checking five ingredients in a row shouldn't fire five separate sync
	// round-trips — debounce content-mutation-triggered syncs so a burst of
	// edits to the same (or different) entities coalesces into one push a
	// few seconds after things go quiet, rather than one per keystroke-ish
	// action. Mount/focus/visibility-change syncs stay immediate (undebounced
	// triggerSync calls) — those are "I just opened this" moments, not
	// rapid-fire edits.
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const SYNC_DEBOUNCE_MS = 5000;
	const scheduleSync = useCallback(() => {
		if (debounceTimerRef.current != null) {
			clearTimeout(debounceTimerRef.current);
		}
		debounceTimerRef.current = setTimeout(() => {
			debounceTimerRef.current = null;
			triggerSync();
		}, SYNC_DEBOUNCE_MS);
	}, [triggerSync]);

	useEffect(() => {
		return () => {
			if (debounceTimerRef.current != null) {
				clearTimeout(debounceTimerRef.current);
			}
		};
	}, []);

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
		// a no-op when this device has never started syncing (see
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

	const handleToggleFavoriteRecipe = useCallback(
		(id: string) => {
			setRecipes((current) => toggleFavoriteRecipe(current, id));
			scheduleSync();
		},
		[scheduleSync],
	);

	// Schedules a (debounced) re-sync right after any edit to a
	// recipe/list/plan (e.g. checking an ingredient) rather than only on the
	// next focus/visibility-change/mount — otherwise the change sits locally
	// until this tab happens to background-and-refocus, which is exactly what
	// made a checked ingredient look like it never reached the other device
	// (it hadn't been pushed yet, not that the merge was wrong).
	const handleUpdateRecipe = useCallback(
		(recipe: Recipe) => {
			setRecipes((current) => updateRecipe(current, recipe));
			scheduleSync();
		},
		[scheduleSync],
	);

	const handleUpdateRecipes = useCallback(
		(recipesToUpdate: Recipe[]) => {
			setRecipes((current) => updateRecipes(current, recipesToUpdate));
			scheduleSync();
		},
		[scheduleSync],
	);

	const handleCreateRecipe = useCallback(
		(recipe: Recipe) => {
			setRecipes((current) => saveRecipe(current, recipe));
			scheduleSync();
		},
		[scheduleSync],
	);

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

	const handleUpdateGroceryList = useCallback(
		(list: GroceryList) => {
			setGroceryLists((current) => updateGroceryList(current, list));
			scheduleSync();
		},
		[scheduleSync],
	);

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
			scheduleSync();
		},
		[editingGroceryList, scheduleSync],
	);

	const handleCreateMealPlan = useCallback(
		(plan: MealPlan) => {
			setMealPlans((current) => saveMealPlan(current, plan));
			scheduleSync();
		},
		[scheduleSync],
	);

	const handleUpdateMealPlan = useCallback(
		(plan: MealPlan) => {
			setMealPlans((current) => updateMealPlan(current, plan));
			scheduleSync();
		},
		[scheduleSync],
	);

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

	// What a per-item Share icon calls — see the AppDataContextValue comment
	// on `enableSync` above for why this isn't resource-scoped: it just
	// ensures this device has an identity (a no-op if it already does) and
	// runs a sync, which now pushes/pulls everything automatically.
	const handleEnableSync = useCallback(async () => {
		await ensureDeviceIdentity();
		setHasDeviceIdentity(true);
		await syncNow();
	}, [syncNow]);

	const handleCreatePairingCode = useCallback(async () => {
		const result = await createPairingCodeForThisDevice();
		setHasDeviceIdentity(true);
		return result;
	}, []);

	// Just pairs this device to the code's account and syncs — since every
	// local entity syncs automatically once identified (see
	// sync-engine.ts's stampForSync), there's nothing extra to trigger here:
	// the sync pushes this device's own data and pulls whatever the other
	// side already has, symmetrically.
	const handleLinkDevice = useCallback(
		async (code: string) => {
			await linkDeviceWithPairingCode(code);
			setHasDeviceIdentity(true);
			await syncNow();
		},
		[syncNow],
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
		enableSync: handleEnableSync,
		createPairingCode: handleCreatePairingCode,
		linkDevice: handleLinkDevice,
		syncNow,
		accountDrawerOpen,
		openAccountDrawer,
		closeAccountDrawer,
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
