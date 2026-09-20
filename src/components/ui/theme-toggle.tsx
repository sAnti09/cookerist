import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "#/lib/utils";

type ThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "cookerist:theme";
const OPTIONS: Array<{
	value: ThemeMode;
	label: string;
	icon: typeof Monitor;
}> = [
	{ value: "system", label: "System", icon: Monitor },
	{ value: "light", label: "Light", icon: Sun },
	{ value: "dark", label: "Dark", icon: Moon },
];

function applyTheme(mode: ThemeMode) {
	if (mode === "system") {
		document.documentElement.removeAttribute("data-theme");
	} else {
		document.documentElement.setAttribute("data-theme", mode);
	}
}

function readStoredTheme(): ThemeMode {
	try {
		const stored = localStorage.getItem(STORAGE_KEY);
		if (stored === "light" || stored === "dark" || stored === "system") {
			return stored;
		}
	} catch {
		// localStorage unavailable (private browsing, etc.)
	}
	return "system";
}

// Each tab-root screen mounts its own <ThemeToggle/>, so switching tabs
// remounts it. Caching the resolved theme here (rather than only in React
// state) lets every mount after the first read it synchronously instead of
// defaulting to "system" and flashing that before its effect corrects it.
let cachedMode: ThemeMode | null = null;

export function ThemeToggle() {
	const [mode, setMode] = useState<ThemeMode>(() => cachedMode ?? "system");

	useEffect(() => {
		if (cachedMode === null) {
			cachedMode = readStoredTheme();
			setMode(cachedMode);
		}
	}, []);

	function handleSelect(next: ThemeMode) {
		setMode(next);
		applyTheme(next);
		cachedMode = next;
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
					aria-label={option.label}
					title={option.label}
					onClick={() => handleSelect(option.value)}
					className={cn(
						"flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors sm:px-3",
						mode === option.value
							? "bg-primary text-primary-foreground"
							: "text-ink-dim hover:bg-secondary",
					)}
				>
					<option.icon className="size-3.5" aria-hidden="true" />
					<span className="hidden sm:inline">{option.label}</span>
				</button>
			))}
		</div>
	);
}
