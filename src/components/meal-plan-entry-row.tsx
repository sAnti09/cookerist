import { Link } from "@tanstack/react-router";
import { RefreshCcw, Trash2 } from "lucide-react";
import { MEAL_TYPE_LABELS, type MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { useSwipeRowActions } from "#/lib/use-swipe-row-actions";
import { cn } from "#/lib/utils";

export function MealPlanEntryRow({
	entry,
	recipe,
	edited,
	planId,
	onDelete,
	onChangeRecipe,
}: {
	entry: MealPlanEntry;
	recipe: Recipe;
	edited: boolean;
	planId: string;
	onDelete: () => void;
	onChangeRecipe: () => void;
}) {
	const swipe = useSwipeRowActions<HTMLAnchorElement>({
		onSwipeLeft: onDelete,
		onSwipeRight: onChangeRecipe,
	});

	return (
		<div className="relative overflow-hidden rounded-[18px]">
			<div
				aria-hidden="true"
				className="absolute inset-y-0 left-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-accent text-[11px] font-semibold text-primary-foreground"
			>
				<RefreshCcw className="size-4" aria-hidden="true" />
				Change
			</div>
			<div
				aria-hidden="true"
				className="absolute inset-y-0 right-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-warn text-[11px] font-semibold text-warn-wash"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				Delete
			</div>
			<Link
				ref={swipe.ref}
				to="/recipes/$recipeId"
				params={{ recipeId: recipe.id }}
				search={{ from: "meal-plan", planId }}
				data-testid={`meal-plan-entry-${entry.id}`}
				{...swipe.handlers}
				// translate-x-0 never actually moves anything (the drag/rest
				// position is always driven by the separate `transform` property
				// via swipe.ref, not `translate`) — it's here purely so the card has
				// a non-"none" translate value from the very first paint, which
				// per the CSS stacking-context rules gives it its own stacking
				// context. Without that, this plain static-flow element would
				// paint *behind* the absolutely-positioned hint panels above
				// (position:absolute always paints above static siblings,
				// regardless of DOM order) until the first touch interaction set
				// an inline `transform` and created one implicitly.
				className="card block translate-x-0 bg-card p-3.5 text-ink no-underline transition-transform duration-200"
			>
				<div className="flex items-start justify-between gap-2">
					<span className="font-bold text-[10px] text-ink-dim uppercase tracking-wide">
						{MEAL_TYPE_LABELS[entry.mealType]}
					</span>
					<span
						className={cn(
							"inline-flex w-fit shrink-0 items-center rounded-[10px] border px-2 py-0.5 text-[11px]",
							edited
								? "border-accent/40 bg-accent/10 font-semibold text-accent"
								: "border-line text-ink-dim",
						)}
					>
						Servings: {recipe.currentServings}
						{edited ? " · edited" : ""}
					</span>
				</div>
				<p className="mt-1 font-semibold text-sm">{recipe.title}</p>
				<p className="mt-0.5 text-ink-dim text-xs">{recipe.overview}</p>
			</Link>
		</div>
	);
}
