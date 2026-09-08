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
