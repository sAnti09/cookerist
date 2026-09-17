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
// gesture decides whether a gesture counts as a deliberate swipe at all.
// Dragging left past this and releasing deletes the entry (still via the
// same confirmation dialog a tap on a Delete button would have opened);
// dragging right past it opens the change-recipe dialog. There's no
// intermediate "revealed, tap to trigger" state — releasing past the
// threshold runs the action immediately, and the card always springs back
// to rest either way.
const SWIPE_THRESHOLD_PX = 50;
// How far the card can visually slide while dragging (a bit past the
// trigger threshold, so the Change/Delete hint has room to peek out before
// the gesture commits) — matches the hint panels' own width below.
const DRAG_CLAMP_PX = 72;

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
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	// Whether the in-progress gesture has committed to being a horizontal
	// drag (as opposed to a vertical scroll) — decided once, on the first
	// touchmove that moves far enough to tell the two apart.
	const isDraggingRef = useRef(false);
	// The card's own DOM node, mutated directly (bypassing React state/
	// render) while dragging — see the fix in the sibling commit for why:
	// touchmove/touchend are prioritized differently by React's scheduler,
	// so driving the live offset through useState risked a stale drag frame
	// landing after touchend had already reset things. Direct DOM writes are
	// synchronous and can't race with anything.
	const linkRef = useRef<HTMLAnchorElement>(null);
	// Set on a recognized swipe's touchend so the synthetic click most
	// browsers fire right after doesn't also trigger the Link's navigation.
	const suppressClickRef = useRef(false);

	function settleToClosed() {
		const el = linkRef.current;
		if (!el) return;
		el.style.transitionDuration = ""; // restore the duration-200 class's timing
		el.style.transform = "translateX(0px)";
	}

	function handleTouchStart(event: ReactTouchEvent<HTMLAnchorElement>) {
		const touch = event.touches[0];
		touchStartRef.current = touch
			? { x: touch.clientX, y: touch.clientY }
			: null;
		isDraggingRef.current = false;
	}

	function handleTouchMove(event: ReactTouchEvent<HTMLAnchorElement>) {
		const start = touchStartRef.current;
		const touch = event.touches[0];
		if (!start || !touch) return;

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (!isDraggingRef.current) {
			if (Math.abs(deltaX) < Math.abs(deltaY)) return; // a scroll, not a swipe
			isDraggingRef.current = true;
		}
		const next = Math.max(-DRAG_CLAMP_PX, Math.min(DRAG_CLAMP_PX, deltaX));
		const el = linkRef.current;
		if (el) {
			// Follows the finger 1:1 with no easing; settling back onto the
			// duration-200 class on release (or cancel) is what animates the
			// spring back to rest.
			el.style.transitionDuration = "0s";
			el.style.transform = `translateX(${next}px)`;
		}
	}

	function handleTouchEnd(event: ReactTouchEvent<HTMLAnchorElement>) {
		const start = touchStartRef.current;
		touchStartRef.current = null;
		const wasDragging = isDraggingRef.current;
		isDraggingRef.current = false;

		// The card only ever moves away from rest via a real drag — a plain
		// tap (isDraggingRef never set) has nothing to spring back from.
		const touch = event.changedTouches[0];
		if (!start || !touch) {
			if (wasDragging) settleToClosed();
			return;
		}

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		const isSwipe =
			Math.abs(deltaX) >= SWIPE_THRESHOLD_PX &&
			Math.abs(deltaX) >= Math.abs(deltaY);

		if (wasDragging) settleToClosed();
		if (!isSwipe) return;

		suppressClickRef.current = true;
		if (deltaX < 0) onDelete();
		else onChangeRecipe();
	}

	function handleTouchCancel() {
		touchStartRef.current = null;
		if (isDraggingRef.current) settleToClosed();
		isDraggingRef.current = false;
	}

	// A swipe that just triggered Delete/Change suppresses the one
	// navigation-triggering click the browser fires right after touchend.
	function handleClick(event: ReactMouseEvent<HTMLAnchorElement>) {
		if (!suppressClickRef.current) return;
		event.preventDefault();
		suppressClickRef.current = false;
	}

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
				ref={linkRef}
				to="/recipes/$recipeId"
				params={{ recipeId: recipe.id }}
				search={{ from: "meal-plan", planId }}
				data-testid={`meal-plan-entry-${entry.id}`}
				onTouchStart={handleTouchStart}
				onTouchMove={handleTouchMove}
				onTouchEnd={handleTouchEnd}
				onTouchCancel={handleTouchCancel}
				onClick={handleClick}
				className="card block bg-card p-3.5 text-ink no-underline transition-transform duration-200"
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
