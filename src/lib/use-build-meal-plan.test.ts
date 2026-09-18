import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { MealPlan, MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { generateRecipe } from "#/server/generate-recipe";
import {
	computeBuildWorkerProviders,
	useBuildMealPlan,
} from "./use-build-meal-plan";

vi.mock("#/server/generate-recipe", () => ({
	generateRecipe: vi.fn(),
	continueRecipe: vi.fn(),
	modifyRecipe: vi.fn(),
}));

const generateRecipeMock = vi.mocked(generateRecipe);

function makeEntry(overrides: Partial<MealPlanEntry> = {}): MealPlanEntry {
	return {
		id: crypto.randomUUID(),
		day: "2026-09-15",
		mealType: "dinner",
		slotIndex: 0,
		status: "suggested",
		suggestedTitle: "Veggie Stir-Fry",
		suggestedOverview: "Crisp vegetables in a garlic-ginger sauce.",
		...overrides,
	};
}

function makePlan(overrides: Partial<MealPlan> = {}): MealPlan {
	return {
		// Unique per call (not a fixed literal) — activeBuildLoops in
		// use-build-meal-plan.ts is module-level, shared across every test in
		// this file, so two tests reusing the same plan id could see each
		// other's loop-tracking state.
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		startDate: "2026-09-15",
		endDate: "2026-09-15",
		description: "",
		defaultServings: 4,
		status: "building",
		entries: [makeEntry()],
		refineInstructions: [],
		...overrides,
	};
}

function makeRecipe(overrides: Partial<Recipe> = {}): Recipe {
	return {
		id: crypto.randomUUID(),
		createdAt: new Date().toISOString(),
		updatedAt: new Date().toISOString(),
		sharedAt: null,
		ownerId: null,
		prompt: "a dish",
		title: "Veggie Stir-Fry",
		overview: "overview",
		baseServings: 4,
		currentServings: 4,
		ingredients: [],
		steps: [],
		expanded: false,
		favorite: false,
		...overrides,
	};
}

function successResult(title: string) {
	return {
		type: "success" as const,
		truncated: false,
		recipe: {
			title,
			overview: "A generated dish.",
			baseServings: 4,
			difficulty: "quick_and_easy" as const,
			estimatedMinutes: 20,
			caloriesPerServing: 400,
			ingredients: [
				{
					baseName: "onion",
					description: "",
					quantity: 1,
					unit: "",
					category: "Produce" as const,
					approxGramsPerUnit: null,
				},
			],
			steps: [{ section: null, text: "Cook it.", estimatedMinutes: null }],
		},
	};
}

beforeEach(() => {
	generateRecipeMock.mockReset();
});

describe("computeBuildWorkerProviders", () => {
	it("spins up only the sole groq worker, no idle openrouter worker, for a single dish", () => {
		expect(computeBuildWorkerProviders(1)).toEqual(["groq"]);
	});

	it("still returns just the groq worker for 0 pending, so a stuck plan can self-heal", () => {
		expect(computeBuildWorkerProviders(0)).toEqual(["groq"]);
	});

	it.each([
		[2, 2],
		[3, 2],
		[4, 2],
		[5, 3],
		[6, 3],
		[7, 4],
		[8, 4],
		[9, 5],
		[10, 5],
	])("returns %i total workers (1 groq + scaling openrouter) for %i pending dishes", (pendingCount, expectedTotal) => {
		const providers = computeBuildWorkerProviders(pendingCount);
		expect(providers).toHaveLength(expectedTotal);
		expect(providers.filter((p) => p === "groq")).toEqual(["groq"]);
	});

	it("never scales groq past one worker, capping openrouter instead, for a very large plan", () => {
		const providers = computeBuildWorkerProviders(30);
		expect(providers.filter((p) => p === "groq")).toHaveLength(1);
		expect(providers.filter((p) => p === "openrouter")).toHaveLength(5);
		expect(providers).toHaveLength(6);
	});
});

describe("useBuildMealPlan", () => {
	it("reuses an existing recipe by title match without calling generateRecipe", async () => {
		const existing = makeRecipe({ id: "existing-recipe", currentServings: 4 });
		const plan = makePlan();
		const onUpdatePlan = vi.fn();
		const onCreateRecipe = vi.fn();
		const onUpdateRecipe = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [existing],
				onUpdatePlan,
				onCreateRecipe,
				onUpdateRecipe,
			}),
		);

		await waitFor(() => expect(onUpdatePlan).toHaveBeenCalled());

		expect(generateRecipeMock).not.toHaveBeenCalled();
		expect(onCreateRecipe).not.toHaveBeenCalled();
		expect(onUpdateRecipe).not.toHaveBeenCalled(); // servings already match the default
		const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
		expect(finalPlan.status).toBe("ready");
		expect(finalPlan.entries[0]).toMatchObject({
			status: "ready",
			recipeId: "existing-recipe",
			reused: true,
		});
	});

	it("rescales a reused recipe's servings to the plan default", async () => {
		const existing = makeRecipe({ id: "existing-recipe", currentServings: 2 });
		const plan = makePlan({ defaultServings: 6 });
		const onUpdatePlan = vi.fn();
		const onUpdateRecipe = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [existing],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe,
			}),
		);

		await waitFor(() => expect(onUpdatePlan).toHaveBeenCalled());

		expect(onUpdateRecipe).toHaveBeenCalledWith({
			...existing,
			currentServings: 6,
		});
	});

	it("generates a new recipe when no existing recipe matches", async () => {
		generateRecipeMock.mockResolvedValueOnce(successResult("Veggie Stir-Fry"));
		const plan = makePlan();
		const onUpdatePlan = vi.fn();
		const onCreateRecipe = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe,
				onUpdateRecipe: vi.fn(),
			}),
		);

		await waitFor(() => expect(onCreateRecipe).toHaveBeenCalled());

		const created = onCreateRecipe.mock.calls[0][0] as Recipe;
		expect(created.title).toBe("Veggie Stir-Fry");
		expect(created.currentServings).toBe(plan.defaultServings);

		await waitFor(() => {
			const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
			expect(finalPlan.status).toBe("ready");
			expect(finalPlan.entries[0]).toMatchObject({
				status: "ready",
				recipeId: created.id,
				reused: false,
			});
		});
	});

	it("resolves entries concurrently across the worker pool, not one at a time", async () => {
		const order: string[] = [];
		const releasers: Array<() => void> = [];
		generateRecipeMock.mockImplementation(async ({ data }) => {
			order.push(`start:${data.prompt}`);
			await new Promise<void>((resolve) => releasers.push(resolve));
			order.push(`end:${data.prompt}`);
			return successResult(data.prompt.split(" — ")[0] ?? data.prompt);
		});

		const plan = makePlan({
			entries: [
				makeEntry({ id: "e1", suggestedTitle: "First Dish" }),
				makeEntry({ id: "e2", suggestedTitle: "Second Dish" }),
			],
		});

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan: vi.fn(),
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		// One worker per entry here (2 pending dishes -> 1 groq + 1
		// openrouter) — both should be in-flight together, not started one
		// after another.
		await waitFor(() => expect(generateRecipeMock).toHaveBeenCalledTimes(2));
		expect(order).toEqual([
			"start:First Dish — Crisp vegetables in a garlic-ginger sauce.",
			"start:Second Dish — Crisp vegetables in a garlic-ginger sauce.",
		]);

		for (const release of releasers) release();
		await waitFor(() => expect(order).toHaveLength(4));
	});

	it("sizes the worker pool to 1 groq + 1 openrouter for a typical single day's dishes", async () => {
		const releasers: Array<() => void> = [];
		generateRecipeMock.mockImplementation(async () => {
			await new Promise<void>((resolve) => releasers.push(resolve));
			return successResult("Dish");
		});

		const plan = makePlan({
			entries: [
				makeEntry({ id: "e1", suggestedTitle: "First Dish" }),
				makeEntry({ id: "e2", suggestedTitle: "Second Dish" }),
				makeEntry({ id: "e3", suggestedTitle: "Third Dish" }),
			],
		});

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan: vi.fn(),
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		// 3 pending dishes -> computeBuildWorkerProviders(3) is 1 groq + 1
		// openrouter (2 total) — exactly 2 calls in flight, the third dish
		// waits for a worker to free up rather than getting its own worker.
		await waitFor(() => expect(generateRecipeMock).toHaveBeenCalledTimes(2));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(generateRecipeMock).toHaveBeenCalledTimes(2);
		const providers = generateRecipeMock.mock.calls.map(
			([{ data }]) => data.provider,
		);
		expect(providers).toEqual(["groq", "openrouter"]);

		// Drain everything so no promise is left dangling past the test.
		while (releasers.length > 0) {
			const pending = releasers.splice(0, releasers.length);
			for (const release of pending) release();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	});

	it("scales the openrouter worker count for a bigger plan while keeping exactly one groq worker", async () => {
		const releasers: Array<() => void> = [];
		generateRecipeMock.mockImplementation(async () => {
			await new Promise<void>((resolve) => releasers.push(resolve));
			return successResult("Dish");
		});

		const plan = makePlan({
			entries: Array.from({ length: 9 }, (_, i) =>
				makeEntry({ id: `e${i}`, suggestedTitle: `Dish ${i}` }),
			),
		});

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan: vi.fn(),
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		// 9 pending dishes -> computeBuildWorkerProviders(9) is 1 groq + 4
		// openrouter (5 total): exactly that many calls in flight, with the
		// remaining 4 dishes left unclaimed until a worker frees up — never a
		// second groq worker, no matter how big the plan.
		await waitFor(() => expect(generateRecipeMock).toHaveBeenCalledTimes(5));
		await new Promise((resolve) => setTimeout(resolve, 10));
		expect(generateRecipeMock).toHaveBeenCalledTimes(5);
		const providers = generateRecipeMock.mock.calls.map(
			([{ data }]) => data.provider,
		);
		expect(providers.filter((p) => p === "groq")).toHaveLength(1);
		expect(providers.filter((p) => p === "openrouter")).toHaveLength(4);

		while (releasers.length > 0) {
			const pending = releasers.splice(0, releasers.length);
			for (const release of pending) release();
			await new Promise((resolve) => setTimeout(resolve, 0));
		}
	});

	it("marks an entry failed on a Groq error and keeps the plan in building status", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Groq is down",
		});
		const plan = makePlan();
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		await waitFor(() => {
			const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
			expect(finalPlan.entries[0].status).toBe("failed");
		});

		const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
		expect(finalPlan.status).toBe("building");
		expect(finalPlan.entries[0].buildError).toBe("Groq is down");
	});

	it("retryEntry resets a failed entry and reprocesses it to success", async () => {
		generateRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "oops",
		});
		const plan = makePlan();
		const onUpdatePlan = vi.fn();
		const onCreateRecipe = vi.fn();

		const { result } = renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe,
				onUpdateRecipe: vi.fn(),
			}),
		);

		await waitFor(() => {
			const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
			expect(finalPlan.entries[0].status).toBe("failed");
		});

		generateRecipeMock.mockResolvedValueOnce(successResult("Veggie Stir-Fry"));
		result.current.retryEntry(plan.entries[0].id);

		await waitFor(() => expect(onCreateRecipe).toHaveBeenCalled());
		const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
		expect(finalPlan.status).toBe("ready");
		expect(finalPlan.entries[0].status).toBe("ready");
	});

	it("does nothing when the plan isn't in building status", async () => {
		const plan = makePlan({ status: "draft" });
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(generateRecipeMock).not.toHaveBeenCalled();
		expect(onUpdatePlan).not.toHaveBeenCalled();
	});

	it("skips entries that are already ready or failed", async () => {
		const plan = makePlan({
			entries: [
				makeEntry({ id: "ready-one", status: "ready", recipeId: "r1" }),
				makeEntry({ id: "failed-one", status: "failed", buildError: "x" }),
			],
		});
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(generateRecipeMock).not.toHaveBeenCalled();
		expect(onUpdatePlan).not.toHaveBeenCalled();
	});

	it("self-heals a plan stuck at 'building' when every entry is already ready", async () => {
		// Simulates a plan corrupted by some earlier bug (e.g. the double-loop
		// race activeBuildLoops now prevents) — every entry finished, but
		// status never got flipped. Mounting the hook again should repair it
		// rather than silently doing nothing forever.
		const plan = makePlan({
			entries: [
				makeEntry({ id: "e1", status: "ready", recipeId: "r1" }),
				makeEntry({ id: "e2", status: "ready", recipeId: "r2" }),
			],
		});
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		await waitFor(() => expect(onUpdatePlan).toHaveBeenCalled());

		expect(generateRecipeMock).not.toHaveBeenCalled();
		const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
		expect(finalPlan.status).toBe("ready");
		expect(finalPlan.entries).toEqual(plan.entries);
	});

	it("does not reconcile status when a failed entry remains, even with nothing left to resolve", async () => {
		const plan = makePlan({
			entries: [
				makeEntry({ id: "e1", status: "ready", recipeId: "r1" }),
				makeEntry({ id: "e2", status: "failed", buildError: "x" }),
			],
		});
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe: vi.fn(),
				onUpdateRecipe: vi.fn(),
			}),
		);

		await new Promise((resolve) => setTimeout(resolve, 10));

		expect(onUpdatePlan).not.toHaveBeenCalled();
	});

	it("never runs two loops for the same plan, even if the hook mounts twice for it", async () => {
		// Simulates a double-mount (React StrictMode's double-invoke, a
		// hydration-mismatch client re-render, or a fast back/forward
		// navigation) — two independent hook instances for the exact same
		// plan id should still only ever produce one loop's worth of work.
		generateRecipeMock.mockResolvedValueOnce(successResult("Veggie Stir-Fry"));
		const plan = makePlan();
		const onCreateRecipe = vi.fn();
		const onUpdatePlan = vi.fn();

		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe,
				onUpdateRecipe: vi.fn(),
			}),
		);
		renderHook(() =>
			useBuildMealPlan(plan, {
				recipes: [],
				onUpdatePlan,
				onCreateRecipe,
				onUpdateRecipe: vi.fn(),
			}),
		);

		await waitFor(() => expect(onCreateRecipe).toHaveBeenCalled());
		await new Promise((resolve) => setTimeout(resolve, 20));

		expect(generateRecipeMock).toHaveBeenCalledTimes(1);
		expect(onCreateRecipe).toHaveBeenCalledTimes(1);
		const finalPlan = onUpdatePlan.mock.calls.at(-1)?.[0] as MealPlan;
		expect(finalPlan.status).toBe("ready");
	});
});
