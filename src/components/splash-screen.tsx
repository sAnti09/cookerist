import { Flame } from "lucide-react";
import { useEffect, useState } from "react";

// Shown once per app open (a fresh full page load — client-side tab
// navigation never remounts this), before the first tab renders. Brand
// wordmark + tagline live here now instead of in every page header (see the
// nav-overhaul mockup, artboard 0e). Stays up until data has actually loaded
// AND a minimum duration has elapsed, whichever is longer, so it never just
// flashes on a fast load — long enough for the flame icon to actually
// register, not just a 500ms blip.
const MINIMUM_VISIBLE_MS = 1000;

export function SplashScreen({ ready }: { ready: boolean }) {
	const [minimumElapsed, setMinimumElapsed] = useState(false);

	useEffect(() => {
		const timeout = window.setTimeout(
			() => setMinimumElapsed(true),
			MINIMUM_VISIBLE_MS,
		);
		return () => window.clearTimeout(timeout);
	}, []);

	const done = ready && minimumElapsed;

	return (
		<div
			data-testid="splash-screen"
			aria-hidden={done}
			className={
				done
					? "pointer-events-none fixed inset-0 z-50 opacity-0 transition-opacity duration-300 motion-reduce:transition-none"
					: "fixed inset-0 z-50 opacity-100 transition-opacity duration-300 motion-reduce:transition-none"
			}
			style={done ? { visibility: "hidden" } : undefined}
		>
			<div className="flex h-full w-full flex-col items-center justify-center gap-4 bg-bg px-10">
				<h1
					className="display-title inline-flex items-baseline text-4xl font-semibold text-ink"
					aria-label="Cookerist"
				>
					<span aria-hidden="true">C</span>
					<span aria-hidden="true">o</span>
					<Flame
						className="flame-flicker-wordmark size-7 shrink-0 text-accent"
						fill="currentColor"
						aria-hidden="true"
					/>
					<span aria-hidden="true">kerist</span>
				</h1>
				<p className="max-w-[26ch] text-center text-sm leading-relaxed text-ink-dim">
					Tell us what you want to cook — we'll handle the rest.
				</p>
				<div aria-hidden="true" className="mt-1.5 flex items-center gap-1.5">
					<span className="size-1.5 rounded-full bg-accent opacity-100" />
					<span className="size-1.5 rounded-full bg-accent opacity-60" />
					<span className="size-1.5 rounded-full bg-accent opacity-30" />
				</div>
			</div>
		</div>
	);
}
