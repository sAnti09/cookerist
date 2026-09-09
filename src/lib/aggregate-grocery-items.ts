import type { GroceryListItem, GroceryListItemOrigin } from "./grocery-list";
import type { Recipe } from "./recipe";
import { formatIngredientLine, scaleQuantity } from "./scale-servings";

// Units that count discrete, whole ingredients — can't take a fractional
// (0.25) amount. Extend this list as new countable units show up from Groq.
export const COUNTABLE_UNITS: readonly string[] = [
	"piece",
	"pieces",
	"clove",
	"cloves",
	"egg",
	"eggs",
	"slice",
	"slices",
	"can",
	"cans",
	"unit",
	"units",
	"whole",
];

export type CustomGroceryIngredient = {
	text: string;
	quantity: number;
	unit: string;
};

const EPSILON = 1e-9;

function roundUpToMultiple(value: number, multiple: number): number {
	const result = Math.ceil((value - EPSILON) / multiple) * multiple;
	// Squash float drift (e.g. 1.5000000000000002) introduced by the division above.
	return Math.round(result * 1e6) / 1e6;
}

export function isCountableUnit(unit: string): boolean {
	return COUNTABLE_UNITS.includes(unit.trim().toLowerCase());
}

export function roundGroceryQuantity(quantity: number, unit: string): number {
	const normalizedUnit = unit.trim().toLowerCase();
	if (normalizedUnit === "mg" || normalizedUnit === "ml") {
		return roundUpToMultiple(quantity, 100);
	}
	if (isCountableUnit(normalizedUnit)) {
		return roundUpToMultiple(quantity, 1);
	}
	return roundUpToMultiple(quantity, 0.25);
}

type IngredientGroup = {
	text: string;
	unit: string;
	quantity: number;
	// Unique, order-preserved descriptions collected from every ingredient
	// merged into this group (e.g. "chopped", "minced") — kept as detail since
	// combining on the shared base name would otherwise lose it (TEST-255).
	descriptions: string[];
	origins: GroceryListItemOrigin[];
};

export function aggregateGroceryItems(
	recipes: Recipe[],
	customIngredients: CustomGroceryIngredient[] = [],
): GroceryListItem[] {
	const groups = new Map<string, IngredientGroup>();

	for (const recipe of recipes) {
		for (const ingredient of recipe.ingredients) {
			// Grocery combination keys on the base name (e.g. "garlic") rather
			// than the full descriptive text (e.g. "garlic, chopped") so
			// differently-described ingredients that are really the same item
			// still merge — falling back to `text` for ingredients saved before
			// the base name/description split existed (TEST-255).
			const baseName = (ingredient.baseName ?? ingredient.text).trim();
			const description = (ingredient.description ?? "").trim();
			const normalizedBaseName = baseName.toLowerCase();
			const normalizedUnit = ingredient.unit.trim().toLowerCase();
			const key = `${normalizedBaseName}::${normalizedUnit}`;
			const origin: GroceryListItemOrigin = {
				recipeId: recipe.id,
				ingredientId: ingredient.id,
			};
			// Scale to the recipe's current servings, not the base quantity, so
			// adjusting servings before building the list changes what's on it.
			const scaledQuantity = scaleQuantity(
				ingredient.quantity,
				recipe.baseServings,
				recipe.currentServings,
			);

			const existing = groups.get(key);
			if (existing) {
				existing.quantity += scaledQuantity;
				existing.origins.push(origin);
				if (description && !existing.descriptions.includes(description)) {
					existing.descriptions.push(description);
				}
			} else {
				groups.set(key, {
					text: baseName,
					unit: ingredient.unit.trim(),
					quantity: scaledQuantity,
					descriptions: description ? [description] : [],
					origins: [origin],
				});
			}
		}
	}

	const recipeItems: GroceryListItem[] = Array.from(groups.values()).map(
		(group) => ({
			id: crypto.randomUUID(),
			text: group.text,
			quantity: roundGroceryQuantity(group.quantity, group.unit),
			unit: group.unit,
			checked: false,
			source: "recipe",
			origins: group.origins,
			descriptions:
				group.descriptions.length > 0 ? group.descriptions : undefined,
		}),
	);

	const customItems: GroceryListItem[] = customIngredients.map(
		(ingredient) => ({
			id: crypto.randomUUID(),
			text: ingredient.text,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			checked: false,
			source: "custom",
		}),
	);

	return [...recipeItems, ...customItems];
}

function checkedStateKey(item: GroceryListItem): string {
	return `${item.text.trim().toLowerCase()}::${item.unit.trim().toLowerCase()}`;
}

// Carries checked state from a list's previous items onto its freshly
// re-aggregated items (e.g. after an edit) — an item counts as "the same" if
// its merged text+unit is unchanged; anything new or changed resets to
// unchecked rather than guessing.
export function carryOverCheckedState(
	previousItems: GroceryListItem[],
	newItems: GroceryListItem[],
): GroceryListItem[] {
	const previouslyChecked = new Map(
		previousItems.map((item) => [checkedStateKey(item), item.checked]),
	);
	return newItems.map((item) => ({
		...item,
		checked: previouslyChecked.get(checkedStateKey(item)) ?? false,
	}));
}

// Renders a grocery item's display line, appending any preserved descriptions
// (TEST-255) after the base quantity/unit/name line, e.g.
// "2 cloves garlic (chopped, minced)".
export function formatGroceryItemLine(item: GroceryListItem): string {
	const base = formatIngredientLine(item.quantity, item.unit, item.text);
	if (!item.descriptions || item.descriptions.length === 0) return base;
	return `${base} (${item.descriptions.join(", ")})`;
}
