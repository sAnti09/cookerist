// Size adjectives (small/medium/large/etc.) that describe which specimen of
// an ingredient to grab, not a different purchasable product — e.g. "medium
// onion" and "large onion" are still just "onion" at the store, so treating
// the size as part of the ingredient's identity would needlessly block
// grocery-list merging. Stripped from the merge key (see
// stripSizeDescriptor) and folded into the ingredient's description
// instead, so the detail isn't lost — same treatment "chopped"/"minced"
// already get (TEST-255).
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

export type SizeStripResult = {
	// `baseName` with any leading/trailing size word removed, original casing
	// preserved — unchanged (equal to the trimmed input) when no size word is
	// found.
	mergeKey: string;
	// The removed word, lowercase, to fold into an ingredient's description —
	// null when nothing was stripped.
	extractedSizeDescriptor: string | null;
};

// Strips a leading or trailing size adjective from an ingredient's base
// name, e.g. "medium onion" -> { mergeKey: "onion", extractedSizeDescriptor:
// "medium" }. Only ever removes one occurrence, from one end — an ingredient
// name isn't expected to carry a size word at both ends.
export function stripSizeDescriptor(baseName: string): SizeStripResult {
	const trimmed = baseName.trim().replace(/\s+/g, " ");
	if (!trimmed) return { mergeKey: trimmed, extractedSizeDescriptor: null };
	const lower = trimmed.toLowerCase();

	// A successful match below always leaves a non-empty remainder: `trimmed`
	// has no leading/trailing whitespace, so a "sizeWord " prefix or "
	// sizeWord" suffix match necessarily has a real character on the other
	// side of that separating space (a bare size word with nothing else,
	// e.g. "large", matches neither pattern — there's no space left for
	// startsWith/endsWith to find).
	for (const sizeWord of SIZE_WORDS) {
		if (lower.startsWith(`${sizeWord} `)) {
			return {
				mergeKey: trimmed.slice(sizeWord.length + 1),
				extractedSizeDescriptor: sizeWord,
			};
		}
		if (lower.endsWith(` ${sizeWord}`)) {
			return {
				mergeKey: trimmed.slice(0, trimmed.length - sizeWord.length - 1),
				extractedSizeDescriptor: sizeWord,
			};
		}
	}
	return { mergeKey: trimmed, extractedSizeDescriptor: null };
}
