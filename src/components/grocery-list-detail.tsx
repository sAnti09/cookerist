import { Checkbox } from "#/components/ui/checkbox";
import { formatGroceryItemLine } from "#/lib/aggregate-grocery-items";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import { applyGroceryItemsCheckedToRecipes } from "#/lib/propagate-grocery-check";
import type { Recipe } from "#/lib/recipe";

type GroceryListDetailProps = {
	list: GroceryList;
	recipes: Recipe[];
	onUpdate: (list: GroceryList) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
};

function ItemLabel({ item }: { item: GroceryListItem }) {
	return (
		<span
			className={
				item.checked ? "tabular-nums text-ink-dim line-through" : "tabular-nums"
			}
		>
			{formatGroceryItemLine(item)}
		</span>
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

export function GroceryListDetail({
	list,
	recipes,
	onUpdate,
	onUpdateRecipes,
}: GroceryListDetailProps) {
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
	const recipeItems = list.items.filter((item) => item.source === "recipe");
	const customItems = list.items.filter((item) => item.source === "custom");
	const hasApproximateItems = list.items.some((item) => item.approximate);

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

				{recipeItems.length > 0 ? (
					<div className="mt-3">
						<h5 className="text-sm font-semibold">From recipes</h5>
						<ItemList items={recipeItems} onToggle={handleToggleItem} />
					</div>
				) : null}

				{customItems.length > 0 ? (
					<div className="mt-3">
						<h5 className="text-sm font-semibold">Custom</h5>
						<ItemList items={customItems} onToggle={handleToggleItem} />
					</div>
				) : null}

				{hasApproximateItems ? (
					<p className="mt-3 text-ink-dim text-xs">
						≈ estimated by converting between measurements (e.g. cups and grams)
						using an approximate ingredient density — actual amount may vary.
					</p>
				) : null}
			</section>
		</div>
	);
}
