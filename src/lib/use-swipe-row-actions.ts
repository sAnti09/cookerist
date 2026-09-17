import type {
	MouseEvent as ReactMouseEvent,
	TouchEvent as ReactTouchEvent,
} from "react";
import { useRef } from "react";

// Same threshold/axis-dominance approach as cook-mode.tsx's swipe-to-navigate
// gesture decides whether a gesture counts as a deliberate swipe at all.
// Dragging left past this and releasing runs `onSwipeLeft`; dragging right
// past it runs `onSwipeRight`. Either side is optional — a row with nothing
// to do in a direction (e.g. no secondary action) simply can't be dragged
// that way at all, since handleTouchMove clamps that direction to 0. There's
// no intermediate "revealed, tap to trigger" state — releasing past the
// threshold runs the action immediately, and the card always springs back to
// rest either way. Set well past SWIPE_DRAG_CLAMP_PX (the card's own visual
// travel limit) on purpose: the hint panel is already fully revealed by the
// time the card maxes out, and the extra finger travel beyond that — with no
// further visual feedback — is what makes committing feel deliberate rather
// than accidental.
const SWIPE_THRESHOLD_PX = 110;
// How far the card can visually slide while dragging — matches the hint
// panels' own width in the row components that use this hook.
export const SWIPE_DRAG_CLAMP_PX = 72;

// Shared swipe-to-act gesture for a row that's also a navigation `<Link>` —
// used by meal-plan-entry-row.tsx (delete/change) and the recipe/grocery/
// meal-plan list rows (delete, plus cook/shop where applicable). Returns a
// ref for the row's own DOM node plus the touch/click handlers to spread
// onto it; the row component owns the two absolutely-positioned hint panels
// and their styling, since those differ per action (icon/label/color).
export function useSwipeRowActions<T extends HTMLElement>({
	onSwipeLeft,
	onSwipeRight,
}: {
	onSwipeLeft?: () => void;
	onSwipeRight?: () => void;
}) {
	const touchStartRef = useRef<{ x: number; y: number } | null>(null);
	// Whether the in-progress gesture has committed to being a horizontal
	// drag (as opposed to a vertical scroll) — decided once, on the first
	// touchmove that moves far enough to tell the two apart.
	const isDraggingRef = useRef(false);
	// The row's own DOM node, mutated directly (bypassing React state/
	// render) while dragging: touchmove/touchend are prioritized differently
	// by React's scheduler, so driving the live offset through useState risked
	// a stale drag frame landing after touchend had already reset things.
	// Direct DOM writes are synchronous and can't race with anything.
	const rowRef = useRef<T>(null);
	// Set on a recognized swipe's touchend so the synthetic click most
	// browsers fire right after doesn't also trigger the row's own navigation.
	const suppressClickRef = useRef(false);

	function settleToClosed() {
		const el = rowRef.current;
		if (!el) return;
		el.style.transitionDuration = ""; // restore the duration-200 class's timing
		el.style.transform = "translateX(0px)";
	}

	function handleTouchStart(event: ReactTouchEvent<T>) {
		const touch = event.touches[0];
		touchStartRef.current = touch
			? { x: touch.clientX, y: touch.clientY }
			: null;
		isDraggingRef.current = false;
	}

	function handleTouchMove(event: ReactTouchEvent<T>) {
		const start = touchStartRef.current;
		const touch = event.touches[0];
		if (!start || !touch) return;

		const deltaX = touch.clientX - start.x;
		const deltaY = touch.clientY - start.y;
		if (!isDraggingRef.current) {
			if (Math.abs(deltaX) < Math.abs(deltaY)) return; // a scroll, not a swipe
			isDraggingRef.current = true;
		}
		const min = onSwipeLeft ? -SWIPE_DRAG_CLAMP_PX : 0;
		const max = onSwipeRight ? SWIPE_DRAG_CLAMP_PX : 0;
		const next = Math.max(min, Math.min(max, deltaX));
		const el = rowRef.current;
		if (el) {
			// Follows the finger 1:1 with no easing; settling back onto the
			// duration-200 class on release (or cancel) is what animates the
			// spring back to rest.
			el.style.transitionDuration = "0s";
			el.style.transform = `translateX(${next}px)`;
		}
	}

	function handleTouchEnd(event: ReactTouchEvent<T>) {
		const start = touchStartRef.current;
		touchStartRef.current = null;
		const wasDragging = isDraggingRef.current;
		isDraggingRef.current = false;

		// The row only ever moves away from rest via a real drag — a plain
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

		if (deltaX < 0 && onSwipeLeft) {
			suppressClickRef.current = true;
			onSwipeLeft();
		} else if (deltaX > 0 && onSwipeRight) {
			suppressClickRef.current = true;
			onSwipeRight();
		}
	}

	function handleTouchCancel() {
		touchStartRef.current = null;
		if (isDraggingRef.current) settleToClosed();
		isDraggingRef.current = false;
	}

	// A swipe that just triggered an action suppresses the one
	// navigation-triggering click the browser fires right after touchend.
	function handleClick(event: ReactMouseEvent<T>) {
		if (!suppressClickRef.current) return;
		event.preventDefault();
		suppressClickRef.current = false;
	}

	return {
		ref: rowRef,
		handlers: {
			onTouchStart: handleTouchStart,
			onTouchMove: handleTouchMove,
			onTouchEnd: handleTouchEnd,
			onTouchCancel: handleTouchCancel,
			onClick: handleClick,
		},
	};
}
