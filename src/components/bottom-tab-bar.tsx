import { Link, useRouterState } from "@tanstack/react-router";
import { Book, Calendar, ShoppingCart } from "lucide-react";
import { cn } from "#/lib/utils";

// Fixed bottom navigation replacing the old pill ViewToggle — three tabs
// (Recipes / Meal Plan / Grocery) per the nav-overhaul mockup.
export function BottomTabBar() {
	const pathname = useRouterState({
		select: (state) => state.location.pathname,
	});
	const onRecipes = pathname === "/" || pathname.startsWith("/recipes");
	const onMealPlan = pathname.startsWith("/meal-plan");
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
			<Link
				to="/meal-plan"
				aria-current={onMealPlan ? "page" : undefined}
				className={cn(
					"flex flex-1 flex-col items-center gap-1",
					onMealPlan ? "font-semibold text-accent" : "text-ink-dim",
				)}
			>
				<Calendar className="size-[22px]" aria-hidden="true" />
				<span className="text-[11px]">Meal Plan</span>
			</Link>
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
