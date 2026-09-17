import { Link } from "@tanstack/react-router";
import { RefreshCcw, Trash2 } from "lucide-react";
import type {
	MouseEvent as ReactMouseEvent,
	TouchEvent as ReactTouchEvent,
} from "react";
import { useEffect, useRef } from "react";
import { MEAL_TYPE_LABELS, type MealPlanEntry } from "#/lib/meal-plan";
import type { Recipe } from "#/lib/recipe";
import { cn } from "#/lib/utils";

// Same threshold/axis-dominance approach as cook-mode.tsx's swipe-to-navigate
// gesture decides whether a *completed* gesture counts as a swipe at all
// (touchend, below); on top of that, touchmove drives a live drag-follow so
// the card visibly slides with the finger instead of only snapping into
// place on release.
const SWIPE_THRESHOLD_PX = 50;
// Two 72px action buttons — how far the card needs to slide to reveal them.
const REVEAL_WIDTH_PX = 144;

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
	// Whether the in-progress gesture has committed to being a horizontal
	// drag (as opposed to a vertical scroll) — decided once, on the first
	// touchmove that moves far enough to tell the two apart.
	const isDraggingRef = useRef(false);
	// The card's own DOM node, mutated directly (bypassing React state/
	// render) while dragging — touchmove fires far more often than React's
	// scheduler is guaranteed to flush a state update, and touchmove/touchend
	// are prioritized differently (continuous vs. discrete), so driving the
	// live offset through useState risked a stale drag frame landing after
	// touchend had already reset things. Direct DOM writes are synchronous
	// and can't race with anything.
	const linkRef = useRef<HTMLAnchorElement>(null);
	// Set on a recognized swipe's touchend so the synthetic click most
	// browsers fire right after doesn't also trigger the Link's navigation.
	const suppressClickRef = useRef(false);

	// The resting position (open/closed) is driven by this same inline
	// `transform`, not a separate Tailwind `translate` utility class — mixing
	// the two caused a visible glitch: clearing the drag's inline `transform`
	// while a class-driven `translate` changed at the same moment made the
	// browser transition each CSS property independently (one fading out
	// from the last drag offset, the other animating in from 0), so the card
	// overshot past the target and eased back rather than sliding cleanly.
	// Keeping everything on `transform` means there's only ever one value
	// being animated.
	function settleToRestingPosition(nextRevealed: boolean) {
		const el = linkRef.current;
		if (!el) return;
		el.style.transitionDuration = ""; // restore the duration-200 class's timing
		el.style.transform = `translateX(${nextRevealed ? -REVEAL_WIDTH_PX : 0}px)`;
	}

	// Keeps the card in sync when `revealed` changes for a reason other than
	// this row's own drag — e.g. the parent closing it because a different
	// entry was swiped open, or the Change/Delete buttons' onClick. A drag
	// ending on this row already calls settleToRestingPosition itself; this
	// effect re-applying the same value right after is a harmless no-op.
	// biome-ignore lint/correctness/useExhaustiveDependencies: settleToRestingPosition is a stable per-render closure over linkRef/REVEAL_WIDTH_PX only, not a value that should re-trigger this effect
	useEffect(() => {
		settleToRestingPosition(revealed);
	}, [revealed]);

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
		const base = revealed ? -REVEAL_WIDTH_PX : 0;
		const next = Math.min(0, Math.max(-REVEAL_WIDTH_PX, base + deltaX));
		const el = linkRef.current;
		if (el) {
			// Follows the finger 1:1 with no easing; settling back onto the
			// duration-200 class on release (or cancel) is what animates the
			// snap into the resting position.
			el.style.transitionDuration = "0s";
			el.style.transform = `translateX(${next}px)`;
		}
	}

	function handleTouchEnd(event: ReactTouchEvent<HTMLAnchorElement>) {
		const start = touchStartRef.current;
		touchStartRef.current = null;
		const wasDragging = isDraggingRef.current;
		isDraggingRef.current = false;

		// Only a real drag ever moved the card away from `revealed`'s resting
		// spot in the first place — a plain tap (isDraggingRef never set) has
		// nothing to settle back from.
		const touch = event.changedTouches[0];
		if (!start || !touch) {
			if (wasDragging) settleToRestingPosition(revealed);
			return;
		}

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		const isSwipe =
			Math.abs(deltaX) >= SWIPE_THRESHOLD_PX &&
			Math.abs(deltaX) >= Math.abs(deltaY);
		const nextRevealed = isSwipe ? deltaX < 0 : revealed;

		if (wasDragging) settleToRestingPosition(nextRevealed);
		if (isSwipe) {
			suppressClickRef.current = true;
			onRevealChange(nextRevealed);
		}
	}

	function handleTouchCancel() {
		touchStartRef.current = null;
		if (isDraggingRef.current) settleToRestingPosition(revealed);
		isDraggingRef.current = false;
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
				// The open/closed position itself is applied imperatively via
				// linkRef (see settleToRestingPosition) rather than a Tailwind
				// translate-x utility class — this class only supplies the
				// transition timing those direct style writes animate against.
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
