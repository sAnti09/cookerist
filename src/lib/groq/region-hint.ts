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
