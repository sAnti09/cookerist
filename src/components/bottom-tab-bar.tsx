import { Link, useRouterState } from "@tanstack/react-router";
import { Book, Calendar, ShoppingCart } from "lucide-react";
import { cn } from "#/lib/utils";

// Fixed bottom navigation replacing the old pill ViewToggle — three tabs
// (Recipes / Meal Plan / Grocery) per the nav-overhaul mockup. Meal Plan has
// no route yet (confirmed 2026-09-16: ships as a disabled placeholder, not a
// real page) so it's a plain inert button, never a Link.
export function BottomTabBar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const onRecipes = pathname === "/" || pathname.startsWith("/recipes");
	const onGrocery = pathname.startsWith("/grocery");

	return (
		<nav
			aria-label="Primary"
			className="fixed inset-x-0 bottom-0 z-40 flex border-line border-t bg-surface px-2 pt-2.5 shadow-[0_-8px_22px_-18px_rgba(33,28,22,0.25)]"
			style={{
				paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
			}}
		>
			<Link
				to="/recipes"
				aria-current={onRecipes ? "page" : undefined}
				className={cn(
					"flex flex-1 flex-col items-center gap-1",
					onRecipes ? "font-semibold text-accent" : "text-ink-dim",
				)}
			>
				<Book className="size-[22px]" aria-hidden="true" />
				<span className="text-[11px]">Recipes</span>
			</Link>
			<button
				type="button"
				disabled
				aria-disabled="true"
				className="flex flex-1 cursor-not-allowed flex-col items-center gap-1 text-ink-dim/60"
			>
				<Calendar className="size-[22px]" aria-hidden="true" />
				<span className="text-[11px]">Meal Plan</span>
			</button>
			<Link
				to="/grocery"
				aria-current={onGrocery ? "page" : undefined}
				className={cn(
					"flex flex-1 flex-col items-center gap-1",
					onGrocery ? "font-semibold text-accent" : "text-ink-dim",
				)}
			>
				<ShoppingCart className="size-[22px]" aria-hidden="true" />
				<span className="text-[11px]">Grocery</span>
			</Link>
		</nav>
	);
}
