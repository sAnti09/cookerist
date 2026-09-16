import { memo, useMemo, useState } from "react";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import { IngredientLine } from "#/components/ui/ingredient-line";
import { SearchInput } from "#/components/ui/search-input";
import {
	APPROXIMATE_ITEMS_NOTE,
	formatGroceryItemQuantity,
} from "#/lib/aggregate-grocery-items";
import {
	DEFAULT_GROCERY_CATEGORY,
	GROCERY_CATEGORIES,
} from "#/lib/grocery-category";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import {
	applyGroceryItemsCheckedToRecipes,
	toggleGroceryListItem,
} from "#/lib/propagate-grocery-check";
import type { Recipe } from "#/lib/recipe";
import {
	type GroceryMergeSuggestion,
	suggestGroceryMerges,
	suggestionKey,
} from "#/lib/suggest-grocery-merges";

type GroceryListDetailProps = {
	list: GroceryList;
	recipes: Recipe[];
	onUpdate: (list: GroceryList) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
};

// Checked items sink to the bottom of their section (still alphabetical
// within each of the two groups) so a shopper working down the list doesn't
// have to keep scanning past things they've already grabbed.
function compareItemsCheckedLast(
	a: GroceryListItem,
	b: GroceryListItem,
): number {
	if (a.checked !== b.checked) return a.checked ? 1 : -1;
	return a.text.localeCompare(b.text);
}

function ItemLabel({ item }: { item: GroceryListItem }) {
	return (
		<IngredientLine
			checked={item.checked}
			quantity={formatGroceryItemQuantity(item)}
			name={item.text}
		/>
	);
}

function ItemList({
	items,
	onToggle,
}: {
	items: GroceryListItem[];
	onToggle: (id: string) => void;
}) {
	return (
		<ul className="mt-2 grid grid-cols-1 gap-2 min-[420px]:grid-cols-2">
			{items.map((item) => (
				<li key={item.id}>
					<Checkbox
						checked={item.checked}
						onChange={() => onToggle(item.id)}
						label={<ItemLabel item={item} />}
					/>
				</li>
			))}
		</ul>
	);
}

export const GroceryListDetail = memo(function GroceryListDetail({
	list,
	recipes,
	onUpdate,
	onUpdateRecipes,
}: GroceryListDetailProps) {
	const [search, setSearch] = useState("");
	// This detail view is now a stable route (no more collapse/expand
	// remount cycle), so a dismissal can just live here instead of being
	// lifted to an outlasting parent.
	const [dismissedSuggestionKeys, setDismissedSuggestionKeys] = useState<
		Set<string>
	>(new Set());

	function handleToggleItem(id: string) {
		const result = toggleGroceryListItem(list, recipes, id);
		if (!result) return;
		onUpdate(result.list);
		if (result.affectedRecipes.length > 0)
			onUpdateRecipes(result.affectedRecipes);
	}

	function handleCheckAll(checked: boolean) {
		onUpdate({
			...list,
			items: list.items.map((item) => ({ ...item, checked })),
		});
		const affectedRecipes = applyGroceryItemsCheckedToRecipes(
			recipes,
			list.items,
			checked,
		);
		if (affectedRecipes.length > 0) onUpdateRecipes(affectedRecipes);
	}

	function handleMergeSuggestion(suggestion: GroceryMergeSuggestion) {
		onUpdate({
			...list,
			items: [
				...list.items.filter(
					(item) => item.id !== suggestion.a.id && item.id !== suggestion.b.id,
				),
				suggestion.merged,
			],
		});
		// Syncs the merged item's checked state (true only when both halves
		// were already checked — see merge-grocery-items.ts) onto every
		// combined origin, the same way handleToggleItem/handleCheckAll do —
		// this can uncheck a recipe ingredient that was checked via one half
		// but not the other, which is correct: the merged line isn't fully
		// gathered until both are.
		const affectedRecipes = applyGroceryItemsCheckedToRecipes(
			recipes,
			[suggestion.merged],
			suggestion.merged.checked,
		);
		if (affectedRecipes.length > 0) onUpdateRecipes(affectedRecipes);
	}

	const allChecked =
		list.items.length > 0 && list.items.every((item) => item.checked);
	// Search only narrows which items are shown — "Check all" still applies to
	// every item in the list, not just what's currently visible, and the
	// approximate-quantity note below still reflects the whole list too.
	const trimmedSearch = search.trim().toLowerCase();
	const matchesSearch = (item: GroceryListItem) =>
		trimmedSearch === "" || item.text.toLowerCase().includes(trimmedSearch);
	const recipeItems = list.items
		.filter((item) => item.source === "recipe" && matchesSearch(item))
		.sort(compareItemsCheckedLast);
	const customItems = list.items
		.filter((item) => item.source === "custom" && matchesSearch(item))
		.sort(compareItemsCheckedLast);
	const hasNoSearchResults =
		trimmedSearch !== "" &&
		recipeItems.length === 0 &&
		customItems.length === 0;
	const hasApproximateItems = list.items.some((item) => item.approximate);
	// Computed over the full, unfiltered list (search only narrows what's
	// displayed, not what's eligible to merge) — only one suggestion is
	// shown at a time so confirming/dismissing it doesn't have to reconcile
	// against a second suggestion that might reference the same item.
	const mergeSuggestions = useMemo(
		() => suggestGroceryMerges(list.items),
		[list.items],
	);
	const visibleSuggestion = mergeSuggestions.find(
		(suggestion) => !dismissedSuggestionKeys.has(suggestionKey(suggestion)),
	);
	// Groups the "From recipes" section by grocery-store category (see
	// grocery-category.ts) — recipeItems is already checked-last+alphabetical
	// sorted, and filtering preserves that relative order within each
	// category. Custom items have no per-item category input, so that
	// section stays flat. Category subheadings are only shown once there's
	// more than one group — a list with only "Other" (every item saved
	// before this field existed, or Groq falling back to it for all of them)
	// renders exactly as it did before this feature, not as a single
	// redundant "Other" heading.
	const recipeItemsByCategory = GROCERY_CATEGORIES.map((category) => ({
		category,
		items: recipeItems.filter(
			(item) => (item.category ?? DEFAULT_GROCERY_CATEGORY) === category,
		),
	})).filter((group) => group.items.length > 0);
	const showCategoryHeadings = recipeItemsByCategory.length > 1;

	return (
		<div className="flex flex-col gap-5">
			<section>
				<div className="flex flex-wrap items-center justify-between gap-2">
					<h4 className="font-medium">Items</h4>
					<Checkbox
						checked={allChecked}
						onChange={handleCheckAll}
						label="Check all"
					/>
				</div>

				{visibleSuggestion ? (
					<div className="mt-2 flex flex-col gap-2 rounded-[10px] border border-line bg-bg2 p-3 sm:flex-row sm:items-center sm:justify-between">
						<p className="text-sm">
							<span className="font-medium">{visibleSuggestion.a.text}</span>{" "}
							and{" "}
							<span className="font-medium">{visibleSuggestion.b.text}</span>{" "}
							might be the same item — merge into "
							{visibleSuggestion.canonicalText}"?
						</p>
						<div className="flex shrink-0 gap-2">
							<Button
								variant="secondary"
								onClick={() =>
									setDismissedSuggestionKeys((keys) =>
										new Set(keys).add(suggestionKey(visibleSuggestion)),
									)
								}
							>
								Not the same
							</Button>
							<Button onClick={() => handleMergeSuggestion(visibleSuggestion)}>
								Merge
							</Button>
						</div>
					</div>
				) : null}

				{list.items.length > 0 ? (
					<SearchInput
						value={search}
						onChange={setSearch}
						placeholder="Search items…"
						aria-label="Search grocery items"
						clearLabel="Clear grocery item search"
						className="mt-2"
						inputClassName="sm:text-sm"
					/>
				) : null}

				{recipeItems.length > 0 ? (
					<div className="mt-3">
						<h5 className="text-sm font-semibold">From recipes</h5>
						{showCategoryHeadings ? (
							recipeItemsByCategory.map(({ category, items }) => (
								<div key={category} className="mt-2">
									<h6 className="text-ink-dim text-xs font-medium uppercase tracking-wide">
										{category}
									</h6>
									<ItemList items={items} onToggle={handleToggleItem} />
								</div>
							))
						) : (
							<ItemList items={recipeItems} onToggle={handleToggleItem} />
						)}
					</div>
				) : null}

				{customItems.length > 0 ? (
					<div className="mt-3">
						<h5 className="text-sm font-semibold">Custom</h5>
						<ItemList items={customItems} onToggle={handleToggleItem} />
					</div>
				) : null}

				{hasNoSearchResults ? (
					<p className="mt-3 text-sm text-ink-dim">
						No items match "{search.trim()}".
					</p>
				) : null}

				{hasApproximateItems ? (
					<p className="mt-3 text-ink-dim text-xs">{APPROXIMATE_ITEMS_NOTE}</p>
				) : null}
			</section>
		</div>
	);
});
