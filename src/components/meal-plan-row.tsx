import { Link } from "@tanstack/react-router";
import { Trash2, Users } from "lucide-react";
import {
	formatMealPlanDateRange,
	type MealPlan,
	summarizeMealPlanEntries,
} from "#/lib/meal-plan";
import { useSwipeRowActions } from "#/lib/use-swipe-row-actions";

const STATUS_LABELS: Record<MealPlan["status"], string> = {
	draft: "Draft",
	building: "Building",
	ready: "Ready",
};

// Collapsed-only row — tapping navigates to the plan's full-screen detail
// page (/meal-plan/$planId), which renders the wizard-draft/building/ready
// view appropriate to its current status. Same row conventions as
// grocery-list-row.tsx/result-row.tsx: no inline action buttons, only a
// swipe-to-delete gesture (see use-swipe-row-actions.ts) — unlike those two
// rows, a meal plan has no secondary swipe action (nothing analogous to
// Cook/Shop applies at the plan level), so only left-swipe does anything;
// right-swipe is a no-op and never reveals a panel.
export function MealPlanRow({
	plan,
	shared = false,
	onDelete,
}: {
	plan: MealPlan;
	// True when this plan was shared *to* this account by someone else —
	// see CLAUDE.md's "Per-resource sharing" roadmap item.
	shared?: boolean;
	onDelete: () => void;
}) {
	const date = new Date(plan.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const { ready, total } = summarizeMealPlanEntries(plan.entries);
	const swipe = useSwipeRowActions<HTMLAnchorElement>({
		onSwipeLeft: onDelete,
	});

	return (
		<div className="relative overflow-hidden rounded-[18px]">
			<div
				aria-hidden="true"
				className="absolute inset-y-0 right-0 flex w-[72px] flex-col items-center justify-center gap-1 bg-warn text-[11px] font-semibold text-warn-wash"
			>
				<Trash2 className="size-4" aria-hidden="true" />
				Delete
			</div>
			<Link
				ref={swipe.ref}
				to="/meal-plan/$planId"
				params={{ planId: plan.id }}
				id={`meal-plan-${plan.id}`}
				data-testid={`meal-plan-row-${plan.id}`}
				{...swipe.handlers}
				className="card block translate-x-0 scroll-mt-6 bg-card p-4 text-ink no-underline transition-transform duration-200"
			>
				<div className="flex items-center gap-1.5">
					<h3 className="display-title text-lg text-ink">
						{formatMealPlanDateRange(plan.startDate, plan.endDate)}
					</h3>
					{shared ? (
						<Users
							className="size-[15px] shrink-0 text-ink-dim"
							aria-label="Shared with you"
						/>
					) : null}
				</div>
				<div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-ink-dim">
					<span>{date}</span>
					<span className="rounded-[10px] bg-bg2 px-2 py-0.5 font-medium">
						{STATUS_LABELS[plan.status]}
					</span>
					{total > 0 ? (
						<span className="tabular-nums">
							{plan.status === "ready" ? total : `${ready}/${total}`}{" "}
							{total === 1 ? "dish" : "dishes"}
						</span>
					) : null}
				</div>
			</Link>
		</div>
	);
}
