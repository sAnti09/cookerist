import { ChevronDown } from "lucide-react";
import {
	type KeyboardEvent as ReactKeyboardEvent,
	type PointerEvent as ReactPointerEvent,
	useRef,
	useState,
} from "react";
import { cn } from "#/lib/utils";

const PX_PER_STEP = 14;
const DRAG_THRESHOLD_PX = 6;

type ServingsScrubProps = {
	value: number;
	onChange: (value: number) => void;
	min?: number;
	max?: number;
	label: string;
};

// Drag-to-scrub control: press and drag horizontally to change the value —
// left decreases, right increases (the same interaction Figma/Xcode/Blender
// use on numeric fields). Unlike a stepper or slider this has no fixed
// track, so it scales to any range (2 servings or 200) without losing
// precision or growing wider to fit a wide range. Manual typing is
// intentionally left out for now — this replaces the stepper on
// grocery-list-create-form.tsx's selected-recipes row, where width is at a
// premium; arrow keys cover keyboard/AT access in the meantime.
export function ServingsScrub({
	value,
	onChange,
	min = 1,
	max = 999,
	label,
}: ServingsScrubProps) {
	const [dragging, setDragging] = useState(false);
	const [direction, setDirection] = useState<"left" | "right" | null>(null);
	const dragState = useRef<{
		pointerId: number;
		startX: number;
		startValue: number;
	} | null>(null);

	function clamp(next: number) {
		return Math.max(min, Math.min(max, next));
	}

	function handlePointerDown(event: ReactPointerEvent<HTMLButtonElement>) {
		// Guarded — jsdom (our test environment) doesn't implement pointer
		// capture; real browsers do, and that's where we need it (so the drag
		// keeps tracking if the finger/cursor slips off the button).
		event.currentTarget.setPointerCapture?.(event.pointerId);
		dragState.current = {
			pointerId: event.pointerId,
			startX: event.clientX,
			startValue: value,
		};
	}

	function handlePointerMove(event: ReactPointerEvent<HTMLButtonElement>) {
		const drag = dragState.current;
		if (!drag || event.pointerId !== drag.pointerId) return;
		const dx = event.clientX - drag.startX;
		if (!dragging && Math.abs(dx) <= DRAG_THRESHOLD_PX) return;
		if (!dragging) setDragging(true);
		const delta = Math.round(dx / PX_PER_STEP);
		const next = clamp(drag.startValue + delta);
		if (next !== value) onChange(next);
		setDirection(delta < 0 ? "left" : delta > 0 ? "right" : null);
	}

	function endDrag(event: ReactPointerEvent<HTMLButtonElement>) {
		if (dragState.current?.pointerId !== event.pointerId) return;
		dragState.current = null;
		setDragging(false);
		setDirection(null);
	}

	function handleKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
		if (event.key === "ArrowRight") {
			event.preventDefault();
			onChange(clamp(value + 1));
		} else if (event.key === "ArrowLeft") {
			event.preventDefault();
			onChange(clamp(value - 1));
		}
	}

	return (
		<button
			type="button"
			className={cn(
				"inline-flex min-w-14 shrink-0 touch-pan-y items-center justify-center gap-0.5 rounded-full border border-line bg-bg2 px-2 py-1.5 select-none",
				"cursor-[ew-resize] transition-colors",
				dragging && "border-accent bg-accent/10",
			)}
			aria-label={`${label}, currently ${value}. Drag left or right to adjust.`}
			onPointerDown={handlePointerDown}
			onPointerMove={handlePointerMove}
			onPointerUp={endDrag}
			onPointerCancel={endDrag}
			onKeyDown={handleKeyDown}
		>
			<ChevronDown
				className={cn(
					"size-2.5 shrink-0 rotate-90 text-ink-dim/60 transition-opacity",
					dragging && direction === "left" && "text-accent opacity-100",
				)}
				aria-hidden="true"
			/>
			<span className="min-w-[1.2em] text-center text-sm font-semibold tabular-nums">
				{value}
			</span>
			<ChevronDown
				className={cn(
					"size-2.5 shrink-0 -rotate-90 text-ink-dim/60 transition-opacity",
					dragging && direction === "right" && "text-accent opacity-100",
				)}
				aria-hidden="true"
			/>
		</button>
	);
}
