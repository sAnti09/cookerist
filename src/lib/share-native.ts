// Wraps the Web Share API (the OS-native share sheet on iOS/Android —
// AirDrop, Messages, copy, etc. all show up there for free) used by the
// pairing-code and per-resource-share-code dialogs to hand a code off
// without making the recipient type it in by hand. Not supported on most
// desktop browsers, so callers feature-detect via canShareNatively() and
// fall back to the existing manual "Copy code" button when it's false.
export function canShareNatively(): boolean {
	return (
		typeof navigator !== "undefined" && typeof navigator.share === "function"
	);
}

// Resolves once the share sheet is dismissed, whether or not the person
// actually picked a target -- cancelling out of the sheet (AbortError) is
// a normal outcome, not a failure worth surfacing as an error.
export async function shareNatively(data: {
	title: string;
	text: string;
}): Promise<void> {
	try {
		await navigator.share(data);
	} catch (error) {
		if (error instanceof DOMException && error.name === "AbortError") return;
		throw error;
	}
}
