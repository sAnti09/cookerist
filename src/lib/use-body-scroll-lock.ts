import { useEffect } from "react";

// Module-level, not per-hook-instance — so nested/sibling dialogs (e.g. a
// confirm dialog opened from inside another dialog) share one lock instead of
// fighting over document.body.style. Only the first lock captures the
// pre-lock styles/scroll position, and only the release that brings the
// count back to 0 restores them.
let lockCount = 0;
let previousStyles: {
	position: string;
	top: string;
	width: string;
	overflow: string;
} | null = null;
let previousScrollY = 0;

function lockBodyScroll() {
	if (lockCount === 0) {
		const body = document.body;
		previousScrollY = window.scrollY;
		previousStyles = {
			position: body.style.position,
			top: body.style.top,
			width: body.style.width,
			overflow: body.style.overflow,
		};
		body.style.position = "fixed";
		body.style.top = `-${previousScrollY}px`;
		body.style.width = "100%";
		body.style.overflow = "hidden";
	}
	lockCount += 1;
}

function unlockBodyScroll() {
	lockCount -= 1;
	if (lockCount === 0 && previousStyles) {
		const body = document.body;
		body.style.position = previousStyles.position;
		body.style.top = previousStyles.top;
		body.style.width = previousStyles.width;
		body.style.overflow = previousStyles.overflow;
		window.scrollTo(0, previousScrollY);
		previousStyles = null;
	}
}

// Locks page scroll for as long as `active` is true. Every dialog/full-screen
// overlay in the app uses this: a fixed-position overlay doesn't stop the
// page underneath from scrolling on its own — most visibly on iOS, where a
// swipe/drag inside the overlay can rubber-band the body behind it instead of
// (or in addition to) being handled by the overlay's own control, which is
// exactly what broke the servings-scrub drag gesture inside
// grocery-list-create-form.tsx before this existed.
export function useBodyScrollLock(active: boolean) {
	useEffect(() => {
		if (!active) return;
		lockBodyScroll();
		return unlockBodyScroll;
	}, [active]);
}
