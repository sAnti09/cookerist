// Lightweight cooking-unit conversion table. Covers four dimensions: mass,
// volume, length (a "2-inch piece" of ginger, say), and count (discrete
// items — "dozen", "piece", "whole", etc.). There's no cross-dimension entry
// between mass/volume/length (e.g. cup <-> gram, or inch <-> gram) because
// that depends on the specific ingredient — a cup of flour and a cup of
// sugar don't weigh the same, and neither does an inch of ginger and an inch
// of a much thicker root — see ingredient-density.ts (volume -> mass) and
// ingredient-length-density.ts (length -> mass) for those per-ingredient
// bridges. Count-to-mass/volume has no entry here at all (a "whole" onion
// has no universal weight) — see ingredient-piece-ratio.ts for the
// analogous per-ingredient container/piece bridge within the count
// dimension itself (e.g. a bulb of garlic -> its cloves).

export type UnitDimension = "mass" | "volume" | "length" | "count";

type UnitDefinition = {
	dimension: UnitDimension;
	// Multiply a quantity in this unit by this factor to get the dimension's
	// base unit: grams for mass, milliliters for volume.
	toBase: number;
};

// Every key is pre-normalized (see normalizeUnitKey): lowercase, trimmed,
// periods stripped, whitespace collapsed to single spaces.
const UNIT_TABLE: Record<string, UnitDefinition> = {
	// Mass (base: gram)
	mg: { dimension: "mass", toBase: 0.001 },
	milligram: { dimension: "mass", toBase: 0.001 },
	milligrams: { dimension: "mass", toBase: 0.001 },
	g: { dimension: "mass", toBase: 1 },
	gram: { dimension: "mass", toBase: 1 },
	grams: { dimension: "mass", toBase: 1 },
	kg: { dimension: "mass", toBase: 1000 },
	kilogram: { dimension: "mass", toBase: 1000 },
	kilograms: { dimension: "mass", toBase: 1000 },
	oz: { dimension: "mass", toBase: 28.3495 },
	ounce: { dimension: "mass", toBase: 28.3495 },
	ounces: { dimension: "mass", toBase: 28.3495 },
	lb: { dimension: "mass", toBase: 453.592 },
	lbs: { dimension: "mass", toBase: 453.592 },
	pound: { dimension: "mass", toBase: 453.592 },
	pounds: { dimension: "mass", toBase: 453.592 },

	// Volume (base: milliliter)
	ml: { dimension: "volume", toBase: 1 },
	milliliter: { dimension: "volume", toBase: 1 },
	milliliters: { dimension: "volume", toBase: 1 },
	millilitre: { dimension: "volume", toBase: 1 },
	millilitres: { dimension: "volume", toBase: 1 },
	l: { dimension: "volume", toBase: 1000 },
	liter: { dimension: "volume", toBase: 1000 },
	liters: { dimension: "volume", toBase: 1000 },
	litre: { dimension: "volume", toBase: 1000 },
	litres: { dimension: "volume", toBase: 1000 },
	tsp: { dimension: "volume", toBase: 4.92892 },
	teaspoon: { dimension: "volume", toBase: 4.92892 },
	teaspoons: { dimension: "volume", toBase: 4.92892 },
	tbsp: { dimension: "volume", toBase: 14.7868 },
	tablespoon: { dimension: "volume", toBase: 14.7868 },
	tablespoons: { dimension: "volume", toBase: 14.7868 },
	"fl oz": { dimension: "volume", toBase: 29.5735 },
	floz: { dimension: "volume", toBase: 29.5735 },
	"fluid ounce": { dimension: "volume", toBase: 29.5735 },
	"fluid ounces": { dimension: "volume", toBase: 29.5735 },
	cup: { dimension: "volume", toBase: 236.588 },
	cups: { dimension: "volume", toBase: 236.588 },
	pt: { dimension: "volume", toBase: 473.176 },
	pint: { dimension: "volume", toBase: 473.176 },
	pints: { dimension: "volume", toBase: 473.176 },
	qt: { dimension: "volume", toBase: 946.353 },
	quart: { dimension: "volume", toBase: 946.353 },
	quarts: { dimension: "volume", toBase: 946.353 },
	gal: { dimension: "volume", toBase: 3785.41 },
	gallon: { dimension: "volume", toBase: 3785.41 },
	gallons: { dimension: "volume", toBase: 3785.41 },

	// Length (base: centimeter) — for ingredients specified by a piece length
	// rather than a weight/volume, e.g. "a 2-inch piece of ginger".
	mm: { dimension: "length", toBase: 0.1 },
	millimeter: { dimension: "length", toBase: 0.1 },
	millimeters: { dimension: "length", toBase: 0.1 },
	cm: { dimension: "length", toBase: 1 },
	centimeter: { dimension: "length", toBase: 1 },
	centimeters: { dimension: "length", toBase: 1 },
	in: { dimension: "length", toBase: 2.54 },
	inch: { dimension: "length", toBase: 2.54 },
	inches: { dimension: "length", toBase: 2.54 },

	// Count (base: one discrete item). These are exact multipliers (a dozen
	// is always 12), unlike ingredient-piece-ratio.ts's container/piece
	// ratios, which are approximate.
	//
	// "" (unitless) is deliberately included here, not left unresolved: the
	// Groq prompt (see generate-recipe.ts) tells the model to return unit ""
	// for a genuinely unitless whole item (e.g. "1 onion"), but doesn't
	// forbid "whole"/"piece"/etc. for the exact same kind of item, so the two
	// forms show up interchangeably across separate generations. Without ""
	// resolving to the same count dimension, "1 onion" (unit "") and "1
	// whole onion" (unit "whole") landed in different merge buckets and
	// silently failed to combine on the grocery list.
	"": { dimension: "count", toBase: 1 },
	piece: { dimension: "count", toBase: 1 },
	pieces: { dimension: "count", toBase: 1 },
	whole: { dimension: "count", toBase: 1 },
	unit: { dimension: "count", toBase: 1 },
	units: { dimension: "count", toBase: 1 },
	each: { dimension: "count", toBase: 1 },
	egg: { dimension: "count", toBase: 1 },
	eggs: { dimension: "count", toBase: 1 },
	ear: { dimension: "count", toBase: 1 },
	ears: { dimension: "count", toBase: 1 },
	head: { dimension: "count", toBase: 1 },
	heads: { dimension: "count", toBase: 1 },
	loaf: { dimension: "count", toBase: 1 },
	loaves: { dimension: "count", toBase: 1 },
	dozen: { dimension: "count", toBase: 12 },
	"half dozen": { dimension: "count", toBase: 6 },
	"half-dozen": { dimension: "count", toBase: 6 },
};

function normalizeUnitKey(unit: string): string {
	return unit.trim().toLowerCase().replace(/\./g, "").replace(/\s+/g, " ");
}

export function resolveUnit(unit: string): UnitDefinition | null {
	return UNIT_TABLE[normalizeUnitKey(unit)] ?? null;
}

// Returns the dimension of a unit string, or null when it's not recognized
// at all (e.g. an ingredient-specific unit like "clove", or anything Groq/
// the user typed that isn't in the table).
export function getUnitDimension(unit: string): UnitDimension | null {
	return resolveUnit(unit)?.dimension ?? null;
}

// Null when `unit` isn't recognized.
export function convertToBase(quantity: number, unit: string): number | null {
	const def = resolveUnit(unit);
	return def ? quantity * def.toBase : null;
}

// Only meaningful for a `unit` that resolves (callers should only pass units
// already known-resolvable, e.g. from `pickDisplayUnit`); falls back to
// returning the base quantity unconverted otherwise.
export function convertFromBase(baseQuantity: number, unit: string): number {
	const def = resolveUnit(unit);
	return def ? baseQuantity / def.toBase : baseQuantity;
}

// Picks which of a set of actually-used unit strings to display a merged
// total in: the one with the largest conversion factor (e.g. tbsp + cup ->
// cup), so the result is always a unit that was genuinely used in one of the
// source recipes rather than an arbitrary "best fit" unit nobody asked for.
export function pickDisplayUnit(units: readonly string[]): string {
	let best = units[0];
	let bestFactor = resolveUnit(best)?.toBase ?? 0;
	for (const unit of units) {
		const factor = resolveUnit(unit)?.toBase ?? 0;
		if (factor > bestFactor) {
			best = unit;
			bestFactor = factor;
		}
	}
	return best;
}
