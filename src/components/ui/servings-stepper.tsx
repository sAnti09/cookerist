import type { ChangeEvent } from "react";
import { Button } from "#/components/ui/button";

type ServingsStepperProps = {
	value: number;
	onChange: (value: number) => void;
	min?: number;
};

export function ServingsStepper({
	value,
	onChange,
	min = 1,
}: ServingsStepperProps) {
	function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
		const next = Number(event.target.value);
		if (Number.isFinite(next) && next >= min) {
			onChange(next);
		}
	}

	return (
		<div className="inline-flex items-center gap-2 rounded-full border border-input px-2 py-1">
			<Button
				variant="secondary"
				className="size-7 rounded-full p-0"
				aria-label="Decrease servings"
				onClick={() => onChange(Math.max(min, value - 1))}
			>
				−
			</Button>
			<input
				type="number"
				inputMode="numeric"
				min={min}
				value={value}
				onChange={handleInputChange}
				aria-label="Servings"
				className="w-12 border-0 bg-transparent text-center text-base tabular-nums outline-none [appearance:textfield] sm:text-sm"
			/>
			<Button
				variant="secondary"
				className="size-7 rounded-full p-0"
				aria-label="Increase servings"
				onClick={() => onChange(value + 1)}
			>
				+
			</Button>
		</div>
	);
}
