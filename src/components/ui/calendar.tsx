import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import * as React from "react";
import {
	type DayButton,
	DayPicker,
	getDefaultClassNames,
} from "react-day-picker";
import { cn } from "#/lib/utils";

function Calendar({
	className,
	classNames,
	showOutsideDays = true,
	components,
	...props
}: React.ComponentProps<typeof DayPicker>) {
	const defaultClassNames = getDefaultClassNames();

	return (
		<DayPicker
			showOutsideDays={showOutsideDays}
			captionLayout="label"
			className={cn(
				"w-fit [--cell-size:2.25rem]",
				defaultClassNames.root,
				className,
			)}
			classNames={{
				months: cn("relative flex flex-col gap-4", defaultClassNames.months),
				month: cn("flex w-full flex-col gap-3", defaultClassNames.month),
				nav: cn(
					"absolute inset-x-0 top-0 flex w-full items-center justify-between",
					defaultClassNames.nav,
				),
				button_previous: cn(
					"flex size-8 items-center justify-center rounded-[10px] border border-line bg-bg2 text-ink-dim transition-colors hover:bg-line/40 disabled:pointer-events-none disabled:opacity-40",
					defaultClassNames.button_previous,
				),
				button_next: cn(
					"flex size-8 items-center justify-center rounded-[10px] border border-line bg-bg2 text-ink-dim transition-colors hover:bg-line/40 disabled:pointer-events-none disabled:opacity-40",
					defaultClassNames.button_next,
				),
				month_caption: cn(
					"flex h-8 w-full items-center justify-center font-semibold text-ink text-sm",
					defaultClassNames.month_caption,
				),
				month_grid: cn("w-full border-collapse", defaultClassNames.month_grid),
				weekdays: cn("flex", defaultClassNames.weekdays),
				weekday: cn(
					"flex-1 select-none text-[11px] text-ink-dim uppercase tracking-wide",
					defaultClassNames.weekday,
				),
				week: cn("mt-1 flex w-full", defaultClassNames.week),
				day: cn(
					"group/day relative aspect-square h-(--cell-size) w-full select-none p-0 text-center",
					defaultClassNames.day,
				),
				range_start: cn(
					"rounded-l-full bg-accent/15",
					defaultClassNames.range_start,
				),
				range_middle: cn(
					"rounded-none bg-accent/15",
					defaultClassNames.range_middle,
				),
				range_end: cn(
					"rounded-r-full bg-accent/15",
					defaultClassNames.range_end,
				),
				today: cn(
					"[&_button]:border [&_button]:border-accent/50",
					defaultClassNames.today,
				),
				outside: cn(
					"text-ink-dim/50 aria-selected:text-ink-dim/50",
					defaultClassNames.outside,
				),
				disabled: cn("text-ink-dim/30 opacity-50", defaultClassNames.disabled),
				hidden: cn("invisible", defaultClassNames.hidden),
				...classNames,
			}}
			components={{
				Chevron: ({ className: chevronClassName, orientation }) =>
					orientation === "left" ? (
						<ChevronLeftIcon className={cn("size-4", chevronClassName)} />
					) : (
						<ChevronRightIcon className={cn("size-4", chevronClassName)} />
					),
				DayButton: CalendarDayButton,
				...components,
			}}
			{...props}
		/>
	);
}

function CalendarDayButton({
	className,
	day,
	modifiers,
	...props
}: React.ComponentProps<typeof DayButton>) {
	const ref = React.useRef<HTMLButtonElement>(null);
	React.useEffect(() => {
		if (modifiers.focused) ref.current?.focus();
	}, [modifiers.focused]);

	const isEndpoint =
		modifiers.selected &&
		(modifiers.range_start || modifiers.range_end || !modifiers.range_middle);

	return (
		<button
			ref={ref}
			type="button"
			data-day={day.date.toLocaleDateString()}
			className={cn(
				"flex size-(--cell-size) items-center justify-center rounded-full font-medium text-ink text-sm transition-colors",
				"focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50",
				isEndpoint ? "bg-accent text-primary-foreground" : "hover:bg-line/40",
				modifiers.disabled && "pointer-events-none opacity-40",
				className,
			)}
			{...props}
		/>
	);
}

export { Calendar, CalendarDayButton };
