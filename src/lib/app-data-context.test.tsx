import { act, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import { saveGroceryList } from "#/lib/grocery-storage";
import type { MealPlan } from "#/lib/meal-plan";
import { saveMealPlan } from "#/lib/meal-plan-storage";
import { GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID } from "#/lib/migrations/generate-recipe-thumbnails";
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
const pushShareRevocationMock = vi.fn();
const pullOneMock = vi.fn();
vi.mock("#/lib/sync/sync-client", () => ({
	pushTombstone: (...args: unknown[]) => pushTombstoneMock(...args),
	pushShareRevocation: (...args: unknown[]) => pushShareRevocationMock(...args),
	pullOne: (...args: unknown[]) => pullOneMock(...args),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: (...args: unknown[]) => runSyncMock(...args),
}));

const createShareCodeForResourceMock = vi.fn();
const redeemShareCodeClientMock = vi.fn();
vi.mock("#/lib/identity/resource-sharing", () => ({
	createShareCodeForResource: (...args: unknown[]) =>
		createShareCodeForResourceMock(...args),
	redeemShareCode: (...args: unknown[]) => redeemShareCodeClientMock(...args),
}));

const generateRecipeThumbnailMock = vi.fn();
// A real (unmocked) request here would hit DeepInfra/R2 via cloudflare:workers
// (unavailable outside a Workers/Miniflare runtime).
vi.mock("#/server/generate-recipe-thumbnail", () => ({
	generateRecipeThumbnail: (...args: unknown[]) =>
		generateRecipeThumbnailMock(...args),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	const now = "2026-01-01T00:00:00.000Z";
	return {
		id: "r1",
		createdAt: now,
		updatedAt: now,
		sharedAt: null,
		ownerId: null,
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
		ownerId: null,
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
		ownerId: null,
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
		updateRecipe,
		updateGroceryList,
		updateMealPlan,
		hasDeviceIdentity,
		createPairingCode,
		linkDevice,
		syncNow,
		isSharedWithMe,
		shareResource,
		redeemShareCode,
		generateThumbnailForRecipe,
		isGeneratingThumbnail,
	} = useAppData();

	if (!ready) return <div>loading</div>;

	const r1 = recipes.find((r) => r.id === "r1");

	return (
		<div>
			<div data-testid="recipe-count">{recipes.length}</div>
			<div data-testid="list-count">{groceryLists.length}</div>
			<div data-testid="plan-count">{mealPlans.length}</div>
			<div data-testid="has-identity">{String(hasDeviceIdentity)}</div>
			<div data-testid="r1-shared">
				{String(r1 ? isSharedWithMe(r1) : false)}
			</div>
			<div data-testid="r1-thumbnail-url">{r1?.thumbnailUrl ?? "null"}</div>
			<div data-testid="r1-thumbnail-attempts">
				{String(r1?.thumbnailAttempts ?? 0)}
			</div>
			<div data-testid="r1-generating-thumbnail">
				{String(r1 ? isGeneratingThumbnail(r1.id) : false)}
			</div>
			<button
				type="button"
				onClick={() => {
					if (r1) generateThumbnailForRecipe(r1);
				}}
			>
				generate-thumbnail
			</button>
			<button type="button" onClick={() => deleteRecipe("r1")}>
				delete-recipe
			</button>
			<button
				type="button"
				onClick={async () => {
					const result = await shareResource("recipes", "r1");
					document.title = `share:${result.code}`;
				}}
			>
				share-recipe
			</button>
			<button
				type="button"
				onClick={async () => {
					const result = await redeemShareCode("SOMECODE");
					document.title = `redeemed:${result.table}:${result.id}:${result.title}`;
				}}
			>
				redeem-code
			</button>
			<button type="button" onClick={() => deleteGroceryList("l1")}>
				delete-list
			</button>
			<button type="button" onClick={() => deleteMealPlan("p1")}>
				delete-plan
			</button>
			<button
				type="button"
				onClick={() => {
					const recipe = recipes.find((r) => r.id === "r1");
					if (recipe) updateRecipe({ ...recipe, favorite: !recipe.favorite });
				}}
			>
				update-recipe
			</button>
			<button
				type="button"
				onClick={() => {
					const list = groceryLists.find((l) => l.id === "l1");
					if (list) updateGroceryList({ ...list, name: "Updated" });
				}}
			>
				update-list
			</button>
			<button
				type="button"
				onClick={() => {
					const plan = mealPlans.find((p) => p.id === "p1");
					if (plan) updateMealPlan({ ...plan, description: "Updated" });
				}}
			>
				update-plan
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
	pushShareRevocationMock.mockReset();
	pullOneMock.mockReset();
	runSyncMock.mockReset();
	createShareCodeForResourceMock.mockReset();
	redeemShareCodeClientMock.mockReset();
	getDeviceIdentityMock.mockReturnValue(null);
	pushTombstoneMock.mockResolvedValue(undefined);
	pushShareRevocationMock.mockResolvedValue(undefined);
	runSyncMock.mockResolvedValue(null);
	generateRecipeThumbnailMock.mockReset();
	// Never resolves by default — harmless no-op for the backfill migration
	// (see generate-recipe-thumbnails.ts), which any seeded recipe missing a
	// thumbnail is a candidate for; tests that need a specific
	// success/failure result mark that migration already-run first (see the
	// "AppDataProvider thumbnail generation" describe block) so its own
	// mount-time call doesn't consume a queued mockResolvedValueOnce/
	// mockRejectedValueOnce meant for an explicit generate-thumbnail click.
	generateRecipeThumbnailMock.mockReturnValue(new Promise(() => {}));
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

	// Every paired device is a symmetric co-owner (see CLAUDE.md's Ownership
	// section) — deleting a shared entity always pushes a tombstone,
	// regardless of which device originally shared it.
	it("pushes a tombstone when deleting a shared recipe", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveRecipe(
			[],
			makeRecipe({
				sharedAt: "2026-01-01T00:00:00.000Z",
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

	it("pushes a tombstone when deleting a shared grocery list", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveGroceryList(
			[],
			makeGroceryList({
				sharedAt: "2026-01-01T00:00:00.000Z",
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

	it("pushes a tombstone when deleting a shared meal plan", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		saveMealPlan(
			[],
			makeMealPlan({
				sharedAt: "2026-01-01T00:00:00.000Z",
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

	// Regression: entry.recipeId used to be a plain, uncleaned pointer — if
	// the recipe it pointed to reappeared locally later (e.g. a sync race),
	// the untouched entry would silently re-link to it. Deleting the recipe
	// must scrub any meal-plan entry referencing it.
	it("strips a deleted recipe's dangling reference from any meal plan that linked to it", async () => {
		saveRecipe([], makeRecipe());
		saveMealPlan(
			[],
			makeMealPlan({
				entries: [
					{
						id: "e1",
						day: "2026-01-01",
						mealType: "breakfast",
						slotIndex: 0,
						status: "ready",
						suggestedTitle: "Recipe",
						suggestedOverview: "",
						recipeId: "r1",
					},
				],
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("plan-count");

		await user.click(screen.getByRole("button", { name: "delete-recipe" }));

		await waitFor(() => {
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:meal-plans") ?? "[]",
			) as MealPlan[];
			expect(stored[0]?.entries).toEqual([]);
		});
	});
});

describe("AppDataProvider per-resource sharing", () => {
	it("reports isSharedWithMe false for a locally-owned recipe", async () => {
		getDeviceIdentityMock.mockReturnValue({
			deviceId: "device-1",
			userId: "me",
		});
		saveRecipe([], makeRecipe({ ownerId: "me" }));
		renderHarness();
		await screen.findByTestId("recipe-count");

		expect(screen.getByTestId("r1-shared")).toHaveTextContent("false");
	});

	it("reports isSharedWithMe true for a recipe owned by a different account", async () => {
		getDeviceIdentityMock.mockReturnValue({
			deviceId: "device-1",
			userId: "me",
		});
		saveRecipe([], makeRecipe({ ownerId: "someone-else" }));
		renderHarness();
		await screen.findByTestId("recipe-count");

		expect(screen.getByTestId("r1-shared")).toHaveTextContent("true");
	});

	// A shared-to-me item's "delete" only ever revokes this account's own
	// access grant — never a tombstone on the resource itself, which would
	// delete it for the owner and every other recipient too.
	it("revokes this account's own share grant when deleting a shared-to-me recipe, never a tombstone", async () => {
		getDeviceIdentityMock.mockReturnValue({
			deviceId: "device-1",
			userId: "me",
		});
		saveRecipe(
			[],
			makeRecipe({
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerId: "someone-else",
			}),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "delete-recipe" }));

		await waitFor(() =>
			expect(pushShareRevocationMock).toHaveBeenCalledWith("recipes", "r1"),
		);
		expect(pushTombstoneMock).not.toHaveBeenCalled();
		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("0"),
		);
	});

	it("mints a share code for a resource this account owns", async () => {
		createShareCodeForResourceMock.mockResolvedValue({
			code: "ABCD1234",
			expiresAt: "2026-01-01T00:10:00.000Z",
		});
		saveRecipe([], makeRecipe());
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "share-recipe" }));

		await waitFor(() =>
			expect(createShareCodeForResourceMock).toHaveBeenCalledWith(
				"recipes",
				"r1",
			),
		);
		await waitFor(() => expect(document.title).toBe("share:ABCD1234"));
	});

	it("redeems a share code for a shared grocery list", async () => {
		redeemShareCodeClientMock.mockResolvedValue({
			resourceTable: "grocery_lists",
			resourceId: "shared-list",
		});
		pullOneMock.mockResolvedValue({
			id: "shared-list",
			data: makeGroceryList({ id: "shared-list", name: "Shared List" }),
			owner_id: "owner-1",
			updated_at: "2026-01-01T00:00:00.000Z",
			deleted_at: null,
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "redeem-code" }));

		await waitFor(() =>
			expect(document.title).toBe(
				"redeemed:grocery_lists:shared-list:Shared List",
			),
		);
		await waitFor(() =>
			expect(screen.getByTestId("list-count")).toHaveTextContent("1"),
		);
	});

	it("redeems a share code, fetching and inserting the resource locally right away", async () => {
		redeemShareCodeClientMock.mockResolvedValue({
			resourceTable: "recipes",
			resourceId: "shared-recipe",
		});
		pullOneMock.mockResolvedValue({
			id: "shared-recipe",
			data: makeRecipe({ id: "shared-recipe", title: "Shared Dish" }),
			owner_id: "owner-1",
			updated_at: "2026-01-01T00:00:00.000Z",
			deleted_at: null,
		});
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(screen.getByRole("button", { name: "redeem-code" }));

		await waitFor(() =>
			expect(document.title).toBe("redeemed:recipes:shared-recipe:Shared Dish"),
		);
		await waitFor(() =>
			expect(screen.getByTestId("recipe-count")).toHaveTextContent("1"),
		);
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

	it("links a device, marking identity true and syncing (pulling in whatever's already shared)", async () => {
		linkDeviceWithPairingCodeMock.mockResolvedValue({
			userId: "u1",
			deviceId: "device-1",
			deviceSecret: "secret",
		});
		// getDeviceIdentity() is what syncNow()/runSync() gate on — the device
		// isn't "identified" as far as that mock is concerned until this
		// resolves, matching production (linkDeviceWithPairingCode persists
		// the identity before app-data-context calls syncNow()).
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue({
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

	it("re-syncs when the tab becomes visible again, past the foreground throttle window", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue(null);
		vi.useFakeTimers({ shouldAdvanceTime: true });
		try {
			renderHarness();
			await screen.findByTestId("recipe-count");
			await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(1));

			// Clear the foreground-sync throttle window (see
			// FOREGROUND_SYNC_MIN_INTERVAL_MS in app-data-context.tsx) so this
			// genuinely counts as a fresh "welcome back" moment rather than a
			// duplicate of the mount-time sync just above.
			await act(async () => {
				await vi.advanceTimersByTimeAsync(20_000);
			});

			Object.defineProperty(document, "visibilityState", {
				value: "visible",
				configurable: true,
			});
			await act(async () => {
				document.dispatchEvent(new Event("visibilitychange"));
			});

			await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(2));
		} finally {
			vi.useRealTimers();
		}
	});

	it("drops a duplicate foreground trigger (visibilitychange + focus back to back) inside the throttle window", async () => {
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
			window.dispatchEvent(new Event("focus"));
		});

		// Both fired within milliseconds of the mount sync — well inside the
		// throttle window — so neither should have triggered a second sync.
		expect(runSyncMock).toHaveBeenCalledTimes(1);
	});
});

describe("AppDataProvider content-mutation sync debouncing", () => {
	beforeEach(() => {
		vi.useFakeTimers({ shouldAdvanceTime: true });
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it("debounces a sync after editing a recipe instead of syncing immediately", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue(null);
		saveRecipe([], makeRecipe());
		const user = userEvent.setup({
			advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms),
		});
		renderHarness();
		await screen.findByTestId("recipe-count");
		// The mount-time immediate sync already ran once — wait for it so it
		// doesn't get confused with the debounced one below.
		await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(1));

		await user.click(screen.getByRole("button", { name: "update-recipe" }));

		// Not synced yet — still debouncing.
		expect(runSyncMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(runSyncMock).toHaveBeenCalledTimes(2);
		// Only the table actually edited gets synced — not grocery_lists or
		// meal_plans too (the "why does opening/editing a recipe touch
		// everything else" bug this debounce scoping fixes).
		expect(runSyncMock).toHaveBeenNthCalledWith(2, ["recipes"]);
	});

	it("scopes the debounced sync to every table actually touched in the same window", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue(null);
		saveGroceryList([], makeGroceryList());
		saveMealPlan([], makeMealPlan());
		const user = userEvent.setup({
			advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms),
		});
		renderHarness();
		await screen.findByTestId("recipe-count");
		await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(1));

		await user.click(screen.getByRole("button", { name: "update-list" }));
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		await user.click(screen.getByRole("button", { name: "update-plan" }));

		expect(runSyncMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(runSyncMock).toHaveBeenCalledTimes(2);
		expect(runSyncMock).toHaveBeenNthCalledWith(2, [
			"grocery_lists",
			"meal_plans",
		]);
	});

	it("coalesces rapid successive edits into a single debounced sync", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		runSyncMock.mockResolvedValue(null);
		saveRecipe([], makeRecipe());
		const user = userEvent.setup({
			advanceTimers: (ms) => vi.advanceTimersByTimeAsync(ms),
		});
		renderHarness();
		await screen.findByTestId("recipe-count");
		await waitFor(() => expect(runSyncMock).toHaveBeenCalledTimes(1));

		const updateButton = screen.getByRole("button", { name: "update-recipe" });
		await user.click(updateButton);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		await user.click(updateButton);
		await act(async () => {
			await vi.advanceTimersByTimeAsync(2000);
		});
		await user.click(updateButton);

		// Still within the debounce window from the last click.
		expect(runSyncMock).toHaveBeenCalledTimes(1);

		await act(async () => {
			await vi.advanceTimersByTimeAsync(5000);
		});

		expect(runSyncMock).toHaveBeenCalledTimes(2);
	});
});

describe("AppDataProvider thumbnail generation", () => {
	beforeEach(() => {
		// Every recipe seeded below starts without a thumbnail, which makes it
		// a candidate for the generate-recipe-thumbnails backfill migration —
		// mark it already-run so its own mount-time call doesn't consume a
		// mockResolvedValueOnce/mockRejectedValueOnce meant for this block's
		// explicit generate-thumbnail clicks (the migration gets its own
		// dedicated test file).
		window.localStorage.setItem(
			"cookerist:completed-migrations",
			JSON.stringify([GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID]),
		);
	});

	it("sets the thumbnail URL and clears the generating state on success", async () => {
		// A recipe missing a thumbnail is a candidate for the mount-time
		// background sweep (see app-data-context.tsx's sweepMissingThumbnails),
		// which fires this request on its own — no click needed.
		let resolveRequest!: (value: unknown) => void;
		generateRecipeThumbnailMock.mockReturnValueOnce(
			new Promise((r) => {
				resolveRequest = r;
			}),
		);
		saveRecipe([], makeRecipe());
		renderHarness();
		await screen.findByTestId("recipe-count");

		await waitFor(() =>
			expect(generateRecipeThumbnailMock).toHaveBeenCalledWith({
				data: { recipeId: "r1", title: "Recipe", overview: "" },
			}),
		);
		expect(screen.getByTestId("r1-generating-thumbnail")).toHaveTextContent(
			"true",
		);

		await act(async () => {
			resolveRequest({ type: "success", url: "https://example.com/r1.png" });
			await Promise.resolve();
		});

		await waitFor(() =>
			expect(screen.getByTestId("r1-thumbnail-url")).toHaveTextContent(
				"https://example.com/r1.png",
			),
		);
		expect(screen.getByTestId("r1-generating-thumbnail")).toHaveTextContent(
			"false",
		);
	});

	it("increments thumbnailAttempts and clears the generating state on an error result", async () => {
		// A recipe missing a thumbnail is also a candidate for the mount-time
		// background sweep (see app-data-context.tsx's sweepMissingThumbnails),
		// which fires this request automatically — no click needed, and it's
		// this automatic request (not a later explicit one) that consumes the
		// queued error result below.
		generateRecipeThumbnailMock.mockResolvedValueOnce({
			type: "error",
			message: "DeepInfra image generation failed: 500 Internal Server Error",
		});
		saveRecipe([], makeRecipe());
		renderHarness();
		await screen.findByTestId("recipe-count");

		await waitFor(() =>
			expect(screen.getByTestId("r1-thumbnail-attempts")).toHaveTextContent(
				"1",
			),
		);
		expect(screen.getByTestId("r1-thumbnail-url")).toHaveTextContent("null");
		expect(screen.getByTestId("r1-generating-thumbnail")).toHaveTextContent(
			"false",
		);
	});

	it("increments thumbnailAttempts when the request rejects", async () => {
		// Same reasoning as above — the mount-time sweep fires this request on
		// its own, without any click.
		generateRecipeThumbnailMock.mockRejectedValueOnce(
			new Error("network down"),
		);
		saveRecipe([], makeRecipe());
		renderHarness();
		await screen.findByTestId("recipe-count");

		await waitFor(() =>
			expect(screen.getByTestId("r1-thumbnail-attempts")).toHaveTextContent(
				"1",
			),
		);
	});

	it("is a no-op when the recipe already has a thumbnail", async () => {
		saveRecipe(
			[],
			makeRecipe({ thumbnailUrl: "https://example.com/existing.png" }),
		);
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(
			screen.getByRole("button", { name: "generate-thumbnail" }),
		);

		expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
	});

	it("is a no-op once the attempt cap is reached", async () => {
		// MAX_THUMBNAIL_ATTEMPTS is 2 (see src/lib/recipe.ts).
		saveRecipe([], makeRecipe({ thumbnailAttempts: 2 }));
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");

		await user.click(
			screen.getByRole("button", { name: "generate-thumbnail" }),
		);

		expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
	});

	it("does not fire a second request while one is already in flight for the same recipe", async () => {
		generateRecipeThumbnailMock.mockReturnValue(new Promise(() => {}));
		saveRecipe([], makeRecipe());
		const user = userEvent.setup();
		renderHarness();
		await screen.findByTestId("recipe-count");
		const button = screen.getByRole("button", { name: "generate-thumbnail" });

		await user.click(button);
		expect(screen.getByTestId("r1-generating-thumbnail")).toHaveTextContent(
			"true",
		);
		await user.click(button);

		expect(generateRecipeThumbnailMock).toHaveBeenCalledTimes(1);
	});
});
