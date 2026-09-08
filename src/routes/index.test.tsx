import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { saveRecipe, toStoredRecipe } from "#/lib/recipes-storage";
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

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: (...args: unknown[]) => generateRecipeMock(...args),
}));

const validRecipe = {
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	ingredients: [{ text: "shrimp", quantity: 300, unit: "g" }],
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

beforeEach(() => {
	generateRecipeMock.mockReset();
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
			toStoredRecipe(`prompt ${i}`, { ...validRecipe, title: `Recipe ${i}` }),
		);
	}
}

describe("Home", () => {
	it("renders the Cookerist heading", () => {
		renderHome();

		expect(
			screen.getByRole("heading", { name: "Cookerist" }),
		).toBeInTheDocument();
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

	it("shows an empty-state placeholder when there are no results", () => {
		renderHome();

		expect(screen.getByText(/no recipes yet/i)).toBeInTheDocument();
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
});
