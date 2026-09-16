import { Check, Flame } from "lucide-react";
import { Button } from "#/components/ui/button";
import {
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	MEAL_TYPE_ABBREVIATIONS,
	type MealPlan,
	summarizeMealPlanEntries,
} from "#/lib/meal-plan";
import { cn } from "#/lib/utils";

export function MealPlanBuilding({
	plan,
	onRetryEntry,
}: {
	plan: MealPlan;
	onRetryEntry: (entryId: string) => void;
}) {
	const summary = summarizeMealPlanEntries(plan.entries);
	const percent =
		summary.total > 0 ? Math.round((summary.ready / summary.total) * 100) : 0;
	const days = groupMealPlanEntriesByDay(plan.entries);

	return (
		<div className="pb-8">
			<output className="flex flex-col items-center gap-2 text-center">
				<Flame
					className="flame-flicker size-7 text-accent"
					fill="currentColor"
					aria-hidden="true"
				/>
				<h2 className="display-title font-semibold text-lg">
					Building your plan…
				</h2>
				<p className="text-ink-dim text-xs">
					Existing recipes are reused instantly — new dishes are generated one
					at a time.
				</p>
			</output>

			<div className="mt-5">
				<div className="mb-2 flex items-center justify-between gap-2 text-sm">
					<span className="font-semibold">
						{summary.ready} of {summary.total} ready
					</span>
					<span className="text-ink-dim text-xs">
						{summary.reused} reused · {summary.generated} generated
						{summary.failed > 0 ? ` · ${summary.failed} failed` : ""}
					</span>
				</div>
				<div
					role="progressbar"
					aria-valuenow={percent}
					aria-valuemin={0}
					aria-valuemax={100}
					className="h-2 w-full overflow-hidden rounded-full bg-bg2"
				>
					<div
						className="h-full rounded-full bg-accent transition-[width] duration-300 ease-out"
						style={{ width: `${percent}%` }}
					/>
				</div>
			</div>

			<div className="mt-4 flex flex-col gap-2.5">
				{days.map(({ day, entries }) => {
					const failedEntry = entries.find(
						(entry) => entry.status === "failed",
					);
					return (
						<div
							key={day}
							className={cn(
								"card flex items-center justify-between gap-3 bg-card p-3.5",
								failedEntry && "border-warn/40 bg-warn-wash",
							)}
						>
							<div>
								<p className="font-semibold text-sm">
									{formatMealPlanDay(day)}
								</p>
								{failedEntry ? (
									<p className="text-warn text-xs">
										{MEAL_TYPE_ABBREVIATIONS[failedEntry.mealType]}:{" "}
										{failedEntry.buildError ?? "Couldn't be generated"}
									</p>
								) : (
									<p className="text-ink-dim text-xs">
										{entries.length} {entries.length === 1 ? "meal" : "meals"}
									</p>
								)}
							</div>
							{failedEntry ? (
								<Button
									variant="secondary"
									className="shrink-0 border-warn text-warn"
									onClick={() => onRetryEntry(failedEntry.id)}
								>
									Retry
								</Button>
							) : (
								<div className="flex shrink-0 gap-1.5">
									{entries.map((entry) => (
										<div
											key={entry.id}
											className="flex flex-col items-center gap-0.5"
										>
											<div
												className={cn(
													"flex size-6 items-center justify-center rounded-full",
													entry.status === "ready"
														? "bg-sage/15 text-sage"
														: "border border-line bg-bg2",
												)}
											>
												{entry.status === "ready" ? (
													<Check className="size-3.5" aria-hidden="true" />
												) : (
													<span className="size-1.5 rounded-full bg-ink-dim/60" />
												)}
											</div>
											<span className="text-[9px] text-ink-dim">
												{MEAL_TYPE_ABBREVIATIONS[entry.mealType]}
											</span>
										</div>
									))}
								</div>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}
