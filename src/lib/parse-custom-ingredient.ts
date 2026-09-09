export type ParsedCustomIngredient = {
	text: string;
	quantity: number;
	unit: string;
};

export const DEFAULT_CUSTOM_INGREDIENT_UNIT = "piece";

// A curated set of common grocery/cooking units — combined at call time
// with whatever units the user's own saved recipes already use (see
// `knownUnits` below), so a brand-new user with no recipes yet still gets
// sensible unit recognition for common cases.
const COMMON_UNITS = new Set([
	"pc",
	"pcs",
	"piece",
	"pieces",
	"kg",
	"g",
	"gram",
	"grams",
	"kl",
	"l",
	"liter",
	"liters",
	"litre",
	"litres",
	"ml",
	"lb",
	"lbs",
	"oz",
	"cup",
	"cups",
	"tbsp",
	"tsp",
	"can",
	"cans",
	"box",
	"boxes",
	"pack",
	"packs",
	"bottle",
	"bottles",
	"bag",
	"bags",
	"jar",
	"jars",
	"bunch",
	"bunches",
	"head",
	"heads",
	"clove",
	"cloves",
	"slice",
	"slices",
	"dozen",
]);

const QUANTITY_PATTERN = /^\d+(\.\d+)?$/;

// Parses a freeform custom-ingredient entry per three shapes (TEST-post-258
// follow-up):
//   "<qty> <unit> <item>" -> all three filled, e.g. "1 pc chicken"
//   "<qty> <item>"        -> unit defaults to "piece", e.g. "5 tuna sardines"
//   "<item>"              -> quantity 1, unit "piece", e.g. "table"
// Returns null for blank input. `knownUnits` (e.g. units already used across
// the user's saved recipes) are recognized as units alongside the built-in
// common list above.
export function parseCustomIngredientInput(
	rawInput: string,
	knownUnits: string[] = [],
): ParsedCustomIngredient | null {
	const trimmed = rawInput.trim().replace(/\s+/g, " ");
	if (!trimmed) return null;

	const tokens = trimmed.split(" ");
	const firstToken = tokens[0];

	if (tokens.length > 1 && firstToken && QUANTITY_PATTERN.test(firstToken)) {
		const quantity = Number(firstToken);
		const rest = tokens.slice(1);
		const [maybeUnit, ...restWords] = rest;
		const recognizedUnits = new Set([
			...COMMON_UNITS,
			...knownUnits.map((unit) => unit.toLowerCase()),
		]);

		if (
			maybeUnit &&
			restWords.length > 0 &&
			recognizedUnits.has(maybeUnit.toLowerCase())
		) {
			return { quantity, unit: maybeUnit, text: restWords.join(" ") };
		}
		return {
			quantity,
			unit: DEFAULT_CUSTOM_INGREDIENT_UNIT,
			text: rest.join(" "),
		};
	}

	return { quantity: 1, unit: DEFAULT_CUSTOM_INGREDIENT_UNIT, text: trimmed };
}
