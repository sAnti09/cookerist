import { CalendarRange } from "lucide-react";
import { useState } from "react";
import type { DateRange } from "react-day-picker";
import { Calendar } from "#/components/ui/calendar";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "#/components/ui/popover";
import { formatMealPlanDateRange, toIsoDate } from "#/lib/meal-plan";

function parseIsoDate(iso: string): Date {
	return new Date(`${iso}T00:00:00`);
}

export function MealPlanDateRangePicker({
	startDate,
	endDate,
	onChange,
}: {
	startDate: string;
	endDate: string;
	onChange: (startDate: string, endDate: string) => void;
}) {
	const [open, setOpen] = useState(false);
	// The popover portals into this element rather than document.body — see
	// the sibling <div> below.
	const [portalContainer, setPortalContainer] = useState<HTMLDivElement | null>(
		null,
	);
	// Set the moment a fresh selection's first tap lands; cleared once the
	// second tap completes the range (or the popover closes before that
	// happens). react-day-picker's own range continuation treats a single tap
	// as an already-complete one-day range, so it can't tell "first tap" apart
	// from "second tap" on its own — this is what does, driving the
	// tap-start-then-tap-end (airline-style) flow deterministically instead of
	// relying on that ambiguous built-in heuristic.
	const [draftFrom, setDraftFrom] = useState<Date | null>(null);

	const displayed: DateRange = draftFrom
		? { from: draftFrom, to: draftFrom }
		: { from: parseIsoDate(startDate), to: parseIsoDate(endDate) };

	function handleOpenChange(next: boolean) {
		setOpen(next);
		if (!next) setDraftFrom(null);
	}

	function handleDaySelect(_range: DateRange | undefined, triggerDate: Date) {
		if (!draftFrom) {
			setDraftFrom(triggerDate);
			return;
		}
		const [from, to] =
			triggerDate.getTime() < draftFrom.getTime()
				? [triggerDate, draftFrom]
				: [draftFrom, triggerDate];
		setDraftFrom(null);
		onChange(toIsoDate(from), toIsoDate(to));
		setOpen(false);
	}

	return (
		<Popover open={open} onOpenChange={handleOpenChange}>
			<PopoverTrigger asChild>
				<button
					type="button"
					className="card flex w-full items-center justify-center gap-2 rounded-full bg-surface px-4 py-2.5 text-sm text-ink"
				>
					<CalendarRange className="size-4 text-ink-dim" aria-hidden="true" />
					{formatMealPlanDateRange(startDate, endDate)}
				</button>
			</PopoverTrigger>
			<PopoverContent align="center" container={portalContainer}>
				<Calendar
					mode="range"
					selected={displayed}
					onSelect={handleDaySelect}
					defaultMonth={displayed.from}
				/>
				<p className="mt-1 text-center text-ink-dim text-xs">
					{draftFrom
						? "Now tap the last day"
						: "Tap the first day, then the last day"}
				</p>
			</PopoverContent>
			<div ref={setPortalContainer} />
		</Popover>
	);
}
