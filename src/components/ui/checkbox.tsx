import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "#/lib/utils";

type CheckboxProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	className?: string;
} & Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "checked" | "onChange"
>;

export function Checkbox({
	checked,
	onChange,
	label,
	className,
	...inputProps
}: CheckboxProps) {
	return (
		<label
			className={cn(
				"inline-flex cursor-pointer items-start gap-2 align-top text-sm",
				className,
			)}
		>
			<input
				type="checkbox"
				checked={checked}
				onChange={(event) => onChange(event.target.checked)}
				className="peer sr-only"
				{...inputProps}
			/>
			<span
				aria-hidden="true"
				className={cn(
					"mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
					checked ? "border-sage bg-sage" : "border-line bg-surface",
				)}
			>
				{checked ? (
					<Check className="size-3 text-white" strokeWidth={3} />
				) : null}
			</span>
			{label}
		</label>
	);
}
