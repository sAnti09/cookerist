import { useEffect, useState } from "react";
import { cn } from "#/lib/utils";

type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "cookerist:theme";
const OPTIONS: Array<{ value: ThemeMode; label: string }> = [
	{ value: "system", label: "System" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];

function applyTheme(mode: ThemeMode) {
	if (mode === "system") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}
}

export function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>("system");

	useEffect(() => {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			setMode(stored);
		}
	}, []);

	function handleSelect(next: ThemeMode) {
		setMode(next);
		applyTheme(next);
		try {
			localStorage.setItem(STORAGE_KEY, next);
		} catch {
			// localStorage unavailable (private browsing, etc.) - selection just won't persist
		}
	}

	return (
		// biome-ignore lint/a11y/useSemanticElements: a segmented-control toolbar, not a form fieldset
		<div
			role="group"
			aria-label="Theme"
			className="card inline-flex gap-0.5 rounded-full bg-surface p-1"
		>
			{OPTIONS.map((option) => (
				<button
					key={option.value}
					type="button"
					aria-pressed={mode === option.value}
					onClick={() => handleSelect(option.value)}
					className={cn(
						"rounded-full px-3 py-1.5 text-xs font-medium transition-colors",
						mode === option.value
							? "bg-primary text-primary-foreground"
							: "text-ink-dim hover:bg-secondary",
					)}
				>
					{option.label}
				</button>
			))}
		</div>
	);
}
