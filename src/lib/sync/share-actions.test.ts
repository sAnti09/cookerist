import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import type { MealPlan } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";

const ensureDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	ensureDeviceIdentity: () => ensureDeviceIdentityMock(),
}));

const pushEntitiesMock = vi.fn();
vi.mock("#/lib/sync/sync-client", () => ({
	pushEntities: (...args: unknown[]) => pushEntitiesMock(...args),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: () => runSyncMock(),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "r1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		prompt: "test",
		title: "Recipe",
		overview: "",
		baseServings: 2,
		currentServings: 2,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

function makeGroceryList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: "l1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		name: "List",
		recipeIds: [],
		items: [],
		expanded: false,
		...overrides,
	};
}

function makeMealPlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		id: "p1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		startDate: "2026-01-01",
		endDate: "2026-01-07",
		description: "",
		defaultServings: 4,
		status: "ready",
		entries: [],
		refineInstructions: [],
		...overrides,
	};
}

beforeEach(() => {
	window.localStorage.clear();
	ensureDeviceIdentityMock.mockReset();
	pushEntitiesMock.mockReset();
	runSyncMock.mockReset();
	ensureDeviceIdentityMock.mockResolvedValue({ deviceId: "device-1" });
	pushEntitiesMock.mockResolvedValue(undefined);
});

describe("shareRecipe", () => {
	it("stamps sharedAt/ownerDeviceId, pushes, and persists the recipe", async () => {
		const { shareRecipe } = await import("./share-actions");
		const recipe = makeRecipe();

		const result = await shareRecipe(
			{ recipes: [recipe], groceryLists: [], mealPlans: [] },
			"r1",
		);

		const shared = result.recipes[0];
		expect(shared?.sharedAt).not.toBeNull();
		expect(shared?.ownerDeviceId).toBe("device-1");
		expect(pushEntitiesMock).toHaveBeenCalledWith(
			"recipes",
			expect.arrayContaining([expect.objectContaining({ id: "r1" })]),
		);
	});

	it("returns local data unchanged when the recipe id doesn't exist", async () => {
		const { shareRecipe } = await import("./share-actions");
		const local = { recipes: [], groceryLists: [], mealPlans: [] };

		const result = await shareRecipe(local, "missing");

		expect(result).toBe(local);
		expect(ensureDeviceIdentityMock).not.toHaveBeenCalled();
	});

	it("keeps an already-shared recipe's existing ownerDeviceId", async () => {
		const { shareRecipe } = await import("./share-actions");
		const recipe = makeRecipe({
			sharedAt: "2026-01-01T00:00:00.000Z",
			ownerDeviceId: "device-2",
		});

		const result = await shareRecipe(
			{ recipes: [recipe], groceryLists: [], mealPlans: [] },
			"r1",
		);

		expect(result.recipes[0]?.ownerDeviceId).toBe("device-2");
	});
});

describe("shareGroceryList", () => {
	it("pushes the list's cascade recipes along with it", async () => {
		const { shareGroceryList } = await import("./share-actions");
		const recipe = makeRecipe({ id: "r1" });
		const list = makeGroceryList({ recipeIds: ["r1"] });

		const result = await shareGroceryList(
			{ recipes: [recipe], groceryLists: [list], mealPlans: [] },
			"l1",
		);

		expect(result.groceryLists[0]?.sharedAt).not.toBeNull();
		expect(result.recipes[0]?.sharedAt).not.toBeNull();
		expect(pushEntitiesMock).toHaveBeenCalledWith(
			"grocery_lists",
			expect.any(Array),
		);
		expect(pushEntitiesMock).toHaveBeenCalledWith("recipes", expect.any(Array));
	});
});

describe("shareMealPlan", () => {
	it("pushes the plan's cascade recipes and derived grocery list", async () => {
		const { shareMealPlan } = await import("./share-actions");
		const recipe = makeRecipe({ id: "r1" });
		const list = makeGroceryList({ id: "gl1" });
		const plan = makeMealPlan({
			groceryListId: "gl1",
			entries: [
				{
					id: "e1",
					day: "2026-01-01",
					mealType: "dinner",
					slotIndex: 0,
					status: "ready",
					suggestedTitle: "x",
					suggestedOverview: "x",
					recipeId: "r1",
				},
			],
		});

		const result = await shareMealPlan(
			{ recipes: [recipe], groceryLists: [list], mealPlans: [plan] },
			"p1",
		);

		expect(result.mealPlans[0]?.sharedAt).not.toBeNull();
		expect(result.recipes[0]?.sharedAt).not.toBeNull();
		expect(result.groceryLists[0]?.sharedAt).not.toBeNull();
	});
});

describe("shareAllLocalData", () => {
	it("stamps and persists everything locally, then runs a full sync", async () => {
		runSyncMock.mockResolvedValue({
			recipes: [makeRecipe({ id: "from-sync" })],
			groceryLists: [],
			mealPlans: [],
		});
		const { shareAllLocalData } = await import("./share-actions");
		const local = {
			recipes: [makeRecipe()],
			groceryLists: [makeGroceryList()],
			mealPlans: [makeMealPlan()],
		};

		const result = await shareAllLocalData(local);

		expect(pushEntitiesMock).toHaveBeenCalledWith("recipes", expect.any(Array));
		expect(pushEntitiesMock).toHaveBeenCalledWith(
			"grocery_lists",
			expect.any(Array),
		);
		expect(pushEntitiesMock).toHaveBeenCalledWith(
			"meal_plans",
			expect.any(Array),
		);
		expect(runSyncMock).toHaveBeenCalled();
		expect(result.recipes[0]?.id).toBe("from-sync");
	});

	it("falls back to the locally-stamped result if runSync somehow returns null", async () => {
		runSyncMock.mockResolvedValue(null);
		const { shareAllLocalData } = await import("./share-actions");
		const local = {
			recipes: [makeRecipe()],
			groceryLists: [],
			mealPlans: [],
		};

		const result = await shareAllLocalData(local);

		expect(result.recipes[0]?.sharedAt).not.toBeNull();
	});
});
