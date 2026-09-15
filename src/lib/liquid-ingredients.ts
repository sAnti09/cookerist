// Decides whether an ingredient is a genuine liquid — one that defaults to
// being shopped for by volume (fl oz/liters), not weight, *unless* a real
// mass-unit occurrence of the same liquid also shows up somewhere in the
// same aggregation. Checked in aggregate-grocery-items.ts's "liquid" bucket:
// - Every occurrence in volume only (e.g. broth measured in cups across
//   every recipe) -> stays in metric volume (ml/l), exact, density never
//   even consulted.
// - Every occurrence in mass only (e.g. "100 g" + "200 g" spaghetti sauce)
//   -> stays in mass, exact — a recognized liquid is never force-converted
//   to volume just because it's on this list.
// - A genuine mix of both (e.g. "50 g milk" + "100 ml milk") -> mass wins,
//   with the volume occurrence bridged in via ingredient-density.ts and the
//   result flagged approximate. Mass wins when present because that's
//   already the app's existing rule for any solid with a known density
//   (flour, sugar, ...) — extended here to apply to a liquid too, but only
//   once real mass data actually exists to justify it, not unconditionally
//   (unconditionally is exactly the earlier bug — "2 cups chicken broth"
//   alone showing as "≈480 g" instead of "≈473 ml").
//
// A volume-measured ingredient that *isn't* a recognized liquid and has no
// density entry either (e.g. "1 cup chopped carrots") falls back to
// whichever native unit was actually used — forcing that into ml/l would be
// actively misleading, since nobody buys carrots by the milliliter.
//
// Matched against the *last word* of the (normalized) baseName, so a
// modifier in front still matches (e.g. "chicken broth", "olive oil",
// "orange juice", "soy sauce") — same principle as
// ingredient-density.ts/ingredient-piece-ratio.ts's suffix matching, just
// simplified to one word since every entry here is itself already the
// single word that names "this is a liquid" in everyday grocery language.
// An ingredient with no match here (most solids) simply keeps whichever
// native unit was actually used, or its density-bridged mass — same "no
// entry beats a wrong guess" trade-off as the density/piece-ratio tables:
// guessing an ingredient is a liquid when it isn't would be worse than
// leaving it alone.
const LIQUID_TERMINAL_WORDS: ReadonlySet<string> = new Set([
	"water",
	"milk",
	"broth",
	"stock",
	"oil",
	"wine",
	"vinegar",
	"juice",
	"cream",
	"buttermilk",
	"syrup",
	"extract",
	"sauce",
	"beer",
	"soda",
	"cider",
]);

// A leading modifier that turns an otherwise-liquid word into a dry/powdered
// product — e.g. "dry milk" and "powdered milk" are both milk *powder*, not
// the liquid, even though "milk" is a liquid word and would otherwise match
// as the last word. Checked before the terminal-word match so these never
// get misclassified as liquid (which would wrongly force them into ml/l
// instead of leaving them to their density-bridged mass, see
// ingredient-density.ts's "milk powder"/"powdered milk"/"dry milk" entries).
const DRY_FORM_WORDS: ReadonlySet<string> = new Set([
	"dry",
	"dried",
	"powder",
	"powdered",
]);

export function isLiquidIngredient(baseName: string): boolean {
	const words = baseName.trim().toLowerCase().split(/\s+/).filter(Boolean);
	if (words.length === 0) return false;
	if (words.some((word) => DRY_FORM_WORDS.has(word))) return false;

	const lastWord = words[words.length - 1];
	return lastWord !== undefined && LIQUID_TERMINAL_WORDS.has(lastWord);
}
