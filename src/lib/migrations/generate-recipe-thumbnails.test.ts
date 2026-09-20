import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { loadRecipes, saveRecipe } from "#/lib/recipes-storage";
import { generateRecipeThumbnail } from "#/server/generate-recipe-thumbnail";
import { generateRecipeThumbnails } from "./generate-recipe-thumbnails";

vi.mock("#/server/generate-recipe-thumbnail", () => ({
	generateRecipeThumbnail: vi.fn(),
}));

const generateRecipeThumbnailMock = vi.mocked(generateRecipeThumbnail);

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		prompt: "a dish",
		title: "A Dish",
		overview: "overview",
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
	window.localStorage.clear();
	generateRecipeThumbnailMock.mockReset();
});

describe("generateRecipeThumbnails", () => {
	it("does nothing and never calls the server function when there are no recipes", async () => {
		await generateRecipeThumbnails();

		expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
	});

	it("does not ask to be retried when there was nothing to do in the first place", async () => {
		await expect(generateRecipeThumbnails()).resolves.toBeUndefined();
	});

	it("skips a recipe that already has a thumbnail", async () => {
		saveRecipe(
			[],
			makeRecipe({ thumbnailUrl: "https://example.com/existing.png" }),
		);

		await generateRecipeThumbnails();

		expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
	});

	it("skips a recipe already at the attempt cap", async () => {
		// MAX_THUMBNAIL_ATTEMPTS is 2 (see src/lib/recipe.ts).
		saveRecipe([], makeRecipe({ thumbnailAttempts: 2 }));

		await generateRecipeThumbnails();

		expect(generateRecipeThumbnailMock).not.toHaveBeenCalled();
	});

	it("sets thumbnailUrl for a recipe missing one", async () => {
		const recipe = saveRecipe(
			[],
			makeRecipe({ title: "Tacos", overview: "Crispy beef tacos." }),
		)[0];
		generateRecipeThumbnailMock.mockResolvedValueOnce({
			type: "success",
			url: "https://example.com/r1.png",
		});

		await generateRecipeThumbnails();

		expect(generateRecipeThumbnailMock).toHaveBeenCalledWith({
			data: {
				recipeId: recipe.id,
				title: "Tacos",
				overview: "Crispy beef tacos.",
			},
		});
		const [stored] = loadRecipes();
		expect(stored.thumbnailUrl).toBe("https://example.com/r1.png");
	});

	it("increments thumbnailAttempts (not thumbnailUrl) on an error result, and asks to be retried since nothing succeeded", async () => {
		saveRecipe([], makeRecipe());
		generateRecipeThumbnailMock.mockResolvedValueOnce({
			type: "error",
			message: "DeepInfra image generation failed: 500 Internal Server Error",
		});

		await expect(generateRecipeThumbnails()).resolves.toEqual({ retry: true });

		const [stored] = loadRecipes();
		expect(stored.thumbnailUrl).toBeNull();
		expect(stored.thumbnailAttempts).toBe(1);
	});

	it("increments thumbnailAttempts and asks to be retried when the server call rejects", async () => {
		saveRecipe([], makeRecipe());
		generateRecipeThumbnailMock.mockRejectedValueOnce(
			new Error("network down"),
		);

		await expect(generateRecipeThumbnails()).resolves.toEqual({ retry: true });

		const [stored] = loadRecipes();
		expect(stored.thumbnailAttempts).toBe(1);
	});

	it("does not ask to be retried when at least one recipe succeeded, even if another failed", async () => {
		saveRecipe(
			saveRecipe([], makeRecipe({ id: "recipe-1" })),
			makeRecipe({ id: "recipe-2" }),
		);
		generateRecipeThumbnailMock
			.mockResolvedValueOnce({
				type: "success",
				url: "https://example.com/a.png",
			})
			.mockResolvedValueOnce({ type: "error", message: "failed" });

		await expect(generateRecipeThumbnails()).resolves.toBeUndefined();

		// saveRecipe prepends, so candidate iteration order isn't the same as
		// insertion order here — assert on outcome, not which specific id got
		// which mocked result.
		const stored = loadRecipes();
		const succeeded = stored.filter((r) => r.thumbnailUrl != null);
		const failed = stored.filter((r) => r.thumbnailUrl == null);
		expect(succeeded).toHaveLength(1);
		expect(succeeded[0]?.thumbnailUrl).toBe("https://example.com/a.png");
		expect(failed).toHaveLength(1);
		expect(failed[0]?.thumbnailAttempts).toBe(1);
	});

	it("processes every candidate sequentially, one server call per recipe", async () => {
		saveRecipe(
			saveRecipe([], makeRecipe({ id: "recipe-1" })),
			makeRecipe({ id: "recipe-2" }),
		);
		generateRecipeThumbnailMock.mockResolvedValue({
			type: "success",
			url: "https://example.com/a.png",
		});

		await generateRecipeThumbnails();

		expect(generateRecipeThumbnailMock).toHaveBeenCalledTimes(2);
	});

	it("leaves an unrelated recipe untouched", async () => {
		saveRecipe(
			saveRecipe(
				[],
				makeRecipe({
					id: "recipe-untouched",
					thumbnailUrl: "https://example.com/already-has-one.png",
				}),
			),
			makeRecipe({ id: "recipe-changed" }),
		);
		const baselineUntouched = loadRecipes().find(
			(r) => r.id === "recipe-untouched",
		);
		generateRecipeThumbnailMock.mockResolvedValueOnce({
			type: "success",
			url: "https://example.com/new.png",
		});

		await generateRecipeThumbnails();

		const stored = loadRecipes().find((r) => r.id === "recipe-untouched");
		expect(stored).toEqual(baselineUntouched);
	});
});
