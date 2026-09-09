// When Groq's response gets cut off mid-JSON (e.g. an elaborate recipe whose
// ingredients/steps arrays run past the completion token budget), a plain
// `JSON.parse` throws and today the whole recipe is discarded. This utility
// recovers as much of a truncated JSON document as possible instead: it
// drops any partially-written trailing array element (an ingredient/step
// object cut off mid-way) rather than trying to salvage a mutilated one, and
// closes any dangling strings/arrays/objects so the result is valid JSON.
//
// It's intentionally generic over "JSON shaped like our recipe response"
// (a top-level object whose interesting content lives in array fields like
// `ingredients` / `steps`) rather than hardcoded to those field names, so it
// works the same way for the continuation response shape too.

type Bracket = "{" | "[";

type Frame = {
	bracket: Bracket;
	// Index into the source string right after the last child of this
	// container that we know finished cleanly (a complete key/value pair for
	// an object, or a complete element for an array). Starts as the index
	// right after the opening bracket, i.e. "empty container so far".
	lastSafeEnd: number;
	// Only meaningful for "{" frames: true once we've seen the ':' for the
	// current key, until that value's completion is observed.
	awaitingValue: boolean;
};

function markValueEnd(frame: Frame | undefined, index: number): void {
	if (!frame) return;
	if (frame.bracket === "[") {
		frame.lastSafeEnd = index;
		return;
	}
	if (frame.awaitingValue) {
		frame.lastSafeEnd = index;
		frame.awaitingValue = false;
	}
}

/**
 * Given a possibly-truncated JSON string, returns valid JSON text: unchanged
 * if it already parses, otherwise repaired by dropping the last incomplete
 * array element (or object field) and closing any dangling containers.
 *
 * This can't invent missing data — if the input was truncated before any
 * complete top-level array element existed, the repaired array comes back
 * empty. Callers should still validate the parsed result against a schema.
 */
export function repairTruncatedJson(raw: string): string {
	try {
		JSON.parse(raw);
		return raw;
	} catch {
		// Fall through to repair below.
	}

	const stack: Frame[] = [];
	let inString = false;
	let escaped = false;

	for (let i = 0; i < raw.length; i++) {
		const ch = raw[i];

		if (inString) {
			if (escaped) {
				escaped = false;
			} else if (ch === "\\") {
				escaped = true;
			} else if (ch === '"') {
				inString = false;
				const top = stack[stack.length - 1];
				markValueEnd(top, i + 1);
			}
			continue;
		}

		switch (ch) {
			case '"':
				inString = true;
				break;
			case ":": {
				const top = stack[stack.length - 1];
				if (top && top.bracket === "{") top.awaitingValue = true;
				break;
			}
			case "{":
			case "[":
				stack.push({ bracket: ch, lastSafeEnd: i + 1, awaitingValue: false });
				break;
			case "}":
			case "]": {
				// A bare primitive (number/true/false/null) ending right before this
				// closing bracket counts as this frame's last completed child.
				const closing = stack[stack.length - 1];
				markValueEnd(closing, i);
				stack.pop();
				const parent = stack[stack.length - 1];
				markValueEnd(parent, i + 1);
				break;
			}
			case ",": {
				const top = stack[stack.length - 1];
				markValueEnd(top, i);
				break;
			}
			default:
				break;
		}
	}

	if (stack.length === 0) {
		// Brackets are balanced but JSON.parse still failed for some other
		// reason — this isn't a truncation we know how to repair.
		return raw;
	}

	// Prefer cutting back to the deepest still-open array: that discards the
	// entire partially-written trailing element (however deeply the cut
	// happened inside it) rather than keeping a mutilated one. If nothing on
	// the stack is an array, fall back to the innermost open object.
	let cutFrameIndex = -1;
	for (let i = stack.length - 1; i >= 0; i--) {
		if (stack[i].bracket === "[") {
			cutFrameIndex = i;
			break;
		}
	}
	if (cutFrameIndex === -1) cutFrameIndex = stack.length - 1;

	const cutFrame = stack[cutFrameIndex];
	const kept = stack.slice(0, cutFrameIndex + 1);
	const closing = kept
		.map((frame) => (frame.bracket === "{" ? "}" : "]"))
		.reverse()
		.join("");

	return raw.slice(0, cutFrame.lastSafeEnd) + closing;
}
