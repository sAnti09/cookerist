import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID } from "#/lib/migrations/generate-recipe-thumbnails";
import { loadRecipes, saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
import { renderApp } from "#/test-utils/render-app";

const modifyRecipeMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: (...args: unknown[]) => modifyRecipeMock(...args),
}));

const generateRecipeThumbnailMock = vi.fn();
// A real (unmocked) request here would hit DeepInfra/R2 via cloudflare:workers
// (unavailable outside a Workers/Miniflare runtime).
vi.mock("#/server/generate-recipe-thumbnail", () => ({
	generateRecipeThumbnail: (...args: unknown[]) =>
		generateRecipeThumbnailMock(...args),
}));

const getDeviceIdentityMock = vi.fn();
const ensureDeviceIdentityMock = vi.fn();
vi.mock("#/lib/identity/device", () => ({
	getDeviceIdentity: () => getDeviceIdentityMock(),
	ensureDeviceIdentity: () => ensureDeviceIdentityMock(),
}));

const runSyncMock = vi.fn();
vi.mock("#/lib/sync/sync-engine", () => ({
	runSync: () => runSyncMock(),
}));

const createResourceShareCodeMock = vi.fn();
vi.mock("#/server/resource-sharing", () => ({
	createResourceShareCode: (...args: unknown[]) =>
		createResourceShareCodeMock(...args),
	redeemResourceShareCode: vi.fn(),
}));

const validRecipe = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy" as const,
	estimatedMinutes: 25,
	caloriesPerServing: 620,
	ingredients: [
		{
			baseName: "shrimp",
			description: "",
			quantity: 300,
			unit: "g",
			category: "Meat & Seafood" as const,
			approxGramsPerUnit: null,
		},
	],
	steps: [{ section: null, text: "Cook the pasta." }],
};

beforeEach(() => {
	modifyRecipeMock.mockReset();
	window.localStorage.clear();
	// Every seeded recipe here starts without a thumbnail, which makes it a
	// candidate for the generate-recipe-thumbnails backfill migration — mark
	// it already-run so it doesn't fire in the background on mount and
	// consume generateRecipeThumbnailMock's queued return values ahead of
	// this file's own explicit calls (the migration gets its own dedicated
	// test file).
	window.localStorage.setItem(
		"cookerist:completed-migrations",
		JSON.stringify([GENERATE_RECIPE_THUMBNAILS_MIGRATION_ID]),
	);
	getDeviceIdentityMock.mockReset();
	ensureDeviceIdentityMock.mockReset();
	runSyncMock.mockReset();
	createResourceShareCodeMock.mockReset();
	getDeviceIdentityMock.mockReturnValue(null);
	runSyncMock.mockResolvedValue(null);
	generateRecipeThumbnailMock.mockReset();
	generateRecipeThumbnailMock.mockReturnValue(new Promise(() => {}));
});

function seedRecipe(
	overrides: {
		title?: string;
		favorite?: boolean;
		sharedAt?: string | null;
		ownerId?: string | null;
		thumbnailUrl?: string | null;
		thumbnailAttempts?: number;
	} = {},
) {
	const recipe = toStoredRecipe("shrimp pasta for 2", {
		...validRecipe,
		title: overrides.title ?? validRecipe.title,
	});
	const saved = saveRecipe(loadRecipes(), {
		...recipe,
		favorite: overrides.favorite ?? false,
		sharedAt: overrides.sharedAt ?? null,
		ownerId: overrides.ownerId ?? null,
		thumbnailUrl: overrides.thumbnailUrl ?? null,
		thumbnailAttempts: overrides.thumbnailAttempts ?? 0,
	});
	return saved[0];
}

describe("Recipe detail screen", () => {
	it("shows a not-found state and a link back for an unknown id", async () => {
		await renderApp("/recipes/does-not-exist");

		expect(screen.getByText(/couldn't be found/i)).toBeInTheDocument();
		expect(
			screen.getByRole("link", { name: "Back to recipes" }),
		).toHaveAttribute("href", "/recipes");
	});

	it("renders the recipe's title, meta, and detail content", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.getByRole("heading", { name: recipe.title }),
		).toBeInTheDocument();
		expect(screen.getByText("Quick & easy")).toBeInTheDocument();
		expect(screen.getByText("25 min")).toBeInTheDocument();
		expect(screen.getByText("620 cal")).toBeInTheDocument();
		expect(screen.getByText(recipe.overview)).toBeInTheDocument();
	});

	it("shows a sticky Start Cooking button and hides the bottom tab bar", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.getByRole("button", { name: "Start Cooking" }),
		).toBeInTheDocument();
		expect(screen.queryByRole("navigation")).not.toBeInTheDocument();
	});

	it("hides the sticky Start Cooking button when the recipe has no steps", async () => {
		const recipe = toStoredRecipe("shrimp pasta for 2", {
			...validRecipe,
			steps: [],
		});
		saveRecipe(loadRecipes(), recipe);
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.queryByRole("button", { name: "Start Cooking" }),
		).not.toBeInTheDocument();
	});

	it("opens and closes cook mode from the sticky Start Cooking button", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		expect(screen.queryByText("Step 1 of 1")).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Start Cooking" }));
		expect(screen.getByText("Step 1 of 1")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Exit cook mode" }));
		expect(screen.queryByText("Step 1 of 1")).not.toBeInTheDocument();
	});

	it("navigates back to the recipes list via the back button", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: "Back to recipes" }));

		expect(
			await screen.findByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
	});

	it("uses a true history back (a POP, not a fresh navigation) when arrived at via in-app navigation, so the list's scroll position can be restored", async () => {
		const recipe = seedRecipe();
		const { router } = await renderApp("/recipes");
		const user = userEvent.setup();
		const historyBackSpy = vi.spyOn(router.history, "back");

		await user.click(screen.getByText(recipe.title));
		await user.click(
			await screen.findByRole("button", { name: "Back to recipes" }),
		);

		expect(historyBackSpy).toHaveBeenCalledTimes(1);
		expect(
			await screen.findByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
	});

	it("toggles favorite from the header star and persists it", async () => {
		const recipe = seedRecipe({ favorite: false });
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		const favoriteButton = screen.getByRole("button", {
			name: `Favorite ${recipe.title}`,
		});
		await user.click(favoriteButton);

		expect(
			screen.getByRole("button", { name: `Unfavorite ${recipe.title}` }),
		).toHaveAttribute("aria-pressed", "true");
		const [stored] = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		);
		expect(stored.favorite).toBe(true);
	});

	it("deletes the recipe and navigates back to the list after confirming", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(
			await screen.findByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).not.toContain(
			recipe.title,
		);
	});

	it("does not delete until the confirmation dialog is confirmed", async () => {
		const recipe = seedRecipe();
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		);
		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(
			screen.getByRole("heading", { name: recipe.title }),
		).toBeInTheDocument();
	});

	it("forks a modification into a new recipe and navigates to its detail page", async () => {
		const recipe = seedRecipe({ title: "Original Recipe" });
		modifyRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: { ...validRecipe, title: "Forked Recipe" },
			truncated: false,
		});
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Modify ${recipe.title}` }),
		);
		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"make it spicier",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));
		await screen.findByRole("button", { name: "Approve" });
		await user.click(
			screen.getByRole("button", { name: "Create as new recipe" }),
		);

		expect(
			await screen.findByRole("heading", { name: "Forked Recipe" }),
		).toBeInTheDocument();
		await waitFor(() => {
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:recipes") ?? "[]",
			);
			expect(
				stored.some((r: { title: string }) => r.title === "Forked Recipe"),
			).toBe(true);
		});
	});

	// Every paired device is a symmetric co-owner (see CLAUDE.md's Ownership
	// section) — delete is always "Delete," never a device-scoped "Remove."
	it("labels delete as Delete for a shared recipe", async () => {
		getDeviceIdentityMock.mockReturnValue({ deviceId: "device-1" });
		const recipe = seedRecipe({
			sharedAt: "2026-01-01T00:00:00.000Z",
		});
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.getByRole("button", { name: `Delete ${recipe.title}` }),
		).toBeInTheDocument();
	});

	// See CLAUDE.md's "Per-resource sharing" roadmap item.
	it("opens the share dialog and generates a code from the Share icon", async () => {
		const recipe = seedRecipe();
		ensureDeviceIdentityMock.mockImplementation(async () => {
			const identity = { deviceId: "device-1", deviceSecret: "s" };
			getDeviceIdentityMock.mockReturnValue(identity);
			return identity;
		});
		createResourceShareCodeMock.mockResolvedValue({
			code: "ABCD1234",
			expiresAt: "2026-01-01T00:10:00.000Z",
		});
		await renderApp(`/recipes/${recipe.id}`);
		const user = userEvent.setup();

		await user.click(
			screen.getByRole("button", { name: `Share ${recipe.title}` }),
		);
		await user.click(
			screen.getByRole("button", { name: /generate share code/i }),
		);

		expect(await screen.findByText("ABCD1234")).toBeInTheDocument();
	});

	it("hides the Share icon and labels delete as Remove for a recipe shared to this account", async () => {
		getDeviceIdentityMock.mockReturnValue({
			deviceId: "device-1",
			userId: "me",
		});
		const recipe = seedRecipe({
			sharedAt: "2026-01-01T00:00:00.000Z",
			ownerId: "someone-else",
		});
		await renderApp(`/recipes/${recipe.id}`);

		expect(
			screen.queryByRole("button", { name: `Share ${recipe.title}` }),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: `Remove ${recipe.title}` }),
		).toBeInTheDocument();
	});

	describe("thumbnail", () => {
		it("shows the generated image directly when a thumbnail already exists", async () => {
			const recipe = seedRecipe({
				thumbnailUrl: "https://example.com/recipes/r1.png",
			});
			await renderApp(`/recipes/${recipe.id}`);

			expect(
				screen.getByRole("heading", { name: recipe.title }),
			).toBeInTheDocument();
			const hero = document.querySelector(
				`img[src="https://example.com/recipes/r1.png"]`,
			);
			expect(hero).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Generate image" }),
			).not.toBeInTheDocument();
		});

		it("automatically retries a missing thumbnail on mount (app-data-context.tsx's background sweep), and offers a manual Generate image button for a further retry that shows the result once it resolves", async () => {
			// The mount-time sweep (see CLAUDE.md's "Recipe thumbnail images" /
			// app-data-context.tsx's sweepMissingThumbnails) fires for any recipe
			// missing a thumbnail below the attempt cap — no click needed to kick
			// off this first attempt, so this is the request that consumes the
			// queued error result below, not an explicit user action.
			generateRecipeThumbnailMock.mockResolvedValueOnce({
				type: "error",
				message: "DeepInfra image generation failed: 500 Internal Server Error",
			});
			const recipe = seedRecipe({ thumbnailAttempts: 0 });
			await renderApp(`/recipes/${recipe.id}`);

			await waitFor(() => {
				expect(generateRecipeThumbnailMock).toHaveBeenCalledWith({
					data: expect.objectContaining({
						recipeId: recipe.id,
						title: recipe.title,
						overview: recipe.overview,
					}),
				});
			});

			// The automatic attempt failed but left one retry under the cap (2
			// total) — the manual button becomes available once it settles.
			const button = await screen.findByRole("button", {
				name: "Generate image",
			});
			let resolveThumbnail!: (value: unknown) => void;
			generateRecipeThumbnailMock.mockReturnValueOnce(
				new Promise((r) => {
					resolveThumbnail = r;
				}),
			);
			const user = userEvent.setup();
			await user.click(button);

			expect(generateRecipeThumbnailMock).toHaveBeenCalledTimes(2);
			expect(
				screen.queryByRole("button", { name: "Generate image" }),
			).not.toBeInTheDocument();

			resolveThumbnail({
				type: "success",
				url: "https://example.com/recipes/r1.png",
			});

			// A decorative thumbnail (alt="") isn't exposed with role "img" —
			// queried directly, same as result-row.test.tsx's photo previews.
			await waitFor(() => {
				expect(
					document.querySelector(
						'img[src="https://example.com/recipes/r1.png"]',
					),
				).toBeInTheDocument();
			});
		});

		it("shows a 'could not be generated' message with no button once the attempt cap is reached", async () => {
			// MAX_THUMBNAIL_ATTEMPTS is 2 (see src/lib/recipe.ts) — both the
			// automatic creation-time attempt and one manual retry have already
			// been spent.
			const recipe = seedRecipe({ thumbnailAttempts: 2 });
			await renderApp(`/recipes/${recipe.id}`);

			expect(
				screen.getByText(/image could not be generated for this recipe/i),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Generate image" }),
			).not.toBeInTheDocument();
			expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
		});
	});
});
