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

	it("only pushes locally-shared entities, never local-only ones", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const { saveRecipe } = await import("#/lib/recipes-storage");
		saveRecipe(
			[],
			makeRecipe({ id: "shared", sharedAt: "2026-01-01T00:00:00.000Z" }),
		);
		saveRecipe(
			[makeRecipe({ id: "shared", sharedAt: "2026-01-01T00:00:00.000Z" })],
			makeRecipe({ id: "local-only", sharedAt: null }),
		);
		const { runSync } = await import("./sync-engine");

		await runSync();

		const recipesPushCall = pushEntitiesMock.mock.calls.find(
			(call) => call[0] === "recipes",
		);
		expect(recipesPushCall?.[1]).toHaveLength(1);
		expect(recipesPushCall?.[1][0].id).toBe("shared");
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

		const adopted = result?.recipes.find((r) => r.id === "remote-1");
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

		expect(result?.recipes.find((r) => r.id === "r1")?.title).toBe(
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

		const detached = result?.recipes.find((r) => r.id === "r1");
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
			result?.recipes.find((r) => r.id === "never-had-it"),
		).toBeUndefined();
	});
});
