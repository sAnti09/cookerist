// Common aromatics, pungent seasonings, spices, and cooking fats that flavor
// the pan rather than acting as bulk mass (meat, rice, potatoes). Used as a
// fallback for legacy recipes saved before Groq started tagging scalingClass
// ("linear" | "sublinear") directly on ingredients.
export const LEGACY_SUBLINEAR_WORDS: ReadonlySet<string> = new Set([
	"onion",
	"onions",
	"garlic",
	"ginger",
	"shallot",
	"shallots",
	"scallion",
	"scallions",
	"green onion",
	"green onions",
	"leek",
	"leeks",
	"chives",
	"salt",
	"pepper",
	"black pepper",
	"white pepper",
	"cayenne",
	"chili",
	"chilies",
	"chilli",
	"chillies",
	"chile",
	"chiles",
	"cumin",
	"paprika",
	"oregano",
	"cinnamon",
	"coriander",
	"turmeric",
	"bay leaf",
	"bay leaves",
	"rosemary",
	"thyme",
	"basil",
	"parsley",
	"cilantro",
	"nutmeg",
	"clove",
	"cloves",
	"cardamom",
	"saffron",
	"vanilla",
	"soy sauce",
	"fish sauce",
	"oyster sauce",
	"hot sauce",
	"sriracha",
	"vinegar",
	"oil",
	"cooking oil",
	"olive oil",
	"vegetable oil",
	"canola oil",
	"sesame oil",
]);

export function isLegacySublinear(baseName: string): boolean {
	const normalized = baseName.trim().toLowerCase().replace(/\s+/g, " ");
	if (!normalized) return false;
	if (LEGACY_SUBLINEAR_WORDS.has(normalized)) return true;
	const words = normalized.split(" ");
	const lastWord = words[words.length - 1];
	if (LEGACY_SUBLINEAR_WORDS.has(lastWord)) return true;
	return false;
}

export function scaleQuantity(
	baseQuantity: number,
	baseServings: number,
	currentServings: number,
	scalingClass?: "linear" | "sublinear",
	baseName?: string,
): number {
	if (baseServings <= 0) return baseQuantity;
	const ratio = currentServings / baseServings;
	const isSublinear =
		scalingClass === "sublinear" ||
		(!scalingClass && baseName ? isLegacySublinear(baseName) : false);

	const factor = isSublinear ? ratio ** 0.6 : ratio;
	return baseQuantity * factor;
}

export function formatQuantity(quantity: number): string {
	const rounded = Math.round(quantity * 100) / 100;
	return rounded.toString();
}

/**
 * Singularizes a word using a couple of simple, common English patterns
 * ("-es"/"-s" suffixes). This is intentionally not a full pluralization
 * library — just enough to catch the common ingredient/unit duplicate cases
 * (e.g. "egg"/"eggs", "tomato"/"tomatoes").
 */
function singularize(word: string): string {
	if (word.endsWith("es") && word.length > 2) return word.slice(0, -2);
	if (word.endsWith("s") && word.length > 1) return word.slice(0, -1);
	return word;
}

function normalizeWord(word: string): string {
	return word.trim().toLowerCase().replace(/\s+/g, " ");
}

/**
 * Whether `unit` is just a restatement of the ingredient's own name (e.g.
 * text "egg" + unit "egg", or text "eggs" + unit "egg") rather than a real
 * measure/container. Case/whitespace-insensitive, and tolerant of simple
 * singular/plural variation.
 */
function isDuplicateUnit(unit: string, text: string): boolean {
	const normalizedUnit = normalizeWord(unit);
	const normalizedText = normalizeWord(text);
	if (!normalizedUnit) return false;
	if (normalizedUnit === normalizedText) return true;
	return singularize(normalizedUnit) === singularize(normalizedText);
}

/**
 * Composes just the "quantity [unit]" portion of an ingredient/grocery item
 * display line — the part meant to render visually separate from the
 * ingredient name (see `IngredientLine`). As defense-in-depth against an LLM
 * restating the ingredient's own name as its "unit" (e.g.
 * `{ text: "egg", unit: "egg" }`), the unit is omitted when it's a duplicate
 * of the ingredient text. Also omits the unit when it's empty.
 */
export function formatIngredientQuantity(
	quantity: number,
	unit: string,
	text: string,
): string {
	const trimmedUnit = unit.trim();
	const trimmedText = text.trim();
	const parts = [formatQuantity(quantity)];
	if (trimmedUnit && !isDuplicateUnit(trimmedUnit, trimmedText)) {
		parts.push(trimmedUnit);
	}
	return parts.join(" ");
}

/**
 * Composes the full display line for an ingredient/grocery item: quantity,
 * unit, and name, joining only the non-empty parts with a single space so
 * the result never has a double space.
 */
export function formatIngredientLine(
	quantity: number,
	unit: string,
	text: string,
): string {
	const trimmedText = text.trim();
	return [formatIngredientQuantity(quantity, unit, text), trimmedText]
		.filter(Boolean)
		.join(" ");
}
