import type { Ingredient } from "#/lib/recipe";

export type HighlightSegment = {
	text: string;
	matched: boolean;
};

function escapeRegExp(value: string): string {
	return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// `\b` only makes sense next to a word character — a name like "chili
// (dried)" ends in ")", so a trailing `\b` there would never match (both
// sides of the boundary would be non-word characters). Only add the
// boundary (and the plural allowance, which only makes sense for a
// word-ending name) on whichever side actually ends in a word character.
function buildNamePattern(name: string): string {
	const escaped = escapeRegExp(name);
	const prefix = /^\w/.test(name) ? "\\b" : "";
	const suffix = /\w$/.test(name) ? "s?\\b" : "";
	return `${prefix}${escaped}${suffix}`;
}

// A tiny function-word safety net for the head-noun fallback below — never
// a list of descriptive adjectives ("dry", "fresh", "chopped", ...). Those
// are excluded structurally instead: the fallback only ever uses a multi-
// word name's LAST word, never an earlier modifier, so "dry yeast" can
// fall back to "yeast" but never to "dry".
const FUNCTION_WORD_STOPLIST = new Set([
	"a",
	"an",
	"the",
	"of",
	"and",
	"or",
	"to",
	"in",
	"on",
	"with",
	"for",
	"at",
	"by",
]);

// Besides each ingredient's full name, also add its last word as a
// fallback — a step recipe text will often just say "the yeast" or "add
// the flour" without repeating a modifier like "dry" or "all-purpose".
function collectMatchNames(ingredients: Ingredient[]): string[] {
	const names = new Set<string>();
	for (const ingredient of ingredients) {
		const name = (ingredient.baseName ?? ingredient.text).trim();
		if (!name) continue;
		names.add(name);

		const words = name.split(/\s+/);
		if (words.length > 1) {
			const headWord = words[words.length - 1];
			if (headWord && !FUNCTION_WORD_STOPLIST.has(headWord.toLowerCase())) {
				names.add(headWord);
			}
		}
	}
	return Array.from(names);
}

// Longest names first, so e.g. "chicken breast" (or "dry yeast") wins over
// a shorter head-noun fallback ("breast"/"yeast") that would otherwise
// match part of the same phrase.
function buildMentionPattern(ingredients: Ingredient[]): RegExp | null {
	const names = collectMatchNames(ingredients).sort(
		(a, b) => b.length - a.length,
	);

	if (names.length === 0) return null;

	// "s?" is a simple plural allowance (garlic clove -> cloves) — it won't
	// catch irregular plurals (tomato -> tomatoes), which is an accepted gap
	// for this text-matching approach.
	return new RegExp(names.map(buildNamePattern).join("|"), "gi");
}

// Splits step text into plain/matched segments wherever an ingredient's
// base name appears, so cook mode can render the matches highlighted
// without needing Groq to tag ingredients per step.
export function highlightIngredientMentions(
	text: string,
	ingredients: Ingredient[],
): HighlightSegment[] {
	const pattern = buildMentionPattern(ingredients);
	if (!pattern) return [{ text, matched: false }];

	const segments: HighlightSegment[] = [];
	let lastIndex = 0;
	for (const match of text.matchAll(pattern)) {
		const start = match.index ?? 0;
		if (start > lastIndex) {
			segments.push({ text: text.slice(lastIndex, start), matched: false });
		}
		segments.push({ text: match[0], matched: true });
		lastIndex = start + match[0].length;
	}
	if (lastIndex < text.length) {
		segments.push({ text: text.slice(lastIndex), matched: false });
	}
	return segments;
}
