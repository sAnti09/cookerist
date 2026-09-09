export type Ingredient = {
	id: string;
	text: string;
	quantity: number;
	unit: string;
	checked: boolean;
	// Optional: absent on ingredients saved before TEST-255 split ingredient
	// naming into a base name (what grocery combination keys on, e.g. "garlic")
	// and a description (preserved detail, e.g. "chopped"). When absent,
	// callers should fall back to treating `text` as the base name with no
	// description.
	baseName?: string;
	description?: string;
};

// Composes the full display name from a base name + optional description
// (e.g. "garlic" + "chopped" -> "garlic, chopped"), used both when building a
// freshly-generated ingredient's display `text` and when merging a Groq
// continuation response back into a recipe.
export function combineIngredientName(
	baseName: string,
	description: string,
): string {
	const trimmedBase = baseName.trim();
	const trimmedDescription = description.trim();
	return trimmedDescription
		? `${trimmedBase}, ${trimmedDescription}`
		: trimmedBase;
}

export type Step = {
	id: string;
	section: string | null;
	text: string;
	checked: boolean;
	// Optional: minutes estimate for an inherently time-based step (e.g.
	// "simmer for 10 minutes") — populated by Groq only when relevant
	// (TEST-258). Absent/null for most steps, which fall back to plain
	// navigation with no timer.
	estimatedMinutes?: number | null;
};

export type Difficulty = "quick_and_easy" | "intermediate" | "hard";

export const DIFFICULTY_LABELS: Record<Difficulty, string> = {
	quick_and_easy: "Quick & easy",
	intermediate: "Intermediate",
	hard: "Hard",
};

export type Recipe = {
	id: string;
	createdAt: string;
	prompt: string;
	title: string;
	overview: string;
	baseServings: number;
	currentServings: number;
	// Optional: absent on recipes saved before TEST-229 added these fields.
	difficulty?: Difficulty | null;
	estimatedMinutes?: number | null;
	ingredients: Ingredient[];
	steps: Step[];
	expanded: boolean;
	favorite: boolean;
	// True when Groq's response was cut off mid-generation (TEST-243) — the
	// recipe detail view offers a "Load more" action to fetch the rest.
	// Optional: absent on recipes saved before this field existed.
	truncated?: boolean;
};

export function formatEstimatedTime(minutes: number): string {
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	const remainingMinutes = minutes % 60;
	return remainingMinutes === 0
		? `${hours} hr`
		: `${hours} hr ${remainingMinutes} min`;
}

export type StepSection = {
	name: string | null;
	steps: Step[];
};

export function groupSteps(steps: Step[]): StepSection[] {
	const sections: StepSection[] = [];
	for (const step of steps) {
		const last = sections[sections.length - 1];
		if (last && last.name === step.section) {
			last.steps.push(step);
		} else {
			sections.push({ name: step.section, steps: [step] });
		}
	}
	return sections;
}
