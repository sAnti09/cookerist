import { Check } from "lucide-react";
import type { InputHTMLAttributes, ReactNode } from "react";
import { cn } from "#/lib/utils";

type CheckboxProps = {
	checked: boolean;
	onChange: (checked: boolean) => void;
	label: ReactNode;
	className?: string;
	// "lg" is for Grocery Mode's large, one-handed touch targets — everywhere
	// else uses the default size.
	size?: "default" | "lg";
} & Omit<
	InputHTMLAttributes<HTMLInputElement>,
	"type" | "checked" | "onChange" | "size"
>;

export function Checkbox({
	checked,
	onChange,
	label,
	className,
	size = "default",
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
					"flex shrink-0 items-center justify-center rounded-full border-2 transition-colors peer-focus-visible:ring-2 peer-focus-visible:ring-ring peer-focus-visible:ring-offset-2",
					size === "lg" ? "size-8" : "mt-0.5 size-5",
					checked ? "border-sage bg-sage" : "border-line bg-surface",
				)}
			>
				{checked ? (
					<Check
						className={
							size === "lg" ? "size-4 text-white" : "size-3 text-white"
						}
						strokeWidth={3}
					/>
				) : null}
			</span>
			{label}
		</label>
	);
}
