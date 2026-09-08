import type { TextareaHTMLAttributes } from "react";
import { cn } from "#/lib/utils";

export function Textarea({
	className,
	...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	return (
		<textarea
			className={cn(
				"w-full resize-none bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
