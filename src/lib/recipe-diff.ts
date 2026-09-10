import type { Ingredient, Step } from "#/lib/recipe";

export type IngredientDiffEntry =
	| { status: "unchanged"; ingredient: Ingredient }
	| { status: "changed"; before: Ingredient; after: Ingredient }
	| { status: "removed"; ingredient: Ingredient }
	| { status: "added"; ingredient: Ingredient };

// Steps have no stable identity like an ingredient's baseName to key a
// "changed" comparison on, so a reworded step is represented as a
// removed+added pair rather than a "changed" entry — see diffSteps below.
export type StepDiffEntry =
	| { status: "unchanged"; step: Step }
	| { status: "removed"; step: Step }
	| { status: "added"; step: Step };

export type RecipeDiff = {
	title: { before: string; after: string } | null;
	overview: { before: string; after: string } | null;
	servings: { before: number; after: number } | null;
	ingredients: IngredientDiffEntry[];
	steps: StepDiffEntry[];
};

export type DiffableRecipeFields = {
	title: string;
	overview: string;
	baseServings: number;
	ingredients: Ingredient[];
	steps: Step[];
};

function normalize(text: string): string {
	return text.trim().toLowerCase();
}

function ingredientKey(ingredient: Ingredient): string {
	return normalize(ingredient.baseName ?? ingredient.text);
}

function ingredientsEqual(a: Ingredient, b: Ingredient): boolean {
	return (
		a.quantity === b.quantity &&
		normalize(a.unit) === normalize(b.unit) &&
		normalize(a.description ?? "") === normalize(b.description ?? "")
	);
}

// Matches "before" and "after" ingredients by normalized baseName, pairing
// repeated occurrences of the same ingredient (e.g. two "onion" lines) in
// order rather than all matching the first one — a queue per key.
function diffIngredients(
	before: Ingredient[],
	after: Ingredient[],
): IngredientDiffEntry[] {
	const afterQueues = new Map<string, Ingredient[]>();
	for (const ingredient of after) {
		const key = ingredientKey(ingredient);
		const queue = afterQueues.get(key);
		if (queue) {
			queue.push(ingredient);
		} else {
			afterQueues.set(key, [ingredient]);
		}
	}

	const entries: IngredientDiffEntry[] = [];
	for (const ingredient of before) {
		const queue = afterQueues.get(ingredientKey(ingredient));
		const match = queue?.shift();
		if (!match) {
			entries.push({ status: "removed", ingredient });
			continue;
		}
		entries.push(
			ingredientsEqual(ingredient, match)
				? { status: "unchanged", ingredient: match }
				: { status: "changed", before: ingredient, after: match },
		);
	}
	for (const queue of afterQueues.values()) {
		for (const ingredient of queue) {
			entries.push({ status: "added", ingredient });
		}
	}
	return entries;
}

function stepKey(step: Step): string {
	return normalize(step.text);
}

// Matches "before" and "after" steps by normalized text (ignoring section),
// same queue-per-key approach as diffIngredients so a repeated step text
// still pairs up in order.
function diffSteps(before: Step[], after: Step[]): StepDiffEntry[] {
	const afterQueues = new Map<string, Step[]>();
	for (const step of after) {
		const key = stepKey(step);
		const queue = afterQueues.get(key);
		if (queue) {
			queue.push(step);
		} else {
			afterQueues.set(key, [step]);
		}
	}

	const entries: StepDiffEntry[] = [];
	for (const step of before) {
		const queue = afterQueues.get(stepKey(step));
		const match = queue?.shift();
		entries.push(
			match
				? { status: "unchanged", step: match }
				: { status: "removed", step },
		);
	}
	for (const queue of afterQueues.values()) {
		for (const step of queue) {
			entries.push({ status: "added", step });
		}
	}
	return entries;
}

export function diffRecipes(
	before: DiffableRecipeFields,
	after: DiffableRecipeFields,
): RecipeDiff {
	return {
		title:
			before.title === after.title
				? null
				: { before: before.title, after: after.title },
		overview:
			before.overview === after.overview
				? null
				: { before: before.overview, after: after.overview },
		servings:
			before.baseServings === after.baseServings
				? null
				: { before: before.baseServings, after: after.baseServings },
		ingredients: diffIngredients(before.ingredients, after.ingredients),
		steps: diffSteps(before.steps, after.steps),
	};
}
