import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Recipe } from "#/lib/recipe";
import { CookMode } from "./cook-mode";

const baseRecipe: Recipe = {
	id: "recipe-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	prompt: "shrimp pasta for 2",
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	currentServings: 2,
	ingredients: [],
	steps: [
		{ id: "step-1", section: "Prep", text: "Chop garlic", checked: false },
		{ id: "step-2", section: "Prep", text: "Peel shrimp", checked: false },
		{ id: "step-3", section: "Cook", text: "Saute garlic", checked: false },
	],
	expanded: true,
	favorite: false,
};

function renderCookMode(
	recipe: Recipe,
	onUpdate: (recipe: Recipe) => void,
	onClose: () => void,
) {
	return render(
		<CookMode recipe={recipe} onUpdate={onUpdate} onClose={onClose} />,
	);
}

afterEach(() => {
	// biome-ignore lint/suspicious/noExplicitAny: cleaning up a test-only navigator patch
	delete (navigator as any).wakeLock;
});

describe("CookMode", () => {
	it("shows no timer for a step without an estimated duration", () => {
		renderCookMode(baseRecipe, vi.fn(), vi.fn());

		expect(
			screen.queryByRole("button", { name: "Start" }),
		).not.toBeInTheDocument();
	});

	it("shows a timer defaulting to the step's estimated duration when one is present", () => {
		const recipeWithTimedStep: Recipe = {
			...baseRecipe,
			steps: [
				{
					id: "step-1",
					section: "Cook",
					text: "Simmer the sauce",
					checked: false,
					estimatedMinutes: 10,
				},
				baseRecipe.steps[1],
			],
		};
		renderCookMode(recipeWithTimedStep, vi.fn(), vi.fn());

		expect(screen.getByText("10:00")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Start" })).toBeInTheDocument();
	});

	it("highlights ingredient mentions within the step text", () => {
		const recipeWithIngredients: Recipe = {
			...baseRecipe,
			ingredients: [
				{
					id: "ing-1",
					text: "garlic",
					baseName: "garlic",
					quantity: 2,
					unit: "cloves",
					checked: false,
				},
			],
		};
		const { container } = renderCookMode(
			recipeWithIngredients,
			vi.fn(),
			vi.fn(),
		);

		// Scoped to the step-text paragraph — the section label above it
		// (e.g. "Prep") also uses text-accent, for an unrelated reason.
		const stepParagraph = container.querySelector("p.leading-snug");
		const highlighted = stepParagraph?.querySelector(".text-accent");
		expect(highlighted?.textContent).toBe("garlic");
	});

	it("does not highlight anything when no ingredient is mentioned in the step", () => {
		const recipeWithIngredients: Recipe = {
			...baseRecipe,
			ingredients: [
				{
					id: "ing-1",
					text: "olive oil",
					baseName: "olive oil",
					quantity: 1,
					unit: "tbsp",
					checked: false,
				},
			],
		};
		const { container } = renderCookMode(
			recipeWithIngredients,
			vi.fn(),
			vi.fn(),
		);

		expect(screen.getByText("Chop garlic")).toBeInTheDocument();
		const stepParagraph = container.querySelector("p.leading-snug");
		expect(stepParagraph?.querySelector(".text-accent")).toBeNull();
	});

	it("opens on the first step, with Back disabled and the section shown", () => {
		renderCookMode(baseRecipe, vi.fn(), vi.fn());

		expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
		expect(screen.getByText("Prep")).toBeInTheDocument();
		expect(screen.getByText("Chop garlic")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Back" })).toBeDisabled();
	});

	it("marks the current step checked and advances on Next", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		renderCookMode(baseRecipe, onUpdate, vi.fn());

		await user.click(screen.getByRole("button", { name: "Next" }));

		expect(onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			steps: [
				{ ...baseRecipe.steps[0], checked: true },
				baseRecipe.steps[1],
				baseRecipe.steps[2],
			],
		});
	});

	it("goes back to the previous step without changing its checked state", async () => {
		const onUpdate = vi.fn();
		const user = userEvent.setup();
		const { rerender } = render(
			<CookMode recipe={baseRecipe} onUpdate={onUpdate} onClose={vi.fn()} />,
		);

		await user.click(screen.getByRole("button", { name: "Next" }));
		const updatedRecipe = onUpdate.mock.calls[0][0] as Recipe;
		rerender(
			<CookMode recipe={updatedRecipe} onUpdate={onUpdate} onClose={vi.fn()} />,
		);
		expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Back" }));

		expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
		expect(onUpdate).toHaveBeenCalledTimes(1);
	});

	it("shows a distinct done state after the last step, with a celebration, and returns to the recipe from it", async () => {
		const onClose = vi.fn();
		const user = userEvent.setup();
		const singleStepRecipe = {
			...baseRecipe,
			steps: [baseRecipe.steps[0]],
		};
		const { container } = renderCookMode(singleStepRecipe, vi.fn(), onClose);

		expect(screen.getByRole("button", { name: "Finish" })).toBeInTheDocument();
		expect(container.querySelectorAll(".confetti-piece")).toHaveLength(0);
		await user.click(screen.getByRole("button", { name: "Finish" }));

		expect(screen.getByText("That's every step")).toBeInTheDocument();
		expect(
			screen.queryByRole("button", { name: "Next" }),
		).not.toBeInTheDocument();
		expect(container.querySelectorAll(".confetti-piece")).toHaveLength(22);

		await user.click(screen.getByRole("button", { name: "Back to recipe" }));
		expect(onClose).toHaveBeenCalledTimes(1);
	});

	it("exits on the close button and on Escape", async () => {
		const onClose = vi.fn();
		const user = userEvent.setup();
		renderCookMode(baseRecipe, vi.fn(), onClose);

		await user.click(screen.getByRole("button", { name: "Exit cook mode" }));
		expect(onClose).toHaveBeenCalledTimes(1);

		await user.keyboard("{Escape}");
		expect(onClose).toHaveBeenCalledTimes(2);
	});

	it("navigates with the ArrowRight and ArrowLeft keys", async () => {
		const user = userEvent.setup();
		renderCookMode(baseRecipe, vi.fn(), vi.fn());

		await user.keyboard("{ArrowRight}");
		expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();

		await user.keyboard("{ArrowLeft}");
		expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
	});

	describe("swipe gestures", () => {
		function swipe(element: Element, fromX: number, toX: number) {
			fireEvent.touchStart(element, {
				touches: [{ clientX: fromX, clientY: 0 }],
			});
			fireEvent.touchEnd(element, {
				changedTouches: [{ clientX: toX, clientY: 0 }],
			});
		}

		it("advances on a leftward swipe and goes back on a rightward swipe", () => {
			renderCookMode(baseRecipe, vi.fn(), vi.fn());
			const panel = screen.getByText("Chop garlic").parentElement as Element;

			swipe(panel, 300, 200);
			expect(screen.getByText("Step 2 of 3")).toBeInTheDocument();

			swipe(panel, 200, 300);
			expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
		});

		it("ignores short or mostly-vertical gestures", () => {
			renderCookMode(baseRecipe, vi.fn(), vi.fn());
			const panel = screen.getByText("Chop garlic").parentElement as Element;

			fireEvent.touchStart(panel, {
				touches: [{ clientX: 300, clientY: 100 }],
			});
			fireEvent.touchEnd(panel, {
				changedTouches: [{ clientX: 290, clientY: 100 }],
			});
			expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();

			fireEvent.touchStart(panel, {
				touches: [{ clientX: 300, clientY: 100 }],
			});
			fireEvent.touchEnd(panel, {
				changedTouches: [{ clientX: 200, clientY: 250 }],
			});
			expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
		});
	});

	describe("wake lock", () => {
		it("requests a screen wake lock on open and releases it on close, when supported", async () => {
			const release = vi.fn().mockResolvedValue(undefined);
			const request = vi.fn().mockResolvedValue({ release });
			Object.defineProperty(navigator, "wakeLock", {
				configurable: true,
				value: { request },
			});

			const { unmount } = renderCookMode(baseRecipe, vi.fn(), vi.fn());
			await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));

			unmount();
			await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
		});

		it("re-acquires the wake lock when the page becomes visible again", async () => {
			const request = vi
				.fn()
				.mockResolvedValue({ release: vi.fn().mockResolvedValue(undefined) });
			Object.defineProperty(navigator, "wakeLock", {
				configurable: true,
				value: { request },
			});

			renderCookMode(baseRecipe, vi.fn(), vi.fn());
			await waitFor(() => expect(request).toHaveBeenCalledTimes(1));

			document.dispatchEvent(new Event("visibilitychange"));

			await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
		});

		it("does nothing when the Wake Lock API isn't supported", () => {
			expect(() => renderCookMode(baseRecipe, vi.fn(), vi.fn())).not.toThrow();
			expect(screen.getByText("Step 1 of 3")).toBeInTheDocument();
		});

		it("releases the lock immediately if it resolves after cook mode has already closed", async () => {
			let resolveRequest!: (sentinel: { release: () => Promise<void> }) => void;
			const release = vi.fn().mockResolvedValue(undefined);
			const request = vi.fn(
				() =>
					new Promise<{ release: () => Promise<void> }>((resolve) => {
						resolveRequest = resolve;
					}),
			);
			Object.defineProperty(navigator, "wakeLock", {
				configurable: true,
				value: { request },
			});

			const { unmount } = renderCookMode(baseRecipe, vi.fn(), vi.fn());
			await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
			unmount();

			resolveRequest({ release });

			await waitFor(() => expect(release).toHaveBeenCalledTimes(1));
		});
	});
});
