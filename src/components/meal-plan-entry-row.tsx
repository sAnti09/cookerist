import { Link } from "@tanstack/react-router";
import { RefreshCcw, Trash2 } from "lucide-react";
import type {
	MouseEvent as ReactMouseEvent,
	TouchEvent as ReactTouchEvent,
} from "react";
import { useRef } from "react";
import { MEAL_TYPE_LABELS, type MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

// Same threshold/axis-dominance approach as cook-mode.tsx's swipe-to-navigate
// gesture, applied here to reveal (rather than immediately trigger) actions.
const SWIPE_THRESHOLD_PX = 50;

export function MealPlanEntryRow({
	entry,
	recipe,
	edited,
	planId,
	revealed,
	onRevealChange,
	onDelete,
	onChangeRecipe,
}: {
	entry: MealPlanEntry;
	recipe: Recipe;
	edited: boolean;
	planId: string;
	revealed: boolean;
	onRevealChange: (revealed: boolean) => void;
	onDelete: () => void;
	onChangeRecipe: () => void;
}) {
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	// Set on a recognized swipe's touchend so the synthetic click most
	// browsers fire right after doesn't also trigger the Link's navigation.
	const suppressClickRef = useRef(false);

	function handleTouchStart(event: ReactTouchEvent<HTMLAnchorElement>) {
		const touch = event.touches[0];
		touchStartRef.current = touch
			? { x: touch.clientX, y: touch.clientY }
			: null;
	}

	function handleTouchEnd(event: ReactTouchEvent<HTMLAnchorElement>) {
		const start = touchStartRef.current;
		touchStartRef.current = null;
		const touch = event.changedTouches[0];
		if (!start || !touch) return;

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (
			Math.abs(deltaX) < SWIPE_THRESHOLD_PX ||
			Math.abs(deltaX) < Math.abs(deltaY)
		) {
			return;
		}
		suppressClickRef.current = true;
		onRevealChange(deltaX < 0);
	}

	// Tapping the card while it's revealed closes it instead of navigating
	// (same "tap elsewhere to dismiss" convention as the reveal itself); a
	// swipe that just finished suppresses the one navigation-triggering click.
	function handleClick(event: ReactMouseEvent<HTMLAnchorElement>) {
		if (suppressClickRef.current) {
			event.preventDefault();
			suppressClickRef.current = false;
			return;
		}
		if (revealed) {
			event.preventDefault();
			onRevealChange(false);
		}
	}

	return (
		<div className="relative overflow-hidden rounded-[18px]">
			<div className="absolute inset-y-0 right-0 flex" aria-hidden={!revealed}>
				<button
					type="button"
					tabIndex={revealed ? 0 : -1}
					aria-label={`Change recipe for ${MEAL_TYPE_LABELS[entry.mealType]}`}
					onClick={() => {
						onRevealChange(false);
						onChangeRecipe();
					}}
					className="flex w-[72px] flex-col items-center justify-center gap-1 bg-accent text-[11px] font-semibold text-primary-foreground"
				>
					<RefreshCcw className="size-4" aria-hidden="true" />
					Change
				</button>
				<button
					type="button"
					tabIndex={revealed ? 0 : -1}
					aria-label={`Remove ${recipe.title} from the meal plan`}
					onClick={() => {
						onRevealChange(false);
						onDelete();
					}}
					className="flex w-[72px] flex-col items-center justify-center gap-1 bg-warn text-[11px] font-semibold text-warn-wash"
				>
					<Trash2 className="size-4" aria-hidden="true" />
					Delete
				</button>
			</div>
			<Link
				to="/recipes/$recipeId"
				params={{ recipeId: recipe.id }}
				search={{ from: "meal-plan", planId }}
				data-testid={`meal-plan-entry-${entry.id}`}
				onTouchStart={handleTouchStart}
				onTouchEnd={handleTouchEnd}
				onClick={handleClick}
				className={cn(
					"card block bg-card p-3.5 text-ink no-underline transition-transform duration-200",
					// -translate-x-36 = 144px, matching the two 72px action buttons
					// below — a static class so Tailwind's build-time scanner can
					// actually see and generate it (a template-literal computed
					// arbitrary value wouldn't be).
					revealed ? "-translate-x-36" : "translate-x-0",
				)}
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
