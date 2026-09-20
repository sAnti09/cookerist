import { Flame } from "lucide-react";

// The "Co🔥kerist" brand mark, shared between the splash screen and the
// account drawer's header (its second real use case — see CLAUDE.md's
// "no premature abstraction" note). The flame is sized in em units so it
// scales with whatever font-size the caller sets on an ancestor (a 4xl
// heading on the splash screen, a small drawer title elsewhere) instead of
// needing a size prop.
export function Wordmark() {
	return (
		<span className="display-title inline-flex items-baseline">
			<span className="sr-only">Cookerist</span>
			<span aria-hidden="true" className="inline-flex items-baseline">
				<span>C</span>
				<span>o</span>
				<Flame
					className="flame-flicker-wordmark shrink-0 text-accent"
					style={{ width: "0.85em", height: "0.85em" }}
					fill="currentColor"
				/>
				<span>kerist</span>
			</span>
		</span>
	);
}
