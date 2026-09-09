export type Ingredient = {
	id: string;
	text: string;
	quantity: number;
	unit: string;
	checked: boolean;
};

export type Step = {
	id: string;
	section: string | null;
	text: string;
	checked: boolean;
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
