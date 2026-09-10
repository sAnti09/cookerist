import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flame, Plus, Search, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FeatureSection } from "#/components/feature-section";
import { GroceryListCreateForm } from "#/components/grocery-list-create-form";
import { GroceryListRow } from "#/components/grocery-list-row";
import { OfflineBanner } from "#/components/offline-banner";
import { PromptForm } from "#/components/prompt-form";
import {
	PendingResultRow,
	type PendingRow,
	RecipeResultRow,
} from "#/components/result-row";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { type ResultsView, ViewToggle } from "#/components/ui/view-toggle";
import { filterRecipes, hasActiveFilters } from "#/lib/filter-recipes";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	saveGroceryList,
	setExpandedGroceryList,
	updateGroceryList,
} from "#/lib/grocery-storage";
import { DIFFICULTY_LABELS, type Difficulty, type Recipe } from "#/lib/recipe";
import {
	deleteRecipe,
	loadRecipes,
	saveRecipe,
	setExpandedRecipe,
	toggleFavoriteRecipe,
	toStoredRecipe,
	updateRecipe,
	updateRecipes,
} from "#/lib/recipes-storage";
import { resetAllData } from "#/lib/reset-all-data";
import { useOnlineStatus } from "#/lib/use-online-status";
import { cn } from "#/lib/utils";
import { generateRecipe } from "#/server/generate-recipe";

export const Route = createFileRoute("/")({ component: Home });

const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish, or listing ingredients you have on hand.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";
const PAGE_SIZE = 10;

export function Home() {
	const isOnline = useOnlineStatus();
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [groceryLists, setGroceryLists] = useState<GroceryList[]>([]);
	const [view, setView] = useState<ResultsView>("recipes");
	const [pending, setPending] = useState<PendingRow[]>([]);
	const [promptValue, setPromptValue] = useState("");
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const [searchQuery, setSearchQuery] = useState("");
	const [difficultyFilter, setDifficultyFilter] = useState<Difficulty | "all">(
		"all",
	);
	const [favoritesOnly, setFavoritesOnly] = useState(false);
	const [creatingGroceryList, setCreatingGroceryList] = useState(false);
	const [editingGroceryList, setEditingGroceryList] =
		useState<GroceryList | null>(null);
	const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
	// Whichever row (recipe or grocery list) most recently became expanded —
	// on a click, or restored from a previous session on load — so it can be
	// scrolled to and focused once it's actually on the page. Holds the row's
	// DOM id (`recipe-<id>` / `grocery-list-<id>`) rather than a bare id so
	// one effect can serve both kinds.
	const [pendingScrollToElementId, setPendingScrollToElementId] = useState<
		string | null
	>(null);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const isInitialFilterMount = useRef(true);
	// Mirrors the latest recipes/groceryLists state so handlers passed to
	// memoized row components (RecipeResultRow, GroceryListRow) can read
	// current state without needing it in their own dependency array — that
	// would otherwise force a new handler reference (and a re-render of every
	// row) on every recipe/grocery-list change.
	const recipesRef = useRef<Recipe[]>(recipes);
	recipesRef.current = recipes;
	const groceryListsRef = useRef<GroceryList[]>(groceryLists);
	groceryListsRef.current = groceryLists;
	const mutation = useMutation({
		mutationFn: (prompt: string) => generateRecipe({ data: prompt }),
	});

	useEffect(() => {
		const loadedRecipes = loadRecipes();
		const loadedGroceryLists = loadGroceryLists();
		setRecipes(loadedRecipes);
		setGroceryLists(loadedGroceryLists);

		// A recipe or grocery list left expanded from a previous session
		// survives the reload (TEST-158) — scroll/focus it back into view once
		// it's on the page. Recipe pagination only renders the first page by
		// default, so make sure it's actually there first; a recipe takes
		// priority since the Recipes tab is the default view on load.
		const expandedRecipeIndex = loadedRecipes.findIndex(
			(recipe) => recipe.expanded,
		);
		if (expandedRecipeIndex !== -1) {
			setVisibleCount((count) => Math.max(count, expandedRecipeIndex + 1));
			setPendingScrollToElementId(
				`recipe-${loadedRecipes[expandedRecipeIndex].id}`,
			);
			return;
		}
		const expandedGroceryList = loadedGroceryLists.find(
			(list) => list.expanded,
		);
		if (expandedGroceryList) {
			setView("grocery");
			setPendingScrollToElementId(`grocery-list-${expandedGroceryList.id}`);
		}
	}, []);

	// Runs again once state changes actually render the target row — on the
	// initial pass right after it's set (a click, or the effect above), it
	// may not be in the DOM yet (pagination hasn't caught up, or the view
	// tab hasn't switched).
	// biome-ignore lint/correctness/useExhaustiveDependencies: recipes/groceryLists/visibleCount/view intentionally retrigger this to re-check the DOM once they render the target row, not read directly
	useEffect(() => {
		if (!pendingScrollToElementId) return;
		const row = document.getElementById(pendingScrollToElementId);
		if (!row) return;
		row.scrollIntoView({ block: "start" });
		// Move focus to the row's own title control (already keyboard-reachable
		// on its own) rather than the row itself, which is a click-only target
		// — this is what actually keeps an expanded panel from getting
		// scrolled/laid out out of view again the next time something above it
		// collapses.
		row.querySelector<HTMLElement>('[role="button"], button')?.focus({
			preventScroll: true,
		});
		setPendingScrollToElementId(null);
	}, [pendingScrollToElementId, recipes, groceryLists, visibleCount, view]);

	const filters = {
		search: searchQuery,
		difficulty: difficultyFilter,
		favoritesOnly,
	};
	const filtersActive = hasActiveFilters(filters);
	// `filters` above is a fresh object every render, so memoizing on it
	// directly would never skip a recompute — depend on its primitive fields
	// instead, so this only reruns the full-list filter when they (or
	// `recipes`) actually change, not on every unrelated re-render.
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally depends on the primitive filter fields rather than the `filters` object (see comment above)
	const filteredRecipes = useMemo(
		() => filterRecipes(recipes, filters),
		[recipes, searchQuery, difficultyFilter, favoritesOnly],
	);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on filter change to reset pagination, not to read the values
	useEffect(() => {
		// Skip the mount run — filters start inactive, so there's nothing to
		// reset yet, and resetting here would stomp on a larger visibleCount
		// the scroll-to-expanded-recipe effect above may have just set.
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

	// The handlers below are wrapped in useCallback with stable (empty, or
	// ref-only) dependencies and use functional setState — they're passed as
	// props into RecipeResultRow/GroceryListRow, which are React.memo'd so
	// only the row that actually changed re-renders. A handler that changed
	// reference on every recipes/groceryLists update would defeat that: every
	// row would see a "new" prop and re-render regardless of memoization.
	const handleDelete = useCallback((id: string) => {
		setRecipes((current) => deleteRecipe(current, id));
	}, []);

	const handleToggleExpand = useCallback((id: string) => {
		const recipe = recipesRef.current.find((r) => r.id === id);
		const expanding = !recipe?.expanded;
		setRecipes((current) => setExpandedRecipe(current, expanding ? id : null));
		// Collapsing whichever recipe was previously expanded can shift this
		// one up or down the page (its content was likely much taller) —
		// scroll/focus it back into view rather than leaving it wherever that
		// reflow happens to land it.
		if (expanding) setPendingScrollToElementId(`recipe-${id}`);
	}, []);

	const handleUpdateRecipe = useCallback((recipe: Recipe) => {
		setRecipes((current) => updateRecipe(current, recipe));
	}, []);

	const handleCreateRecipe = useCallback((recipe: Recipe) => {
		// Expand the newly forked recipe (accordion-style, collapsing whichever
		// one was previously open) — it's prepended to the top of the list, but
		// the viewport may be scrolled elsewhere, so scroll it into view too.
		setRecipes((current) =>
			setExpandedRecipe(saveRecipe(current, recipe), recipe.id),
		);
		setPendingScrollToElementId(`recipe-${recipe.id}`);
	}, []);

	const handleUpdateRecipes = useCallback((recipesToUpdate: Recipe[]) => {
		setRecipes((current) => updateRecipes(current, recipesToUpdate));
	}, []);

	const handleToggleFavorite = useCallback((id: string) => {
		setRecipes((current) => toggleFavoriteRecipe(current, id));
	}, []);

	const handleDeleteGroceryList = useCallback((id: string) => {
		setGroceryLists((current) => deleteGroceryList(current, id));
	}, []);

	const handleToggleExpandGroceryList = useCallback((id: string) => {
		const list = groceryListsRef.current.find((l) => l.id === id);
		const expanding = !list?.expanded;
		setGroceryLists((current) =>
			setExpandedGroceryList(current, expanding ? id : null),
		);
		if (expanding) setPendingScrollToElementId(`grocery-list-${id}`);
	}, []);

	const handleUpdateGroceryList = useCallback((list: GroceryList) => {
		setGroceryLists((current) => updateGroceryList(current, list));
	}, []);

	const handleEditGroceryList = useCallback((list: GroceryList) => {
		setEditingGroceryList(list);
	}, []);

	function handleCreateGroceryList() {
		setCreatingGroceryList(true);
	}

	function handleResetAllData() {
		resetAllData();
		window.location.reload();
	}

	function handleGroceryListSaved(list: GroceryList) {
		setGroceryLists((current) =>
			editingGroceryList
				? updateGroceryList(current, list)
				: saveGroceryList(current, list),
		);
		setCreatingGroceryList(false);
		setEditingGroceryList(null);
	}

	function submit(prompt: string, replaceId?: string) {
		// A search is a Recipes-view action — jump back there so the loading
		// row/result is actually visible, even if the user searched while
		// looking at their Grocery Lists.
		if (view === "grocery") setView("recipes");

		const localId = replaceId ?? crypto.randomUUID();
		setPending((rows) => [
			{ localId, prompt, status: "loading" },
			...rows.filter((row) => row.localId !== localId),
		]);

		mutation
			.mutateAsync(prompt)
			.then((result) => {
				if (result.type === "success") {
					const recipe = toStoredRecipe(
						prompt,
						result.recipe,
						result.truncated,
					);
					setRecipes((current) => saveRecipe(current, recipe));
					setPending((rows) => rows.filter((row) => row.localId !== localId));
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

	// An off-topic rejection means the prompt itself was the problem, so
	// retrying it verbatim would just fail the same way again — instead,
	// drop the notification and hand the prompt back to the search field so
	// the user can rephrase it. Any other error is a generation failure, not
	// a prompt problem, so it retries the same prompt as before.
	function handleRetry(row: PendingRow) {
		if (row.offTopic) {
			setPending((rows) => rows.filter((r) => r.localId !== row.localId));
			setPromptValue(row.prompt);
			return;
		}
		submit(row.prompt, row.localId);
	}

	return (
		<>
			<div className="flex justify-end p-4 sm:sticky sm:top-0 sm:z-20">
				<ThemeToggle />
			</div>
			<div className="mx-auto max-w-2xl p-8 pt-0">
				<div className="flex flex-col items-center text-center">
					<h1
						className="display-title inline-flex items-center text-4xl font-semibold text-ink"
						aria-label="Cookerist"
					>
						<span aria-hidden="true">C</span>
						<span aria-hidden="true">o</span>
						<Flame
							className="flame-flicker-wordmark size-7 shrink-0 text-accent"
							fill="currentColor"
							aria-hidden="true"
						/>
						<span aria-hidden="true">kerist</span>
					</h1>
					<p className="mt-2 text-sm text-ink-dim">
						Tell us what you want to cook — we'll handle the rest.
					</p>
				</div>

				<div className="mt-8">
					<PromptForm
						value={promptValue}
						onChange={setPromptValue}
						onSubmit={submit}
						disabled={!isOnline}
					/>
					<OfflineBanner isOnline={isOnline} />
				</div>

				<div className="mt-8 mb-4">
					<div className="flex flex-wrap items-center justify-between gap-3">
						<div className="flex items-center gap-3">
							<ViewToggle value={view} onChange={setView} />
							<h2 className="display-title text-xl font-semibold text-ink">
								{view === "recipes" ? "Recipes" : "Grocery Lists"}
							</h2>
						</div>
						{view === "grocery" ? (
							<Button
								variant="primary"
								className="gap-1.5"
								onClick={handleCreateGroceryList}
							>
								<Plus className="size-4" aria-hidden="true" />
								Create grocery list
							</Button>
						) : null}
					</div>
					{view === "recipes" && recipes.length > 0 ? (
						<div className="mt-3 flex flex-wrap items-center gap-2">
							<div className="card flex min-w-[180px] flex-1 items-center gap-2 rounded-full bg-surface px-4 py-2">
								<Search
									className="size-4 shrink-0 text-ink-dim"
									aria-hidden="true"
								/>
								<input
									type="search"
									value={searchQuery}
									onChange={(event) => setSearchQuery(event.target.value)}
									placeholder="Search your recipes…"
									aria-label="Search recipes"
									className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-dim sm:text-sm"
								/>
							</div>
							<select
								value={difficultyFilter}
								onChange={(event) =>
									setDifficultyFilter(event.target.value as Difficulty | "all")
								}
								aria-label="Filter by difficulty"
								className="card shrink-0 rounded-full bg-surface px-3 py-2 text-base text-ink outline-none sm:text-sm"
							>
								<option value="all">All difficulties</option>
								{Object.entries(DIFFICULTY_LABELS).map(([value, label]) => (
									<option key={value} value={value}>
										{label}
									</option>
								))}
							</select>
							<Button
								variant={favoritesOnly ? "primary" : "secondary"}
								aria-pressed={favoritesOnly}
								onClick={() => setFavoritesOnly((value) => !value)}
								className="shrink-0 gap-1.5"
							>
								<Star
									className={cn("size-4", favoritesOnly && "fill-current")}
									aria-hidden="true"
								/>
								Favorites
							</Button>
							{filtersActive ? (
								<Button
									variant="secondary"
									className="shrink-0"
									onClick={handleClearFilters}
								>
									Clear filters
								</Button>
							) : null}
						</div>
					) : null}
				</div>
				<div className="flex flex-col gap-3">
					{view === "recipes" ? (
						<>
							{pending.map((row) => (
								<PendingResultRow
									key={row.localId}
									row={row}
									onRetry={handleRetry}
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
								filteredRecipes
									.slice(0, visibleCount)
									.map((recipe) => (
										<RecipeResultRow
											key={recipe.id}
											recipe={recipe}
											onDelete={handleDelete}
											onToggleExpand={handleToggleExpand}
											onToggleFavorite={handleToggleFavorite}
											onUpdate={handleUpdateRecipe}
											onCreateRecipe={handleCreateRecipe}
										/>
									))
							)}
							{hasMore ? <div ref={sentinelRef} aria-hidden="true" /> : null}
						</>
					) : groceryLists.length === 0 ? (
						<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
							No grocery lists yet — create one from your saved recipes.
						</p>
					) : (
						groceryLists.map((list) => (
							<GroceryListRow
								key={list.id}
								list={list}
								recipes={recipes}
								onDelete={handleDeleteGroceryList}
								onEdit={handleEditGroceryList}
								onToggleExpand={handleToggleExpandGroceryList}
								onUpdate={handleUpdateGroceryList}
								onUpdateRecipes={handleUpdateRecipes}
							/>
						))
					)}
				</div>

				{recipes.length === 0 ? (
					<div className="mt-8">
						<h2 className="display-title text-center text-xl font-semibold text-ink">
							Why Cookerist
						</h2>
						<FeatureSection
							className="mt-4"
							onResetData={() => setResetConfirmOpen(true)}
						/>
					</div>
				) : null}

				<footer className="mt-10 border-t border-line pt-7 text-sm text-ink-dim">
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
			</div>
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
			{creatingGroceryList || editingGroceryList ? (
				<GroceryListCreateForm
					recipes={recipes}
					editingList={editingGroceryList ?? undefined}
					onUpdateRecipe={handleUpdateRecipe}
					onSave={handleGroceryListSaved}
					onClose={() => {
						setCreatingGroceryList(false);
						setEditingGroceryList(null);
					}}
				/>
			) : null}
		</>
	);
}
