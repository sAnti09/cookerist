import { beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import type { Recipe } from "#/lib/recipe";

const getDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

const pushEntitiesMock = vi.fn();
const pullChangedSinceMock = vi.fn();
const pushTombstoneMock = vi.fn();
const pushShareRevocationMock = vi.fn();
const pullGrantedResourceIdsMock = vi.fn();
const pullOneMock = vi.fn();
vi.mock("#/lib/sync/sync-client", () => ({
	pushEntities: (...args: unknown[]) => pushEntitiesMock(...args),
	pullChangedSince: (...args: unknown[]) => pullChangedSinceMock(...args),
	pushTombstone: (...args: unknown[]) => pushTombstoneMock(...args),
	pushShareRevocation: (...args: unknown[]) => pushShareRevocationMock(...args),
	pullGrantedResourceIds: (...args: unknown[]) =>
		pullGrantedResourceIdsMock(...args),
	pullOne: (...args: unknown[]) => pullOneMock(...args),
}));

const cascadeSharesForResourceMock = vi.fn();
vi.mock("#/lib/identity/resource-sharing", () => ({
	cascadeSharesForResource: (...args: unknown[]) =>
		cascadeSharesForResourceMock(...args),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "r1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		ownerId: null,
		prompt: "test",
		title: "Original",
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
		id: "list-1",
		createdAt: "2026-01-01T00:00:00.000Z",
		name: "Test list",
		recipeIds: [],
		items: [],
		expanded: false,
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
		ownerId: null,
		...overrides,
	};
}

beforeEach(() => {
	vi.resetModules();
	window.localStorage.clear();
	getDeviceIdentityMock.mockReset();
	pushEntitiesMock.mockReset();
	pullChangedSinceMock.mockReset();
	pushTombstoneMock.mockReset();
	pushShareRevocationMock.mockReset();
	pullGrantedResourceIdsMock.mockReset();
	pullOneMock.mockReset();
	cascadeSharesForResourceMock.mockReset();
	pushEntitiesMock.mockResolvedValue(undefined);
	pullChangedSinceMock.mockResolvedValue([]);
	pushTombstoneMock.mockResolvedValue(undefined);
	pushShareRevocationMock.mockResolvedValue(undefined);
	pullGrantedResourceIdsMock.mockResolvedValue([]);
	pullOneMock.mockResolvedValue(null);
	cascadeSharesForResourceMock.mockResolvedValue(undefined);
});

describe("runSync", () => {
	it("no-ops when this device has no identity yet", async () => {
		getDeviceIdentityMock.mockReturnValue(null);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(result).toBeNull();
		expect(pushEntitiesMock).not.toHaveBeenCalled();
	});

	it("pushes every local entity, auto-stamping ones that have never synced before", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "already-synced",
				sharedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		saveRecipe(
			[
				makeRecipe({
					id: "already-synced",
					sharedAt: "2026-01-01T00:00:00.000Z",
				}),
			],
			makeRecipe({ id: "never-synced-yet", sharedAt: null }),
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		const pushedIds = (recipesPushCall?.[1] as Array<{ id: string }>).map(
			(r) => r.id,
		);
		expect(pushedIds.sort()).toEqual(["already-synced", "never-synced-yet"]);
		const stamped = result?.recipes?.find((r) => r.id === "never-synced-yet");
		expect(stamped?.sharedAt).not.toBeNull();
	});

	it("pulls and merges BEFORE pushing, so a stale local copy never clobbers a newer remote write", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				title: "Stale local title",
				updatedAt: "2026-01-01T00:00:00.000Z",
				sharedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		const remote = makeRecipe({
			id: "r1",
			title: "Newer remote title",
			updatedAt: "2026-01-05T00:00:00.000Z",
			sharedAt: "2026-01-01T00:00:00.000Z",
		});
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? [
						{
							id: "r1",
							data: remote,
							updated_at: "2026-01-05T00:00:00.000Z",
							deleted_at: null,
						},
					]
				: [],
		);
		const { runSync } = await import("./sync-engine");

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		const pushedR1 = (
			recipesPushCall?.[1] as Array<{ id: string; title: string }>
		).find((r) => r.id === "r1");
		// The push must carry the merged (newer remote) title, not the stale
		// local one — proving the merge happened before this device pushed.
		expect(pushedR1?.title).toBe("Newer remote title");
	});

	it("adopts a remote recipe not yet known locally, stamping sharedAt if missing", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const remote = makeRecipe({ id: "remote-1", sharedAt: null });
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? [
						{
							id: "remote-1",
							data: remote,
							updated_at: "2026-01-02T00:00:00.000Z",
							deleted_at: null,
						},
					]
				: [],
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		const adopted = result?.recipes?.find((r) => r.id === "remote-1");
		expect(adopted).toBeDefined();
		expect(adopted?.sharedAt).not.toBeNull();
	});

	it("merges via last-write-wins when the recipe already exists locally", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				title: "Local title",
				updatedAt: "2026-01-01T00:00:00.000Z",
				sharedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		const remote = makeRecipe({
			id: "r1",
			title: "Remote title",
			updatedAt: "2026-01-03T00:00:00.000Z",
			sharedAt: "2026-01-01T00:00:00.000Z",
		});
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? [
						{
							id: "r1",
							data: remote,
							updated_at: "2026-01-03T00:00:00.000Z",
							deleted_at: null,
						},
					]
				: [],
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(result?.recipes?.find((r) => r.id === "r1")?.title).toBe(
			"Remote title",
		);
	});

	// Every paired device is a symmetric co-owner (see CLAUDE.md's Ownership
	// section) — a tombstone pulled from any device means the entity is gone
	// everywhere, not merely unshared from this one, so it's removed from
	// local storage entirely rather than kept as a private detached copy.
	it("removes a local entity entirely when it was tombstoned remotely, persisting the removal", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-2" });
		const { saveRecipe, loadRecipes } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({ id: "r1", sharedAt: "2026-01-01T00:00:00.000Z" }),
		);
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? [
						{
							id: "r1",
							data: makeRecipe({ id: "r1" }),
							updated_at: "2026-01-02T00:00:00.000Z",
							deleted_at: "2026-01-02T00:00:00.000Z",
						},
					]
				: [],
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(result?.recipes?.find((r) => r.id === "r1")).toBeUndefined();
		// Not just absent from the returned in-memory array — actually gone
		// from localStorage too, so it doesn't reappear on the next load.
		expect(loadRecipes().find((r) => r.id === "r1")).toBeUndefined();
	});

	it("ignores a tombstone for an entity it never had locally", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? [
						{
							id: "never-had-it",
							data: makeRecipe({ id: "never-had-it" }),
							updated_at: "2026-01-02T00:00:00.000Z",
							deleted_at: "2026-01-02T00:00:00.000Z",
						},
					]
				: [],
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(
			result?.recipes?.find((r) => r.id === "never-had-it"),
		).toBeUndefined();
	});

	it("skips the push entirely and returns local state unchanged when the pull fails", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe([], makeRecipe({ id: "r1" }));
		pullChangedSinceMock.mockImplementation(async (table: string) =>
			table === "recipes" ? Promise.reject(new Error("network down")) : [],
		);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(result?.recipes?.map((r) => r.id)).toEqual(["r1"]);
		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		expect(recipesPushCall).toBeUndefined();
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Sync pull failed"),
			expect.any(Error),
		);
		consoleErrorSpy.mockRestore();
	});

	it("does not re-push an already-shared entity on a second cycle when nothing changed locally", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				sharedAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		const { runSync } = await import("./sync-engine");

		await runSync();
		pushEntitiesMock.mockClear();

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		expect(recipesPushCall?.[1]).toEqual([]);
	});

	it("still pushes an entity whose updatedAt advanced after the last successful push", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe, updateRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				sharedAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		const { runSync } = await import("./sync-engine");
		await runSync();
		pushEntitiesMock.mockClear();

		// A genuine edit after the last successful push — touch() stamps a
		// fresh (real "now") updatedAt, which is always past the 2026-01-01
		// push watermark set above.
		const { loadRecipes } = await import("#/lib/recipes-storage");
		updateRecipe(loadRecipes(), loadRecipes()[0]);

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		expect(
			(recipesPushCall?.[1] as Array<{ id: string }>).map((r) => r.id),
		).toEqual(["r1"]);
	});

	it("does not advance the push watermark when the push fails, so the next cycle retries", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				sharedAt: "2026-01-01T00:00:00.000Z",
				updatedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		pushEntitiesMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? Promise.reject(new Error("upstream rejected"))
				: undefined,
		);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { runSync } = await import("./sync-engine");

		await runSync();
		pushEntitiesMock.mockClear();
		pushEntitiesMock.mockResolvedValue(undefined);

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		// Still queued for push — the failed first attempt never advanced the
		// watermark, so this cycle retries the same entity instead of having
		// given up on it.
		expect(
			(recipesPushCall?.[1] as Array<{ id: string }>).map((r) => r.id),
		).toEqual(["r1"]);
		consoleErrorSpy.mockRestore();
	});

	it("only syncs the requested table(s), leaving the others out of the pull/push entirely", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				sharedAt: "2026-01-01T00:00:00.000Z",
			}),
		);
		const { runSync } = await import("./sync-engine");

		const result = await runSync(["recipes"]);

		expect(result?.recipes).toBeDefined();
		expect(result?.groceryLists).toBeUndefined();
		expect(result?.mealPlans).toBeUndefined();
		expect(pullChangedSinceMock).toHaveBeenCalledTimes(1);
		expect(pullChangedSinceMock).toHaveBeenCalledWith(
			"recipes",
			expect.any(String),
		);
		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		expect(recipesPushCall).toBeDefined();
		expect(
			pushEntitiesMock.mock.calls.some((call) => call[0] === "grocery_lists"),
		).toBe(false);
		expect(
			pushEntitiesMock.mock.calls.some((call) => call[0] === "meal_plans"),
		).toBe(false);
	});

	it("excludes recipes entirely when a different table is requested", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { runSync } = await import("./sync-engine");

		const result = await runSync(["grocery_lists"]);

		expect(result?.recipes).toBeUndefined();
		expect(result?.groceryLists).toBeDefined();
		expect(result?.mealPlans).toBeUndefined();
		expect(
			pullChangedSinceMock.mock.calls.some((call) => call[0] === "recipes"),
		).toBe(false);
	});

	it("logs and swallows a push failure rather than throwing", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe([], makeRecipe({ id: "r1" }));
		pushEntitiesMock.mockImplementation(async (table: string) =>
			table === "recipes"
				? Promise.reject(new Error("upstream rejected"))
				: undefined,
		);
		const consoleErrorSpy = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const { runSync } = await import("./sync-engine");

		const result = await runSync();

		expect(result?.recipes?.map((r) => r.id)).toEqual(["r1"]);
		expect(consoleErrorSpy).toHaveBeenCalledWith(
			expect.stringContaining("Sync push failed"),
			expect.any(Error),
		);
		consoleErrorSpy.mockRestore();
	});

	describe("pending tombstone retry", () => {
		it("retries a pending tombstone before pulling, and clears it once confirmed", async () => {
			getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
			const { addPendingTombstone, getPendingTombstones } = await import(
				"#/lib/sync/pending-tombstones"
			);
			addPendingTombstone("recipes", "r1");
			const { runSync } = await import("./sync-engine");

			await runSync();

			expect(pushTombstoneMock).toHaveBeenCalledWith("recipes", "r1");
			expect(getPendingTombstones("recipes")).toEqual([]);
		});

		it("leaves a pending tombstone in place for the next cycle when the retry still fails", async () => {
			getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
			pushTombstoneMock.mockRejectedValue(new Error("still not landed"));
			const { addPendingTombstone, getPendingTombstones } = await import(
				"#/lib/sync/pending-tombstones"
			);
			addPendingTombstone("recipes", "r1");
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const { runSync } = await import("./sync-engine");

			await runSync();

			expect(getPendingTombstones("recipes")).toEqual(["r1"]);
			consoleErrorSpy.mockRestore();
		});

		it("does not resurrect an entity locally while its own tombstone retry is still failing", async () => {
			getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
			pushTombstoneMock.mockRejectedValue(new Error("still not landed"));
			const { addPendingTombstone } = await import(
				"#/lib/sync/pending-tombstones"
			);
			addPendingTombstone("recipes", "r1");
			pullChangedSinceMock.mockImplementation(async (table: string) =>
				table === "recipes"
					? [
							{
								id: "r1",
								data: makeRecipe({ id: "r1" }),
								updated_at: "2026-01-02T00:00:00.000Z",
								deleted_at: null,
							},
						]
					: [],
			);
			const consoleErrorSpy = vi
				.spyOn(console, "error")
				.mockImplementation(() => {});
			const { runSync } = await import("./sync-engine");

			const result = await runSync();

			expect(result?.recipes?.find((r) => r.id === "r1")).toBeUndefined();
			consoleErrorSpy.mockRestore();
		});
	});

	// See CLAUDE.md's "Per-resource sharing" roadmap item.
	describe("per-resource sharing", () => {
		it("stamps a newly-synced entity's ownerId with this device's own account", async () => {
			getDeviceIdentityMock.mockReturnValue({
				deviceId: "device-1",
				userId: "my-account",
			});
			const { saveRecipe } = await import("#/lib/recipes-storage");
			saveRecipe([], makeRecipe({ id: "r1", sharedAt: null, ownerId: null }));
			const { runSync } = await import("./sync-engine");

			const result = await runSync();

			expect(result?.recipes?.find((r) => r.id === "r1")?.ownerId).toBe(
				"my-account",
			);
		});

		it("never overwrites an entity's ownerId once it's already synced, even under a different device identity", async () => {
			getDeviceIdentityMock.mockReturnValue({
				deviceId: "device-1",
				userId: "my-account",
			});
			const { saveRecipe } = await import("#/lib/recipes-storage");
			saveRecipe(
				[],
				makeRecipe({
					id: "r1",
					sharedAt: "2026-01-01T00:00:00.000Z",
					ownerId: "someone-else",
				}),
			);
			const { runSync } = await import("./sync-engine");

			const result = await runSync();

			expect(result?.recipes?.find((r) => r.id === "r1")?.ownerId).toBe(
				"someone-else",
			);
		});

		it("pushes a shared-to-me entity's edits carrying its true owner's id, not this device's own", async () => {
			getDeviceIdentityMock.mockReturnValue({
				deviceId: "device-1",
				userId: "my-account",
			});
			const { saveRecipe, updateRecipe, loadRecipes } = await import(
				"#/lib/recipes-storage"
			);
			saveRecipe(
				[],
				makeRecipe({
					id: "r1",
					sharedAt: "2026-01-01T00:00:00.000Z",
					updatedAt: "2026-01-01T00:00:00.000Z",
					ownerId: "someone-else",
				}),
			);
			const { runSync } = await import("./sync-engine");
			await runSync();
			pushEntitiesMock.mockClear();

			updateRecipe(loadRecipes(), loadRecipes()[0]);
			await runSync();

			const recipesPushCall = pushEntitiesMock.mock.calls.find(
				(call) => call[0] === "recipes",
			);
			const pushedR1 = (
				recipesPushCall?.[1] as Array<{ id: string; ownerId: string | null }>
			).find((r) => r.id === "r1");
			expect(pushedR1?.ownerId).toBe("someone-else");
		});

		it("overrides a pulled row's ownerId from the authoritative Supabase column, ignoring whatever the jsonb payload carries", async () => {
			getDeviceIdentityMock.mockReturnValue({
				deviceId: "device-1",
				userId: "my-account",
			});
			const remote = makeRecipe({
				id: "remote-1",
				sharedAt: "2026-01-01T00:00:00.000Z",
				// Deliberately stale/wrong — the row's own owner_id column must win.
				ownerId: "stale-value",
			});
			pullChangedSinceMock.mockImplementation(async (table: string) =>
				table === "recipes"
					? [
							{
								id: "remote-1",
								data: remote,
								owner_id: "authoritative-owner",
								updated_at: "2026-01-02T00:00:00.000Z",
								deleted_at: null,
							},
						]
					: [],
			);
			const { runSync } = await import("./sync-engine");

			const result = await runSync();

			expect(result?.recipes?.find((r) => r.id === "remote-1")?.ownerId).toBe(
				"authoritative-owner",
			);
		});

		describe("pending share revocation retry", () => {
			it("retries a pending revocation before pulling, and clears it once confirmed", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				const { addPendingShareRevocation, getPendingShareRevocations } =
					await import("#/lib/sync/pending-share-revocations");
				addPendingShareRevocation("recipes", "r1");
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(pushShareRevocationMock).toHaveBeenCalledWith("recipes", "r1");
				expect(getPendingShareRevocations("recipes")).toEqual([]);
			});

			it("leaves a pending revocation in place for the next cycle when the retry still fails", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				pushShareRevocationMock.mockRejectedValue(
					new Error("still not landed"),
				);
				const { addPendingShareRevocation, getPendingShareRevocations } =
					await import("#/lib/sync/pending-share-revocations");
				addPendingShareRevocation("recipes", "r1");
				const consoleErrorSpy = vi
					.spyOn(console, "error")
					.mockImplementation(() => {});
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(getPendingShareRevocations("recipes")).toEqual(["r1"]);
				consoleErrorSpy.mockRestore();
			});

			it("does not resurrect a shared entity locally while its own revocation retry is still failing", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				pushShareRevocationMock.mockRejectedValue(
					new Error("still not landed"),
				);
				const { addPendingShareRevocation } = await import(
					"#/lib/sync/pending-share-revocations"
				);
				addPendingShareRevocation("recipes", "r1");
				pullChangedSinceMock.mockImplementation(async (table: string) =>
					table === "recipes"
						? [
								{
									id: "r1",
									data: makeRecipe({ id: "r1", ownerId: "someone-else" }),
									owner_id: "someone-else",
									updated_at: "2026-01-02T00:00:00.000Z",
									deleted_at: null,
								},
							]
						: [],
				);
				const consoleErrorSpy = vi
					.spyOn(console, "error")
					.mockImplementation(() => {});
				const { runSync } = await import("./sync-engine");

				const result = await runSync();

				expect(result?.recipes?.find((r) => r.id === "r1")).toBeUndefined();
				consoleErrorSpy.mockRestore();
			});
		});

		// See CLAUDE.md's "Per-resource sharing" section: sharing a grocery
		// list/meal plan alone left the recipes it references inaccessible
		// (bare id references, no embedded content) — these two mechanisms
		// close that gap.
		describe("linked-resource grant cascade", () => {
			it("adopts a resource this account was granted access to but doesn't have locally yet, bypassing the watermark", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				pullGrantedResourceIdsMock.mockImplementation(async (table: string) =>
					table === "recipes" ? ["granted-1"] : [],
				);
				pullOneMock.mockImplementation(async (table: string, id: string) =>
					table === "recipes" && id === "granted-1"
						? {
								id: "granted-1",
								data: makeRecipe({ id: "granted-1", ownerId: "owner-1" }),
								owner_id: "owner-1",
								updated_at: "2020-01-01T00:00:00.000Z",
								deleted_at: null,
							}
						: null,
				);
				const { runSync } = await import("./sync-engine");

				const result = await runSync();

				const adopted = result?.recipes?.find((r) => r.id === "granted-1");
				expect(adopted).toBeDefined();
				expect(adopted?.ownerId).toBe("owner-1");
				expect(adopted?.sharedAt).not.toBeNull();
			});

			it("doesn't re-fetch a granted resource that's already known locally", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				const { saveRecipe } = await import("#/lib/recipes-storage");
				saveRecipe(
					[],
					makeRecipe({
						id: "already-here",
						sharedAt: "2026-01-01T00:00:00.000Z",
						ownerId: "owner-1",
					}),
				);
				pullGrantedResourceIdsMock.mockImplementation(async (table: string) =>
					table === "recipes" ? ["already-here"] : [],
				);
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(pullOneMock).not.toHaveBeenCalled();
			});

			it("logs and continues when grant reconciliation itself fails", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				pullGrantedResourceIdsMock.mockRejectedValue(new Error("boom"));
				const consoleErrorSpy = vi
					.spyOn(console, "error")
					.mockImplementation(() => {});
				const { runSync } = await import("./sync-engine");

				const result = await runSync();

				expect(result).not.toBeNull();
				expect(consoleErrorSpy).toHaveBeenCalledWith(
					expect.stringContaining("Grant reconciliation failed"),
					expect.any(Error),
				);
				consoleErrorSpy.mockRestore();
			});

			it("re-derives cascaded grants after pushing an owned grocery list", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				const { saveGroceryList } = await import("#/lib/grocery-storage");
				saveGroceryList(
					[],
					makeGroceryList({
						id: "list-1",
						sharedAt: "2026-01-01T00:00:00.000Z",
						ownerId: "my-account",
					}),
				);
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(cascadeSharesForResourceMock).toHaveBeenCalledWith(
					"grocery_lists",
					"list-1",
				);
			});

			it("never cascades for the recipes table itself", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				const { saveRecipe } = await import("#/lib/recipes-storage");
				saveRecipe(
					[],
					makeRecipe({
						id: "r1",
						sharedAt: "2026-01-01T00:00:00.000Z",
						ownerId: "my-account",
					}),
				);
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(cascadeSharesForResourceMock).not.toHaveBeenCalled();
			});

			it("never cascades a grocery list shared TO this account, only one it owns", async () => {
				getDeviceIdentityMock.mockReturnValue({
					deviceId: "device-1",
					userId: "my-account",
				});
				const { saveGroceryList } = await import("#/lib/grocery-storage");
				saveGroceryList(
					[],
					makeGroceryList({
						id: "list-1",
						sharedAt: "2026-01-01T00:00:00.000Z",
						ownerId: "someone-else",
					}),
				);
				const { runSync } = await import("./sync-engine");

				await runSync();

				expect(cascadeSharesForResourceMock).not.toHaveBeenCalled();
			});
		});
	});
});
