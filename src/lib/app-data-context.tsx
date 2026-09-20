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
	upsertGroceryLists,
} from "#/lib/grocery-storage";
import {
	createPairingCodeForThisDevice,
	getDeviceIdentity,
	linkDeviceWithPairingCode,
} from "#/lib/identity/device";
import {
	createShareCodeForResource,
	redeemShareCode as redeemShareCodeClient,
} from "#/lib/identity/resource-sharing";
import { formatMealPlanDateRange, type MealPlan } from "#/lib/meal-plan";
import {
	deleteMealPlan,
	loadMealPlans,
	removeRecipeFromMealPlans,
	saveMealPlan,
	updateMealPlan,
	upsertMealPlans,
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
	upsertRecipes,
} from "#/lib/recipes-storage";
import {
	addPendingShareRevocation,
	removePendingShareRevocation,
} from "#/lib/sync/pending-share-revocations";
import {
	addPendingTombstone,
	removePendingTombstone,
} from "#/lib/sync/pending-tombstones";
import { isSharedWithMe as isSharedWithMeUtil } from "#/lib/sync/share-status";
import {
	pullOne,
	pushShareRevocation,
	pushTombstone,
	type SyncTable,
} from "#/lib/sync/sync-client";
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
	// stampForSync). The only ways a device actually gets an identity are the
	// account drawer's "Generate pairing code"/"Link this device"/"Redeem a
	// share code" actions (each lazily calls ensureDeviceIdentity) — there's
	// deliberately no per-item "start syncing" entry point anymore (an earlier
	// per-screen Share2 icon calling this was removed for being confusing
	// right next to the per-resource Share/UserPlus icon).
	hasDeviceIdentity: boolean;
	createPairingCode: () => Promise<{ code: string; expiresAt: string }>;
	// Only pairs this device to the code's account and syncs — never bulk
	// uploads this device's own data on its own (entering a code and having
	// your whole library dumped into someone else's account by surprise was
	// a real bug this avoids).
	linkDevice: (code: string) => Promise<void>;
	// Manually triggers a sync (see triggerSync below) and reports whether one
	// actually ran (false when this device has no identity yet — nothing to
	// sync) — used by the account drawer's "Sync now" button, which needs to
	// know whether to show a result message. Defaults to every table (an
	// explicit manual action should always catch up on everything); an
	// optional table list lets an internal caller (content-edit syncs) scope
	// it down instead.
	syncNow: (tables?: SyncTable[]) => Promise<boolean>;
	// True when `entity` (a recipe/grocery-list/meal-plan) was shared *to*
	// this device's account by someone else, rather than owned by it — see
	// CLAUDE.md's "Per-resource sharing" roadmap item and
	// src/lib/sync/share-status.ts. Drives hiding the re-share icon,
	// labeling Delete as "Remove," and the collapsed-row "Shared" badge.
	isSharedWithMe: (entity: { ownerId: string | null }) => boolean;
	// Mints a short-lived, single-use code for sharing one resource with a
	// different account — see the new "Share" icon on each detail screen.
	shareResource: (
		table: SyncTable,
		id: string,
	) => Promise<{ code: string; expiresAt: string }>;
	// Redeems a code minted by shareResource above: grants this account
	// access, then fetches and inserts the resource locally right away
	// (rather than waiting on the next watermark-based sync — see
	// sync-client.ts's pullOne for why that matters here). Used by the
	// account drawer's generic "Redeem a share code" field.
	redeemShareCode: (
		code: string,
	) => Promise<{ table: SyncTable; id: string; title: string }>;
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
	// visibility/focus effects use. `tables` defaults to everything (see
	// runSync in sync-engine.ts) — only present so a scoped caller (the
	// debounced content-edit sync below) can ask for just the table it
	// actually touched, and only that table's local state gets replaced
	// (a table that wasn't synced this cycle is simply absent from the
	// result, so it's left untouched here).
	const syncNow = useCallback(
		async (tables?: SyncTable[]): Promise<boolean> => {
			if (syncInFlightRef.current || !getDeviceIdentity()) return false;
			syncInFlightRef.current = true;
			try {
				const result = await runSync(tables);
				if (!result) return false;
				if (result.recipes) setRecipes(result.recipes);
				if (result.groceryLists) setGroceryLists(result.groceryLists);
				if (result.mealPlans) setMealPlans(result.mealPlans);
				return true;
			} finally {
				syncInFlightRef.current = false;
			}
		},
		[],
	);

	const triggerSync = useCallback(
		(tables?: SyncTable[]) => {
			syncNow(tables).catch((error) => {
				console.error("Sync failed:", error);
			});
		},
		[syncNow],
	);

	// Mount/focus/visibility-change ("I just came back to the app") syncs go
	// through this leading-edge throttle instead of calling triggerSync
	// directly: the whole point of those triggers is catching up on remote
	// changes *right now*, so the first one in a window should fire
	// immediately rather than waiting for things to go quiet (a trailing
	// debounce here would delay the very sync the user is waiting for). Any
	// further foreground trigger within the cooldown is just a duplicate
	// signal for the same "welcome back" moment (e.g. a visibilitychange and
	// a focus event firing back to back) and is dropped, not queued.
	const FOREGROUND_SYNC_MIN_INTERVAL_MS = 5_000;
	const lastForegroundSyncAtRef = useRef(0);
	const triggerForegroundSync = useCallback(() => {
		const now = Date.now();
		if (
			now - lastForegroundSyncAtRef.current <
			FOREGROUND_SYNC_MIN_INTERVAL_MS
		) {
			return;
		}
		lastForegroundSyncAtRef.current = now;
		triggerSync();
	}, [triggerSync]);

	// Checking five ingredients in a row shouldn't fire five separate sync
	// round-trips — debounce content-mutation-triggered syncs so a burst of
	// edits to the same (or different) entities coalesces into one push a
	// few seconds after things go quiet, rather than one per keystroke-ish
	// action (this one genuinely wants the trailing/"fire last" behavior,
	// unlike the foreground trigger above — there's no urgency to push
	// mid-edit-burst, and waiting for the settled state avoids sending
	// several intermediate pushes in a row). Accumulates which table(s) were
	// actually touched across the whole debounce window (in case, say, a
	// recipe edit and a grocery-list edit land within the same 5s window) so
	// the eventual sync only touches those, not every table every time.
	// Mount/focus/visibility-change syncs stay immediate (via
	// triggerForegroundSync above) — those are "I just opened this" moments,
	// not rapid-fire edits.
	const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
	const pendingSyncTablesRef = useRef<Set<SyncTable>>(new Set());
	const SYNC_DEBOUNCE_MS = 5000;
	const scheduleSync = useCallback(
		(tables: SyncTable[]) => {
			for (const table of tables) pendingSyncTablesRef.current.add(table);
			if (debounceTimerRef.current != null) {
				clearTimeout(debounceTimerRef.current);
			}
			debounceTimerRef.current = setTimeout(() => {
				debounceTimerRef.current = null;
				const tablesToSync = Array.from(pendingSyncTablesRef.current);
				pendingSyncTablesRef.current.clear();
				triggerSync(tablesToSync);
			}, SYNC_DEBOUNCE_MS);
		},
		[triggerSync],
	);

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
		triggerForegroundSync();
	}, [triggerForegroundSync]);

	// Sync-on-open: re-sync whenever the tab regains focus/visibility, not
	// just at mount — the whole point of "sync on open" is picking up changes
	// another device made while this tab sat in the background. Goes through
	// the foreground throttle above rather than triggerSync directly, so a
	// visibilitychange immediately followed by a focus event (or rapid
	// tab-switching) collapses into one sync instead of two.
	useEffect(() => {
		function handleVisibilityChange() {
			if (document.visibilityState === "visible") triggerForegroundSync();
		}
		document.addEventListener("visibilitychange", handleVisibilityChange);
		window.addEventListener("focus", triggerForegroundSync);
		return () => {
			document.removeEventListener("visibilitychange", handleVisibilityChange);
			window.removeEventListener("focus", triggerForegroundSync);
		};
	}, [triggerForegroundSync]);

	// Every paired device is a symmetric co-owner of a shared entity (see
	// CLAUDE.md's "Sharing feature" / Ownership section) — any of them can
	// fully delete it, and the delete cascades to the rest on their next sync.
	// There's no "leave" concept for pairing anymore; that's reserved for a
	// possible future "share one item with someone else's account" feature.
	//
	// The local entity is gone from storage the moment this returns, so it's
	// no longer around to notice if the tombstone push failed (or silently
	// matched zero rows — see pushTombstone's own comment) the way a failed
	// content edit naturally would on the next sync cycle. addPendingTombstone
	// records the delete-intent durably *before* attempting the push, so even
	// a page close mid-request leaves something for sync-engine.ts's
	// syncTable to retry; removePendingTombstone only fires once the push
	// actually confirms the row was touched.
	const handleDeleteRecipe = useCallback(
		(id: string) => {
			const recipe = recipes.find((r) => r.id === id);
			const myUserId = getDeviceIdentity()?.userId ?? null;
			if (recipe && isSharedWithMeUtil(recipe, myUserId)) {
				// A recipe shared *to* this account — "delete" here only ever
				// revokes this account's own grant, never the resource itself
				// (see CLAUDE.md's "Per-resource sharing" roadmap item).
				addPendingShareRevocation("recipes", id);
				pushShareRevocation("recipes", id)
					.then(() => removePendingShareRevocation("recipes", id))
					.catch((error) => {
						console.error("Failed to push recipe share revocation:", error);
					});
			} else if (recipe?.sharedAt != null) {
				addPendingTombstone("recipes", id);
				pushTombstone("recipes", id)
					.then(() => removePendingTombstone("recipes", id))
					.catch((error) => {
						console.error("Failed to push recipe tombstone:", error);
					});
			}
			setRecipes((current) => deleteRecipe(current, id));
			// A meal-plan entry's recipeId is otherwise a plain, uncleaned
			// pointer — see removeRecipeReferences (meal-plan.ts) for why leaving
			// it dangling can make a deleted recipe look "resurrected" later.
			setMealPlans((current) => removeRecipeFromMealPlans(current, id));
			scheduleSync(["meal_plans"]);
		},
		[recipes, scheduleSync],
	);

	const handleToggleFavoriteRecipe = useCallback(
		(id: string) => {
			setRecipes((current) => toggleFavoriteRecipe(current, id));
			scheduleSync(["recipes"]);
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
			scheduleSync(["recipes"]);
		},
		[scheduleSync],
	);

	const handleUpdateRecipes = useCallback(
		(recipesToUpdate: Recipe[]) => {
			setRecipes((current) => updateRecipes(current, recipesToUpdate));
			scheduleSync(["recipes"]);
		},
		[scheduleSync],
	);

	const handleCreateRecipe = useCallback(
		(recipe: Recipe) => {
			setRecipes((current) => saveRecipe(current, recipe));
			scheduleSync(["recipes"]);
		},
		[scheduleSync],
	);

	const handleDeleteGroceryList = useCallback(
		(id: string) => {
			const list = groceryLists.find((l) => l.id === id);
			const myUserId = getDeviceIdentity()?.userId ?? null;
			if (list && isSharedWithMeUtil(list, myUserId)) {
				addPendingShareRevocation("grocery_lists", id);
				pushShareRevocation("grocery_lists", id)
					.then(() => removePendingShareRevocation("grocery_lists", id))
					.catch((error) => {
						console.error(
							"Failed to push grocery list share revocation:",
							error,
						);
					});
			} else if (list?.sharedAt != null) {
				addPendingTombstone("grocery_lists", id);
				pushTombstone("grocery_lists", id)
					.then(() => removePendingTombstone("grocery_lists", id))
					.catch((error) => {
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
			scheduleSync(["grocery_lists"]);
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
			scheduleSync(["grocery_lists"]);
		},
		[editingGroceryList, scheduleSync],
	);

	const handleCreateMealPlan = useCallback(
		(plan: MealPlan) => {
			setMealPlans((current) => saveMealPlan(current, plan));
			scheduleSync(["meal_plans"]);
		},
		[scheduleSync],
	);

	const handleUpdateMealPlan = useCallback(
		(plan: MealPlan) => {
			setMealPlans((current) => updateMealPlan(current, plan));
			scheduleSync(["meal_plans"]);
		},
		[scheduleSync],
	);

	const handleDeleteMealPlan = useCallback(
		(id: string) => {
			const plan = mealPlans.find((p) => p.id === id);
			const myUserId = getDeviceIdentity()?.userId ?? null;
			if (plan && isSharedWithMeUtil(plan, myUserId)) {
				addPendingShareRevocation("meal_plans", id);
				pushShareRevocation("meal_plans", id)
					.then(() => removePendingShareRevocation("meal_plans", id))
					.catch((error) => {
						console.error("Failed to push meal plan share revocation:", error);
					});
			} else if (plan?.sharedAt != null) {
				addPendingTombstone("meal_plans", id);
				pushTombstone("meal_plans", id)
					.then(() => removePendingTombstone("meal_plans", id))
					.catch((error) => {
						console.error("Failed to push meal plan tombstone:", error);
					});
			}
			setMealPlans((current) => deleteMealPlan(current, id));
		},
		[mealPlans],
	);

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

	const isEntitySharedWithMe = useCallback(
		(entity: { ownerId: string | null }) =>
			isSharedWithMeUtil(entity, getDeviceIdentity()?.userId ?? null),
		[],
	);

	// Mints a share code for one resource — ensures this device has an
	// identity first (a no-op if it already does), same lazy-registration
	// philosophy as createPairingCode above.
	const handleShareResource = useCallback(
		async (table: SyncTable, id: string) => {
			const result = await createShareCodeForResource(table, id);
			setHasDeviceIdentity(true);
			return result;
		},
		[],
	);

	// Redeems a share code, then immediately fetches and inserts the
	// resource locally (see sync-client.ts's pullOne for why the generic
	// watermark-based pull can't be relied on for this) so the account
	// drawer can show the result right away instead of "check back after
	// the next sync."
	const handleRedeemShareCode = useCallback(
		async (
			code: string,
		): Promise<{ table: SyncTable; id: string; title: string }> => {
			const { resourceTable, resourceId } = await redeemShareCodeClient(code);
			setHasDeviceIdentity(true);
			const row = await pullOne(resourceTable, resourceId);
			if (!row) {
				throw new Error(
					"Couldn't load the shared item after redeeming the code.",
				);
			}
			const nowIso = new Date().toISOString();
			let title: string;
			if (resourceTable === "recipes") {
				const recipe: Recipe = {
					...(row.data as unknown as Recipe),
					ownerId: row.owner_id,
					sharedAt: (row.data as unknown as Recipe).sharedAt ?? nowIso,
				};
				setRecipes((current) => upsertRecipes(current, [recipe]));
				title = recipe.title;
			} else if (resourceTable === "grocery_lists") {
				const list: GroceryList = {
					...(row.data as unknown as GroceryList),
					ownerId: row.owner_id,
					sharedAt: (row.data as unknown as GroceryList).sharedAt ?? nowIso,
				};
				setGroceryLists((current) => upsertGroceryLists(current, [list]));
				title = list.name;
			} else {
				const plan: MealPlan = {
					...(row.data as unknown as MealPlan),
					ownerId: row.owner_id,
					sharedAt: (row.data as unknown as MealPlan).sharedAt ?? nowIso,
				};
				setMealPlans((current) => upsertMealPlans(current, [plan]));
				title =
					plan.description ||
					`${formatMealPlanDateRange(plan.startDate, plan.endDate)} meal plan`;
			}
			// Redeeming a grocery-list/meal-plan share also cascades grants for
			// everything it references (recipes, and a meal plan's linked
			// grocery list — see resource-share-registry.ts's cascadeGrants),
			// but only mints the grants; it doesn't fetch them. A full sync
			// picks those up right away via sync-engine.ts's grant
			// reconciliation, so the recipient sees the referenced recipes
			// immediately instead of on whatever the next incidental sync
			// happens to be.
			await syncNow();
			return { table: resourceTable, id: resourceId, title };
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
		createPairingCode: handleCreatePairingCode,
		linkDevice: handleLinkDevice,
		syncNow,
		isSharedWithMe: isEntitySharedWithMe,
		shareResource: handleShareResource,
		redeemShareCode: handleRedeemShareCode,
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
