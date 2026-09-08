import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flame, Plus, Search, Star } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { GroceryListRow } from "#/components/grocery-list-row";
import { PromptForm } from "#/components/prompt-form";
import {
	PendingResultRow,
	type PendingRow,
	RecipeResultRow,
} from "#/components/result-row";
import { Button } from "#/components/ui/button";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import { type ResultsView, ViewToggle } from "#/components/ui/view-toggle";
import { filterRecipes, hasActiveFilters } from "#/lib/filter-recipes";
import type { GroceryList } from "#/lib/grocery-list";
import {
	deleteGroceryList,
	loadGroceryLists,
	setExpandedGroceryList,
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
} from "#/lib/recipes-storage";
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

	// The create flow (recipe selection + custom ingredients) lands in
	// TEST-239; this button satisfies TEST-238 AC6 but isn't wired up yet.
	function handleCreateGroceryList() {}

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
					const recipe = toStoredRecipe(prompt, result.recipe);
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
					<h1 className="display-title flex items-center gap-2 text-4xl font-semibold text-ink">
						<Flame
							className="size-8 text-accent"
							fill="currentColor"
							aria-hidden="true"
						/>
						Cookerist
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
								onToggleExpand={handleToggleExpandGroceryList}
							/>
						))
					)}
				</div>
			</div>
		</>
	);
}
