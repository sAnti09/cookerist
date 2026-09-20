import { carryOverCheckedState } from "./aggregate-grocery-items";
import type { GroceryListItem } from "./grocery-list";
import { mergeGroceryListItems } from "./merge-grocery-items";

export type GroceryMergeSuggestion = {
	a: GroceryListItem;
	b: GroceryListItem;
	// Whichever of the two names is shorter (by word count) — used as both
	// the merged item's display name and the stable key identifying this
	// suggestion (see dismissedKey below).
	canonicalText: string;
	merged: GroceryListItem;
};

function wordsOf(text: string): string[] {
	return text.trim().toLowerCase().split(/\s+/).filter(Boolean);
}

// True when the shorter word list is a contiguous prefix or suffix of the
// longer one — catches a leading/trailing descriptor being the only
// difference (e.g. "onion" vs "yellow onion", "bell pepper" vs "red bell
// pepper"). Deliberately simple/local: it has no notion of synonyms, so
// "chicken broth" vs "chicken stock" won't be caught (see CLAUDE.md's
// "Arbitrary LLM baseName inconsistency isn't normalized" limitation) — and
// it doesn't know the difference between an adjective and an established
// grocery cut/form, so e.g. "chicken" vs "chicken breast" will also match
// even though the baseName rule (prompt-rules.ts) treats those as
// deliberately distinct products. Both are acceptable here specifically
// because this only ever produces a dismissible suggestion, never a silent
// merge.
function isPrefixOrSuffixMatch(
	shortWords: string[],
	longWords: string[],
): boolean {
	if (shortWords.length === 0 || shortWords.length >= longWords.length) {
		return false;
	}
	const isPrefix = shortWords.every((word, i) => longWords[i] === word);
	const isSuffix = shortWords.every(
		(word, i) => longWords[longWords.length - shortWords.length + i] === word,
	);
	return isPrefix || isSuffix;
}

// A stable id for a suggestion, independent of the items' own (freshly
// regenerated on every aggregation) ids — used by the caller to remember a
// dismissed suggestion across re-renders without it reappearing for the
// same pair of names.
export function suggestionKey(suggestion: {
	a: GroceryListItem;
	b: GroceryListItem;
}): string {
	return [suggestion.a.text, suggestion.b.text]
		.map((text) => text.trim().toLowerCase())
		.sort()
		.join("::");
}

// Finds pairs of grocery items that likely name the same ingredient but
// didn't merge during aggregation because their text differs (see
// aggregate-grocery-items.ts, which merges strictly on normalized text) —
// e.g. "onion" and "yellow onion" from two different recipes. Only proposes
// a pair when: they're the same `source` (mixing a recipe-sourced item's
// `origins` semantics with a custom item's isn't handled — see
// merge-grocery-items.ts), the name match heuristic above fires, and the
// quantities are actually combinable (mergeGroceryListItems returns
// non-null) — a name-alike pair with incompatible units is silently
// skipped rather than offered as a suggestion that can't actually merge.
export function suggestGroceryMerges(
	items: readonly GroceryListItem[],
): GroceryMergeSuggestion[] {
	const suggestions: GroceryMergeSuggestion[] = [];
	const seenPairs = new Set<string>();

	for (let i = 0; i < items.length; i++) {
		for (let j = i + 1; j < items.length; j++) {
			const itemA = items[i];
			const itemB = items[j];
			if (itemA.source !== itemB.source) continue;

			const normalizedA = itemA.text.trim().toLowerCase();
			const normalizedB = itemB.text.trim().toLowerCase();
			if (normalizedA === normalizedB) continue;

			const wordsA = wordsOf(itemA.text);
			const wordsB = wordsOf(itemB.text);
			const [shorter, , shortWords, longWords] =
				wordsA.length <= wordsB.length
					? [itemA, itemB, wordsA, wordsB]
					: [itemB, itemA, wordsB, wordsA];
			if (!isPrefixOrSuffixMatch(shortWords, longWords)) continue;

			const merged = mergeGroceryListItems(itemA, itemB, shorter.text);
			if (!merged) continue;

			const key = suggestionKey({ a: itemA, b: itemB });
			if (seenPairs.has(key)) continue;
			seenPairs.add(key);
			suggestions.push({
				a: itemA,
				b: itemB,
				canonicalText: shorter.text,
				merged,
			});
		}
	}

	return suggestions;
}

// Re-applies merge decisions the user has already confirmed (see
// GroceryList.confirmedMergeKeys) onto a freshly re-aggregated item list.
// aggregateGroceryItems has no memory of a manual merge — it only groups by
// normalized base name — so without this, every re-aggregation (the
// meal-plan "Update grocery list" banner, or Edit-and-save) would silently
// split a previously-merged pair back into two items and re-surface the
// exact suggestion the user already accepted. Looping (rather than a single
// pass) handles a confirmed merge whose two source texts only line back up
// with each other after an earlier confirmed merge in the same list already
// ran — each iteration merges at most one pair, so it's bounded by the item
// count shrinking by one each time and always terminates.
export function reapplyConfirmedMerges(
	items: readonly GroceryListItem[],
	confirmedMergeKeys: readonly string[] | undefined,
): GroceryListItem[] {
	if (!confirmedMergeKeys || confirmedMergeKeys.length === 0) {
		return [...items];
	}
	const confirmedKeys = new Set(confirmedMergeKeys);
	let current = [...items];
	for (;;) {
		const match = suggestGroceryMerges(current).find((candidate) =>
			confirmedKeys.has(suggestionKey(candidate)),
		);
		if (!match) return current;
		current = [
			...current.filter(
				(item) => item.id !== match.a.id && item.id !== match.b.id,
			),
			match.merged,
		];
	}
}

// Every list rebuild runs the same carryOverCheckedState + reapplyConfirmedMerges
// pipeline (aggregate-grocery-items.ts's carryOverCheckedState preserves an
// item's identity/checked-state across a fresh aggregation; reapplyConfirmedMerges
// then re-collapses any pair the user already confirmed as the same item) —
// wrapped here so every caller that rebuilds a list's `items` shares one
// definition of what that means.
export function rebuildGroceryListItems(
	previousItems: GroceryListItem[],
	freshItems: GroceryListItem[],
	confirmedMergeKeys: readonly string[] | undefined,
): GroceryListItem[] {
	return reapplyConfirmedMerges(
		carryOverCheckedState(previousItems, freshItems),
		confirmedMergeKeys,
	);
}
