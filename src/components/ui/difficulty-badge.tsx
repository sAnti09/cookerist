import { DIFFICULTY_LABELS, type Difficulty } from "#/lib/recipe";
import { cn } from "#/lib/utils";

export function DifficultyBadge({
	difficulty,
	className,
}: {
	difficulty: Difficulty;
	className?: string;
}) {
	return (
		<span
			className={cn(
				"inline-flex items-center rounded-[10px] bg-bg2 px-2 py-0.5 text-xs font-medium text-ink-dim",
				className,
			)}
		>
			{DIFFICULTY_LABELS[difficulty]}
		</span>
	);
}
