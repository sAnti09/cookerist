import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "./grocery-list";
import {
	reapplyConfirmedMerges,
	suggestGroceryMerges,
	suggestionKey,
} from "./suggest-grocery-merges";

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

describe("reapplyConfirmedMerges", () => {
	it("re-merges a pair whose suggestion key was previously confirmed", () => {
		const a = makeItem({ text: "yellow onion", quantity: 500, unit: "g" });
		const b = makeItem({ text: "onion", quantity: 300, unit: "g" });
		const confirmedKey = suggestionKey({ a, b });

		const result = reapplyConfirmedMerges([a, b], [confirmedKey]);

		expect(result).toHaveLength(1);
		expect(result[0].text).toBe("onion");
		expect(result[0].quantity).toBe(800);
	});

	it("merges every confirmed pair when several are present", () => {
		const onion = makeItem({ text: "yellow onion", quantity: 500, unit: "g" });
		const onion2 = makeItem({ text: "onion", quantity: 300, unit: "g" });
		const pepper = makeItem({
			text: "red bell pepper",
			quantity: 1,
			unit: "",
		});
		const pepper2 = makeItem({ text: "bell pepper", quantity: 2, unit: "" });
		const confirmedKeys = [
			suggestionKey({ a: onion, b: onion2 }),
			suggestionKey({ a: pepper, b: pepper2 }),
		];

		const result = reapplyConfirmedMerges(
			[onion, onion2, pepper, pepper2],
			confirmedKeys,
		);

		expect(result.map((item) => item.text).sort()).toEqual([
			"bell pepper",
			"onion",
		]);
	});

	it("leaves items unchanged when there are no confirmed keys", () => {
		const a = makeItem({ text: "yellow onion" });
		const b = makeItem({ text: "onion" });

		expect(reapplyConfirmedMerges([a, b], undefined)).toEqual([a, b]);
		expect(reapplyConfirmedMerges([a, b], [])).toEqual([a, b]);
	});

	it("ignores a confirmed key that no longer matches any current pair", () => {
		const a = makeItem({ text: "carrot" });
		const b = makeItem({ text: "celery" });

		const result = reapplyConfirmedMerges([a, b], ["onion::yellow onion"]);

		expect(result).toEqual([a, b]);
	});
});
