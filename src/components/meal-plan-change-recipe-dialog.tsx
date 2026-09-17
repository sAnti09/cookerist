import { useMutation } from "@tanstack/react-query";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "#/components/ui/button";
import { SearchInput } from "#/components/ui/search-input";
import { Textarea } from "#/components/ui/textarea";
import { filterRecipes } from "#/lib/filter-recipes";
import type { Recipe } from "#/lib/recipe";
import { toStoredRecipe } from "#/lib/recipes-storage";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";
import { getUserTimezone } from "#/lib/user-region";
import { cn } from "#/lib/utils";
import { generateRecipe } from "#/server/generate-recipe";

// Enough to scan, not enough to turn the dropdown into "just show every
// recipe" — same limit as grocery-list-create-form.tsx's recipe picker.
const SEARCH_RESULTS_LIMIT = 8;
const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";

type Mode = "search" | "generate";

type MealPlanChangeRecipeDialogProps = {
	entryLabel: string;
	currentRecipeId: string | undefined;
	currentServings: number;
	recipes: Recipe[];
	onClose: () => void;
	onSwapExisting: (recipeId: string) => void;
	onGenerateNew: (recipe: Recipe) => void;
};

// Lets a meal-plan entry (see meal-plan-entry-row.tsx's "Change" swipe
// action) be swapped for a different dish, either by picking an already
// saved recipe (reusing grocery-list-create-form.tsx's search pattern) or by
// generating a brand-new one from a prompt (reusing the same
// generateRecipe server fn the main Recipes tab uses). Like
// GroceryListCreateForm, the caller only ever mounts this while open (see
// meal-plan-ready.tsx), so there's no `open` prop/self-gating to thread
// through — a fresh mount is a fresh dialog.
export function MealPlanChangeRecipeDialog({
	entryLabel,
	currentRecipeId,
	currentServings,
	recipes,
	onClose,
	onSwapExisting,
	onGenerateNew,
}: MealPlanChangeRecipeDialogProps) {
	const [mode, setMode] = useState<Mode>("search");
	const [search, setSearch] = useState("");
	const [prompt, setPrompt] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: (input: { prompt: string; timezone?: string }) =>
			generateRecipe({ data: input }),
	});

	useBodyScrollLock(true);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const trimmedSearch = search.trim();
	const results = trimmedSearch
		? filterRecipes(recipes, {
				search: trimmedSearch,
				difficulty: "all",
				favoritesOnly: false,
			})
				.filter((recipe) => recipe.id !== currentRecipeId)
				.slice(0, SEARCH_RESULTS_LIMIT)
		: [];

	function handleGenerate() {
		const trimmed = prompt.trim();
		if (!trimmed) return;
		setError(null);
		mutation.mutate(
			{ prompt: trimmed, timezone: getUserTimezone() },
			{
				onSuccess: (result) => {
					if (result.type !== "success") {
						setError(
							result.type === "off_topic" ? OFF_TOPIC_MESSAGE : result.message,
						);
						return;
					}
					const recipe: Recipe = {
						...toStoredRecipe(trimmed, result.recipe, result.truncated),
						currentServings,
					};
					onGenerateNew(recipe);
				},
				onError: () => setError(GENERIC_ERROR_MESSAGE),
			},
		);
	}

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
				aria-labelledby="change-recipe-dialog-title"
				className="card relative flex max-h-[85vh] w-full max-w-lg flex-col bg-card"
			>
				<div className="flex items-center justify-between gap-3 border-line border-b p-4">
					<div className="min-w-0">
						<h2
							id="change-recipe-dialog-title"
							className="display-title text-lg"
						>
							Change recipe
						</h2>
						<p className="truncate text-ink-dim text-xs">{entryLabel}</p>
					</div>
					<Button
						variant="secondary"
						className="size-8 shrink-0 rounded-[10px] p-0"
						aria-label="Close"
						onClick={onClose}
					>
						<X className="size-4" aria-hidden="true" />
					</Button>
				</div>

				<div className="flex gap-1.5 border-line border-b p-3">
					<Button
						type="button"
						variant="secondary"
						aria-pressed={mode === "search"}
						onClick={() => setMode("search")}
						className={cn(
							"flex-1 rounded-full border-0 text-xs",
							mode === "search"
								? "bg-accent text-primary-foreground"
								: "bg-bg2",
						)}
					>
						Swap existing
					</Button>
					<Button
						type="button"
						variant="secondary"
						aria-pressed={mode === "generate"}
						onClick={() => setMode("generate")}
						className={cn(
							"flex-1 rounded-full border-0 text-xs",
							mode === "generate"
								? "bg-accent text-primary-foreground"
								: "bg-bg2",
						)}
					>
						Generate new
					</Button>
				</div>

				<div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
					{mode === "search" ? (
						recipes.length === 0 ? (
							<p className="text-sm text-ink-dim">
								No saved recipes yet — try generating a new one instead.
							</p>
						) : (
							<>
								<SearchInput
									value={search}
									onChange={setSearch}
									placeholder="Search your recipes…"
									aria-label="Search recipes to swap in"
									clearLabel="Clear recipe search"
								/>
								{trimmedSearch ? (
									<ul className="flex flex-col gap-1">
										{results.length === 0 ? (
											<li className="px-3 py-2 text-sm text-ink-dim">
												No matching recipes.
											</li>
										) : (
											results.map((recipe) => (
												<li key={recipe.id}>
													<button
														type="button"
														onClick={() => onSwapExisting(recipe.id)}
														className="w-full rounded-[10px] px-3 py-2 text-left text-sm hover:bg-bg2"
													>
														{recipe.title}
													</button>
												</li>
											))
										)}
									</ul>
								) : null}
							</>
						)
					) : (
						<form
							onSubmit={(event) => {
								event.preventDefault();
								handleGenerate();
							}}
							className="flex flex-col gap-2"
						>
							<Textarea
								value={prompt}
								onChange={(event) => setPrompt(event.target.value)}
								placeholder="Describe a replacement dish…"
								aria-label="Describe a replacement dish"
								disabled={mutation.isPending}
								autoFocus
							/>
							<Button
								type="submit"
								disabled={mutation.isPending || prompt.trim().length === 0}
							>
								{mutation.isPending ? "Generating…" : "Generate"}
							</Button>
						</form>
					)}
					{error ? <p className="text-sm text-warn">{error}</p> : null}
				</div>
			</div>
		</div>
	);
}
