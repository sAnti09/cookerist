// Approximate grams-per-centimeter figures, used to bridge a length
// measurement (e.g. "a 2-inch piece of ginger") with mass for the same
// ingredient — the length-dimension analog of ingredient-density.ts bridging
// volume and mass. This is a shakier estimate than that one: a cup of flour
// is roughly the same regardless of which flour you scooped, but an inch of
// ginger's mass depends heavily on how thick that particular root is (a
// young, slender knob and a fat mature one can differ by 2-3x), so treat the
// resulting merged total as a rough shoppable estimate, not a precise
// weight. As with the other tables, an ingredient with no entry here simply
// doesn't get this treatment — no entry beats a wrong guess.
//
// Multi-word keys are checked before their single-word fallback (see
// lookupLengthDensity), matching ingredient-density.ts's suffix-matching
// strategy.
const LENGTH_DENSITY_TABLE: Record<string, number> = {
	// ~15 g for a 1-inch (2.54 cm) piece of average fresh ginger root, a
	// commonly cited recipe-conversion figure.
	ginger: 15 / 2.54,
};

const MAX_PHRASE_WORDS = 3;

function normalize(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Looks up an approximate grams-per-centimeter figure for an ingredient name
// by trying decreasing-length word suffixes against the table, same
// strategy as ingredient-density.ts's lookupIngredientDensity.
export function lookupLengthDensity(name: string): number | null {
	const words = normalize(name).split(" ").filter(Boolean);
	if (words.length === 0) return null;

	const maxTake = Math.min(MAX_PHRASE_WORDS, words.length);
	for (let take = maxTake; take >= 1; take--) {
		const phrase = words.slice(words.length - take).join(" ");
		const density = LENGTH_DENSITY_TABLE[phrase];
		if (density !== undefined) return density;
	}
	return null;
}
