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
	type MealPlanEntry,
	type MealPlanEntryDiff,
	type MealPlanEntryDiffDay,
	mealPlanSlotKey,
} from "#/lib/meal-plan";
import { getUserTimezone } from "#/lib/user-region";
import { refineMealPlanDraft } from "#/server/meal-plan";

const GENERIC_ERROR_MESSAGE =
	"Something went wrong refining that plan. Please try again.";

function toDraftEntries(entries: MealPlanEntry[]): MealPlanDraftEntry[] {
	return entries.map((entry) => ({
		day: entry.day,
		mealType: entry.mealType,
		slotIndex: entry.slotIndex,
		title: entry.suggestedTitle,
		overview: entry.suggestedOverview,
	}));
}

// Renders one entry in the draft list, styled per its diff status against
// the plan's preAdjustEntries — the entries as they stood right before this
// re-adjustment of an already-built plan started. A brand-new plan's very
// first draft has no such reference point (there's no previously-built meal
// to compare against, just an initial AI suggestion), so every entry there
// is always treated as freshly "inserted" instead — see MealPlanDraft below.
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
	// and (for "edited") a before → after line differ. Given an accent
	// border + wash, the same treatment "removed" gets with --warn/--warn-wash
	// above, so a changed/new meal is glanceable at the panel level rather
	// than only readable from the small badge text.
	const titleChanged =
		entry.status === "edited" && entry.previousTitle !== entry.title;
	const overviewChanged =
		entry.status === "edited" && entry.previousOverview !== entry.overview;
	return (
		<div className="rounded-[18px] border border-accent/35 bg-accent-wash p-3.5">
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
		const currentEntries = toDraftEntries(plan.entries);
		mutation.mutate(
			{
				currentEntries,
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
					// Diffed against THIS round's input so an "unchanged" slot can
					// keep its existing MealPlanEntry — id, status, recipeId,
					// reused — completely untouched instead of being reset to
					// "suggested" and re-entering the build queue. Without this,
					// every slot re-builds on every refine, since Groq's response
					// always echoes back the full entry list rather than a diff.
					const roundDiffs = diffMealPlanEntries(
						currentEntries,
						result.entries,
					);
					const previousEntriesBySlot = new Map(
						plan.entries.map((entry) => [mealPlanSlotKey(entry), entry]),
					);
					const nextEntries: MealPlanEntry[] = roundDiffs
						.filter((diff) => diff.status !== "removed")
						.map((diff) => {
							if (diff.status === "unchanged") {
								const existing = previousEntriesBySlot.get(
									mealPlanSlotKey(diff),
								);
								if (existing) return existing;
							}
							// "edited" reuses the existing entry's id too (not just
							// "unchanged") — it's still the same conceptual slot, just
							// with new content, so keeping its identity stable across
							// the edit is more honest than minting a fresh one. Only a
							// genuinely new slot ("inserted") gets a fresh id.
							const existingForEdit =
								diff.status === "edited"
									? previousEntriesBySlot.get(mealPlanSlotKey(diff))
									: undefined;
							return {
								id: existingForEdit?.id ?? crypto.randomUUID(),
								day: diff.day,
								mealType: diff.mealType,
								slotIndex: diff.slotIndex,
								status: "suggested",
								suggestedTitle: diff.title,
								suggestedOverview: diff.overview,
							};
						});
					onUpdatePlan({
						...plan,
						entries: nextEntries,
						refineInstructions: [...plan.refineInstructions, trimmed],
					});
					setInstruction("");
				},
				onError: () => setError(GENERIC_ERROR_MESSAGE),
			},
		);
	}

	// Diffed against the plan's own persisted preAdjustEntries — the entries
	// as they stood right before this re-adjustment of an already-built plan
	// started, captured eagerly the moment "Adjust plan" was clicked (see
	// _tabs.meal-plan_.$planId.tsx). Gated on builtBefore, not just on
	// preAdjustEntries being set, so a brand-new plan's very first draft
	// never shows diff highlighting even across several refines — there's no
	// previously-built meal to compare against yet, just one AI suggestion
	// replacing another, so every entry there always reads as freshly
	// "inserted" instead (see the fallback branch below). Living entirely on
	// the plan rather than in local component state means this is a pure
	// function of persisted data and survives navigating away from and back
	// into an in-progress adjustment (a remount of this component) instead
	// of resetting to "nothing changed" the moment that happens.
	const entryDiffs: MealPlanEntryDiff[] | null = plan.builtBefore
		? diffMealPlanEntries(
				toDraftEntries(plan.preAdjustEntries ?? plan.entries),
				toDraftEntries(plan.entries),
			)
		: null;
	const displayDays: MealPlanEntryDiffDay[] = entryDiffs
		? groupMealPlanEntryDiffsByDay(entryDiffs)
		: groupMealPlanEntriesByDay(plan.entries).map(({ day, entries }) => ({
				day,
				entries: entries.map((entry) => ({
					day: entry.day,
					mealType: entry.mealType,
					slotIndex: entry.slotIndex,
					title: entry.suggestedTitle,
					overview: entry.suggestedOverview,
					status: "inserted" as const,
				})),
			}));

	// Re-approving an already-built plan without changing anything would just
	// waste a rebuild — require at least one entry to actually differ from
	// preAdjustEntries first. A brand-new plan's first review has no such
	// requirement: approving its initial suggestions outright is the normal
	// path.
	const approveDisabled =
		plan.builtBefore &&
		!(entryDiffs?.some((diff) => diff.status !== "unchanged") ?? false);

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
