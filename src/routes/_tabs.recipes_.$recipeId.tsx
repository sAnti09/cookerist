import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
	ChefHat,
	ChevronLeft,
	Clock,
	Flame,
	SquarePen,
	Star,
	Trash2,
	UserPlus,
} from "lucide-react";
import { useState } from "react";
import { CookMode } from "#/components/cook-mode";
import { RecipeDetail } from "#/components/recipe-detail";
import { RecipeModificationDialog } from "#/components/recipe-modification-dialog";
import { ShareResourceDialog } from "#/components/share-resource-dialog";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { DifficultyBadge } from "#/components/ui/difficulty-badge";
import { IconButton } from "#/components/ui/icon-button";
import { useAppData } from "#/lib/app-data-context";
import {
	formatCaloriesPerServing,
	formatEstimatedTime,
	MAX_THUMBNAIL_ATTEMPTS,
} from "#/lib/recipe";
import { useGoBack } from "#/lib/use-go-back";
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
	const goBack = useGoBack();
	const {
		recipes,
		deleteRecipe,
		toggleFavoriteRecipe,
		updateRecipe,
		createRecipe,
		isSharedWithMe,
		generateThumbnailForRecipe,
		isGeneratingThumbnail,
	} = useAppData();
	const [confirmingDelete, setConfirmingDelete] = useState(false);
	const [modifyDialogOpen, setModifyDialogOpen] = useState(false);
	const [cookModeOpen, setCookModeOpen] = useState(search.autoStart === "cook");
	const [shareDialogOpen, setShareDialogOpen] = useState(false);
	const recipe = recipes.find((r) => r.id === recipeId);
	const shared = recipe ? isSharedWithMe(recipe) : false;

	function handleBack() {
		goBack(() => {
			if (search.from === "meal-plan" && search.planId) {
				navigate({
					to: "/meal-plan/$planId",
					params: { planId: search.planId },
				});
				return;
			}
			navigate({ to: "/recipes" });
		});
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

	const overlayIconButtonClassName =
		"border-white/40 bg-black/35 backdrop-blur-sm hover:bg-black/50";

	return (
		<div>
			<div className="relative">
				{recipe.thumbnailUrl ? (
					<img
						src={recipe.thumbnailUrl}
						alt=""
						className="aspect-[4/3] w-full object-cover"
					/>
				) : (
					<div
						aria-hidden={isGeneratingThumbnail(recipe.id)}
						className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-2 bg-bg2 px-4 text-center"
					>
						<Flame className="size-6 text-ink-dim" aria-hidden="true" />
						{isGeneratingThumbnail(recipe.id) ? (
							<p className="text-xs text-ink-dim">Generating image…</p>
						) : (recipe.thumbnailAttempts ?? 0) < MAX_THUMBNAIL_ATTEMPTS ? (
							<Button
								variant="secondary"
								className="h-auto px-3 py-1.5 text-xs"
								onClick={() => generateThumbnailForRecipe(recipe)}
							>
								Generate image
							</Button>
						) : (
							<p className="text-xs text-ink-dim">
								Image could not be generated for this recipe
							</p>
						)}
					</div>
				)}

				<div
					className="absolute inset-x-0 top-0 flex items-center justify-between gap-2 px-4 pb-6"
					style={{
						paddingTop: "calc(1rem + env(safe-area-inset-top, 0px))",
					}}
				>
					<IconButton
						aria-label="Back to recipes"
						onClick={handleBack}
						className={overlayIconButtonClassName}
					>
						<ChevronLeft
							className="size-[18px] text-white"
							aria-hidden="true"
						/>
					</IconButton>
					<div className="flex shrink-0 gap-1.5">
						<IconButton
							aria-label={
								recipe.favorite
									? `Unfavorite ${recipe.title}`
									: `Favorite ${recipe.title}`
							}
							aria-pressed={recipe.favorite}
							onClick={() => toggleFavoriteRecipe(recipe.id)}
							className={overlayIconButtonClassName}
						>
							<Star
								className={cn(
									"size-4",
									recipe.favorite ? "fill-accent text-accent" : "text-white",
								)}
							/>
						</IconButton>
						<IconButton
							aria-label={`Modify ${recipe.title}`}
							onClick={() => setModifyDialogOpen(true)}
							className={overlayIconButtonClassName}
						>
							<SquarePen
								className={cn(
									"size-4",
									recipe.pendingModification ? "text-accent" : "text-white",
								)}
							/>
						</IconButton>
						{shared ? null : (
							<IconButton
								aria-label={`Share ${recipe.title}`}
								onClick={() => setShareDialogOpen(true)}
								className={overlayIconButtonClassName}
							>
								<UserPlus className="size-4 text-white" />
							</IconButton>
						)}
						<IconButton
							aria-label={
								shared ? `Remove ${recipe.title}` : `Delete ${recipe.title}`
							}
							onClick={() => setConfirmingDelete(true)}
							className={overlayIconButtonClassName}
						>
							<Trash2 className="size-4 text-white" />
						</IconButton>
					</div>
				</div>

				<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/75 via-black/40 to-transparent px-5 pt-14 pb-4">
					<h1 className="display-title text-2xl font-semibold text-white leading-tight [text-shadow:0_1px_4px_rgba(0,0,0,0.45)]">
						{recipe.title}
					</h1>
					<div className="mt-1.5 flex flex-nowrap items-center gap-2 overflow-hidden whitespace-nowrap text-white/85 text-xs">
						<span className="shrink-0">
							{new Date(recipe.createdAt).toLocaleDateString(undefined, {
								year: "numeric",
								month: "short",
								day: "numeric",
							})}
						</span>
						{recipe.difficulty ? (
							<DifficultyBadge
								difficulty={recipe.difficulty}
								className="shrink-0 bg-white/20 text-white"
							/>
						) : null}
						{recipe.estimatedMinutes != null ? (
							<span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
								<Clock className="size-3" aria-hidden="true" />
								{formatEstimatedTime(recipe.estimatedMinutes)}
							</span>
						) : null}
						{recipe.caloriesPerServing != null ? (
							<span className="inline-flex shrink-0 items-center gap-1 tabular-nums">
								<Flame className="size-3" aria-hidden="true" />
								{formatCaloriesPerServing(recipe.caloriesPerServing)}
							</span>
						) : null}
					</div>
				</div>
			</div>

			<div
				className={cn("px-5 pt-5", recipe.steps.length > 0 ? "pb-28" : "pb-6")}
			>
				<RecipeDetail recipe={recipe} onUpdate={updateRecipe} />
			</div>

			<ConfirmDialog
				open={confirmingDelete}
				title={shared ? "Remove this recipe?" : "Delete this recipe?"}
				description={
					shared
						? `"${recipe.title}" will be removed from your recipes — the person who shared it (and anyone else it's shared with) keeps their copy.`
						: `"${recipe.title}" will be permanently removed.`
				}
				confirmLabel={shared ? "Remove" : "Delete"}
				cancelLabel="Cancel"
				onConfirm={() => {
					setConfirmingDelete(false);
					deleteRecipe(recipe.id);
					navigate({ to: "/recipes" });
				}}
				onCancel={() => setConfirmingDelete(false)}
			/>
			<ShareResourceDialog
				open={shareDialogOpen}
				onClose={() => setShareDialogOpen(false)}
				table="recipes"
				id={recipe.id}
				title={recipe.title}
			/>
			<RecipeModificationDialog
				recipe={recipe}
				open={modifyDialogOpen}
				onClose={() => setModifyDialogOpen(false)}
				onUpdate={updateRecipe}
				onCreateRecipe={(newRecipe) => {
					createRecipe(newRecipe);
					generateThumbnailForRecipe(newRecipe);
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
