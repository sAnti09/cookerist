// Size adjectives (small/medium/large/etc.) that describe which specimen of
// an ingredient to grab, not a different purchasable product — e.g. "medium
// onion" and "large onion" are still just "onion" at the store, so treating
// the size as part of the ingredient's identity would needlessly block
// grocery-list merging. Stripped from the merge key (see
// stripSizeDescriptor) and discarded — the grocery list doesn't display
// per-ingredient detail at all (see formatGroceryItemLine).
//
// Checked longest-phrase-first so e.g. "extra large" doesn't get half
// stripped into a stray "extra". Applied unconditionally to every
// ingredient — a few categories where size really does denote a different
// product (e.g. "jumbo shrimp" vs. "large shrimp" being different
// counts-per-pound at the seafood counter, or "jumbo pasta shells" being a
// different shape from "small shells", not a bigger version of the same
// one) lose that distinction under this rule; simplicity was chosen
// deliberately over carving out those exceptions.
const SIZE_WORDS = [
	"extra large",
	"extra-large",
	"extra small",
	"extra-small",
	"small",
	"medium",
	"large",
	"jumbo",
];

// Strips a leading or trailing size adjective from an ingredient's base
// name, e.g. "medium onion" -> "onion". Only ever removes one occurrence,
// from one end — an ingredient name isn't expected to carry a size word at
// both ends. Returns the name unchanged when no size word is found.
export function stripSizeDescriptor(baseName: string): string {
	const trimmed = baseName.trim().replace(/\s+/g, " ");
	if (!trimmed) return trimmed;
	const lower = trimmed.toLowerCase();

	// A successful match below always leaves a non-empty remainder: `trimmed`
	// has no leading/trailing whitespace, so a "sizeWord " prefix or "
	// sizeWord" suffix match necessarily has a real character on the other
	// side of that separating space (a bare size word with nothing else,
	// e.g. "large", matches neither pattern — there's no space left for
	// startsWith/endsWith to find).
	for (const sizeWord of SIZE_WORDS) {
		if (lower.startsWith(`${sizeWord} `)) {
			return trimmed.slice(sizeWord.length + 1);
		}
		if (lower.endsWith(` ${sizeWord}`)) {
			return trimmed.slice(0, trimmed.length - sizeWord.length - 1);
		}
	}
	return trimmed;
}

// Whether `unit` (the whole, trimmed string — not a substring search) is
// itself one of the size words above. Groq sometimes puts a size adjective
// in the ingredient's `unit` field instead of its base name (e.g. "1 onion"
// with unit "large" rather than baseName "large onion") — this catches that
// case so it can be treated as unitless instead, same as the baseName case.
export function isSizeWordUnit(unit: string): boolean {
	return SIZE_WORDS.includes(unit.trim().toLowerCase());
}
