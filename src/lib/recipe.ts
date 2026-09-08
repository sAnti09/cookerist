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

export type Recipe = {
	id: string;
	createdAt: string;
	prompt: string;
	title: string;
	overview: string;
	baseServings: number;
	currentServings: number;
	ingredients: Ingredient[];
	steps: Step[];
	expanded: boolean;
};

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
