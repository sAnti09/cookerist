import { repairTruncatedJson } from "./repair-truncated-json";

export function extractJson(content: string | null | undefined): unknown {
	if (!content) {
		throw new Error("Empty response from Groq");
	}
	try {
		return JSON.parse(content);
	} catch (error) {
		// The response may have been cut off mid-JSON (finish_reason "length").
		// Try to recover as much complete content as possible before giving up.
		try {
			return JSON.parse(repairTruncatedJson(content));
		} catch {
			throw error instanceof Error ? error : new Error(String(error));
		}
	}
}
