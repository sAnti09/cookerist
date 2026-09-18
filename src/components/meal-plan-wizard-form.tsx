import { useMutation } from "@tanstack/react-query";
import { Flame } from "lucide-react";
import { useEffect, useState } from "react";
import { MealPlanDateRangePicker } from "#/components/meal-plan-date-range-picker";
import { Button } from "#/components/ui/button";
import { Textarea } from "#/components/ui/textarea";
import {
	applyMealPlanDateRange,
	countPlanDays,
	DEFAULT_MEAL_PLAN_SERVINGS,
	DEFAULT_PLAN_DAYS,
	enabledSlots,
	enumerateDays,
	MAX_PLAN_DAYS,
	MEAL_TYPE_ABBREVIATIONS,
	MEAL_TYPE_LABELS,
	MEAL_TYPES,
	type MealPlan,
	type MealSlotConfig,
	resizeSlotsForDays,
	toggleMealTypeColumn,
	toggleSlotInList,
	toIsoDate,
	totalDishCount,
} from "#/lib/meal-plan";
import { getUserTimezone } from "#/lib/user-region";
import { cn } from "#/lib/utils";
import { generateMealPlanDraft } from "#/server/meal-plan";

const GENERIC_ERROR_MESSAGE =
	"Something went wrong planning that week. Please try again.";

function todayIso(): string {
	return toIsoDate(new Date());
}

function addDaysIso(iso: string, days: number): string {
	const date = new Date(`${iso}T00:00:00`);
	date.setDate(date.getDate() + days);
	return toIsoDate(date);
}

export function MealPlanWizardForm({
	onCreated,
}: {
	onCreated: (plan: MealPlan) => void;
}) {
	// Deliberately NOT initialized via `useState(todayIso)` — that would run
	// during SSR too, baking "today" (the *server's* clock) into the markup
	// TanStack Start sends down. If the client hydrates even a moment later
	// than the server rendered (e.g. straddling local midnight), its own
	// `new Date()` disagrees with the server's, and React throws a hydration
	// mismatch on every date-derived value (the grid, the day count, the
	// date inputs' `min`). Computing "today" only after mount — client-only,
	// same as AppDataProvider's `ready` gate elsewhere in the app — avoids
	// ever sending a server-computed "now" to the client at all.
	const [startDate, setStartDate] = useState<string | null>(null);
	const [endDate, setEndDate] = useState<string | null>(null);
	const [slots, setSlots] = useState<MealSlotConfig[]>([]);
	const [description, setDescription] = useState("");
	const [error, setError] = useState<string | null>(null);
	const mutation = useMutation({
		mutationFn: (input: Parameters<typeof generateMealPlanDraft>[0]["data"]) =>
			generateMealPlanDraft({ data: input }),
	});

	// Runs once on mount only (client-side) — see the state-initialization
	// comment above.
	useEffect(() => {
		const start = todayIso();
		const end = addDaysIso(start, DEFAULT_PLAN_DAYS - 1);
		setStartDate(start);
		setEndDate(end);
		setSlots(resizeSlotsForDays([], enumerateDays(start, end)));
	}, []);

	if (startDate === null || endDate === null) {
		// Renders identically on the server and on the client's first paint
		// (before the mount effect above has run) — no date-derived content on
		// either side, so there's nothing for hydration to disagree about.
		return null;
	}

	const days = enumerateDays(startDate, endDate);
	const dayCount = countPlanDays(startDate, endDate);
	const selectedSlots = enabledSlots(slots);
	const dishCount = totalDishCount(slots);

	// Each handler below re-checks for null even though it's only ever
	// reachable once the component has already returned past the null guard
	// above — TypeScript doesn't carry that outer narrowing into a nested
	// function's closure over startDate/endDate, so this re-check is what
	// actually narrows their type to `string` here (not just a runtime
	// safety net).
	function handleRangeChange(nextStart: string, nextEnd: string) {
		const change = applyMealPlanDateRange(slots, nextStart, nextEnd);
		setStartDate(change.startDate);
		setEndDate(change.endDate);
		setSlots(change.slots);
	}

	function handleToggleCell(day: string, mealType: MealSlotConfig["mealType"]) {
		setSlots((current) => toggleSlotInList(current, day, mealType));
	}

	function handleToggleColumn(mealType: MealSlotConfig["mealType"]) {
		setSlots((current) => toggleMealTypeColumn(current, mealType));
	}

	function handleSubmit() {
		if (startDate === null || endDate === null) return;
		if (dishCount === 0 || mutation.isPending) return;
		setError(null);
		mutation.mutate(
			{
				startDate,
				endDate,
				slots: selectedSlots.map((slot) => ({
					day: slot.day,
					mealType: slot.mealType,
					dishCount: slot.dishCount,
				})),
				description: description.trim(),
				timezone: getUserTimezone(),
			},
			{
				onSuccess: (result) => {
					if (result.type !== "success") {
						setError(result.message);
						return;
					}
					const now = new Date().toISOString();
					const plan: MealPlan = {
						id: crypto.randomUUID(),
						createdAt: now,
						updatedAt: now,
						sharedAt: null,
						ownerId: null,
						startDate,
						endDate,
						description: description.trim(),
						defaultServings: DEFAULT_MEAL_PLAN_SERVINGS,
						status: "draft",
						entries: result.entries.map((entry) => ({
							id: crypto.randomUUID(),
							day: entry.day,
							mealType: entry.mealType,
							slotIndex: entry.slotIndex,
							status: "suggested",
							suggestedTitle: entry.title,
							suggestedOverview: entry.overview,
						})),
						refineInstructions: [],
					};
					onCreated(plan);
				},
				onError: () => setError(GENERIC_ERROR_MESSAGE),
			},
		);
	}

	if (mutation.isPending) {
		return (
			<output className="card mt-5 flex flex-col items-center gap-3 bg-card p-8 text-center">
				<Flame
					className="flame-flicker size-8 text-accent"
					fill="currentColor"
					aria-hidden="true"
				/>
				<p className="text-sm text-ink-dim">Planning your week…</p>
			</output>
		);
	}

	return (
		<div className="mt-2 flex flex-col gap-6 pb-8">
			<div>
				<p className="mb-2 font-semibold text-xs text-ink-dim uppercase tracking-wide">
					Date range
				</p>
				<MealPlanDateRangePicker
					startDate={startDate}
					endDate={endDate}
					onChange={handleRangeChange}
				/>
				<p className="mt-2 text-ink-dim text-xs">
					{dayCount} {dayCount === 1 ? "day" : "days"} · up to {MAX_PLAN_DAYS}{" "}
					days per plan
				</p>
			</div>

			<div>
				<p className="mb-2 font-semibold text-xs text-ink-dim uppercase tracking-wide">
					Meals by day
				</p>
				<div className="overflow-x-auto">
					<div
						className="grid min-w-[340px] gap-1.5"
						style={{
							gridTemplateColumns: `44px repeat(${MEAL_TYPES.length}, minmax(0, 1fr))`,
						}}
					>
						<div />
						{MEAL_TYPES.map((mealType) => {
							const columnSlots = slots.filter(
								(slot) => slot.mealType === mealType,
							);
							const columnAllEnabled =
								columnSlots.length > 0 &&
								columnSlots.every((slot) => slot.enabled);
							return (
								<button
									key={mealType}
									type="button"
									onClick={() => handleToggleColumn(mealType)}
									aria-pressed={columnAllEnabled}
									aria-label={`Toggle ${MEAL_TYPE_LABELS[mealType]} for every day`}
									title={MEAL_TYPE_LABELS[mealType]}
									className={cn(
										"flex items-center justify-center rounded-[10px] border py-1 text-[10px] font-bold transition-colors",
										columnAllEnabled
											? "border-accent/35 bg-accent/10 text-accent"
											: "border-line bg-bg2 text-ink-dim hover:bg-line/40",
									)}
								>
									{MEAL_TYPE_ABBREVIATIONS[mealType]}
								</button>
							);
						})}
						{days.map((day) => (
							<div key={day} className="contents">
								<div className="flex items-center text-[11px] text-ink-dim">
									{new Date(`${day}T00:00:00`).toLocaleDateString(undefined, {
										weekday: "short",
									})}
								</div>
								{MEAL_TYPES.map((mealType) => {
									const slot = slots.find(
										(s) => s.day === day && s.mealType === mealType,
									);
									const enabled = slot?.enabled ?? false;
									const dishCountForCell = slot?.dishCount ?? 0;
									return (
										<button
											key={mealType}
											type="button"
											onClick={() => handleToggleCell(day, mealType)}
											aria-pressed={enabled}
											aria-label={`${MEAL_TYPE_LABELS[mealType]}, ${new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" })}${enabled ? `, ${dishCountForCell} ${dishCountForCell === 1 ? "dish" : "dishes"}` : ", off"}`}
											className={cn(
												"relative flex h-9 items-center justify-center rounded-[10px] border text-xs transition-colors",
												enabled
													? "border-accent/35 bg-accent/10 text-accent"
													: "border-line bg-bg2 text-ink-dim",
											)}
										>
											<span
												className={cn(
													"size-1.5 rounded-full",
													enabled ? "bg-accent" : "bg-line",
												)}
											/>
											{dishCountForCell > 1 ? (
												<span className="absolute top-0.5 right-0.5 flex size-4 items-center justify-center rounded-full bg-accent font-bold text-[9px] text-primary-foreground">
													{dishCountForCell}
												</span>
											) : null}
										</button>
									);
								})}
							</div>
						))}
					</div>
				</div>
				<p className="mt-2 text-ink-dim text-[11px] leading-relaxed">
					{MEAL_TYPES.map(
						(mealType) =>
							`${MEAL_TYPE_ABBREVIATIONS[mealType]} = ${MEAL_TYPE_LABELS[mealType]}`,
					).join(" · ")}
				</p>
				<p className="mt-1 text-ink-dim text-xs leading-relaxed">
					Tap a cell to cycle it off → 1 dish → 2 dishes → off. Tap a column
					header to toggle that meal for every day.
				</p>
			</div>

			<div>
				<label
					htmlFor="meal-plan-description"
					className="mb-2 block font-semibold text-xs text-ink-dim uppercase tracking-wide"
				>
					Describe the week
				</label>
				<Textarea
					id="meal-plan-description"
					value={description}
					onChange={(event) => setDescription(event.target.value)}
					placeholder="Mostly vegetarian, one big Sunday dinner, nothing too spicy for the kids…"
					className="card min-h-20 bg-surface p-3.5"
				/>
			</div>

			{error ? <p className="text-warn text-sm">{error}</p> : null}

			<Button
				onClick={handleSubmit}
				disabled={dishCount === 0}
				className="w-full py-3.5 text-[15px]"
			>
				Generate draft plan
			</Button>
		</div>
	);
}
