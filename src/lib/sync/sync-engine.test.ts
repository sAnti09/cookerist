import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";

const getDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
}));

const pushEntitiesMock = vi.fn();
const pullChangedSinceMock = vi.fn();
vi.mock("#/lib/sync/sync-client", () => ({
	pushEntities: (...args: unknown[]) => pushEntitiesMock(...args),
	pullChangedSince: (...args: unknown[]) => pullChangedSinceMock(...args),
}));

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: "r1",
		createdAt: "2026-01-01T00:00:00.000Z",
		updatedAt: "2026-01-01T00:00:00.000Z",
		sharedAt: null,
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

beforeEach(() => {
	vi.resetModules();
	window.localStorage.clear();
	getDeviceIdentityMock.mockReset();
	pushEntitiesMock.mockReset();
	pullChangedSinceMock.mockReset();
	pushEntitiesMock.mockResolvedValue(undefined);
	pullChangedSinceMock.mockResolvedValue([]);
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
				ownerDeviceId: "device-1",
			}),
		);
		saveRecipe(
			[
				makeRecipe({
					id: "already-synced",
					sharedAt: "2026-01-01T00:00:00.000Z",
					ownerDeviceId: "device-1",
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
		expect(stamped?.ownerDeviceId).toBe("device-1");
	});

	it("excludes a detached entity from the push — the owner's delete stays final", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-2" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "detached-earlier",
				sharedAt: null,
				ownerDeviceId: "device-1",
			}),
		);
		const { runSync } = await import("./sync-engine");

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		const pushedIds = (recipesPushCall?.[1] as Array<{ id: string }>).map(
			(r) => r.id,
		);
		expect(pushedIds).not.toContain("detached-earlier");
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
				ownerDeviceId: "device-1",
			}),
		);
		const remote = makeRecipe({
			id: "r1",
			title: "Newer remote title",
			updatedAt: "2026-01-05T00:00:00.000Z",
			sharedAt: "2026-01-01T00:00:00.000Z",
			ownerDeviceId: "device-1",
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

	it("detaches (unshares) a local entity when the owner tombstoned it remotely", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-2" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({
				id: "r1",
				sharedAt: "2026-01-01T00:00:00.000Z",
				ownerDeviceId: "device-1",
			}),
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

		const detached = result?.recipes?.find((r) => r.id === "r1");
		expect(detached).toBeDefined();
		expect(detached?.sharedAt).toBeNull();
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
				ownerDeviceId: "device-1",
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
				ownerDeviceId: "device-1",
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
				ownerDeviceId: "device-1",
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
				ownerDeviceId: "device-1",
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
});
