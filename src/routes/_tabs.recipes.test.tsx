import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRecipes, saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
import { renderApp } from "#/test-utils/render-app";

class MockIntersectionObserver {
	static instances: MockIntersectionObserver[] = [];
	callback: IntersectionObserverCallback;
	root = null;
	rootMargin = "";
	thresholds: number[] = [];
	observe = vi.fn();
	unobserve = vi.fn();
	disconnect = vi.fn();
	takeRecords = () => [];

	constructor(callback: IntersectionObserverCallback) {
		this.callback = callback;
		MockIntersectionObserver.instances.push(this);
	}

	intersect() {
		this.callback(
			[{ isIntersecting: true } as IntersectionObserverEntry],
			this as unknown as IntersectionObserver,
		);
	}
}

const generateRecipeMock = vi.fn();
const identifyDishMock = vi.fn();
const categorizeIngredientsMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: (...args: unknown[]) => generateRecipeMock(...args),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));

vi.mock("#/server/identify-dish", () => ({
	identifyDish: (...args: unknown[]) => identifyDishMock(...args),
}));

// The categorize-recipe-ingredients migration calls this in the background
// whenever any recipe is seeded; mocked so it never hits the AI client.
vi.mock("#/server/categorize-ingredients", () => ({
	categorizeIngredients: (...args: unknown[]) =>
		categorizeIngredientsMock(...args),
}));

vi.mock("#/lib/image-capture", () => ({
	compressImageToDataUrl: vi.fn(() =>
		Promise.resolve("data:image/jpeg;base64,compressed"),
	),
	isImageFile: (file: File) => file.type.startsWith("image/"),
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

async function submitPrompt(prompt: string) {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Describe a dish"), prompt);
	await user.click(screen.getByRole("button", { name: "Get recipe" }));
}

// Deltas here (150px) are past SWIPE_THRESHOLD_PX (110) in
// use-swipe-row-actions.ts.
function swipeLeft(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 250, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 100, clientY: 0 }],
	});
}

function swipeRight(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 100, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 250, clientY: 0 }],
	});
}

// A plain tap on a touch device: touchstart/touchend with a negligible
// delta (not a swipe), followed by the compatibility `click` event real
// mobile browsers fire right after — reproduces the actual event sequence
// use-swipe-row-actions.ts's suppressClickRef handling depends on, unlike
// userEvent.click (which never dispatches touch events in jsdom).
function tap(element: Element) {
	fireEvent.touchStart(element, { touches: [{ clientX: 100, clientY: 0 }] });
	fireEvent.touchEnd(element, {
		changedTouches: [{ clientX: 100, clientY: 0 }],
	});
	fireEvent.click(element);
}

async function selectPhoto(file: File) {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("photo input not found");
	await userEvent.upload(input, file);
}

beforeEach(() => {
	generateRecipeMock.mockReset();
	identifyDishMock.mockReset();
	categorizeIngredientsMock.mockReset();
	categorizeIngredientsMock.mockResolvedValue({ type: "success", items: [] });
	window.localStorage.clear();
	MockIntersectionObserver.instances = [];
	vi.stubGlobal("IntersectionObserver", MockIntersectionObserver);
});

afterEach(() => {
	vi.unstubAllGlobals();
});

function seedRecipes(count: number) {
	for (let i = 0; i < count; i++) {
		saveRecipe(
			loadRecipes(),
			toStoredRecipe(`prompt ${i}`, { ...validRecipe, title: `Recipe ${i}` }),
		);
	}
}

function seedRecipe(overrides: {
	title: string;
	prompt?: string;
	difficulty?: "quick_and_easy" | "intermediate" | "hard";
	favorite?: boolean;
}) {
	const recipe = toStoredRecipe(overrides.prompt ?? "a prompt", {
		...validRecipe,
		title: overrides.title,
		difficulty: overrides.difficulty ?? validRecipe.difficulty,
	});
	saveRecipe(loadRecipes(), {
		...recipe,
		favorite: overrides.favorite ?? false,
	});
}

describe("Recipes screen", () => {
	it("renders the Recipes heading", async () => {
		await renderApp("/recipes");

		expect(
			screen.getByRole("heading", { name: "Recipes" }),
		).toBeInTheDocument();
	});

	it("shows the bottom tab bar", async () => {
		await renderApp("/recipes");

		expect(screen.getByRole("navigation")).toBeInTheDocument();
	});

	it("disables the prompt form and shows a notice while offline", async () => {
		vi.stubGlobal("navigator", { ...window.navigator, onLine: false });
		await renderApp("/recipes");

		expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
		expect(screen.getByLabelText("Describe a dish")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
	});

	it("re-enables the prompt form once back online", async () => {
		vi.stubGlobal("navigator", { ...window.navigator, onLine: false });
		await renderApp("/recipes");
		expect(screen.getByLabelText("Describe a dish")).toBeDisabled();

		act(() => {
			window.dispatchEvent(new Event("online"));
		});

		expect(screen.getByLabelText("Describe a dish")).not.toBeDisabled();
		expect(screen.queryByText(/you're offline/i)).not.toBeInTheDocument();
	});

	it("shows a loading row immediately, then a saved result on success", async () => {
		let resolve!: (value: unknown) => void;
		generateRecipeMock.mockReturnValueOnce(
			new Promise((r) => {
				resolve = r;
			}),
		);
		await renderApp("/recipes");

		await submitPrompt("shrimp pasta for 2");

		expect(screen.getByRole("status")).toHaveTextContent(/simmering/i);

		resolve({ type: "success", recipe: validRecipe });

		expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).toContain(
			validRecipe.title,
		);
	});

	it("shows an inline rejection and saves nothing when off-topic", async () => {
		generateRecipeMock.mockResolvedValueOnce({ type: "off_topic" });
		await renderApp("/recipes");

		await submitPrompt("what's the capital of France?");

		expect(
			await screen.findByText(/doesn't look like a cooking request/i),
		).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).toBeNull();
	});

	it("retrying an off-topic rejection clears the notice and refills the prompt field instead of resubmitting", async () => {
		generateRecipeMock.mockResolvedValueOnce({ type: "off_topic" });
		await renderApp("/recipes");

		await submitPrompt("what's the capital of France?");
		const retryButton = await screen.findByRole("button", { name: "Retry" });

		const user = userEvent.setup();
		await user.click(retryButton);

		expect(
			screen.queryByText(/doesn't look like a cooking request/i),
		).not.toBeInTheDocument();
		expect(screen.getByLabelText("Describe a dish")).toHaveValue(
			"what's the capital of France?",
		);
		expect(generateRecipeMock).toHaveBeenCalledTimes(1);
	});

	it("shows a retry action on failure, and retry re-triggers generation", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
		await renderApp("/recipes");

		await submitPrompt("shrimp pasta for 2");

		const retryButton = await screen.findByRole("button", { name: "Retry" });
		expect(
			screen.getByText("Malformed recipe response from Groq"),
		).toBeInTheDocument();

		generateRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: validRecipe,
		});
		const user = userEvent.setup();
		await user.click(retryButton);

		expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
		expect(generateRecipeMock).toHaveBeenCalledTimes(2);
	});

	it("shows a generic error and retry when the server function call throws", async () => {
		generateRecipeMock.mockRejectedValueOnce(new Error("network down"));
		await renderApp("/recipes");

		await submitPrompt("shrimp pasta for 2");

		expect(
			await screen.findByText(/something went wrong generating that recipe/i),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
	});

	it("handles two concurrent submissions independently, regardless of resolution order", async () => {
		let resolveFirst!: (value: unknown) => void;
		let resolveSecond!: (value: unknown) => void;
		generateRecipeMock
			.mockReturnValueOnce(
				new Promise((r) => {
					resolveFirst = r;
				}),
			)
			.mockReturnValueOnce(
				new Promise((r) => {
					resolveSecond = r;
				}),
			);
		await renderApp("/recipes");

		await submitPrompt("first dish");
		await submitPrompt("second dish");

		expect(screen.getAllByRole("status")).toHaveLength(2);

		resolveSecond({
			type: "success",
			recipe: { ...validRecipe, title: "Second Dish" },
		});
		expect(await screen.findByText("Second Dish")).toBeInTheDocument();
		expect(screen.getAllByRole("status")).toHaveLength(1);

		resolveFirst({ type: "off_topic" });
		await waitFor(() =>
			expect(screen.queryByRole("status")).not.toBeInTheDocument(),
		);
		expect(
			screen.getByText(/doesn't look like a cooking request/i),
		).toBeInTheDocument();
		expect(screen.getByText("Second Dish")).toBeInTheDocument();
	});

	it("shows an empty-state placeholder when there are no results", async () => {
		await renderApp("/recipes");

		expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
	});

	describe("Why Cookerist", () => {
		it("shows the feature showcase with a privacy tile and an install button", async () => {
			await renderApp("/recipes");

			expect(
				screen.getByRole("heading", { name: "Why Cookerist" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Private by design" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Install app" }),
			).toBeInTheDocument();
		});

		it("clears every localStorage key and reloads once the reset is confirmed", async () => {
			seedRecipes(1);
			window.localStorage.setItem("cookerist:theme", "dark");
			const reload = vi.fn();
			Object.defineProperty(window, "location", {
				configurable: true,
				value: { ...window.location, reload },
			});
			await renderApp("/recipes");
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "reset all data" }));
			await user.click(
				screen.getByRole("button", { name: "Reset everything" }),
			);

			expect(window.localStorage.length).toBe(0);
			expect(reload).toHaveBeenCalledTimes(1);
		});
	});

	it("renders only the first 10 recipes and loads more on scroll intersection", async () => {
		seedRecipes(12);
		await renderApp("/recipes");

		expect(screen.getAllByText(/^Recipe \d+$/)).toHaveLength(10);

		MockIntersectionObserver.instances[0]?.intersect();

		await waitFor(() =>
			expect(screen.getAllByText(/^Recipe \d+$/)).toHaveLength(12),
		);
	});

	it("navigates to a recipe's full-screen detail page when its row is clicked", async () => {
		seedRecipe({ title: "Garlic Shrimp Pasta" });
		await renderApp("/recipes");
		const user = userEvent.setup();

		await user.click(screen.getByText("Garlic Shrimp Pasta"));

		expect(
			await screen.findByRole("button", { name: "Back to recipes" }),
		).toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Garlic Shrimp Pasta" }),
		).toBeInTheDocument();
	});

	describe("search and filters", () => {
		it("filters the list by title or prompt, case-insensitively", async () => {
			seedRecipe({ title: "Garlic Butter Shrimp Pasta" });
			seedRecipe({ title: "Beef Tacos", prompt: "something for date night" });
			await renderApp("/recipes");
			const user = userEvent.setup();

			await user.type(screen.getByLabelText("Search recipes"), "SHRIMP");

			expect(
				screen.getByText("Garlic Butter Shrimp Pasta"),
			).toBeInTheDocument();
			expect(screen.queryByText("Beef Tacos")).not.toBeInTheDocument();
		});

		it("filters by difficulty, and 'All difficulties' clears it", async () => {
			seedRecipe({ title: "Easy Dish", difficulty: "quick_and_easy" });
			seedRecipe({ title: "Hard Dish", difficulty: "hard" });
			await renderApp("/recipes");
			const user = userEvent.setup();

			await user.selectOptions(
				screen.getByLabelText("Filter by difficulty"),
				"Hard",
			);

			expect(screen.getByText("Hard Dish")).toBeInTheDocument();
			expect(screen.queryByText("Easy Dish")).not.toBeInTheDocument();

			await user.selectOptions(
				screen.getByLabelText("Filter by difficulty"),
				"All difficulties",
			);

			expect(screen.getByText("Hard Dish")).toBeInTheDocument();
			expect(screen.getByText("Easy Dish")).toBeInTheDocument();
		});

		it("filters to favorites only when the toggle is enabled", async () => {
			seedRecipe({ title: "Favorited Dish", favorite: true });
			seedRecipe({ title: "Regular Dish", favorite: false });
			await renderApp("/recipes");
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Favorites" }));

			expect(screen.getByText("Favorited Dish")).toBeInTheDocument();
			expect(screen.queryByText("Regular Dish")).not.toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Favorites" }));

			expect(screen.getByText("Regular Dish")).toBeInTheDocument();
		});

		it("shows a distinct empty state for no matches vs. no recipes at all, and clears via Clear filters", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			await renderApp("/recipes");
			const user = userEvent.setup();

			await user.type(screen.getByLabelText("Search recipes"), "tacos");

			expect(
				screen.getByText(/no recipes match your filters/i),
			).toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Clear filters" }));

			expect(screen.getByText("Garlic Shrimp Pasta")).toBeInTheDocument();
			expect(
				screen.queryByRole("button", { name: "Clear filters" }),
			).not.toBeInTheDocument();
		});
	});

	describe("swipe actions", () => {
		it("swiping left on a recipe row opens the delete confirmation, and confirming removes it", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			await renderApp("/recipes");
			const user = userEvent.setup();
			const row = screen.getByText("Garlic Shrimp Pasta").closest("a");
			if (!row) throw new Error("row not found");

			swipeLeft(row);

			expect(
				await screen.findByRole("alertdialog", {
					name: "Delete this recipe?",
				}),
			).toBeInTheDocument();
			await user.click(screen.getByRole("button", { name: "Delete" }));

			expect(screen.queryByText("Garlic Shrimp Pasta")).not.toBeInTheDocument();
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:recipes") ?? "[]",
			);
			expect(stored).toHaveLength(0);
		});

		it("cancelling the swipe-left delete confirmation keeps the recipe", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			await renderApp("/recipes");
			const user = userEvent.setup();
			const row = screen.getByText("Garlic Shrimp Pasta").closest("a");
			if (!row) throw new Error("row not found");

			swipeLeft(row);
			await screen.findByRole("alertdialog", { name: "Delete this recipe?" });
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			expect(screen.getByText("Garlic Shrimp Pasta")).toBeInTheDocument();
		});

		it("navigates on the very next tap after cancelling a swipe-left delete confirmation", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			await renderApp("/recipes");
			const user = userEvent.setup();
			const row = screen.getByText("Garlic Shrimp Pasta").closest("a");
			if (!row) throw new Error("row not found");

			swipeLeft(row);
			await screen.findByRole("alertdialog", { name: "Delete this recipe?" });
			await user.click(screen.getByRole("button", { name: "Cancel" }));

			tap(row);

			expect(
				await screen.findByRole("button", { name: "Back to recipes" }),
			).toBeInTheDocument();
		});

		it("swiping right on a recipe row with steps opens Cook Mode directly", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			await renderApp("/recipes");
			const row = screen.getByText("Garlic Shrimp Pasta").closest("a");
			if (!row) throw new Error("row not found");

			swipeRight(row);

			expect(
				await screen.findByLabelText("Exit cook mode"),
			).toBeInTheDocument();
		});

		it("swiping right on a recipe row with no steps does nothing", async () => {
			saveRecipe(
				loadRecipes(),
				toStoredRecipe("a prompt", {
					...validRecipe,
					title: "No Steps Dish",
					steps: [],
				}),
			);
			await renderApp("/recipes");
			const row = screen.getByText("No Steps Dish").closest("a");
			if (!row) throw new Error("row not found");

			swipeRight(row);

			expect(screen.queryByLabelText("Exit cook mode")).not.toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Recipes" }),
			).toBeInTheDocument();
		});
	});

	describe("photo identification", () => {
		it("shows an identifying loading row with a thumbnail, then hands off to normal generation", async () => {
			let resolveIdentify!: (value: unknown) => void;
			let resolveGenerate!: (value: unknown) => void;
			identifyDishMock.mockReturnValueOnce(
				new Promise((r) => {
					resolveIdentify = r;
				}),
			);
			generateRecipeMock.mockReturnValueOnce(
				new Promise((r) => {
					resolveGenerate = r;
				}),
			);
			await renderApp("/recipes");
			const file = new File(["data"], "dish.jpg", { type: "image/jpeg" });

			await selectPhoto(file);

			expect(screen.getByText(/identifying your photo/i)).toBeInTheDocument();

			await act(async () => {
				resolveIdentify({
					type: "success",
					description: "creamy garlic butter shrimp pasta",
				});
				await Promise.resolve();
			});

			expect(screen.getByText(/simmering your/i)).toHaveTextContent(
				"creamy garlic butter shrimp pasta",
			);
			expect(generateRecipeMock).toHaveBeenCalledWith({
				data: expect.objectContaining({
					prompt: "creamy garlic butter shrimp pasta",
				}),
			});

			resolveGenerate({ type: "success", recipe: validRecipe });

			expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
		});

		it("shows a photo-specific rejection when the photo isn't food, without calling generateRecipe", async () => {
			identifyDishMock.mockResolvedValueOnce({ type: "not_food" });
			await renderApp("/recipes");

			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));

			expect(
				await screen.findByText(/doesn't look like a dish/i),
			).toBeInTheDocument();
			expect(generateRecipeMock).not.toHaveBeenCalled();
		});

		it("retrying an identification error re-runs identification with the same photo", async () => {
			identifyDishMock.mockResolvedValueOnce({
				type: "error",
				message: "Malformed dish identification response from Groq",
			});
			await renderApp("/recipes");
			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));
			const retryButton = await screen.findByRole("button", { name: "Retry" });

			identifyDishMock.mockResolvedValueOnce({
				type: "success",
				description: "pancakes with syrup",
			});
			generateRecipeMock.mockResolvedValueOnce({
				type: "success",
				recipe: { ...validRecipe, title: "Pancakes" },
			});
			const user = userEvent.setup();
			await user.click(retryButton);

			expect(await screen.findByText("Pancakes")).toBeInTheDocument();
			expect(identifyDishMock).toHaveBeenCalledTimes(2);
		});
	});
});
