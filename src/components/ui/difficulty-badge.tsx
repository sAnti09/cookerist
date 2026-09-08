import { DIFFICULTY_LABELS, type Difficulty } from "#/lib/recipe";

export function DifficultyBadge({ difficulty }: { difficulty: Difficulty }) {
	return (
		<span className="inline-flex items-center rounded-[10px] bg-bg2 px-2 py-0.5 text-xs font-medium text-ink-dim">
			{DIFFICULTY_LABELS[difficulty]}
		</span>
	);
}
