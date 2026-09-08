export function scaleQuantity(
	baseQuantity: number,
	baseServings: number,
	currentServings: number,
): number {
	if (baseServings <= 0) return baseQuantity;
	return (baseQuantity * currentServings) / baseServings;
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
 * Composes the full display line for an ingredient/grocery item: quantity,
 * unit, and name. As defense-in-depth against an LLM restating the
 * ingredient's own name as its "unit" (e.g. `{ text: "egg", unit: "egg" }`),
 * the unit is omitted when it's a duplicate of the ingredient text. Also
 * omits the unit when it's empty, joining only the non-empty parts with a
 * single space so the result never has a double space.
 */
export function formatIngredientLine(
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
	parts.push(trimmedText);
	return parts.filter(Boolean).join(" ");
}
