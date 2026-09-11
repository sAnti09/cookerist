import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { GroceryList } from "#/lib/grocery-list";
import {
	loadGroceryLists,
	saveGroceryList,
	setExpandedGroceryList,
} from "#/lib/grocery-storage";
import {
	loadRecipes,
	saveRecipe,
	setExpandedRecipe,
	toStoredRecipe,
} from "#/lib/recipes-storage";
import { Home } from "./index";

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
const modifyRecipeMock = vi.fn();
const identifyDishMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: (...args: unknown[]) => generateRecipeMock(...args),
	continueRecipe: vi.fn(),
	modifyRecipe: (...args: unknown[]) => modifyRecipeMock(...args),
}));

vi.mock("#/server/identify-dish", () => ({
	identifyDish: (...args: unknown[]) => identifyDishMock(...args),
}));

// The real compressor uses createImageBitmap/canvas, neither meaningfully
// available in jsdom — these tests care about the routing/state logic around
// a selected photo, not image processing, so it's replaced with an instant
// stand-in.
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
		{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
	],
	steps: [{ section: null, text: "Cook the pasta." }],
};

function renderHome() {
	const queryClient = new QueryClient();
	return render(
		<QueryClientProvider client={queryClient}>
			<Home />
		</QueryClientProvider>,
	);
}

async function submitPrompt(prompt: string) {
	const user = userEvent.setup();
	await user.type(screen.getByLabelText("Describe a dish"), prompt);
	await user.click(screen.getByRole("button", { name: "Get recipe" }));
}

// Goes straight to the (hidden) gallery file input rather than through the
// camera/gallery menu — the menu's own wiring is covered by
// photo-picker-button.test.tsx; these tests care about what happens once a
// photo has been picked, regardless of which entry point produced it.
async function selectPhoto(file: File) {
	const input = document.querySelector<HTMLInputElement>('input[type="file"]');
	if (!input) throw new Error("photo input not found");
	await userEvent.upload(input, file);
}

beforeEach(() => {
	generateRecipeMock.mockReset();
	modifyRecipeMock.mockReset();
	identifyDishMock.mockReset();
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

function makeGroceryList(overrides: Partial<GroceryList> = {}): GroceryList {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		name: "Shrimp Pasta",
		recipeIds: [],
		items: [
			{
				id: crypto.randomUUID(),
				text: "shrimp",
				quantity: 1,
				unit: "lb",
				checked: false,
				source: "custom",
			},
		],
		expanded: false,
		...overrides,
	};
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

describe("Home", () => {
	it("renders the Cookerist heading", () => {
		renderHome();

		expect(
			screen.getByRole("heading", { name: "Cookerist" }),
		).toBeInTheDocument();
	});

	it("disables the prompt form and shows a notice while offline", async () => {
		vi.stubGlobal("navigator", { ...window.navigator, onLine: false });
		renderHome();

		expect(screen.getByText(/you're offline/i)).toBeInTheDocument();
		expect(screen.getByLabelText("Describe a dish")).toBeDisabled();
		expect(screen.getByRole("button", { name: "Get recipe" })).toBeDisabled();
	});

	it("re-enables the prompt form once back online", async () => {
		vi.stubGlobal("navigator", { ...window.navigator, onLine: false });
		renderHome();
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
		renderHome();

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
		renderHome();

		await submitPrompt("what's the capital of France?");

		expect(
			await screen.findByText(/doesn't look like a cooking request/i),
		).toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).toBeNull();
	});

	it("retrying an off-topic rejection clears the notice and refills the prompt field instead of resubmitting", async () => {
		generateRecipeMock.mockResolvedValueOnce({ type: "off_topic" });
		renderHome();

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
		// Only the original submission called Groq — retry did not re-call it.
		expect(generateRecipeMock).toHaveBeenCalledTimes(1);
	});

	it("shows a retry action on failure, and retry re-triggers generation", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
		renderHome();

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
		renderHome();

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
		renderHome();

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

	it("clears an unrelated leftover error notification once a new submission starts simmering", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed recipe response from Groq",
		});
		renderHome();
		await submitPrompt("first dish");
		expect(
			await screen.findByText("Malformed recipe response from Groq"),
		).toBeInTheDocument();

		let resolveSecond!: (value: unknown) => void;
		generateRecipeMock.mockReturnValueOnce(
			new Promise((r) => {
				resolveSecond = r;
			}),
		);
		await submitPrompt("second dish");

		expect(
			screen.queryByText("Malformed recipe response from Groq"),
		).not.toBeInTheDocument();
		expect(screen.getByRole("status")).toHaveTextContent(/second dish/i);

		resolveSecond({ type: "success", recipe: validRecipe });
		expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
	});

	it("shows an empty-state placeholder when there are no results", () => {
		renderHome();

		expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
	});

	describe("Why Cookerist", () => {
		it("shows the feature showcase with a privacy tile and an install button", () => {
			renderHome();

			expect(
				screen.getByRole("heading", { name: "Why Cookerist" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Private by design" }),
			).toBeInTheDocument();
			expect(screen.getByText(/nothing sent to a server/i)).toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Install on any phone" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Install app" }),
			).toBeInTheDocument();
		});

		it("keeps the feature showcase (and its reset action) reachable once recipes exist", () => {
			seedRecipes(1);
			renderHome();

			expect(
				screen.getByRole("heading", { name: "Why Cookerist" }),
			).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "reset all data" }),
			).toBeInTheDocument();
		});

		it("credits the app's creator at the bottom of the page", () => {
			renderHome();

			// Find the container by matching part of the text
			const creditElement = screen.getByText(/cooked up with love by/i);

			// Assert the full normalized textContent of that container
			expect(creditElement).toHaveTextContent(
				/cooked up with love by james limpiado/i,
			);
		});

		it("does nothing until the reset is confirmed", async () => {
			seedRecipes(1);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "reset all data" }));
			expect(
				screen.getByRole("heading", { name: "Reset all data?" }),
			).toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Cancel" }));

			expect(
				screen.queryByRole("heading", { name: "Reset all data?" }),
			).not.toBeInTheDocument();
			expect(screen.getByText("Recipe 0")).toBeInTheDocument();
			expect(window.localStorage.getItem("cookerist:recipes")).not.toBeNull();
		});

		it("clears every localStorage key and reloads once the reset is confirmed", async () => {
			seedRecipes(1);
			saveGroceryList(loadGroceryLists(), makeGroceryList());
			window.localStorage.setItem("cookerist:theme", "dark");
			const reload = vi.fn();
			Object.defineProperty(window, "location", {
				configurable: true,
				value: { ...window.location, reload },
			});
			renderHome();
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
		renderHome();

		expect(screen.getAllByText(/^Recipe \d+$/)).toHaveLength(10);
		expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();

		MockIntersectionObserver.instances[0]?.intersect();

		await waitFor(() =>
			expect(screen.getAllByText(/^Recipe \d+$/)).toHaveLength(12),
		);
	});

	it("loads and scrolls to a recipe left expanded from a previous session, even past the first page", async () => {
		const scrollIntoViewMock = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoViewMock;

		seedRecipes(15);
		const target = loadRecipes()[12];
		setExpandedRecipe(loadRecipes(), target.id);

		renderHome();

		await waitFor(() => {
			expect(screen.getByText(target.title)).toBeInTheDocument();
		});
		// All 13 recipes up to and including the target must render — not just
		// the default first page of 10 — for it to be scrollable into view.
		expect(screen.getAllByText(/^Recipe \d+$/)).toHaveLength(13);
		expect(scrollIntoViewMock).toHaveBeenCalled();
	});

	it("scrolls to and focuses a recipe when it's expanded by clicking it — not just on load", async () => {
		const scrollIntoViewMock = vi.fn();
		Element.prototype.scrollIntoView = scrollIntoViewMock;
		seedRecipes(2);
		renderHome();
		const user = userEvent.setup();

		const header = screen.getByRole("button", { name: /^Recipe 0/ });
		await user.click(header);

		expect(scrollIntoViewMock).toHaveBeenCalled();
		expect(header).toHaveFocus();
	});

	it("deletes a recipe from the list and localStorage after confirming", async () => {
		seedRecipes(1);
		renderHome();
		const user = userEvent.setup();

		expect(screen.getByText("Recipe 0")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Delete Recipe 0" }));
		await user.click(screen.getByRole("button", { name: "Delete" }));

		expect(screen.queryByText("Recipe 0")).not.toBeInTheDocument();
		expect(window.localStorage.getItem("cookerist:recipes")).not.toContain(
			"Recipe 0",
		);
		expect(await screen.findByText(/no recipes yet/i)).toBeInTheDocument();
	});

	it("expands a row in place and collapses it again on second click", async () => {
		seedRecipes(1);
		renderHome();
		const user = userEvent.setup();

		expect(
			screen.queryByText("A quick, creamy shrimp pasta."),
		).not.toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /^Recipe 0/ }));
		expect(
			screen.getByText("A quick, creamy shrimp pasta."),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: /^Recipe 0/ }));
		expect(
			screen.queryByText("A quick, creamy shrimp pasta."),
		).not.toBeInTheDocument();
	});

	it("only keeps one row expanded at a time (accordion)", async () => {
		seedRecipes(2);
		renderHome();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /^Recipe 0/ }));
		await user.click(screen.getByRole("button", { name: /^Recipe 1/ }));

		const detailViews = screen.getAllByText("A quick, creamy shrimp pasta.");
		expect(detailViews).toHaveLength(1);
		expect(
			JSON.parse(window.localStorage.getItem("cookerist:recipes") ?? "[]"),
		).toEqual(
			expect.arrayContaining([
				expect.objectContaining({ title: "Recipe 1", expanded: true }),
				expect.objectContaining({ title: "Recipe 0", expanded: false }),
			]),
		);
	});

	it("expands a recipe forked via 'Create as new recipe', collapsing whichever was open before", async () => {
		seedRecipe({ title: "Original Recipe" });
		modifyRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: { ...validRecipe, title: "Forked Recipe" },
			truncated: false,
		});
		const user = userEvent.setup();
		renderHome();

		// Expand the original first, so there's something for the accordion to
		// collapse once the fork takes over as the sole expanded recipe.
		await user.click(screen.getByRole("button", { name: /^Original Recipe/ }));

		await user.click(
			screen.getByRole("button", { name: "Modify Original Recipe" }),
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

		await waitFor(() =>
			expect(screen.queryByRole("dialog")).not.toBeInTheDocument(),
		);

		const stored = loadRecipes();
		const forked = stored.find((r) => r.title === "Forked Recipe");
		const original = stored.find((r) => r.title === "Original Recipe");
		expect(forked?.expanded).toBe(true);
		expect(original?.expanded).toBe(false);
		expect(
			screen.getByRole("button", { name: "Collapse Forked Recipe" }),
		).toBeInTheDocument();
	});

	it("persists checkbox and servings changes to localStorage immediately", async () => {
		seedRecipes(1);
		renderHome();
		const user = userEvent.setup();

		await user.click(screen.getByRole("button", { name: /^Recipe 0/ }));
		await user.click(screen.getByText("shrimp"));
		await user.click(screen.getByRole("button", { name: "Increase servings" }));

		const [stored] = JSON.parse(
			window.localStorage.getItem("cookerist:recipes") ?? "[]",
		);
		expect(stored.ingredients[0].checked).toBe(true);
		expect(stored.currentServings).toBe(3);
		expect(screen.getByText("450 g")).toBeInTheDocument();
	});

	describe("search and filters", () => {
		it("filters the list by title or prompt, case-insensitively", async () => {
			seedRecipe({ title: "Garlic Butter Shrimp Pasta" });
			seedRecipe({ title: "Beef Tacos", prompt: "something for date night" });
			renderHome();
			const user = userEvent.setup();

			await user.type(screen.getByLabelText("Search recipes"), "SHRIMP");

			expect(
				screen.getByText("Garlic Butter Shrimp Pasta"),
			).toBeInTheDocument();
			expect(screen.queryByText("Beef Tacos")).not.toBeInTheDocument();

			await user.clear(screen.getByLabelText("Search recipes"));
			await user.type(screen.getByLabelText("Search recipes"), "date night");

			expect(screen.getByText("Beef Tacos")).toBeInTheDocument();
			expect(
				screen.queryByText("Garlic Butter Shrimp Pasta"),
			).not.toBeInTheDocument();
		});

		it("filters by difficulty, and 'All difficulties' clears it", async () => {
			seedRecipe({ title: "Easy Dish", difficulty: "quick_and_easy" });
			seedRecipe({ title: "Hard Dish", difficulty: "hard" });
			renderHome();
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
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Favorites" }));

			expect(screen.getByText("Favorited Dish")).toBeInTheDocument();
			expect(screen.queryByText("Regular Dish")).not.toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Favorites" }));

			expect(screen.getByText("Regular Dish")).toBeInTheDocument();
		});

		it("combines filters with AND logic", async () => {
			seedRecipe({
				title: "Garlic Shrimp Pasta",
				difficulty: "quick_and_easy",
				favorite: true,
			});
			seedRecipe({
				title: "Garlic Shrimp Skillet",
				difficulty: "hard",
				favorite: true,
			});
			seedRecipe({
				title: "Garlic Shrimp Bowl",
				difficulty: "quick_and_easy",
				favorite: false,
			});
			renderHome();
			const user = userEvent.setup();

			await user.type(screen.getByLabelText("Search recipes"), "shrimp");
			await user.selectOptions(
				screen.getByLabelText("Filter by difficulty"),
				"quick_and_easy",
			);
			await user.click(screen.getByRole("button", { name: "Favorites" }));

			expect(screen.getByText("Garlic Shrimp Pasta")).toBeInTheDocument();
			expect(
				screen.queryByText("Garlic Shrimp Skillet"),
			).not.toBeInTheDocument();
			expect(screen.queryByText("Garlic Shrimp Bowl")).not.toBeInTheDocument();
		});

		it("shows a distinct empty state for no matches vs. no recipes at all", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			renderHome();
			const user = userEvent.setup();

			expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();

			await user.type(screen.getByLabelText("Search recipes"), "tacos");

			expect(
				screen.getByText(/no recipes match your filters/i),
			).toBeInTheDocument();
			expect(screen.queryByText(/no recipes yet/i)).not.toBeInTheDocument();
		});

		it("clears all filters via the Clear filters control", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			renderHome();
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

		it("re-paginates from the filtered set rather than the full list", async () => {
			seedRecipe({ title: "Beef Tacos" });
			for (let i = 0; i < 12; i++) {
				seedRecipe({ title: `Shrimp Dish ${i}` });
			}
			renderHome();
			const user = userEvent.setup();

			expect(screen.getAllByText(/^Shrimp Dish \d+$/)).toHaveLength(10);

			await user.type(screen.getByLabelText("Search recipes"), "tacos");

			expect(screen.getByText("Beef Tacos")).toBeInTheDocument();
			expect(screen.queryByText(/^Shrimp Dish \d+$/)).not.toBeInTheDocument();
		});
	});

	describe("grocery lists view", () => {
		it("stays on the Recipes view by default", () => {
			renderHome();

			expect(screen.getByRole("button", { name: "Recipes" })).toHaveAttribute(
				"aria-pressed",
				"true",
			);
			expect(
				screen.getByRole("heading", { name: "Recipes" }),
			).toBeInTheDocument();
		});

		it("switches to the Grocery Lists view and back via the icon toggle", async () => {
			seedRecipes(1);
			saveGroceryList(
				loadGroceryLists(),
				makeGroceryList({ name: "Weeknight Groceries" }),
			);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));

			expect(screen.getByText("Weeknight Groceries")).toBeInTheDocument();
			expect(screen.queryByText("Recipe 0")).not.toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Grocery Lists" }),
			).toBeInTheDocument();
			expect(
				screen.queryByRole("heading", { name: "Recipes" }),
			).not.toBeInTheDocument();

			await user.click(screen.getByRole("button", { name: "Recipes" }));

			expect(screen.getByText("Recipe 0")).toBeInTheDocument();
			expect(screen.queryByText("Weeknight Groceries")).not.toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Recipes" }),
			).toBeInTheDocument();
		});

		it("switches back to the Recipes view when a search is submitted while viewing grocery lists", async () => {
			generateRecipeMock.mockResolvedValueOnce({
				type: "success",
				recipe: validRecipe,
			});
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			expect(
				screen.getByRole("heading", { name: "Grocery Lists" }),
			).toBeInTheDocument();

			await submitPrompt("shrimp pasta for 2");

			expect(
				screen.getByRole("heading", { name: "Recipes" }),
			).toBeInTheDocument();
			expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
		});

		it("scrolls to and focuses a grocery list when it's expanded by clicking it", async () => {
			const scrollIntoViewMock = vi.fn();
			Element.prototype.scrollIntoView = scrollIntoViewMock;
			saveGroceryList(
				loadGroceryLists(),
				makeGroceryList({ name: "Weeknight Groceries" }),
			);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			const header = screen.getByRole("button", {
				name: "Weeknight Groceries",
			});
			await user.click(header);

			expect(scrollIntoViewMock).toHaveBeenCalled();
			expect(header).toHaveFocus();
		});

		it("loads and scrolls to a grocery list left expanded from a previous session, switching to the Grocery Lists view", async () => {
			const scrollIntoViewMock = vi.fn();
			Element.prototype.scrollIntoView = scrollIntoViewMock;
			const list = makeGroceryList({ name: "Weeknight Groceries" });
			const lists = saveGroceryList(loadGroceryLists(), list);
			setExpandedGroceryList(lists, list.id);

			renderHome();

			await waitFor(() => {
				expect(
					screen.getByRole("heading", { name: "Grocery Lists" }),
				).toBeInTheDocument();
			});
			expect(screen.getByText("Weeknight Groceries")).toBeInTheDocument();
			expect(scrollIntoViewMock).toHaveBeenCalled();
		});

		it("shows a distinct empty state with a create entry point when no lists exist", async () => {
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));

			expect(screen.getByText(/no grocery lists yet/i)).toBeInTheDocument();
			expect(
				screen.getByRole("button", { name: "Create grocery list" }),
			).toBeInTheDocument();
		});

		it("keeps the create entry point available once lists already exist", async () => {
			saveGroceryList(loadGroceryLists(), makeGroceryList());
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));

			expect(
				screen.getByRole("button", { name: "Create grocery list" }),
			).toBeInTheDocument();
			expect(
				screen.queryByText(/no grocery lists yet/i),
			).not.toBeInTheDocument();
		});

		it("creates a grocery list from the create form and persists it", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			await user.click(
				screen.getByRole("button", { name: "Create grocery list" }),
			);

			const dialog = screen.getByRole("dialog");
			await user.type(
				within(dialog).getByLabelText("Search recipes to add"),
				"Garlic Shrimp Pasta",
			);
			await user.click(
				within(dialog).getByRole("button", { name: "Garlic Shrimp Pasta" }),
			);
			await user.click(within(dialog).getByRole("button", { name: "Save" }));
			await user.click(
				within(screen.getByRole("alertdialog")).getByRole("button", {
					name: "Save",
				}),
			);

			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(
				screen.getByRole("heading", { name: "Garlic Shrimp Pasta" }),
			).toBeInTheDocument();
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
			);
			expect(stored).toHaveLength(1);
			expect(stored[0].name).toBe("Garlic Shrimp Pasta");
			expect(stored[0].items).toHaveLength(1);
		});

		it("closes the create form without saving when cancelled", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			await user.click(
				screen.getByRole("button", { name: "Create grocery list" }),
			);
			await user.click(
				within(screen.getByRole("dialog")).getByRole("button", {
					name: "Cancel",
				}),
			);

			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(window.localStorage.getItem("cookerist:grocery-lists")).toBeNull();
		});

		it("hides the recipe search/filter toolbar while viewing grocery lists", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));

			expect(screen.queryByLabelText("Search recipes")).not.toBeInTheDocument();
		});

		it("deletes a grocery list from the list and localStorage after confirming", async () => {
			saveGroceryList(
				loadGroceryLists(),
				makeGroceryList({ name: "Weeknight Groceries" }),
			);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			expect(screen.getByText("Weeknight Groceries")).toBeInTheDocument();

			await user.click(
				screen.getByRole("button", { name: "Delete Weeknight Groceries" }),
			);
			await user.click(screen.getByRole("button", { name: "Delete" }));

			expect(screen.queryByText("Weeknight Groceries")).not.toBeInTheDocument();
			expect(
				window.localStorage.getItem("cookerist:grocery-lists"),
			).not.toContain("Weeknight Groceries");
			expect(
				await screen.findByText(/no grocery lists yet/i),
			).toBeInTheDocument();
		});

		it("expands a grocery list row in place and collapses it again on second click", async () => {
			saveGroceryList(
				loadGroceryLists(),
				makeGroceryList({ name: "Weeknight Groceries" }),
			);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			expect(screen.queryByText("Items")).not.toBeInTheDocument();

			await user.click(
				screen.getByRole("button", { name: /^Weeknight Groceries/ }),
			);
			expect(screen.getByText("Items")).toBeInTheDocument();

			await user.click(
				screen.getByRole("button", { name: /^Weeknight Groceries/ }),
			);
			expect(screen.queryByText("Items")).not.toBeInTheDocument();
		});

		it("only keeps one grocery list row expanded at a time and persists it", async () => {
			const first = makeGroceryList({ name: "First List" });
			const second = makeGroceryList({ name: "Second List" });
			saveGroceryList(saveGroceryList(loadGroceryLists(), first), second);
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			await user.click(screen.getByRole("button", { name: /^First List/ }));
			await user.click(screen.getByRole("button", { name: /^Second List/ }));

			expect(screen.getAllByText("Items")).toHaveLength(1);
			expect(
				JSON.parse(
					window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
				),
			).toEqual(
				expect.arrayContaining([
					expect.objectContaining({ name: "First List", expanded: false }),
					expect.objectContaining({ name: "Second List", expanded: true }),
				]),
			);
		});

		it("opens the edit form pre-populated and saves changes over the existing list", async () => {
			seedRecipe({ title: "Garlic Shrimp Pasta" });
			const recipe = loadRecipes()[0];
			saveGroceryList(loadGroceryLists(), {
				id: "list-1",
				createdAt: "2026-01-01T00:00:00.000Z",
				name: "Weeknight Groceries",
				recipeIds: [recipe.id],
				items: [
					{
						id: "item-shrimp",
						text: "shrimp",
						quantity: 300,
						unit: "g",
						checked: true,
						source: "recipe",
						origins: [
							{ recipeId: recipe.id, ingredientId: recipe.ingredients[0].id },
						],
					},
				],
				expanded: false,
			});
			renderHome();
			const user = userEvent.setup();

			await user.click(screen.getByRole("button", { name: "Grocery lists" }));
			await user.click(
				screen.getByRole("button", { name: "Edit Weeknight Groceries" }),
			);

			const dialog = screen.getByRole("dialog");
			expect(
				within(dialog).getByRole("heading", { name: "Edit grocery list" }),
			).toBeInTheDocument();
			expect(
				within(dialog).getByText("Garlic Shrimp Pasta"),
			).toBeInTheDocument();

			const nameInput = within(dialog).getByLabelText("List name");
			await user.clear(nameInput);
			await user.type(nameInput, "Updated Groceries");
			await user.click(within(dialog).getByRole("button", { name: "Save" }));
			await user.click(
				within(screen.getByRole("alertdialog")).getByRole("button", {
					name: "Save",
				}),
			);

			expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
			expect(screen.getByText("Updated Groceries")).toBeInTheDocument();
			const stored = JSON.parse(
				window.localStorage.getItem("cookerist:grocery-lists") ?? "[]",
			);
			expect(stored).toHaveLength(1);
			expect(stored[0].id).toBe("list-1");
			expect(stored[0].name).toBe("Updated Groceries");
			// Same recipe/ingredient selection re-aggregates to the same
			// text+unit, so the previously checked item stays checked.
			expect(stored[0].items[0]).toMatchObject({
				text: "shrimp",
				checked: true,
			});
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
			// Held open (rather than resolved immediately) so the intermediate
			// "generating" state — description known, still no recipe yet — is
			// actually observable instead of being batched straight through to
			// the final result.
			generateRecipeMock.mockReturnValueOnce(
				new Promise((r) => {
					resolveGenerate = r;
				}),
			);
			renderHome();
			const file = new File(["data"], "dish.jpg", { type: "image/jpeg" });

			await selectPhoto(file);

			expect(screen.getByText(/identifying your photo/i)).toBeInTheDocument();
			expect(document.querySelector("img")).toHaveAttribute("src");

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
			// The thumbnail carries through into the generation stage instead of
			// flashing back to the plain flame icon.
			expect(document.querySelector("img")).toHaveAttribute("src");
			expect(generateRecipeMock).toHaveBeenCalledWith({
				data: expect.objectContaining({
					prompt: "creamy garlic butter shrimp pasta",
				}),
			});

			resolveGenerate({ type: "success", recipe: validRecipe });

			expect(await screen.findByText(validRecipe.title)).toBeInTheDocument();
			expect(screen.queryByRole("status")).not.toBeInTheDocument();
		});

		it("shows a photo-specific rejection when the photo isn't food, without calling generateRecipe", async () => {
			identifyDishMock.mockResolvedValueOnce({ type: "not_food" });
			renderHome();

			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));

			expect(
				await screen.findByText(/doesn't look like a dish/i),
			).toBeInTheDocument();
			expect(generateRecipeMock).not.toHaveBeenCalled();
		});

		it("offers 'Choose another photo' instead of Retry for a not-a-dish rejection, and picking one starts a fresh identification", async () => {
			identifyDishMock.mockResolvedValueOnce({ type: "not_food" });
			renderHome();
			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));
			await screen.findByText(/doesn't look like a dish/i);
			expect(
				screen.queryByRole("button", { name: "Retry" }),
			).not.toBeInTheDocument();

			identifyDishMock.mockResolvedValueOnce({
				type: "success",
				description: "pancakes with syrup",
			});
			generateRecipeMock.mockResolvedValueOnce({
				type: "success",
				recipe: { ...validRecipe, title: "Pancakes" },
			});
			const chooseControl = screen.getByText("Choose another photo");
			const input = chooseControl
				.closest("label")
				?.querySelector<HTMLInputElement>('input[type="file"]');
			if (!input) throw new Error("choose-another-photo input not found");
			await userEvent.upload(
				input,
				new File(["data"], "pancakes.jpg", { type: "image/jpeg" }),
			);

			expect(
				screen.queryByText(/doesn't look like a dish/i),
			).not.toBeInTheDocument();
			expect(await screen.findByText("Pancakes")).toBeInTheDocument();
			expect(identifyDishMock).toHaveBeenCalledTimes(2);
		});

		it("retrying an identification error re-runs identification with the same photo", async () => {
			identifyDishMock.mockResolvedValueOnce({
				type: "error",
				message: "Malformed dish identification response from Groq",
			});
			renderHome();
			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));
			const retryButton = await screen.findByRole("button", { name: "Retry" });
			expect(
				screen.getByText("Malformed dish identification response from Groq"),
			).toBeInTheDocument();

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

		it("shows a generic error and retry when the identify call throws", async () => {
			identifyDishMock.mockRejectedValueOnce(new Error("network down"));
			renderHome();

			await selectPhoto(new File(["data"], "dish.jpg", { type: "image/jpeg" }));

			expect(
				await screen.findByText(/something went wrong identifying/i),
			).toBeInTheDocument();
			expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
		});
	});
});
