import { describe, expect, it } from "vitest";
import type { GroceryListItem } from "./grocery-list";
import {
	reapplyConfirmedMerges,
	rebuildGroceryListItems,
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

describe("rebuildGroceryListItems", () => {
	it("carries a surviving item's id forward (matched by text+unit)", () => {
		const previous = [makeItem({ id: "old-id", text: "onion", unit: "g" })];
		const fresh = [makeItem({ id: "new-id", text: "onion", unit: "g" })];

		const items = rebuildGroceryListItems(previous, fresh, undefined);

		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("old-id");
	});

	it("drops an item with nothing matching it in the fresh list", () => {
		const previous = [
			makeItem({ id: "kept-id", text: "onion", unit: "g" }),
			makeItem({ id: "dropped-id", text: "celery", unit: "g" }),
		];
		const fresh = [makeItem({ id: "new-id", text: "onion", unit: "g" })];

		const items = rebuildGroceryListItems(previous, fresh, undefined);

		expect(items.map((item) => item.id)).toEqual(["kept-id"]);
	});

	it("re-collapses a confirmed merge pair back into one item", () => {
		const onion = makeItem({ id: "onion-id", text: "yellow onion", unit: "g" });
		const onion2 = makeItem({ id: "onion2-id", text: "onion", unit: "g" });
		const confirmedKey = suggestionKey({ a: onion, b: onion2 });

		const items = rebuildGroceryListItems(
			[onion, onion2],
			[onion, onion2],
			[confirmedKey],
		);

		expect(items).toHaveLength(1);
		expect(items[0].id).toBe("onion-id");
	});

	it("preserves checked state of an already-merged item when fresh items are unmerged", () => {
		const mergedOnion = makeItem({
			id: "merged-onion-id",
			text: "onion",
			quantity: 800,
			unit: "g",
			checked: true,
		});
		const freshYellow = makeItem({
			id: "fresh-yellow",
			text: "yellow onion",
			quantity: 500,
			unit: "g",
			checked: false,
		});
		const freshOnion = makeItem({
			id: "fresh-onion",
			text: "onion",
			quantity: 300,
			unit: "g",
			checked: false,
		});
		const confirmedKey = suggestionKey({ a: freshYellow, b: freshOnion });

		const items = rebuildGroceryListItems(
			[mergedOnion],
			[freshYellow, freshOnion],
			[confirmedKey],
		);

		expect(items).toHaveLength(1);
		expect(items[0].text).toBe("onion");
		expect(items[0].quantity).toBe(800);
		expect(items[0].checked).toBe(true);
		expect(items[0].id).toBe("merged-onion-id");
	});
});
