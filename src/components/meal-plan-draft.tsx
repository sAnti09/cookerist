import { useMutation } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { Button } from "#/components/ui/button";
import type { MealPlanDraftEntry } from "#/lib/groq/schema";
import {
	diffMealPlanEntries,
	formatMealPlanDay,
	groupMealPlanEntriesByDay,
	groupMealPlanEntryDiffsByDay,
	MEAL_TYPE_LABELS,
	type MealPlan,
	type MealPlanEntryDiff,
	type MealPlanEntryDiffDay,
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

// Renders one entry in the draft list, styled per its diff status against
// the original entries this draft session opened with (or, before any
// refine has happened yet, every entry is treated as freshly "inserted" —
// see MealPlanDraft below).
function MealPlanDiffEntryCard({ entry }: { entry: MealPlanEntryDiff }) {
	const label = MEAL_TYPE_LABELS[entry.mealType];

	if (entry.status === "unchanged") {
		return (
			<div className="rounded-[18px] border border-line bg-surface p-3.5">
				<span className="font-bold text-[10px] text-ink-dim uppercase tracking-wide">
					{label}
				</span>
				<p className="mt-1 font-semibold text-ink text-sm">{entry.title}</p>
				<p className="mt-0.5 text-ink-dim text-xs">{entry.overview}</p>
			</div>
		);
	}

	if (entry.status === "removed") {
		return (
			<div className="rounded-[18px] border border-warn/35 bg-warn-wash p-3.5">
				<span className="font-bold text-[10px] text-warn uppercase tracking-wide">
					Deleted · {label}
				</span>
				<p className="mt-1 font-semibold text-sm text-warn line-through">
					{entry.title}
				</p>
				<p className="mt-0.5 text-warn/70 text-xs line-through">
					{entry.overview}
				</p>
			</div>
		);
	}

	// "edited" and "inserted" share this card shape — only the badge label
	// and (for "edited") a before → after line differ. Same neutral
	// background/border as the "unchanged" card (per the app's own card
	// rule: cards are separated by a border + shadow, never a contrasting
	// fill) — the accent color lives only in the label text.
	const titleChanged =
		entry.status === "edited" && entry.previousTitle !== entry.title;
	const overviewChanged =
		entry.status === "edited" && entry.previousOverview !== entry.overview;
	return (
		<div className="rounded-[18px] border border-line bg-surface p-3.5">
			<span className="font-bold text-[10px] text-accent uppercase tracking-wide">
				{entry.status === "edited" ? "Edited" : "Suggested"} · {label}
			</span>
			{titleChanged ? (
				<p className="mt-1 text-sm">
					<span className="text-ink-dim text-xs line-through">
						{entry.previousTitle}
					</span>{" "}
					→ <span className="font-semibold text-ink">{entry.title}</span>
				</p>
			) : (
				<p className="mt-1 font-semibold text-ink text-sm">{entry.title}</p>
			)}
			{overviewChanged ? (
				<p className="mt-0.5 text-xs">
					<span className="text-ink-dim line-through">
						{entry.previousOverview}
					</span>{" "}
					→ <span className="text-ink-dim">{entry.overview}</span>
				</p>
			) : (
				<p className="mt-0.5 text-ink-dim text-xs">{entry.overview}</p>
			)}
		</div>
	);
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
	// The entries as they stood the moment this draft session opened —
	// captured once via the lazy initializer, never updated again — so every
	// refine round's diff is always measured against the original plan (a
	// brand-new plan's first suggestions, or an already-built plan's
	// pre-adjustment entries), not just the round before it. That way a
	// slot edited twice in a row still shows one before → after span from
	// the true original, and a slot edited then reverted back to its
	// original value correctly reads as unchanged rather than "edited".
	const [baselineEntries] = useState<MealPlanDraftEntry[]>(() =>
		toDraftEntries(plan),
	);
	// Set once the first refine of this draft session completes — the diff
	// of the baseline above against the latest refine result, grouped by
	// day. Null before any refine has happened, in which case every entry
	// just renders as freshly "inserted" (see displayDays below) — there's
	// nothing to diff the original entries against yet.
	const [diffDays, setDiffDays] = useState<MealPlanEntryDiffDay[] | null>(null);
	const mutation = useMutation({
		mutationFn: (input: {
			currentEntries: MealPlanDraftEntry[];
			instruction: string;
			description?: string;
			timezone?: string;
		}) => refineMealPlanDraft({ data: input }),
	});

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
					setDiffDays(
						groupMealPlanEntryDiffsByDay(
							diffMealPlanEntries(baselineEntries, result.entries),
						),
					);
					setInstruction("");
					setHasRefined(true);
				},
				onError: () => setError(GENERIC_ERROR_MESSAGE),
			},
		);
	}

	// Before any refine in this session, an already-built plan's "Adjust
	// plan" re-entry starts from its existing entries, not new suggestions —
	// so it should read as the default/unchanged style from the first paint
	// (there's nothing to highlight until a refine actually changes
	// something). A brand-new plan's first review has no such prior state,
	// so its initial entries are genuinely new and keep the "Suggested"
	// treatment.
	const initialEntryStatus = plan.builtBefore ? "unchanged" : "inserted";
	const displayDays: MealPlanEntryDiffDay[] =
		diffDays ??
		groupMealPlanEntriesByDay(plan.entries).map(({ day, entries }) => ({
			day,
			entries: entries.map((entry) => ({
				day: entry.day,
				mealType: entry.mealType,
				slotIndex: entry.slotIndex,
				title: entry.suggestedTitle,
				overview: entry.suggestedOverview,
				status: initialEntryStatus,
			})),
		}));

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
				{displayDays.map(({ day, entries }) => (
					<div key={day}>
						<p className="mb-2 font-semibold text-ink-dim text-xs">
							{formatMealPlanDay(day)}
						</p>
						<div className="flex flex-col gap-2">
							{entries.map((entry) => (
								<MealPlanDiffEntryCard
									key={`${entry.day}|${entry.mealType}|${entry.slotIndex}`}
									entry={entry}
								/>
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
