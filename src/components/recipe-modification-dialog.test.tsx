import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PendingModification, Recipe } from "#/lib/recipe";
import { RecipeModificationDialog } from "./recipe-modification-dialog";

const modifyRecipeMock = vi.fn();

vi.mock("#/server/generate-recipe", () => ({
	modifyRecipe: (...args: unknown[]) => modifyRecipeMock(...args),
}));

const baseRecipe: Recipe = {
	id: "recipe-1",
	createdAt: "2026-01-15T12:00:00.000Z",
	prompt: "shrimp pasta for 2",
	title: "Garlic Butter Shrimp Pasta",
	overview: "A quick, creamy shrimp pasta.",
	baseServings: 2,
	currentServings: 2,
	ingredients: [
		{ id: "ing-1", text: "shrimp", quantity: 300, unit: "g", checked: false },
		{
			id: "ing-2",
			text: "garlic",
			quantity: 4,
			unit: "cloves",
			checked: false,
		},
	],
	steps: [
		{ id: "step-1", section: "Prep", text: "Chop garlic", checked: false },
	],
	expanded: false,
	favorite: false,
};

const revisedRecipe = {
	title: "Garlic Butter Chicken Pasta",
	overview: "A quick, creamy chicken pasta.",
	baseServings: 2,
	difficulty: "quick_and_easy" as const,
	estimatedMinutes: 25,
	ingredients: [
		{ baseName: "chicken breast", description: "", quantity: 300, unit: "g" },
		{ baseName: "garlic", description: "", quantity: 4, unit: "cloves" },
	],
	steps: [{ section: "Prep", text: "Dice chicken", estimatedMinutes: null }],
};

function pendingModificationFrom(
	instructions: string[],
	draft: Partial<PendingModification["draft"]> = {},
): PendingModification {
	return {
		instructions,
		draft: {
			title: revisedRecipe.title,
			overview: revisedRecipe.overview,
			baseServings: revisedRecipe.baseServings,
			difficulty: revisedRecipe.difficulty,
			estimatedMinutes: revisedRecipe.estimatedMinutes,
			ingredients: [
				{
					id: "draft-ing-1",
					text: "chicken breast",
					baseName: "chicken breast",
					description: "",
					quantity: 300,
					unit: "g",
					checked: false,
				},
			],
			steps: [
				{
					id: "draft-step-1",
					section: null,
					text: "Dice chicken",
					checked: false,
				},
			],
			truncated: false,
			...draft,
		},
	};
}

function renderDialog(recipe: Recipe, overrides: { open?: boolean } = {}) {
	const props = {
		recipe,
		open: true,
		onClose: vi.fn(),
		onUpdate: vi.fn(),
		onCreateRecipe: vi.fn(),
		...overrides,
	};
	const queryClient = new QueryClient();
	return {
		...render(
			<QueryClientProvider client={queryClient}>
				<RecipeModificationDialog {...props} />
			</QueryClientProvider>,
		),
		props,
	};
}

describe("RecipeModificationDialog", () => {
	beforeEach(() => {
		modifyRecipeMock.mockReset();
	});

	it("renders nothing when closed", () => {
		renderDialog(baseRecipe, { open: false });

		expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
	});

	it("shows the instruction form by default when there's no pending draft", () => {
		renderDialog(baseRecipe);

		expect(screen.getByRole("dialog")).toBeInTheDocument();
		expect(
			screen.getByLabelText("Describe how to modify this recipe"),
		).toBeInTheDocument();
	});

	it("shows the full remaining credit count in the title for a fresh recipe", () => {
		renderDialog(baseRecipe);

		expect(
			screen.getByRole("heading", { name: "Modify recipe (2 remaining)" }),
		).toBeInTheDocument();
	});

	it("reflects a partially-used credit count in the title", () => {
		renderDialog({ ...baseRecipe, modificationCount: 1 });

		expect(
			screen.getByRole("heading", { name: "Modify recipe (1 remaining)" }),
		).toBeInTheDocument();
	});

	it("submits the instruction and stores the result as a pending draft", async () => {
		const user = userEvent.setup();
		modifyRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: revisedRecipe,
			truncated: false,
		});
		const { props } = renderDialog(baseRecipe);

		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"swap shrimp for chicken",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));

		await waitFor(() => expect(props.onUpdate).toHaveBeenCalledTimes(1));
		const updated = props.onUpdate.mock.calls[0]?.[0] as Recipe;
		expect(updated.modificationCount).toBe(1);
		expect(updated.pendingModification?.instructions).toEqual([
			"swap shrimp for chicken",
		]);
		expect(updated.pendingModification?.draft.title).toBe(revisedRecipe.title);
		// The original recipe itself stays untouched until approval.
		expect(updated.title).toBe(baseRecipe.title);
		expect(updated.ingredients).toEqual(baseRecipe.ingredients);
		// The dialog stays open, now showing the diff instead of the form.
		expect(props.onClose).not.toHaveBeenCalled();

		const callArgs = modifyRecipeMock.mock.calls[0]?.[0];
		expect(callArgs.data.instruction).toBe("swap shrimp for chicken");
		expect(callArgs.data.current.title).toBe(baseRecipe.title);
		expect(callArgs.data.current.ingredients).toEqual([
			{ baseName: "shrimp", description: "", quantity: 300, unit: "g" },
			{ baseName: "garlic", description: "", quantity: 4, unit: "cloves" },
		]);
	});

	it("shows a used-up message instead of the form once credits are exhausted with no pending draft", () => {
		renderDialog({ ...baseRecipe, modificationCount: 2 });

		expect(
			screen.getByText(
				"You've used all your modifications for this recipe. Search for a new recipe instead, describing the change you want.",
			),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Describe how to modify this recipe"),
		).not.toBeInTheDocument();
		expect(
			screen.getByRole("heading", { name: "Modify recipe (0 remaining)" }),
		).toBeInTheDocument();
	});

	it("treats a recipe saved before modificationCount existed as having full credits", () => {
		const { modificationCount, ...recipeWithoutCount } = baseRecipe;
		renderDialog(recipeWithoutCount as Recipe);

		expect(
			screen.getByRole("heading", { name: "Modify recipe (2 remaining)" }),
		).toBeInTheDocument();
		expect(
			screen.getByLabelText("Describe how to modify this recipe"),
		).toBeInTheDocument();
	});

	it("carries the spent credit forward through approve", async () => {
		const user = userEvent.setup();
		const pendingModification = pendingModificationFrom(["make it spicier"]);
		const { props } = renderDialog({
			...baseRecipe,
			modificationCount: 1,
			pendingModification,
		});

		await user.click(screen.getByRole("button", { name: "Approve" }));

		const updated = props.onUpdate.mock.calls[0]?.[0] as Recipe;
		expect(updated.modificationCount).toBe(1);
	});

	it("carries the spent credit forward through discard (it isn't refunded)", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog({
			...baseRecipe,
			modificationCount: 1,
			pendingModification: pendingModificationFrom(["make it spicier"]),
		});

		await user.click(screen.getByRole("button", { name: "Discard" }));

		const updated = props.onUpdate.mock.calls[0]?.[0] as Recipe;
		expect(updated.modificationCount).toBe(1);
	});

	it("closes without discarding anything when Cancel is clicked before any submission", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog(baseRecipe);

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(props.onClose).toHaveBeenCalledTimes(1);
		expect(props.onUpdate).not.toHaveBeenCalled();
		expect(modifyRecipeMock).not.toHaveBeenCalled();
	});

	it("renders a diff preview with approve/discard/refine controls when a pending modification exists", () => {
		renderDialog({
			...baseRecipe,
			pendingModification: pendingModificationFrom(["make it spicier"]),
		});

		expect(screen.getByText("+ 300 g chicken breast")).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Create as new recipe" }),
		).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
		expect(
			screen.getByRole("button", { name: "Refine again" }),
		).toBeInTheDocument();
		expect(
			screen.queryByLabelText("Describe how to modify this recipe"),
		).not.toBeInTheDocument();
	});

	it("approves the pending modification, replacing the recipe's fields with the draft, and closes", async () => {
		const user = userEvent.setup();
		const pendingModification = pendingModificationFrom(["make it spicier"]);
		const { props } = renderDialog({ ...baseRecipe, pendingModification });

		await user.click(screen.getByRole("button", { name: "Approve" }));

		expect(props.onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			title: pendingModification.draft.title,
			overview: pendingModification.draft.overview,
			baseServings: pendingModification.draft.baseServings,
			difficulty: pendingModification.draft.difficulty,
			estimatedMinutes: pendingModification.draft.estimatedMinutes,
			ingredients: pendingModification.draft.ingredients,
			steps: pendingModification.draft.steps,
			truncated: pendingModification.draft.truncated,
			pendingModification: undefined,
		});
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("discards the pending modification, leaving the recipe unchanged, and closes", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog({
			...baseRecipe,
			pendingModification: pendingModificationFrom(["make it spicier"]),
		});

		await user.click(screen.getByRole("button", { name: "Discard" }));

		expect(props.onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			pendingModification: undefined,
		});
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("creates the draft as a brand-new recipe, clears this recipe's pending draft, and closes", async () => {
		const user = userEvent.setup();
		const pendingModification = pendingModificationFrom(["make it spicier"]);
		const { props } = renderDialog({
			...baseRecipe,
			modificationCount: 1,
			pendingModification,
		});

		await user.click(
			screen.getByRole("button", { name: "Create as new recipe" }),
		);

		const created = props.onCreateRecipe.mock.calls[0]?.[0] as Recipe;
		expect(created.id).not.toBe(baseRecipe.id);
		expect(created.title).toBe(pendingModification.draft.title);
		expect(created.overview).toBe(pendingModification.draft.overview);
		expect(created.baseServings).toBe(pendingModification.draft.baseServings);
		expect(created.currentServings).toBe(
			pendingModification.draft.baseServings,
		);
		expect(created.ingredients).toBe(pendingModification.draft.ingredients);
		expect(created.steps).toBe(pendingModification.draft.steps);
		expect(created.expanded).toBe(false);
		expect(created.favorite).toBe(false);
		expect(created.pendingModification).toBeUndefined();
		// The spent credit carries over rather than resetting on the fork.
		expect(created.modificationCount).toBe(1);
		expect(created.prompt).toContain(baseRecipe.prompt);
		expect(created.prompt).toContain("make it spicier");

		// The original recipe is left with its own fields untouched, only its
		// pending draft cleared (it's been materialized as the new recipe).
		expect(props.onUpdate).toHaveBeenCalledWith({
			...baseRecipe,
			modificationCount: 1,
			pendingModification: undefined,
		});
		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("hides Refine again and shows a limit message once the recipe's total credits are used up", () => {
		renderDialog({
			...baseRecipe,
			modificationCount: 2,
			pendingModification: pendingModificationFrom(["make it spicier"]),
		});

		expect(
			screen.queryByRole("button", { name: "Refine again" }),
		).not.toBeInTheDocument();
		expect(
			screen.getByText(
				"You've reached the modification limit for this draft — approve or discard to continue.",
			),
		).toBeInTheDocument();
		// Approve/Discard remain available even with credits exhausted.
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Discard" })).toBeInTheDocument();
	});

	it("refines again against the pending draft, not the original recipe, and spends another credit", async () => {
		const user = userEvent.setup();
		modifyRecipeMock.mockResolvedValueOnce({
			type: "success",
			recipe: revisedRecipe,
			truncated: false,
		});
		const pendingModification = pendingModificationFrom(["make it spicier"]);
		const { props } = renderDialog({
			...baseRecipe,
			modificationCount: 1,
			pendingModification,
		});

		await user.click(screen.getByRole("button", { name: "Refine again" }));
		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"swap shrimp for chicken",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));

		await waitFor(() => expect(props.onUpdate).toHaveBeenCalledTimes(1));
		const updated = props.onUpdate.mock.calls[0]?.[0] as Recipe;
		expect(updated.modificationCount).toBe(2);
		expect(updated.pendingModification?.instructions).toEqual([
			"make it spicier",
			"swap shrimp for chicken",
		]);

		const callArgs = modifyRecipeMock.mock.calls[0]?.[0];
		expect(callArgs.data.current.title).toBe(pendingModification.draft.title);
		expect(callArgs.data.current.ingredients).toEqual([
			{ baseName: "chicken breast", description: "", quantity: 300, unit: "g" },
		]);
	});

	it("cancelling out of the refine-again form returns to the diff view instead of closing", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog({
			...baseRecipe,
			pendingModification: pendingModificationFrom(["make it spicier"]),
		});

		await user.click(screen.getByRole("button", { name: "Refine again" }));
		expect(
			screen.getByLabelText("Describe how to modify this recipe"),
		).toBeInTheDocument();

		await user.click(screen.getByRole("button", { name: "Cancel" }));

		expect(props.onClose).not.toHaveBeenCalled();
		expect(
			screen.queryByLabelText("Describe how to modify this recipe"),
		).not.toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Approve" })).toBeInTheDocument();
	});

	it("shows an inline error message when the modification server call reports an error", async () => {
		const user = userEvent.setup();
		modifyRecipeMock.mockResolvedValueOnce({
			type: "error",
			message: "Malformed recipe modification response from Groq",
		});
		renderDialog(baseRecipe);

		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"make it spicier",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));

		expect(
			await screen.findByText(
				"Malformed recipe modification response from Groq",
			),
		).toBeInTheDocument();
	});

	it("shows a generic inline error message when the modification call rejects", async () => {
		const user = userEvent.setup();
		modifyRecipeMock.mockRejectedValueOnce(new Error("network down"));
		renderDialog(baseRecipe);

		await user.type(
			screen.getByLabelText("Describe how to modify this recipe"),
			"make it spicier",
		);
		await user.click(screen.getByRole("button", { name: "Submit" }));

		expect(
			await screen.findByText("Couldn't modify the recipe. Please try again."),
		).toBeInTheDocument();
	});

	it("closes via the X button without discarding a pending draft", async () => {
		const user = userEvent.setup();
		const pendingModification = pendingModificationFrom(["make it spicier"]);
		const { props } = renderDialog({ ...baseRecipe, pendingModification });

		await user.click(screen.getByRole("button", { name: "Close" }));

		expect(props.onClose).toHaveBeenCalledTimes(1);
		expect(props.onUpdate).not.toHaveBeenCalled();
	});

	it("closes via the backdrop", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog(baseRecipe);

		await user.click(screen.getByRole("button", { name: "Dismiss dialog" }));

		expect(props.onClose).toHaveBeenCalledTimes(1);
	});

	it("closes on Escape", async () => {
		const user = userEvent.setup();
		const { props } = renderDialog(baseRecipe);

		await user.keyboard("{Escape}");

		expect(props.onClose).toHaveBeenCalledTimes(1);
	});
});
