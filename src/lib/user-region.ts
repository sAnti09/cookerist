// A soft cuisine hint for Groq (see src/lib/groq/region-hint.ts) — the IANA
// timezone name (e.g. "Asia/Manila") reliably implies a country/region
// without a location permission prompt, and unlike navigator.language it
// doesn't depend on the OS/browser being localized to match where the user
// actually is. Only ever called from a user-triggered handler (submitting a
// prompt or photo) so it always reflects the browser's own timezone — never
// the server's, which would be wrong if read during SSR.
export function getUserTimezone(): string | undefined {
	try {
		return Intl.DateTimeFormat().resolvedOptions().timeZone || undefined;
	} catch {
		return undefined;
	}
}
