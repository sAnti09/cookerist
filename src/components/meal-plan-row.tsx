import { Link } from "@tanstack/react-router";
import {
	formatMealPlanDateRange,
	type MealPlan,
	summarizeMealPlanEntries,
} from "#/lib/meal-plan";

const STATUS_LABELS: Record<MealPlan["status"], string> = {
	draft: "Draft",
	building: "Building",
	ready: "Ready",
};

// Collapsed-only row — tapping navigates to the plan's full-screen detail
// page (/meal-plan/$planId), which renders the wizard-draft/building/ready
// view appropriate to its current status. Same row conventions as
// grocery-list-row.tsx/result-row.tsx: no inline actions, those live on the
// detail screen's header.
export function MealPlanRow({ plan }: { plan: MealPlan }) {
	const date = new Date(plan.createdAt).toLocaleDateString(undefined, {
		year: "numeric",
		month: "short",
		day: "numeric",
	});
	const { ready, total } = summarizeMealPlanEntries(plan.entries);

	return (
		<Link
			to="/meal-plan/$planId"
			params={{ planId: plan.id }}
			id={`meal-plan-${plan.id}`}
			data-testid={`meal-plan-row-${plan.id}`}
			className="card block scroll-mt-6 bg-card p-4 text-ink no-underline transition-colors hover:bg-bg2"
		>
			<h3 className="display-title text-lg text-ink">
				{formatMealPlanDateRange(plan.startDate, plan.endDate)}
			</h3>
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
	);
}
