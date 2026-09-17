import { useCanGoBack, useRouter } from "@tanstack/react-router";

// Prefers a true history "back" (a POP) over navigate({ to: ... }) so the
// router's scroll restoration can find the previous page's saved position.
// navigate({ to }) always PUSHes a brand-new history entry with no scroll
// saved under it — which is why an in-app back button used to reset scroll
// to the top on the recipes/grocery/meal-plan list even though the OS-level
// swipe-back gesture (also a POP, reusing the original list entry) restored
// it correctly. Falls back to `fallback` only when there's nothing in this
// tab's session history to go back to (e.g. the detail page was opened
// directly — a deep link or a fresh tab — rather than via in-app
// navigation), where a real back() would leave the app or do nothing.
export function useGoBack() {
	const router = useRouter();
	const canGoBack = useCanGoBack();
	return function goBack(fallback: () => void) {
		if (canGoBack) {
			router.history.back();
			return;
		}
		fallback();
	};
}
