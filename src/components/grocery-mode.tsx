import {
	Check,
	ChevronDown,
	ChevronRight,
	ChevronUp,
	CircleCheck,
	X,
} from "lucide-react";
import { useRef, useState } from "react";
import { Button } from "#/components/ui/button";
import { CelebrationBurst } from "#/components/ui/celebration-burst";
import { Checkbox } from "#/components/ui/checkbox";
import { IngredientLine } from "#/components/ui/ingredient-line";
import { SearchInput } from "#/components/ui/search-input";
import { formatGroceryItemQuantity } from "#/lib/aggregate-grocery-items";
import {
	DEFAULT_GROCERY_CATEGORY,
	GROCERY_CATEGORIES,
} from "#/lib/grocery-category";
import type { GroceryList, GroceryListItem } from "#/lib/grocery-list";
import { toggleGroceryListItem } from "#/lib/propagate-grocery-check";
import type { Recipe } from "#/lib/recipe";
import { useBodyScrollLock } from "#/lib/use-body-scroll-lock";
import { useWakeLock } from "#/lib/use-wake-lock";
import { cn } from "#/lib/utils";

type GroceryModeProps = {
	list: GroceryList;
	recipes: Recipe[];
	onUpdate: (list: GroceryList) => void;
	onUpdateRecipes: (recipes: Recipe[]) => void;
	onClose: () => void;
};

// Once a category has this many checked items, they tuck behind a "N
// checked" disclosure instead of just sinking to the bottom — below this,
// sinking to the bottom (the same behavior the non-immersive list uses) is
// enough to keep the section readable.
const CHECKED_DISCLOSURE_THRESHOLD = 2;

const CUSTOM_SECTION_KEY = "Custom";

type Section = { key: string; label: string; items: GroceryListItem[] };

function byText(a: GroceryListItem, b: GroceryListItem) {
	return a.text.localeCompare(b.text);
}

export function GroceryMode({
	list,
	recipes,
	onUpdate,
	onUpdateRecipes,
	onClose,
}: GroceryModeProps) {
	// Grocery mode is a full-screen overlay, same reasoning as CookMode: lock
	// the page behind it and keep the screen from sleeping mid-shop.
	useBodyScrollLock(true);
	useWakeLock();

	const [search, setSearch] = useState("");
	// Categories collapse to a done pill automatically once every item in them
	// is checked; this tracks a category the shopper explicitly reopened
	// despite that (via the pill, or the collapse control on an already-open
	// one). The override is scoped to the current "fully done" streak: as
	// soon as an item in that category gets unchecked (handleToggleItem,
	// below), it's cleared — so the category auto-collapses again next time
	// every item in it ends up checked, rather than an old override
	// permanently suppressing the auto-collapse.
	const [manuallyExpanded, setManuallyExpanded] = useState<Set<string>>(
		new Set(),
	);
	const [openDisclosures, setOpenDisclosures] = useState<Set<string>>(
		new Set(),
	);
	const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

	const totalCount = list.items.length;
	const checkedCount = list.items.filter((item) => item.checked).length;
	const progressPercent =
		totalCount > 0 ? Math.round((checkedCount / totalCount) * 100) : 0;
	const allDone = totalCount > 0 && checkedCount === totalCount;

	function handleToggleItem(id: string) {
		const item = list.items.find((i) => i.id === id);
		const result = toggleGroceryListItem(list, recipes, id);
		if (!result) return;
		onUpdate(result.list);
		if (result.affectedRecipes.length > 0) {
			onUpdateRecipes(result.affectedRecipes);
		}

		// Unchecking an item means its category isn't fully done anymore, so
		// any earlier "reopen this done category" override no longer applies.
		if (item?.checked) {
			const key =
				item.source === "custom"
					? CUSTOM_SECTION_KEY
					: (item.category ?? DEFAULT_GROCERY_CATEGORY);
			setManuallyExpanded((keys) => {
				if (!keys.has(key)) return keys;
				const next = new Set(keys);
				next.delete(key);
				return next;
			});
		}
	}

	function handleScrollToSection(key: string) {
		sectionRefs.current[key]?.scrollIntoView?.({
			behavior: "smooth",
			block: "start",
		});
	}

	function handleToggleDisclosure(key: string) {
		setOpenDisclosures((keys) => {
			const next = new Set(keys);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	function handleToggleCategoryCollapse(key: string) {
		setManuallyExpanded((keys) => {
			const next = new Set(keys);
			if (next.has(key)) next.delete(key);
			else next.add(key);
			return next;
		});
	}

	const recipeItems = list.items.filter((item) => item.source === "recipe");
	const customItems = list.items.filter((item) => item.source === "custom");

	const categorySections: Section[] = GROCERY_CATEGORIES.map((category) => ({
		key: category,
		label: category,
		items: recipeItems.filter(
			(item) => (item.category ?? DEFAULT_GROCERY_CATEGORY) === category,
		),
	})).filter((section) => section.items.length > 0);

	const sections: Section[] =
		customItems.length > 0
			? [
					...categorySections,
					{ key: CUSTOM_SECTION_KEY, label: "Custom", items: customItems },
				]
			: categorySections;

	const trimmedSearch = search.trim().toLowerCase();
	const isSearching = trimmedSearch !== "";
	const matchesSearch = (item: GroceryListItem) =>
		item.text.toLowerCase().includes(trimmedSearch);

	const visibleSections = sections
		.map((section) => ({
			...section,
			matchCount: isSearching
				? section.items.filter(matchesSearch).length
				: section.items.length,
		}))
		.filter((section) => !isSearching || section.matchCount > 0);

	if (allDone) {
		return (
			<div className="fixed inset-0 z-50 flex flex-col bg-bg">
				<GroceryModeTopBar
					checkedCount={checkedCount}
					totalCount={totalCount}
					onClose={onClose}
				/>
				<ProgressBar percent={100} />
				<div className="flex flex-1 flex-col items-center justify-center gap-1 px-8 text-center">
					<CelebrationBurst />
					<span className="mb-5 flex size-[76px] items-center justify-center rounded-full bg-sage/15">
						<CircleCheck
							className="size-9 text-sage"
							strokeWidth={2}
							aria-hidden="true"
						/>
					</span>
					<p className="display-title font-semibold text-2xl">Cart's full</p>
					<p className="mt-2 max-w-xs text-ink-dim leading-relaxed">
						Every item on the list is checked off. Nicely shopped — head back to
						review anything before checkout.
					</p>
					<Button className="mt-6" onClick={onClose}>
						Back to list
					</Button>
				</div>
			</div>
		);
	}

	return (
		<div className="fixed inset-0 z-50 flex flex-col bg-bg">
			<GroceryModeTopBar
				checkedCount={checkedCount}
				totalCount={totalCount}
				onClose={onClose}
			/>
			<ProgressBar percent={progressPercent} />

			<div className="flex flex-shrink-0 gap-2 overflow-x-auto px-5 py-3.5">
				{sections.map((section) => {
					const sectionChecked = section.items.filter(
						(item) => item.checked,
					).length;
					const sectionDone =
						section.items.length > 0 && sectionChecked === section.items.length;
					const hasMatch =
						!isSearching || section.items.some((item) => matchesSearch(item));
					return (
						<button
							key={section.key}
							type="button"
							onClick={() => handleScrollToSection(section.key)}
							className={cn(
								"inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-[10px] border px-3.5 py-2 font-semibold text-xs transition-opacity",
								sectionDone
									? "border-sage bg-sage/15 text-sage"
									: "border-line bg-bg2 text-ink-dim",
								!hasMatch && "opacity-40",
							)}
						>
							{sectionDone ? (
								<Check
									className="size-2.5"
									strokeWidth={3}
									aria-hidden="true"
								/>
							) : null}
							{section.label}
						</button>
					);
				})}
			</div>

			<div className="flex-shrink-0 px-5 pb-3.5">
				<SearchInput
					value={search}
					onChange={setSearch}
					placeholder="Search items…"
					aria-label="Search grocery items"
					clearLabel="Clear grocery mode search"
					className="py-2.5"
				/>
			</div>

			<div className="flex-1 overflow-y-auto px-5 pb-8">
				{visibleSections.length === 0 ? (
					<p className="mt-3 text-ink-dim text-sm">
						No items match "{search.trim()}".
					</p>
				) : (
					<div className="flex flex-col gap-6">
						{visibleSections.map((section) => {
							const sectionChecked = section.items.filter(
								(item) => item.checked,
							).length;
							const sectionTotal = section.items.length;
							const fullyDone =
								!isSearching &&
								sectionTotal > 0 &&
								sectionChecked === sectionTotal;
							const collapsedPill =
								fullyDone && !manuallyExpanded.has(section.key);

							if (collapsedPill) {
								return (
									<div
										key={section.key}
										ref={(el) => {
											sectionRefs.current[section.key] = el;
										}}
									>
										<button
											type="button"
											onClick={() => handleToggleCategoryCollapse(section.key)}
											aria-expanded={false}
											className="flex w-full items-center justify-between gap-3 rounded-[18px] border border-sage/35 bg-sage/8 p-4 text-left"
										>
											<div className="flex items-center gap-2.5">
												<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sage">
													<Check
														className="size-3.5 text-white"
														strokeWidth={3}
														aria-hidden="true"
													/>
												</span>
												<span>
													<span className="display-title block font-semibold text-sage text-base">
														{section.label}
													</span>
													<span className="mt-0.5 block text-ink-dim text-xs">
														{sectionTotal} item
														{sectionTotal === 1 ? "" : "s"} · all checked
													</span>
												</span>
											</div>
											<ChevronDown
												className="size-4 text-ink-dim"
												aria-hidden="true"
											/>
										</button>
									</div>
								);
							}

							const displayItems = isSearching
								? section.items.filter(matchesSearch)
								: section.items;
							const uncheckedItems = displayItems
								.filter((item) => !item.checked)
								.sort(byText);
							const checkedItems = displayItems
								.filter((item) => item.checked)
								.sort(byText);
							// Only tucks checked items away when there's still something
							// unchecked leading the section — a category the shopper just
							// manually reopened from its done pill (nothing left unchecked)
							// should show everything flat, not immediately re-hide itself
							// behind another disclosure.
							const hideCheckedBehindDisclosure =
								!isSearching &&
								uncheckedItems.length > 0 &&
								checkedItems.length >= CHECKED_DISCLOSURE_THRESHOLD;
							const disclosureOpen = openDisclosures.has(section.key);

							return (
								<section
									key={section.key}
									ref={(el) => {
										sectionRefs.current[section.key] = el;
									}}
								>
									<div className="mb-0.5 flex items-baseline justify-between">
										<h4 className="display-title font-semibold text-ink text-lg">
											{section.label}
										</h4>
										<div className="flex items-center gap-2">
											<span className="text-ink-dim text-xs tabular-nums">
												{isSearching
													? `${section.matchCount} match${section.matchCount === 1 ? "" : "es"}`
													: `${sectionChecked} of ${sectionTotal}`}
											</span>
											{fullyDone ? (
												<button
													type="button"
													onClick={() =>
														handleToggleCategoryCollapse(section.key)
													}
													aria-label={`Collapse ${section.label}`}
													className="text-ink-dim"
												>
													<ChevronUp className="size-3.5" aria-hidden="true" />
												</button>
											) : null}
										</div>
									</div>
									<div>
										{uncheckedItems.map((item, index) => (
											<GroceryModeRow
												key={item.id}
												item={item}
												onToggle={handleToggleItem}
												noBorder={
													index === uncheckedItems.length - 1 &&
													(hideCheckedBehindDisclosure ||
														checkedItems.length === 0)
												}
											/>
										))}
										{hideCheckedBehindDisclosure ? (
											<>
												<button
													type="button"
													onClick={() => handleToggleDisclosure(section.key)}
													aria-expanded={disclosureOpen}
													className="flex w-full items-center gap-1.5 py-3 text-ink-dim text-sm"
												>
													<ChevronRight
														className={cn(
															"size-3.5 transition-transform",
															disclosureOpen && "rotate-90",
														)}
														aria-hidden="true"
													/>
													{checkedItems.length} checked
												</button>
												{disclosureOpen
													? checkedItems.map((item, index) => (
															<GroceryModeRow
																key={item.id}
																item={item}
																onToggle={handleToggleItem}
																noBorder={index === checkedItems.length - 1}
															/>
														))
													: null}
											</>
										) : (
											checkedItems.map((item, index) => (
												<GroceryModeRow
													key={item.id}
													item={item}
													onToggle={handleToggleItem}
													noBorder={index === checkedItems.length - 1}
												/>
											))
										)}
									</div>
								</section>
							);
						})}
					</div>
				)}
			</div>
		</div>
	);
}

function GroceryModeTopBar({
	checkedCount,
	totalCount,
	onClose,
}: {
	checkedCount: number;
	totalCount: number;
	onClose: () => void;
}) {
	return (
		<div className="flex flex-shrink-0 items-center justify-between gap-3 border-line border-b p-5">
			<div>
				<p className="text-ink-dim text-xs tabular-nums">
					{checkedCount} of {totalCount} checked
				</p>
				<p className="display-title font-semibold text-accent text-sm">
					Grocery Mode
				</p>
			</div>
			<Button
				variant="secondary"
				className="size-9 shrink-0 rounded-[10px] p-0"
				aria-label="Exit grocery mode"
				onClick={onClose}
			>
				<X className="size-4" aria-hidden="true" />
			</Button>
		</div>
	);
}

function ProgressBar({ percent }: { percent: number }) {
	return (
		<div
			role="progressbar"
			aria-label="Items checked"
			aria-valuenow={percent}
			aria-valuemin={0}
			aria-valuemax={100}
			className="h-1 w-full flex-shrink-0 overflow-hidden bg-bg2"
		>
			<div
				className="h-full bg-sage transition-[width] duration-300 ease-out"
				style={{ width: `${percent}%` }}
			/>
		</div>
	);
}

function GroceryModeRow({
	item,
	onToggle,
	noBorder,
}: {
	item: GroceryListItem;
	onToggle: (id: string) => void;
	noBorder?: boolean;
}) {
	return (
		<Checkbox
			size="lg"
			checked={item.checked}
			onChange={() => onToggle(item.id)}
			className={cn(
				"w-full items-center gap-3.5 py-3.5",
				!noBorder && "border-line border-b",
			)}
			label={
				<IngredientLine
					checked={item.checked}
					quantity={formatGroceryItemQuantity(item)}
					name={item.text}
					className="text-base"
				/>
			}
		/>
	);
}
