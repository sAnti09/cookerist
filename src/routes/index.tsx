import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flame, Plus, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GroceryListCreateForm } from "#/components/grocery-list-create-form";
import { GroceryListRow } from "#/components/grocery-list-row";
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
import { cn } from "#/lib/utils";
import { generateRecipe } from "#/server/generate-recipe";

export const Route = createFileRoute("/")({ component: Home });

const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish you'd like to make.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";
const PAGE_SIZE = 10;

export function Home() {
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [groceryLists, setGroceryLists] = useState<GroceryList[]>([]);
	const [view, setView] = useState<ResultsView>("recipes");
	const [pending, setPending] = useState<PendingRow[]>([]);
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
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const mutation = useMutation({
		mutationFn: (prompt: string) => generateRecipe({ data: prompt }),
	});

	useEffect(() => {
		setRecipes(loadRecipes());
		setGroceryLists(loadGroceryLists());
	}, []);

	const filters = {
		search: searchQuery,
		difficulty: difficultyFilter,
		favoritesOnly,
	};
	const filtersActive = hasActiveFilters(filters);
	const filteredRecipes = filterRecipes(recipes, filters);

	// biome-ignore lint/correctness/useExhaustiveDependencies: intentionally re-runs on filter change to reset pagination, not to read the values
	useEffect(() => {
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

	function handleDelete(id: string) {
		setRecipes(deleteRecipe(id));
	}

	function handleToggleExpand(id: string) {
		const recipe = recipes.find((r) => r.id === id);
		setRecipes(setExpandedRecipe(recipe?.expanded ? null : id));
	}

	function handleUpdateRecipe(recipe: Recipe) {
		setRecipes(updateRecipe(recipe));
	}

	function handleUpdateRecipes(recipesToUpdate: Recipe[]) {
		setRecipes(updateRecipes(recipesToUpdate));
	}

	function handleToggleFavorite(id: string) {
		setRecipes(toggleFavoriteRecipe(id));
	}

	function handleDeleteGroceryList(id: string) {
		setGroceryLists(deleteGroceryList(id));
	}

	function handleToggleExpandGroceryList(id: string) {
		const list = groceryLists.find((l) => l.id === id);
		setGroceryLists(setExpandedGroceryList(list?.expanded ? null : id));
	}

	function handleUpdateGroceryList(list: GroceryList) {
		setGroceryLists(updateGroceryList(list));
	}

	function handleCreateGroceryList() {
		setCreatingGroceryList(true);
	}

	function handleEditGroceryList(list: GroceryList) {
		setEditingGroceryList(list);
	}

	function handleResetAllData() {
		resetAllData();
		window.location.reload();
	}

	function handleGroceryListSaved(list: GroceryList) {
		setGroceryLists(
			editingGroceryList ? updateGroceryList(list) : saveGroceryList(list),
		);
		setCreatingGroceryList(false);
		setEditingGroceryList(null);
	}

	function submit(prompt: string, replaceId?: string) {
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
					setRecipes(saveRecipe(recipe));
					setPending((rows) => rows.filter((row) => row.localId !== localId));
					return;
				}

				const message =
					result.type === "off_topic" ? OFF_TOPIC_MESSAGE : result.message;
				setPending((rows) =>
					rows.map((row) =>
						row.localId === localId
							? { ...row, status: "error", message }
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

	return (
		<>
			<div className="sticky top-0 z-20 flex justify-end p-4">
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
					<PromptForm onSubmit={submit} />
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
									className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
								/>
							</div>
							<select
								value={difficultyFilter}
								onChange={(event) =>
									setDifficultyFilter(event.target.value as Difficulty | "all")
								}
								aria-label="Filter by difficulty"
								className="card shrink-0 rounded-full bg-surface px-3 py-2 text-sm text-ink outline-none"
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
									onRetry={submit}
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

				<footer className="mt-10 border-t border-line pt-7 text-sm text-ink-dim">
					<h2 className="display-title mb-2.5 text-base font-semibold text-ink">
						FAQ
					</h2>
					<div className="flex flex-col gap-4">
						<div>
							<p className="font-semibold text-ink">Is my data private?</p>
							<p className="mt-1">
								Yes. Every recipe, grocery list, and setting lives only in this
								browser's local storage — nothing is sent to or saved on a
								server, and Cookerist has no accounts or sign-in.
							</p>
						</div>
						<div>
							<p className="font-semibold text-ink">
								Can I use Cookerist on my phone?
							</p>
							<p className="mt-1">
								Yes — Cookerist installs like a native app on Android and iOS
								straight from your browser, no app store required.
							</p>
							<ul className="mt-2 list-disc space-y-1 pl-5">
								<li>
									<span className="font-medium text-ink">
										Android (Chrome):
									</span>{" "}
									open this page, tap the ⋮ menu, then choose "Install app" (or
									"Add to Home screen").
								</li>
								<li>
									<span className="font-medium text-ink">iOS (Safari):</span>{" "}
									open this page, tap the Share icon, then choose "Add to Home
									Screen".
								</li>
							</ul>
						</div>
						<div>
							<p className="font-semibold text-ink">
								What happens to my data if I remove the app?
							</p>
							<p className="mt-1">
								On mobile, uninstalling Cookerist deletes its local storage
								along with it, so every saved recipe and grocery list goes too.
								You can also{" "}
								<button
									type="button"
									className="font-medium text-accent underline underline-offset-2 hover:text-ink"
									onClick={() => setResetConfirmOpen(true)}
								>
									reset all data
								</button>{" "}
								right now, which clears everything Cookerist has saved in this
								browser.
							</p>
						</div>
					</div>
					<p className="mt-6 text-center text-xs text-ink-dim">
						Cooked up with love by James Limpiado
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
