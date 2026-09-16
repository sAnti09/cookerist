import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import type { MealPlanDraftEntry } from "#/lib/groq/schema";
import {
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	MEAL_TYPE_LABELS,
	type MealPlan,
} from "#/lib/meal-plan";
import { getUserTimezone } from "#/lib/user-region";
import { refineMealPlanDraft } from "#/server/meal-plan";

const GENERIC_ERROR_MESSAGE =
	"Something went wrong refining that plan. Please try again.";

function toDraftEntries(plan: MealPlan): MealPlanDraftEntry[] {
	return plan.entries.map((entry) => ({
		day: entry.day,
		mealType: entry.mealType,
		slotIndex: entry.slotIndex,
		title: entry.suggestedTitle,
		overview: entry.suggestedOverview,
	}));
}

export function MealPlanDraft({
	plan,
	onUpdatePlan,
	onApprove,
	onDiscard,
}: {
	plan: MealPlan;
	onUpdatePlan: (plan: MealPlan) => void;
	onApprove: () => void;
	onDiscard: () => void;
}) {
	const [instruction, setInstruction] = useState("");
	const [error, setError] = useState<string | null>(null);
	// Resets to false every time this component mounts fresh — which happens
	// exactly when the route switches into rendering it, i.e. once per
	// "enter draft" transition (a brand-new plan's first review, or an
	// already-built plan's "Adjust plan"). Only matters for the latter: see
	// approveDisabled below.
	const [hasRefined, setHasRefined] = useState(false);
	const mutation = useMutation({
		mutationFn: (input: {
			currentEntries: MealPlanDraftEntry[];
			instruction: string;
			description?: string;
			timezone?: string;
		}) => refineMealPlanDraft({ data: input }),
	});
	const days = groupMealPlanEntriesByDay(plan.entries);

	function handleRefine() {
		const trimmed = instruction.trim();
		if (!trimmed || mutation.isPending) return;
		setError(null);
		mutation.mutate(
			{
				currentEntries: toDraftEntries(plan),
				instruction: trimmed,
				description: plan.description,
				timezone: getUserTimezone(),
			},
			{
				onSuccess: (result) => {
					if (result.type !== "success") {
						setError(result.message);
						return;
					}
					onUpdatePlan({
						...plan,
						entries: result.entries.map((entry) => ({
							id: crypto.randomUUID(),
							day: entry.day,
							mealType: entry.mealType,
							slotIndex: entry.slotIndex,
							status: "suggested",
							suggestedTitle: entry.title,
							suggestedOverview: entry.overview,
						})),
						refineInstructions: [...plan.refineInstructions, trimmed],
					});
					setInstruction("");
					setHasRefined(true);
				},
				onError: () => setError(GENERIC_ERROR_MESSAGE),
			},
		);
	}

	// Re-approving an already-built plan without changing anything would just
	// waste a rebuild — require at least one successful refine first. A
	// brand-new plan's first review has no such requirement: approving its
	// initial suggestions outright is the normal path.
	const approveDisabled = plan.builtBefore && !hasRefined;

	return (
		<div className="pb-32">
			{plan.description ? (
				<p className="mb-4 text-ink-dim text-sm italic">"{plan.description}"</p>
			) : null}

			<div className="flex flex-col gap-5">
				{days.map(({ day, entries }) => (
					<div key={day}>
						<p className="mb-2 font-semibold text-ink-dim text-xs">
							{formatMealPlanDay(day)}
						</p>
						<div className="flex flex-col gap-2">
							{entries.map((entry) => (
								<div
									key={entry.id}
									className="rounded-[18px] border border-accent/35 bg-accent/[0.06] p-3.5"
								>
									<span className="font-bold text-[10px] text-accent uppercase tracking-wide">
										Suggested · {MEAL_TYPE_LABELS[entry.mealType]}
									</span>
									<p className="mt-1 font-semibold text-ink text-sm">
										{entry.suggestedTitle}
									</p>
									<p className="mt-0.5 text-ink-dim text-xs">
										{entry.suggestedOverview}
									</p>
								</div>
							))}
						</div>
					</div>
				))}
			</div>

			{error ? <p className="mt-4 text-warn text-sm">{error}</p> : null}

			<div className="fixed inset-x-0 bottom-0 z-40 flex flex-col gap-3 border-line border-t bg-bg px-5 pt-3.5 shadow-[0_-8px_22px_-18px_rgba(33,28,22,0.25)]">
				<form
					onSubmit={(event) => {
						event.preventDefault();
						handleRefine();
					}}
					className="card flex items-center gap-2 rounded-full bg-surface py-1.5 pr-1.5 pl-4"
				>
					<input
						type="text"
						value={instruction}
						onChange={(event) => setInstruction(event.target.value)}
						placeholder="For Tuesday, make it vegan…"
						aria-label="Describe a change to this plan"
						disabled={mutation.isPending}
						className="min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-ink-dim"
					/>
					<button
						type="submit"
						aria-label="Refine plan"
						disabled={mutation.isPending || instruction.trim().length === 0}
						className="flex size-8 shrink-0 items-center justify-center rounded-full bg-accent text-primary-foreground disabled:opacity-50"
					>
						<ArrowRight className="size-3.5" aria-hidden="true" />
					</button>
				</form>
				<div
					style={{
						paddingBottom: "calc(0.875rem + env(safe-area-inset-bottom, 0px))",
					}}
				>
					{approveDisabled ? (
						<p className="mb-2 text-center text-ink-dim text-xs">
							Describe a change above before rebuilding, or cancel to go back.
						</p>
					) : null}
					<div className="flex gap-2.5">
						<Button
							onClick={onApprove}
							disabled={approveDisabled}
							className="flex-1 py-3"
						>
							Approve &amp; build
						</Button>
						<Button
							variant="secondary"
							onClick={onDiscard}
							className="flex-1 py-3"
						>
							{plan.builtBefore ? "Cancel" : "Discard"}
						</Button>
					</div>
				</div>
			</div>
		</div>
	);
}
