import { useMutation } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { PromptForm } from "#/components/prompt-form";
import {
	PendingResultRow,
	type PendingRow,
	RecipeResultRow,
} from "#/components/result-row";
import { ThemeToggle } from "#/components/ui/theme-toggle";
import type { Recipe } from "#/lib/recipe";
import {
	deleteRecipe,
	loadRecipes,
	saveRecipe,
	setExpandedRecipe,
	toggleFavoriteRecipe,
	toStoredRecipe,
	updateRecipe,
} from "#/lib/recipes-storage";
import { generateRecipe } from "#/server/generate-recipe";

export const Route = createFileRoute("/")({ component: Home });

const OFF_TOPIC_MESSAGE =
	"That doesn't look like a cooking request — try describing a specific dish you'd like to make.";
const GENERIC_ERROR_MESSAGE =
	"Something went wrong generating that recipe. Please try again.";
const PAGE_SIZE = 10;

export function Home() {
	const [recipes, setRecipes] = useState<Recipe[]>([]);
	const [pending, setPending] = useState<PendingRow[]>([]);
	const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
	const sentinelRef = useRef<HTMLDivElement | null>(null);
	const mutation = useMutation({
		mutationFn: (prompt: string) => generateRecipe({ data: prompt }),
	});

	useEffect(() => {
		setRecipes(loadRecipes());
	}, []);

	const hasMore = visibleCount < recipes.length;

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

				{recipes.length > 0 ? (
					<h2 className="display-title mt-8 mb-4 text-xl font-semibold text-ink">
						Your recipes
					</h2>
				) : null}
				<div
					className={
						recipes.length > 0
							? "flex flex-col gap-3"
							: "mt-8 flex flex-col gap-3"
					}
				>
					{pending.map((row) => (
						<PendingResultRow key={row.localId} row={row} onRetry={submit} />
					))}
					{recipes.length === 0 && pending.length === 0 ? (
						<p className="card border-dashed bg-card p-6 text-center text-sm text-ink-dim">
							No recipes yet — describe a dish above to get started.
						</p>
					) : (
						recipes
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
				</div>
			</div>
		</>
	);
}
