import { type TextareaHTMLAttributes, useLayoutEffect, useRef } from "react";
import { cn } from "#/lib/utils";

// Grows to fit its content (e.g. a pasted ingredient list) instead of
// scrolling internally, up to a cap beyond which it scrolls like a normal
// textarea. `min-h-11` (below) reserves enough room for a two-line
// placeholder to show in full while the field is empty — scrollHeight only
// reflects the actual value, never the placeholder, so growth driven by
// typed content starts from that floor rather than from a bare single line.
export function Textarea({
	className,
	value,
	...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
	const ref = useRef<HTMLTextAreaElement>(null);

	// `value` isn't read directly below, but the textarea's rendered DOM
	// content (which scrollHeight measures) is driven by it — re-measure
	// whenever it changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: see above
	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;
		el.style.height = "auto";
		el.style.height = `${el.scrollHeight}px`;
	}, [value]);

	return (
		<textarea
			ref={ref}
			value={value}
			className={cn(
				"max-h-56 min-h-11 w-full resize-none overflow-y-auto bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			{...props}
		/>
	);
}
