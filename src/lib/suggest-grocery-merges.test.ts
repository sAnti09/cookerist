import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "./grocery-list";
import { suggestGroceryMerges, suggestionKey } from "./suggest-grocery-merges";

function makeItem(overrides: Partial<GroceryListItem> = {}): GroceryListItem {
	return {
		id: crypto.randomUUID(),
		text: "onion",
		quantity: 1,
		unit: "g",
		checked: false,
		source: "recipe",
		...overrides,
	};
}

describe("suggestGroceryMerges", () => {
	it("suggests a leading-descriptor variant (yellow onion vs onion)", () => {
		const a = makeItem({ text: "yellow onion", quantity: 500, unit: "g" });
		const b = makeItem({ text: "onion", quantity: 300, unit: "g" });

		const suggestions = suggestGroceryMerges([a, b]);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].canonicalText).toBe("onion");
		expect(suggestions[0].merged.quantity).toBe(800);
	});

	it("suggests a trailing-descriptor variant (bell pepper vs red bell pepper)", () => {
		const a = makeItem({ text: "red bell pepper", quantity: 1, unit: "" });
		const b = makeItem({ text: "bell pepper", quantity: 2, unit: "" });

		const suggestions = suggestGroceryMerges([a, b]);

		expect(suggestions).toHaveLength(1);
		expect(suggestions[0].canonicalText).toBe("bell pepper");
	});

	it("does not suggest identical names (already merged upstream)", () => {
		const a = makeItem({ text: "onion" });
		const b = makeItem({ text: "Onion " });

		expect(suggestGroceryMerges([a, b])).toEqual([]);
	});

	it("does not suggest unrelated items", () => {
		const a = makeItem({ text: "onion" });
		const b = makeItem({ text: "carrot" });

		expect(suggestGroceryMerges([a, b])).toEqual([]);
	});

	it("does not suggest a pair from different sources", () => {
		const a = makeItem({ text: "onion", source: "recipe" });
		const b = makeItem({ text: "yellow onion", source: "custom" });

		expect(suggestGroceryMerges([a, b])).toEqual([]);
	});

	it("does not suggest a name-alike pair whose quantities aren't combinable", () => {
		const a = makeItem({ text: "onion", quantity: 1, unit: "kg" });
		const b = makeItem({ text: "yellow onion", quantity: 1, unit: "jar" });

		expect(suggestGroceryMerges([a, b])).toEqual([]);
	});

	it("finds a match anywhere in a larger list, ignoring unrelated items", () => {
		const items = [
			makeItem({ text: "carrot" }),
			makeItem({ text: "yellow onion", quantity: 500, unit: "g" }),
			makeItem({ text: "celery" }),
			makeItem({ text: "onion", quantity: 300, unit: "g" }),
		];

		const suggestions = suggestGroceryMerges(items);

		expect(suggestions).toHaveLength(1);
		expect([suggestions[0].a.text, suggestions[0].b.text].sort()).toEqual([
			"onion",
			"yellow onion",
		]);
	});
});

describe("suggestionKey", () => {
	it("is the same regardless of which item is a vs b", () => {
		const a = makeItem({ text: "Onion" });
		const b = makeItem({ text: "Yellow Onion" });

		expect(suggestionKey({ a, b })).toBe(suggestionKey({ a: b, b: a }));
	});

	it("is case/whitespace insensitive", () => {
		const a = makeItem({ text: "  Onion " });
		const b = makeItem({ text: "yellow onion" });

		expect(suggestionKey({ a, b })).toBe(
			suggestionKey({
				a: makeItem({ text: "onion" }),
				b: makeItem({ text: "Yellow Onion" }),
			}),
		);
	});
});
