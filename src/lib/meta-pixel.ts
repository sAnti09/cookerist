// Thin wrapper around the Meta Pixel's global `fbq` function (loaded by
// src/routes/__root.tsx, production builds only -- see META_PIXEL_ID there).
// Calling this in dev/test, or with an ad blocker that strips fbevents.js,
// just silently no-ops rather than throwing.
export function trackMetaPixelEvent(eventName: string) {
	if (typeof window === "undefined") return;
	const fbq = (window as unknown as { fbq?: (...args: unknown[]) => void }).fbq;
	if (typeof fbq !== "function") return;
	fbq("trackCustom", eventName);
}
