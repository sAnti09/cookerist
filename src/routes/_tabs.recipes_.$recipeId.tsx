import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChefHat,
	ChevronLeft,
	Clock,
	Flame,
	SquarePen,
	Star,
	Trash2,
} from "lucide-react";
import { useState } from "react";
import { CookMode } from "#/components/cook-mode";
import { RecipeDetail } from "#/components/recipe-detail";
import { RecipeModificationDialog } from "#/components/recipe-modification-dialog";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import { IconButton } from "#/components/ui/icon-button";
import { useAppData } from "#/lib/app-data-context";
import { formatCaloriesPerServing, formatEstimatedTime } from "#/lib/recipe";
import { cn } from "#/lib/utils";

type RecipeDetailSearch = {
	// Set when this route was opened from a meal-plan entry row (see
	// meal-plan-entry-row.tsx) so the back button can return there instead of
	// always landing on the recipes list — the only "came from" tracking
	// anywhere in this app, added specifically for this case.
	from?: "meal-plan";
	planId?: string;
	// Set when this route was opened via a right-swipe "Cook" on a recipe row
	// (see result-row.tsx) so Cook Mode opens immediately instead of
	// requiring a second tap on "Start Cooking" — only ever set for a recipe
	// with steps, since that's the only case the row offers the swipe at all.
	autoStart?: "cook";
};

export const Route = createFileRoute("/_tabs/recipes_/$recipeId")({
	validateSearch: (search: Record<string, unknown>): RecipeDetailSearch => ({
		from: search.from === "meal-plan" ? "meal-plan" : undefined,
		planId: typeof search.planId === "string" ? search.planId : undefined,
		autoStart: search.autoStart === "cook" ? "cook" : undefined,
	}),
	component: RecipeDetailScreen,
});

function RecipeDetailScreen() {
	const { recipeId } = Route.useParams();
	const search = Route.useSearch();
	const navigate = useNavigate();
	const {
		recipes,
		deleteRecipe,
		toggleFavoriteRecipe,
		updateRecipe,
		createRecipe,
	} = useAppData();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
	const [cookModeOpen, setCookModeOpen] = useState(search.autoStart === "cook");
	const recipe = recipes.find((r) => r.id === recipeId);

	function handleBack() {
		if (search.from === "meal-plan" && search.planId) {
			navigate({ to: "/meal-plan/$planId", params: { planId: search.planId } });
			return;
		}
		navigate({ to: "/recipes" });
	}

	if (!recipe) {
		return (
			<div className="flex flex-col items-center gap-3 px-5 pt-16 text-center">
				<p className="text-sm text-ink-dim">
					This recipe couldn't be found — it may have been deleted.
				</p>
				<Link
					to="/recipes"
					className="font-medium text-accent underline underline-offset-2"
				>
					Back to recipes
				</Link>
			</div>
		);
	}

	return (
		<div>
			<div className="sticky top-0 z-10 flex items-center gap-2 border-line border-b bg-bg px-4 py-3.5">
				<IconButton aria-label="Back to recipes" onClick={handleBack}>
					<ChevronLeft className="size-[18px]" aria-hidden="true" />
				</IconButton>
				<div className="display-title flex-1 truncate text-[15px] font-semibold">
					Recipe
				</div>
				<div className="flex shrink-0 gap-1.5">
					<IconButton
						aria-label={
							recipe.favorite
								? `Unfavorite ${recipe.title}`
								: `Favorite ${recipe.title}`
						}
						aria-pressed={recipe.favorite}
						onClick={() => toggleFavoriteRecipe(recipe.id)}
					>
						<Star
							className={cn(
								"size-4",
								recipe.favorite ? "fill-accent text-accent" : "text-ink-dim",
							)}
						/>
					</IconButton>
					<IconButton
						aria-label={`Modify ${recipe.title}`}
						onClick={() => setModifyDialogOpen(true)}
					>
						<SquarePen
							className={cn(
								"size-4",
								recipe.pendingModification ? "text-accent" : "text-ink-dim",
							)}
						/>
					</IconButton>
					<IconButton
						aria-label={`Delete ${recipe.title}`}
						onClick={() => setConfirmingDelete(true)}
					>
						<Trash2 className="size-4 text-ink-dim" />
					</IconButton>
				</div>
			</div>

			<div
				className={cn("px-5 pt-5", recipe.steps.length > 0 ? "pb-28" : "pb-6")}
			>
				<h1 className="display-title text-2xl font-semibold leading-tight">
					{recipe.title}
				</h1>
				<div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
					<span>
						{new Date(recipe.createdAt).toLocaleDateString(undefined, {
							year: "numeric",
							month: "short",
							day: "numeric",
						})}
					</span>
					{recipe.difficulty ? (
						<DifficultyBadge difficulty={recipe.difficulty} />
					) : null}
					{recipe.estimatedMinutes != null ? (
						<span className="inline-flex items-center gap-1 tabular-nums">
							<Clock className="size-3" aria-hidden="true" />
							{formatEstimatedTime(recipe.estimatedMinutes)}
						</span>
					) : null}
					{recipe.caloriesPerServing != null ? (
						<span className="inline-flex items-center gap-1 tabular-nums">
							<Flame className="size-3" aria-hidden="true" />
							{formatCaloriesPerServing(recipe.caloriesPerServing)}
						</span>
					) : null}
				</div>
				<div className="mt-5">
					<RecipeDetail recipe={recipe} onUpdate={updateRecipe} />
				</div>
			</div>

			<ConfirmDialog
				open={confirmingDelete}
				title="Delete this recipe?"
				description={`"${recipe.title}" will be permanently removed.`}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					setConfirmingDelete(false);
					deleteRecipe(recipe.id);
					navigate({ to: "/recipes" });
				}}
				onCancel={() => setConfirmingDelete(false)}
			/>
			<RecipeModificationDialog
				recipe={recipe}
				open={modifyDialogOpen}
				onClose={() => setModifyDialogOpen(false)}
				onUpdate={updateRecipe}
				onCreateRecipe={(newRecipe) => {
					createRecipe(newRecipe);
					navigate({
						to: "/recipes/$recipeId",
						params: { recipeId: newRecipe.id },
					});
				}}
			/>

			{recipe.steps.length > 0 ? (
				<div
					className="fixed inset-x-0 bottom-0 z-40 border-line border-t bg-bg px-5 pt-3.5 shadow-[0_-8px_22px_-18px_rgba(33,28,22,0.25)]"
					style={{
						paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
					}}
				>
					<button
						type="button"
						onClick={() => setCookModeOpen(true)}
						className="flex w-full items-center justify-center gap-2 rounded-full bg-accent py-4 font-semibold text-[15px] text-primary-foreground"
					>
						<ChefHat className="size-[17px]" aria-hidden="true" />
						Start Cooking
					</button>
				</div>
			) : null}
			{cookModeOpen ? (
				<CookMode
					recipe={recipe}
					onUpdate={updateRecipe}
					onClose={() => setCookModeOpen(false)}
				/>
			) : null}
		</div>
	);
}
