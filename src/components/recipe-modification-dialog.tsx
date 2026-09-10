import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { RecipeModificationDiff } from "#/components/recipe-modification-diff";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
	combineIngredientName,
	type Difficulty,
	MAX_MODIFICATIONS,
	type Recipe,
} from "#/lib/recipe";
import { diffRecipes } from "#/lib/recipe-diff";
import { toWireIngredient, toWireStep } from "#/lib/recipe-wire";
import { modifyRecipe } from "#/server/generate-recipe";

type RecipeModificationDialogProps = {
	recipe: Recipe;
	open: boolean;
	onClose: () => void;
	onUpdate: (recipe: Recipe) => void;
	onCreateRecipe: (recipe: Recipe) => void;
};

const MODIFICATION_ERROR_MESSAGE =
	"Couldn't modify the recipe. Please try again.";
const NO_MODIFICATIONS_LEFT_MESSAGE =
	"You've used all your modifications for this recipe. Search for a new recipe instead, describing the change you want.";
// Fallback for recipes saved before TEST-229 added these fields — the Groq
// modification call needs some value for them, even if it's a rough guess.
const FALLBACK_DIFFICULTY: Difficulty = "intermediate";
const FALLBACK_ESTIMATED_MINUTES = 30;

export function RecipeModificationDialog({
	recipe,
	open,
	onClose,
	onUpdate,
	onCreateRecipe,
}: RecipeModificationDialogProps) {
	const usedCount = recipe.modificationCount ?? 0;
	const remaining = Math.max(0, MAX_MODIFICATIONS - usedCount);
	const canStartNewModification = remaining > 0;
	const [formOpen, setFormOpen] = useState(
		!recipe.pendingModification && canStartNewModification,
	);
	const [instruction, setInstruction] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: (instructionText: string) => {
			const source = recipe.pendingModification?.draft ?? recipe;
			return modifyRecipe({
				data: {
					instruction: instructionText,
					current: {
						title: source.title,
						overview: source.overview,
						baseServings: source.baseServings,
						difficulty: source.difficulty ?? FALLBACK_DIFFICULTY,
						estimatedMinutes:
							source.estimatedMinutes ?? FALLBACK_ESTIMATED_MINUTES,
						ingredients: source.ingredients.map(toWireIngredient),
						steps: source.steps.map(toWireStep),
					},
				},
			});
		},
	});

	// Re-derive the initial form/error state only when the dialog transitions
	// open — not on every recipe update while it's already open, since a
	// successful submit below (which changes recipe.pendingModification)
	// manages formOpen itself.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useEffect(() => {
		if (!open) return;
		setInstruction("");
		setError(null);
		setFormOpen(!recipe.pendingModification && canStartNewModification);
	}, [open]);

	useEffect(() => {
		if (!open) return;
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [open, onClose]);

	const diff = useMemo(
		() =>
			recipe.pendingModification
				? diffRecipes(recipe, recipe.pendingModification.draft)
				: null,
		[recipe],
	);

	if (!open) return null;

	function handleSubmit() {
		const trimmed = instruction.trim();
		if (!trimmed) return;
		setError(null);
		mutation.mutate(trimmed, {
			onSuccess: (result) => {
				if (result.type !== "success") {
					setError(result.message);
					return;
				}
				const priorInstructions =
					recipe.pendingModification?.instructions ?? [];
				onUpdate({
					...recipe,
					modificationCount: usedCount + 1,
					pendingModification: {
						instructions: [...priorInstructions, trimmed],
						draft: {
							title: result.recipe.title,
							overview: result.recipe.overview,
							baseServings: result.recipe.baseServings,
							difficulty: result.recipe.difficulty,
							estimatedMinutes: result.recipe.estimatedMinutes,
							ingredients: result.recipe.ingredients.map((ingredient) => ({
								id: crypto.randomUUID(),
								text: combineIngredientName(
									ingredient.baseName,
									ingredient.description,
								),
								baseName: ingredient.baseName,
								description: ingredient.description,
								quantity: ingredient.quantity,
								unit: ingredient.unit,
								checked: false,
							})),
							steps: result.recipe.steps.map((step) => ({
								id: crypto.randomUUID(),
								section: step.section,
								text: step.text,
								estimatedMinutes: step.estimatedMinutes ?? null,
								checked: false,
							})),
							truncated: result.truncated,
						},
					},
				});
				setInstruction("");
				setFormOpen(false);
			},
			onError: () => {
				setError(MODIFICATION_ERROR_MESSAGE);
			},
		});
	}

	function handleApprove() {
		const draft = recipe.pendingModification?.draft;
		if (!draft) return;
		onUpdate({
			...recipe,
			title: draft.title,
			overview: draft.overview,
			baseServings: draft.baseServings,
			difficulty: draft.difficulty,
			estimatedMinutes: draft.estimatedMinutes,
			ingredients: draft.ingredients,
			steps: draft.steps,
			truncated: draft.truncated,
			pendingModification: undefined,
		});
		onClose();
	}

	function handleDiscard() {
		onUpdate({ ...recipe, pendingModification: undefined });
		onClose();
	}

	// Forks the draft into a brand-new recipe instead of overwriting this one,
	// so the user can keep the original and build a variant off it. The new
	// recipe inherits modificationCount as-is (not reset to 0) — the credits
	// were already spent generating this draft, whichever recipe it ends up
	// attached to. Clears this recipe's pendingModification since the draft
	// has been materialized elsewhere, not lost.
	function handleCreateAsNew() {
		const pending = recipe.pendingModification;
		if (!pending) return;
		const draft = pending.draft;
		const newRecipe: Recipe = {
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			prompt: `${recipe.prompt} — modified: ${pending.instructions.join("; ")}`,
			title: draft.title,
			overview: draft.overview,
			baseServings: draft.baseServings,
			currentServings: draft.baseServings,
			difficulty: draft.difficulty,
			estimatedMinutes: draft.estimatedMinutes,
			ingredients: draft.ingredients,
			steps: draft.steps,
			expanded: false,
			favorite: false,
			truncated: draft.truncated,
			modificationCount: usedCount,
		};
		// Clear this recipe's pending draft first — onCreateRecipe expands the
		// new recipe (accordion-style, collapsing whichever was open) as its
		// last step, so nothing here overwrites that with a stale `expanded`
		// value from this render's `recipe` prop.
		onUpdate({ ...recipe, pendingModification: undefined });
		onCreateRecipe(newRecipe);
		onClose();
	}

	// Cancelling the form falls back to the diff view if there's a draft to
	// show; otherwise there's nothing left to show, so close outright.
	function handleCancelForm() {
		setError(null);
		setInstruction("");
		if (recipe.pendingModification) {
			setFormOpen(false);
		} else {
			onClose();
		}
	}

	const pendingModification = recipe.pendingModification;

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Dismiss dialog"
				className="absolute inset-0 bg-black/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="modify-recipe-dialog-title"
				className="card relative flex max-h-[85vh] w-full max-w-lg flex-col bg-card"
			>
				<div className="flex items-center justify-between gap-3 border-line border-b p-4">
					<h2 id="modify-recipe-dialog-title" className="display-title text-lg">
						Modify recipe{" "}
						<span className="font-sans text-ink-dim text-sm font-normal">
							({remaining} remaining)
						</span>
					</h2>
					<Button
						variant="secondary"
						className="size-8 shrink-0 rounded-[10px] p-0"
						aria-label="Close"
						onClick={onClose}
					>
						<X className="size-4" aria-hidden="true" />
					</Button>
				</div>

				<div className="flex flex-col gap-3 overflow-y-auto p-4">
					{diff ? <RecipeModificationDiff diff={diff} /> : null}

					{formOpen ? (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								handleSubmit();
							}}
							className="flex flex-col gap-2"
						>
							<Textarea
								value={instruction}
								onChange={(event) => setInstruction(event.target.value)}
								placeholder='e.g. "make it spicier" or "swap shrimp for chicken"'
								aria-label="Describe how to modify this recipe"
								disabled={mutation.isPending}
								autoFocus
							/>
							<div className="flex gap-2">
								<Button
									type="submit"
									disabled={
										mutation.isPending || instruction.trim().length === 0
									}
								>
									{mutation.isPending ? "Modifying…" : "Submit"}
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={handleCancelForm}
								>
									Cancel
								</Button>
							</div>
						</form>
					) : null}

					{!pendingModification && !formOpen && !canStartNewModification ? (
						<p className="rounded-[18px] border border-line bg-bg2 p-3 text-sm text-ink-dim">
							{NO_MODIFICATIONS_LEFT_MESSAGE}
						</p>
					) : null}

					{pendingModification && !formOpen ? (
						<div className="flex flex-wrap items-center gap-2">
							<Button onClick={handleApprove}>Approve</Button>
							<Button variant="secondary" onClick={handleCreateAsNew}>
								Create as new recipe
							</Button>
							<Button variant="secondary" onClick={handleDiscard}>
								Discard
							</Button>
							{canStartNewModification ? (
								<Button variant="secondary" onClick={() => setFormOpen(true)}>
									Refine again
								</Button>
							) : (
								<p className="text-xs text-ink-dim">
									You've reached the modification limit for this draft — approve
									or discard to continue.
								</p>
							)}
						</div>
					) : null}

					{error ? <p className="text-warn">{error}</p> : null}
				</div>
			</div>
		</div>
	);
}
