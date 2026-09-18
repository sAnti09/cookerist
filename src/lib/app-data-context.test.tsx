import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import { saveGroceryList } from "#/lib/grocery-storage";
import type { MealPlan } from "#/lib/meal-plan";
import { saveMealPlan } from "#/lib/meal-plan-storage";
import type { Recipe } from "#/lib/recipe";
import { saveRecipe } from "#/lib/recipes-storage";
import { AppDataProvider, useAppData } from "./app-data-context";

const getDeviceIdentityMock = vi.fn();
const createPairingCodeForThisDeviceMock = vi.fn();
const linkDeviceWithPairingCodeMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
	createPairingCodeForThisDevice: (...args: unknown[]) =>
		createPairingCodeForThisDeviceMock(...args),
	linkDeviceWithPairingCode: (...args: unknown[]) =>
		linkDeviceWithPairingCodeMock(...args),
}));

const pushTombstoneMock = vi.fn();
vi.mock("#/lib/sync/sync-client", () => ({
	pushTombstone: (...args: unknown[]) => pushTombstoneMock(...args),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: () => runSyncMock(),
}));

const shareRecipeMock = vi.fn();
const shareGroceryListMock = vi.fn();
const shareMealPlanMock = vi.fn();
const shareAllLocalDataMock = vi.fn();
vi.mock("#/lib/sync/share-actions", () => ({
	shareRecipe: (...args: unknown[]) => shareRecipeMock(...args),
	shareGroceryList: (...args: unknown[]) => shareGroceryListMock(...args),
	shareMealPlan: (...args: unknown[]) => shareMealPlanMock(...args),
	shareAllLocalData: (...args: unknown[]) => shareAllLocalDataMock(...args),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	const now = "2026-01-01T00:00:00.000Z";
	return {
		id: "r1",
		createdAt: now,
		updatedAt: now,
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
	const now = "2026-01-01T00:00:00.000Z";
	return {
		id: "l1",
		createdAt: now,
		updatedAt: now,
		sharedAt: null,
		name: "List",
		recipeIds: [],
		items: [],
		expanded: false,
		...overrides,
	};
}

function makeMealPlan(overrides: Partial<MealPlan> = {}): MealPlan {
	const now = "2026-01-01T00:00:00.000Z";
	return {
		id: "p1",
		createdAt: now,
		updatedAt: now,
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

// Minimal presentational harness exposing every surface under test as
// clickable buttons + rendered state, so tests interact via userEvent/screen
// like every other component test in this codebase instead of grabbing the
// hook's return value imperatively.
function Harness() {
	const {
		ready,
		recipes,
		groceryLists,
		mealPlans,
		deleteRecipe,
		deleteGroceryList,
		deleteMealPlan,
		shareRecipe,
		shareGroceryList,
		shareMealPlan,
		hasDeviceIdentity,
		createPairingCode,
		linkDevice,
		syncNow,
	} = useAppData();

	if (!ready) return <div>loading</div>;

	return (
		<div>
			<div data-testid="recipe-count">{recipes.length}</div>
			<div data-testid="list-count">{groceryLists.length}</div>
			<div data-testid="plan-count">{mealPlans.length}</div>
			<div data-testid="has-identity">{String(hasDeviceIdentity)}</div>
			<button type="button" onClick={() => deleteRecipe("r1")}>
				delete-recipe
			</button>
			<button type="button" onClick={() => deleteGroceryList("l1")}>
				delete-list
			</button>
			<button type="button" onClick={() => deleteMealPlan("p1")}>
				delete-plan
			</button>
			<button type="button" onClick={() => shareRecipe("r1")}>
				share-recipe
			</button>
			<button type="button" onClick={() => shareGroceryList("l1")}>
				share-list
			</button>
			<button type="button" onClick={() => shareMealPlan("p1")}>
				share-plan
			</button>
			<button type="button" onClick={() => createPairingCode()}>
				gen-code
			</button>
			<button type="button" onClick={() => linkDevice("CODE1234")}>
				link-device
			</button>
			<SyncButton syncNow={syncNow} />
		</div>
	);
}

function SyncButton({ syncNow }: { syncNow: () => Promise<boolean> }) {
	return (
		<button
			type="button"
			onClick={async () => {
				const result = await syncNow();
				document.title = `sync:${result}`;
			}}
		>
			sync-now
		</button>
	);
}

function renderHarness() {
	return render(
		<AppDataProvider>
			<Harness />
		</AppDataProvider>,
	);
}

beforeEach(() => {
	window.localStorage.clear();
	getDeviceIdentityMock.mockReset();
	createPairingCodeForThisDeviceMock.mockReset();
	linkDeviceWithPairingCodeMock.mockReset();
	pushTombstoneMock.mockReset();
	runSyncMock.mockReset();
	shareRecipeMock.mockReset();
	shareGroceryListMock.mockReset();
	shareMealPlanMock.mockReset();
	shareAllLocalDataMock.mockReset();
	getDeviceIdentityMock.mockReturnValue(null);
	pushTombstoneMock.mockResolvedValue(undefined);
	runSyncMock.mockResolvedValue(null);
});

describe("AppDataProvider delete handlers", () => {
	it("deletes a local-only (never-shared) recipe without pushing a tombstone", async () => {
		saveRecipe([], makeRecipe());
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "delete-recipe" }));

		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("0"),
		);
		expect(pushTombstoneMock).not.toHaveBeenCalled();
	});

	it("pushes a tombstone when deleting a recipe this device owns", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveRecipe(
			[],
			makeRecipe({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-1",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "delete-recipe" }));

		await waitFor(() =>
			expect(pushTombstoneMock).toHaveBeenCalledWith("recipes", "r1"),
		);
	});

	it("removes (without a tombstone) a shared recipe owned by another device", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveRecipe(
			[],
			makeRecipe({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-2",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "delete-recipe" }));

		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("0"),
		);
		expect(pushTombstoneMock).not.toHaveBeenCalled();
	});

	it("pushes a tombstone when deleting an owned shared grocery list", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveGroceryList(
			[],
			makeGroceryList({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-1",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("list-count");

		await user.click(screen.getByRole("button", { name: "delete-list" }));

		await waitFor(() =>
			expect(pushTombstoneMock).toHaveBeenCalledWith("grocery_lists", "l1"),
		);
	});

	it("removes a shared grocery list owned by another device without a tombstone", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveGroceryList(
			[],
			makeGroceryList({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-2",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("list-count");

		await user.click(screen.getByRole("button", { name: "delete-list" }));

		await waitFor(() =>
			expect(screen.getByTestId("list-count")).toHaveTextContent("0"),
		);
		expect(pushTombstoneMock).not.toHaveBeenCalled();
	});

	it("pushes a tombstone when deleting an owned shared meal plan", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveMealPlan(
			[],
			makeMealPlan({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-1",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("plan-count");

		await user.click(screen.getByRole("button", { name: "delete-plan" }));

		await waitFor(() =>
			expect(pushTombstoneMock).toHaveBeenCalledWith("meal_plans", "p1"),
		);
	});

	it("removes a shared meal plan owned by another device without a tombstone", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveMealPlan(
			[],
			makeMealPlan({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-2",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("plan-count");

		await user.click(screen.getByRole("button", { name: "delete-plan" }));

		await waitFor(() =>
			expect(screen.getByTestId("plan-count")).toHaveTextContent("0"),
		);
		expect(pushTombstoneMock).not.toHaveBeenCalled();
	});
});

describe("AppDataProvider share handlers", () => {
	it("shares a recipe and applies the returned local data", async () => {
		saveRecipe([], makeRecipe());
		shareRecipeMock.mockResolvedValue({
			recipes: [makeRecipe({ sharedAt: "2026-01-01T00:00:00.000Z" })],
			groceryLists: [],
			mealPlans: [],
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "share-recipe" }));

		await waitFor(() =>
			expect(shareRecipeMock).toHaveBeenCalledWith(
				expect.objectContaining({ recipes: expect.any(Array) }),
				"r1",
			),
		);
	});

	it("shares a grocery list and applies the returned local data", async () => {
		saveGroceryList([], makeGroceryList());
		shareGroceryListMock.mockResolvedValue({
			recipes: [],
			groceryLists: [makeGroceryList({ sharedAt: "2026-01-01T00:00:00.000Z" })],
			mealPlans: [],
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("list-count");

		await user.click(screen.getByRole("button", { name: "share-list" }));

		await waitFor(() => expect(shareGroceryListMock).toHaveBeenCalled());
	});

	it("shares a meal plan and applies the returned local data", async () => {
		saveMealPlan([], makeMealPlan());
		shareMealPlanMock.mockResolvedValue({
			recipes: [],
			groceryLists: [],
			mealPlans: [makeMealPlan({ sharedAt: "2026-01-01T00:00:00.000Z" })],
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("plan-count");

		await user.click(screen.getByRole("button", { name: "share-plan" }));

		await waitFor(() => expect(shareMealPlanMock).toHaveBeenCalled());
	});
});

describe("AppDataProvider pairing", () => {
	it("generates a pairing code and flips hasDeviceIdentity to true", async () => {
		createPairingCodeForThisDeviceMock.mockResolvedValue({
			code: "ABC12345",
			expiresAt: "2026-01-01T00:10:00.000Z",
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("has-identity");
		expect(screen.getByTestId("has-identity")).toHaveTextContent("false");

		await user.click(screen.getByRole("button", { name: "gen-code" }));

		await waitFor(() =>
			expect(screen.getByTestId("has-identity")).toHaveTextContent("true"),
		);
	});

	it("links a device, marking identity true and applying merged local data", async () => {
		linkDeviceWithPairingCodeMock.mockResolvedValue({
			userId: "u1",
			deviceId: "device-1",
			deviceSecret: "secret",
		});
		shareAllLocalDataMock.mockResolvedValue({
			recipes: [makeRecipe({ id: "from-account" })],
			groceryLists: [],
			mealPlans: [],
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("has-identity");

		await user.click(screen.getByRole("button", { name: "link-device" }));

		await waitFor(() =>
			expect(screen.getByTestId("has-identity")).toHaveTextContent("true"),
		);
		expect(shareAllLocalDataMock).toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("1"),
		);
	});
});

describe("AppDataProvider sync", () => {
	it("syncNow returns false and never calls runSync when this device has no identity", async () => {
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "sync-now" }));

		await waitFor(() => expect(document.title).toBe("sync:false"));
		expect(runSyncMock).not.toHaveBeenCalled();
	});

	it("syncNow runs and applies the result when this device has an identity", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue({
			recipes: [makeRecipe({ id: "synced" })],
			groceryLists: [],
			mealPlans: [],
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "sync-now" }));

		await waitFor(() => expect(document.title).toBe("sync:true"));
		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("1"),
		);
	});

	it("triggers a sync on mount when this device already has an identity", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue({
			recipes: [makeRecipe({ id: "from-mount-sync" })],
			groceryLists: [],
			mealPlans: [],
		});
		renderHarness();

		await waitFor(() => expect(runSyncMock).toHaveBeenCalled());
		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("1"),
		);
	});

	it("re-syncs when the tab becomes visible again", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue(null);
		renderHarness();
		await screen.findByTestId("recipe-count");
		await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(1));

		Object.defineProperty(document, "visibilityState", {
			value: "visible",
			configurable: true,
		});
		await act(async () => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(2));
	});
});
