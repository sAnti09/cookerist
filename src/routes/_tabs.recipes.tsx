import { useMutation } from "@tanstack/react-query";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { FeatureSection } from "#/components/feature-section";
import { OfflineBanner } from "#/components/offline-banner";
import { PromptForm } from "#/components/prompt-form";
import {
	PendingResultRow,
	type PendingRow,
	RecipeResultRow,
} from "#/components/result-row";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { SearchInput } from "#/components/ui/search-input";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { useAppData } from "#/lib/app-data-context";
import { filterRecipes, hasActiveFilters } from "#/lib/filter-recipes";
import { compressImageToDataUrl } from "#/lib/image-capture";
import { DIFFICULTY_LABELS, type Difficulty } from "#/lib/recipe";
import { toStoredRecipe } from "#/lib/recipes-storage";
import { resetAllData } from "#/lib/reset-all-data";
import { useOnlineStatus } from "#/lib/use-online-status";
import { getUserTimezone } from "#/lib/user-region";
import { cn } from "#/lib/utils";
import { generateRecipe } from "#/server/generate-recipe";
import { identifyDish } from "#/server/identify-dish";

export const Route = createFileRoute("/_tabs/recipes")({
	component: RecipesScreen,
});

const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish, or listing ingredients you have on hand.";
const PHOTO_NOT_FOOD_MESSAGE =
	"That doesn't look like a dish — try a clearer photo of food.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";
const PHOTO_ERROR_MESSAGE =
	"Something went wrong identifying that photo. Please try again.";
const PAGE_SIZE = 10;

function RecipesScreen() {
	const isOnline = useOnlineStatus();
	const navigate = useNavigate();
	const { recipes, createRecipe, deleteRecipe } = useAppData();
	const [pending, setPending] = useState<PendingRow[]>([]);
	const [promptValue, setPromptValue] = useState("");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [searchQuery, setSearchQuery] = useState("");
	const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">(
		"all",
	);
	const [favoritesOnly, setFavoritesOnly] = useState(false);
	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
	const [deletingRecipeId, setDeletingRecipeId] = useState<string | null>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const isInitialFilterMount = useRef(true);
	const mutation = useMutation({
		mutationFn: (input: { prompt: string; timezone?: string }) =>
			generateRecipe({ data: input }),
	});
	const identifyMutation = useMutation({
		mutationFn: (input: { imageDataUrl: string; timezone?: string }) =>
			identifyDish({ data: input }),
	});

	const filters = {
		search: searchQuery,
		difficulty: difficultyFilter,
		favoritesOnly,
	};
	const filtersActive = hasActiveFilters(filters);
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depends on the primitive filter fields rather than the `filters` object (a fresh object every render)
	const filteredRecipes = useMemo(
		() => filterRecipes(recipes, filters),
		[recipes, searchQuery, difficultyFilter, favoritesOnly],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on filter change to reset pagination, not to read the values
	useEffect(() => {
		if (isInitialFilterMount.current) {
			isInitialFilterMount.current = false;
			return;
		}
		setVisibleCount(PAGE_SIZE);
	}, [searchQuery, difficultyFilter, favoritesOnly]);

	const hasMore = visibleCount < filteredRecipes.length;

	function handleClearFilters() {
		setSearchQuery("");
		setDifficultyFilter("all");
		setFavoritesOnly(false);
	}

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!sentinel || !hasMore) return;

		const observer = new IntersectionObserver((entries) => {
			if (entries.some((entry) => entry.isIntersecting)) {
				setVisibleCount((count) => count + PAGE_SIZE);
			}
		});
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [hasMore]);

	function handleResetAllData() {
		resetAllData();
		window.location.reload();
	}

	function submit(prompt: string, replaceId?: string) {
		const localId = replaceId ?? crypto.randomUUID();
		setPending((rows) => {
			const existingPhoto = rows.find((row) => row.localId === localId)?.photo;
			return [
				{
					localId,
					prompt,
					status: "loading",
					photo: existingPhoto
						? { ...existingPhoto, stage: "generating" }
						: undefined,
				},
				...rows.filter(
					(row) => row.localId !== localId && row.status !== "error",
				),
			];
		});

		mutation
			.mutateAsync({ prompt, timezone: getUserTimezone() })
			.then((result) => {
				if (result.type === "success") {
					createRecipe(toStoredRecipe(prompt, result.recipe, result.truncated));
					setPending((rows) => {
						const row = rows.find((r) => r.localId === localId);
						if (row?.photo) URL.revokeObjectURL(row.photo.previewUrl);
						return rows.filter((r) => r.localId !== localId);
					});
					return;
				}

				const offTopic = result.type === "off_topic";
				const message = offTopic ? OFF_TOPIC_MESSAGE : result.message;
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message, offTopic }
							: row,
					),
				);
			})
			.catch(() => {
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message: GENERIC_ERROR_MESSAGE }
							: row,
					),
				);
			});
	}

	async function runIdentify(localId: string, dataUrl: string) {
		try {
			const result = await identifyMutation.mutateAsync({
				imageDataUrl: dataUrl,
				timezone: getUserTimezone(),
			});
			if (result.type !== "success") {
				const offTopic = result.type === "not_food";
				const message = offTopic ? PHOTO_NOT_FOOD_MESSAGE : result.message;
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message, offTopic }
							: row,
					),
				);
				return;
			}
			submit(result.description, localId);
		} catch {
			setPending((rows) =>
				rows.map((row) =>
					row.localId === localId
						? { ...row, status: "error", message: PHOTO_ERROR_MESSAGE }
						: row,
				),
			);
		}
	}

	function submitPhoto(file: File) {
		const localId = crypto.randomUUID();
		const previewUrl = URL.createObjectURL(file);
		setPending((rows) => [
			{
				localId,
				prompt: "",
				status: "loading",
				photo: { previewUrl, dataUrl: "", stage: "identifying" },
			},
			...rows.filter((row) => row.status !== "error"),
		]);

		compressImageToDataUrl(file)
			.then((dataUrl) => {
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId && row.photo
							? { ...row, photo: { ...row.photo, dataUrl } }
							: row,
					),
				);
				return runIdentify(localId, dataUrl);
			})
			.catch(() => {
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message: PHOTO_ERROR_MESSAGE }
							: row,
					),
				);
			});
	}

	function handleRetry(row: PendingRow) {
		if (row.photo) {
			const { localId, photo } = row;
			setPending((rows) =>
				rows.map((r) =>
					r.localId === localId
						? {
								...r,
								status: "loading",
								message: undefined,
								offTopic: undefined,
								photo: { ...photo, stage: "identifying" },
							}
						: r,
				),
			);
			void runIdentify(localId, photo.dataUrl);
			return;
		}
		if (row.offTopic) {
			setPending((rows) => rows.filter((r) => r.localId !== row.localId));
			setPromptValue(row.prompt);
			return;
		}
		submit(row.prompt, row.localId);
	}

	function handleChoosePhoto(row: PendingRow, file: File) {
		if (row.photo) URL.revokeObjectURL(row.photo.previewUrl);
		setPending((rows) => rows.filter((r) => r.localId !== row.localId));
		submitPhoto(file);
	}

	return (
		<div className="px-5 pt-5">
			<div className="flex items-center justify-between gap-3">
				<h1 className="display-title text-[22px] font-semibold text-ink">
					Recipes
				</h1>
				<ThemeToggle />
			</div>

			<div className="mt-4">
				<PromptForm
					value={promptValue}
					onChange={setPromptValue}
					onSubmit={submit}
					onPhotoSelected={submitPhoto}
					disabled={!isOnline}
				/>
				<OfflineBanner isOnline={isOnline} />
			</div>

			{recipes.length > 0 ? (
				<div className="mt-5 flex flex-col gap-2.5">
					<SearchInput
						value={searchQuery}
						onChange={setSearchQuery}
						placeholder="Search your recipes…"
						aria-label="Search recipes"
						clearLabel="Clear recipe search"
					/>
					<div className="flex flex-wrap items-center gap-1.5">
						<select
							value={difficultyFilter}
							onChange={(event) =>
								setDifficultyFilter(event.target.value as Difficulty | "all")
							}
							aria-label="Filter by difficulty"
							className="shrink-0 rounded-full bg-bg2 px-3 py-1.5 text-xs text-ink-dim outline-none"
						>
							<option value="all">All difficulties</option>
							{Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
								<option key={value} value={value}>
									{label}
								</option>
							))}
						</select>
						<Button
							variant="secondary"
							aria-pressed={favoritesOnly}
							onClick={() => setFavoritesOnly((value) => !value)}
							className={cn(
								"shrink-0 gap-1.5 rounded-full border-0 px-3 py-1.5 text-xs",
								favoritesOnly ? "bg-accent text-primary-foreground" : "bg-bg2",
							)}
						>
							Favorites
						</Button>
						{filtersActive ? (
							<Button
								variant="secondary"
								className="shrink-0 rounded-full border-0 bg-bg2 px-3 py-1.5 text-xs"
								onClick={handleClearFilters}
							>
								Clear filters
							</Button>
						) : null}
					</div>
				</div>
			) : null}

			<div className="mt-4 flex flex-col gap-2.5 pb-2">
				{pending.map((row) => (
					<PendingResultRow
						key={row.localId}
						row={row}
						onRetry={handleRetry}
						onChoosePhoto={handleChoosePhoto}
					/>
				))}
				{recipes.length === 0 && pending.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No recipes yet — describe a dish above to get started.
					</p>
				) : filteredRecipes.length === 0 && pending.length === 0 ? (
					<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
						No recipes match your filters.
					</p>
				) : (
					filteredRecipes.slice(0, visibleCount).map((recipe) => (
						<RecipeResultRow
							key={recipe.id}
							recipe={recipe}
							onDelete={() => setDeletingRecipeId(recipe.id)}
							onCook={
								recipe.steps.length > 0
									? () =>
											navigate({
												to: "/recipes/$recipeId",
												params: { recipeId: recipe.id },
												search: { autoStart: "cook" },
											})
									: undefined
							}
						/>
					))
				)}
				{hasMore ? <div ref={sentinelRef} aria-hidden="true" /> : null}
			</div>

			{recipes.length === 0 ? (
				<div className="mt-6">
					<h2 className="display-title text-center text-xl font-semibold text-ink">
						Why Cookerist
					</h2>
					<FeatureSection
						className="mt-4"
						onResetData={() => setResetConfirmOpen(true)}
					/>
				</div>
			) : null}

			<footer className="mt-10 border-t border-line pt-7 pb-6 text-sm text-ink-dim">
				{recipes.length > 0 ? (
					<div className="mb-8">
						<h2 className="display-title mb-2.5 text-base font-semibold text-ink">
							Why Cookerist
						</h2>
						<FeatureSection onResetData={() => setResetConfirmOpen(true)} />
					</div>
				) : null}
				<p className="mt-6 text-center text-xs text-ink-dim">
					Cooked up with love by <b>James Limpiado</b>
				</p>
			</footer>

			<ConfirmDialog
				open={resetConfirmOpen}
				title="Reset all data?"
				description="This permanently deletes every recipe, grocery list, and preference saved in this browser. This can't be undone."
				confirmLabel="Reset everything"
				onConfirm={() => {
					setResetConfirmOpen(false);
					handleResetAllData();
				}}
				onCancel={() => setResetConfirmOpen(false)}
			/>
			<ConfirmDialog
				open={deletingRecipeId != null}
				title="Delete this recipe?"
				description={
					deletingRecipeId
						? `"${recipes.find((r) => r.id === deletingRecipeId)?.title}" will be permanently removed.`
						: undefined
				}
				confirmLabel="Delete"
				cancelLabel="Cancel"
				onConfirm={() => {
					if (deletingRecipeId) deleteRecipe(deletingRecipeId);
					setDeletingRecipeId(null);
				}}
				onCancel={() => setDeletingRecipeId(null)}
			/>
		</div>
	);
}
