import type { ButtonHTMLAttributes } from "react";
import { cn } from "#/lib/utils";

type IconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
	size?: "default" | "sm";
};

// Bordered square icon button used in full-screen detail headers (back,
// favorite, modify, delete, edit) — matches the nav-overhaul mockup's
// `.iconbtn`/`.iconbtn-sm`.
export function IconButton({
	className,
	size = "default",
	...props
}: IconButtonProps) {
	return (
		<button
			type="button"
			className={cn(
				"flex shrink-0 items-center justify-center rounded-[10px] border border-line transition-colors hover:bg-bg2 disabled:cursor-not-allowed disabled:opacity-50",
				size === "default" ? "size-9" : "size-[30px]",
				className,
			)}
			{...props}
		/>
	);
}
