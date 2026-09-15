import { Search } from "lucide-react";
import { memo, useState } from "react";
import { Checkbox } from "#/components/ui/checkbox";
import { IngredientLine } from "#/components/ui/ingredient-line";
import {
	APPROXIMATE_ITEMS_NOTE,
	formatGroceryItemQuantity,
} from "#/lib/aggregate-grocery-items";
import {
	DEFAULT_GROCERY_CATEGORY,
	GROCERY_CATEGORIES,
} from "#/lib/grocery-category";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import { applyGroceryItemsCheckedToRecipes } from "#/lib/propagate-grocery-check";
import type { Recipe } from "#/lib/recipe";

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

	function handleToggleItem(id: string) {
		const item = list.items.find((i) => i.id === id);
		if (!item) return;
		const checked = !item.checked;
		onUpdate({
			...list,
			items: list.items.map((i) => (i.id === id ? { ...i, checked } : i)),
		});
		const affectedRecipes = applyGroceryItemsCheckedToRecipes(
			recipes,
			[item],
			checked,
		);
		if (affectedRecipes.length > 0) onUpdateRecipes(affectedRecipes);
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

	const allChecked =
		list.items.length > 0 && list.items.every((item) => item.checked);
	const recipeTitles = list.recipeIds
		.map((id) => recipes.find((recipe) => recipe.id === id)?.title)
		.filter((title): title is string => Boolean(title));
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
			{recipeTitles.length > 0 ? (
				<div>
					<h4 className="font-medium">Recipes in this list</h4>
					<ul className="mt-2 flex flex-wrap gap-2">
						{recipeTitles.map((title) => (
							<li
								key={title}
								className="rounded-[10px] bg-bg2 px-2 py-1 text-sm text-ink-dim"
							>
								{title}
							</li>
						))}
					</ul>
				</div>
			) : null}

			<section>
				<div className="flex items-center justify-between">
					<h4 className="font-medium">Items</h4>
					<Checkbox
						checked={allChecked}
						onChange={handleCheckAll}
						label="Check all"
					/>
				</div>

				{list.items.length > 0 ? (
					<div className="card mt-2 flex items-center gap-2 rounded-full bg-surface px-4 py-2">
						<Search
							className="size-4 shrink-0 text-ink-dim"
							aria-hidden="true"
						/>
						<input
							type="search"
							value={search}
							onChange={(event) => setSearch(event.target.value)}
							placeholder="Search items…"
							aria-label="Search grocery items"
							className="w-full bg-transparent text-base text-ink outline-none placeholder:text-ink-dim sm:text-sm"
						/>
					</div>
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
