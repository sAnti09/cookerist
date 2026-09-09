// Approximate "how many individual pieces come in one whole/bulk container"
// ratios, used to bridge a recipe's sub-piece count (e.g. "7 cloves") with
// its purchasable whole-container count (e.g. "1 bulb") for the same
// ingredient — the count-dimension analog of ingredient-density.ts bridging
// mass and volume. These are general culinary-knowledge estimates (not
// sourced from a dataset like the USDA density table) — a garlic bulb might
// hold 6 or 20 cloves depending on variety and size, so treat the resulting
// merged total as a shoppable estimate, never a precise count. As with the
// density table, an ingredient with no entry here simply doesn't get this
// treatment — no entry beats a wrong guess.
//
// Multi-word keys are checked before their single-word fallback (see
// lookupPieceRatio), matching ingredient-density.ts's suffix-matching
// strategy, so a specific product would take precedence over a generic one
// if this table ever grows to need that distinction.
export type PieceRatio = {
	// Recognized unit strings (lowercase) for the whole/bulk item itself.
	containerUnits: readonly string[];
	// Recognized unit strings (lowercase) for one individual sub-piece.
	pieceUnits: readonly string[];
	// Approximate number of pieces in one container.
	piecesPerContainer: number;
	// Canonical output unit when the rounded container count is exactly 1.
	containerUnitSingular: string;
	// Canonical output unit otherwise.
	containerUnitPlural: string;
};

const PIECE_RATIO_TABLE: Record<string, PieceRatio> = {
	garlic: {
		containerUnits: ["whole", "bulb", "bulbs", "head", "heads"],
		pieceUnits: ["clove", "cloves"],
		piecesPerContainer: 10,
		containerUnitSingular: "bulb",
		containerUnitPlural: "bulbs",
	},
	celery: {
		containerUnits: ["whole", "bunch", "bunches", "head", "heads"],
		pieceUnits: ["stalk", "stalks", "rib", "ribs"],
		piecesPerContainer: 9,
		containerUnitSingular: "bunch",
		containerUnitPlural: "bunches",
	},
	"green onion": {
		containerUnits: ["bunch", "bunches"],
		pieceUnits: ["stalk", "stalks"],
		piecesPerContainer: 6,
		containerUnitSingular: "bunch",
		containerUnitPlural: "bunches",
	},
	scallion: {
		containerUnits: ["bunch", "bunches"],
		pieceUnits: ["stalk", "stalks"],
		piecesPerContainer: 6,
		containerUnitSingular: "bunch",
		containerUnitPlural: "bunches",
	},
	bread: {
		containerUnits: ["loaf", "loaves"],
		pieceUnits: ["slice", "slices"],
		piecesPerContainer: 20,
		containerUnitSingular: "loaf",
		containerUnitPlural: "loaves",
	},
};

const MAX_PHRASE_WORDS = 3;

function normalize(name: string): string {
	return name.trim().toLowerCase().replace(/\s+/g, " ");
}

// Looks up a piece ratio for an ingredient name by trying decreasing-length
// word suffixes against the table, same strategy as
// ingredient-density.ts's lookupIngredientDensity — e.g. "fresh green onion"
// tries "green onion" (match) before ever considering "onion" alone (which
// isn't in this table, so a bare onion never gets treated as sold in
// bunches of stalks).
export function lookupPieceRatio(name: string): PieceRatio | null {
	const words = normalize(name).split(" ").filter(Boolean);
	if (words.length === 0) return null;

	const maxTake = Math.min(MAX_PHRASE_WORDS, words.length);
	for (let take = maxTake; take >= 1; take--) {
		const phrase = words.slice(words.length - take).join(" ");
		const ratio = PIECE_RATIO_TABLE[phrase];
		if (ratio !== undefined) return ratio;
	}
	return null;
}
