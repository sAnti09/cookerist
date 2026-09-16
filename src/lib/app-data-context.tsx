import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useEffect,
	useState,
} from "react";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	saveGroceryList,
	updateGroceryList,
} from "#/lib/grocery-storage";
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
	}, []);

	const handleDeleteRecipe = useCallback((id: string) => {
		setRecipes((current) => deleteRecipe(current, id));
	}, []);

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

	const handleDeleteGroceryList = useCallback((id: string) => {
		setGroceryLists((current) => deleteGroceryList(current, id));
	}, []);

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

	const handleDeleteMealPlan = useCallback((id: string) => {
		setMealPlans((current) => deleteMealPlan(current, id));
	}, []);

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
