import { Search, X } from "lucide-react";
import { forwardRef } from "react";
import { cn } from "#/lib/utils";

type SearchInputProps = {
	value: string;
	onChange: (value: string) => void;
	placeholder: string;
	"aria-label": string;
	className?: string;
	inputClassName?: string;
	// Distinguishes the clear button when more than one search box could be
	// on screen at once (e.g. two expanded grocery lists) — defaults to a
	// generic label everywhere else, matching the equally generic input
	// aria-label those callers already use.
	clearLabel?: string;
};

// Shared pill-shaped search box (icon + input) used by the recipe filter,
// the grocery-list creation form's recipe picker, a grocery list's own item
// search, and Grocery Mode's search — a clear (X) button shows once there's
// text, so clearing doesn't require selecting/backspacing it all by hand.
export const SearchInput = forwardRef<HTMLInputElement, SearchInputProps>(
	function SearchInput(
		{
			value,
			onChange,
			placeholder,
			"aria-label": ariaLabel,
			className,
			inputClassName,
			clearLabel = "Clear search",
		},
		ref,
	) {
		return (
			<div
				className={cn(
					"card flex items-center gap-2 rounded-full bg-surface px-4 py-2",
					className,
				)}
			>
				<Search className="size-4 shrink-0 text-ink-dim" aria-hidden="true" />
				<input
					ref={ref}
					type="search"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					aria-label={ariaLabel}
					className={cn(
						// Suppresses the browser's own native clear ("x") button that
						// type="search" gets for free in Chromium/Safari — without this
						// it doubled up with the custom one below once there was text.
						"w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-dim [&::-webkit-search-cancel-button]:appearance-none",
						inputClassName,
					)}
				/>
				{value ? (
					<button
						type="button"
						onClick={() => onChange("")}
						aria-label={clearLabel}
						className="shrink-0 text-ink-dim hover:text-ink"
					>
						<X className="size-4" aria-hidden="true" />
					</button>
				) : null}
			</div>
		);
	},
);
