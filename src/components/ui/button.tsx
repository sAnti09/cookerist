import type { ButtonHTMLAttributes } from "react";
import { cn } from "#/lib/utils";

export type ButtonVariant = "primary" | "secondary";

export function Button({
	className,
	variant = "primary",
	...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
	return (
		<button
			type="button"
			className={cn(
				"inline-flex items-center justify-center rounded-full px-4 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
				variant === "primary"
					? "bg-primary text-primary-foreground hover:opacity-90"
					: "border border-input bg-transparent hover:bg-secondary",
				className,
			)}
			{...props}
		/>
	);
}
