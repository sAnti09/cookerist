// A soft, non-binding cuisine hint threaded into the recipe-generation and
// dish-identification prompts (see generate-recipe.ts / identify-dish.ts) —
// `timezone` is an IANA zone name (e.g. "Asia/Manila"), which reliably
// implies a country/region without needing a location permission prompt and
// without depending on the OS/browser being localized to match where the
// user actually is (unlike navigator.language).
//
// Deliberately phrased as a tiebreaker, not an instruction to follow — a
// request or photo that already points to a specific dish/cuisine must never
// get overridden by where the user happens to be.
export function regionHint(timezone: string | undefined): string {
	if (!timezone) return "";
	return ` (For context only, not an instruction: the user's timezone suggests they're roughly in this region: ${timezone}. If — and only if — what's described/shown doesn't already point to a specific dish or cuisine, treat this as a soft tiebreaker toward what a home cook from that region would likely make. Never let it override a cuisine or dish that's already evident.)`;
}

// Unlike regionHint above (which only nudges *which dish/cuisine* gets made,
// and only when nothing else already points to one), this always applies
// regardless of which dish is chosen or how specific the request was.
// Recipe-generating models default to large, US-restaurant-style ingredient
// quantities even for a user nowhere near the US (e.g. a Filipino home-cook
// serving is typically smaller than what a US recipe would call one
// serving) — this exists purely to correct that portion-size bias, not to
// influence dish selection, so it's kept as a separate hint appended only to
// the recipe-generation call (see generate-recipe.ts), not the on-topic
// check or dish identification, neither of which produce quantities.
export function portionSizeHint(timezone: string | undefined): string {
	if (!timezone) return "";
	return ` (Portion sizing — apply this regardless of which dish or cuisine you land on: the user's timezone suggests they're roughly in this region: ${timezone}. Size each ingredient's quantity so one serving matches what a home cook in that region would actually consider a normal serving, not a default large US-style portion — adjust amounts down (or up) to match local norms for the indicated region instead of defaulting to US serving sizes.)`;
}
