import { Plus, Search, X } from "lucide-react";
import {
	type FormEvent,
	type KeyboardEvent as ReactKeyboardEvent,
	useEffect,
	useRef,
	useState,
} from "react";
import { Button } from "#/components/ui/button";
import { ConfirmDialog } from "#/components/ui/confirm-dialog";
import { ServingsStepper } from "#/components/ui/servings-stepper";
import {
	APPROXIMATE_ITEMS_NOTE,
	aggregateGroceryItems,
	type CustomGroceryIngredient,
	carryOverCheckedState,
	formatGroceryItemLine,
} from "#/lib/aggregate-grocery-items";
import { filterRecipes } from "#/lib/filter-recipes";
import {
	GROCERY_LIST_NAME_MAX_LENGTH,
	type GroceryList,
	generateGroceryListName,
} from "#/lib/grocery-list";
import { parseCustomIngredientInput } from "#/lib/parse-custom-ingredient";
import type { Recipe } from "#/lib/recipe";
import { formatIngredientLine } from "#/lib/scale-servings";

// How many search matches to surface at once — enough to scan, not enough to
// turn the dropdown back into "just show every recipe".
const RECIPE_SEARCH_RESULTS_LIMIT = 8;

const SAVE_CONFIRMATION_DESCRIPTION_CREATE =
	"This list will be tied to the recipes you selected — checking off a combined item here will also check it off in those recipes. This can't be changed after saving.";
const SAVE_CONFIRMATION_DESCRIPTION_EDIT =
	"This replaces the list's current recipe selection and custom ingredients. Items unaffected by the change keep their checked state — anything new or changed resets to unchecked.";

type DraftCustomIngredient = CustomGroceryIngredient & { localId: string };

export function GroceryListCreateForm({
	recipes,
	editingList,
	onUpdateRecipe,
	onSave,
	onClose,
}: {
	recipes: Recipe[];
	editingList?: GroceryList;
	onUpdateRecipe: (recipe: Recipe) => void;
	onSave: (list: GroceryList) => void;
	onClose: () => void;
}) {
	const isEditing = editingList != null;
	const [selectedRecipeIds, setSelectedRecipeIds] = useState<string[]>(
		() => editingList?.recipeIds ?? [],
	);
	const [recipeSearch, setRecipeSearch] = useState("");
	const recipeSearchInputRef = useRef<HTMLInputElement>(null);
	const [customIngredients, setCustomIngredients] = useState<
		DraftCustomIngredient[]
	>(() =>
		(editingList?.items ?? [])
			.filter((item) => item.source === "custom")
			.map((item) => ({
				localId: item.id,
				text: item.text,
				quantity: item.quantity,
				unit: item.unit,
			})),
	);
	const [customText, setCustomText] = useState("");
	const [customQuantity, setCustomQuantity] = useState("");
	const [customUnit, setCustomUnit] = useState("");
	const [customName, setCustomName] = useState<string | null>(
		() => editingList?.name ?? null,
	);
	const [confirmOpen, setConfirmOpen] = useState(false);

	useEffect(() => {
		function onKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") onClose();
		}
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	}, [onClose]);

	const selectedRecipes = selectedRecipeIds
		.map((id) => recipes.find((recipe) => recipe.id === id))
		.filter((recipe): recipe is Recipe => Boolean(recipe));
	const previewItems = aggregateGroceryItems(
		selectedRecipes,
		customIngredients,
	);
	const canSave = selectedRecipes.length > 0 || customIngredients.length > 0;
	const defaultName = generateGroceryListName(
		selectedRecipes.map((recipe) => recipe.title),
	);
	const name = customName ?? defaultName;

	// Only recipe ingredients feed the suggestions — custom ingredients the
	// user is still typing shouldn't suggest themselves back.
	const knownUnits = Array.from(
		new Set(
			recipes.flatMap((recipe) =>
				recipe.ingredients.map((ingredient) => ingredient.unit.trim()),
			),
		),
	)
		.filter(Boolean)
		.sort((a, b) => a.localeCompare(b));

	const trimmedRecipeSearch = recipeSearch.trim();
	const recipeSearchResults = trimmedRecipeSearch
		? filterRecipes(recipes, {
				search: trimmedRecipeSearch,
				difficulty: "all",
				favoritesOnly: false,
			})
				.filter((recipe) => !selectedRecipeIds.includes(recipe.id))
				.slice(0, RECIPE_SEARCH_RESULTS_LIMIT)
		: [];

	function handleAddRecipe(id: string) {
		setSelectedRecipeIds((ids) => (ids.includes(id) ? ids : [...ids, id]));
		setRecipeSearch("");
		// Selecting a recipe from the dropdown moves focus to its (now-removed)
		// button, so the browser drops focus entirely — pull it back to the
		// search field so adding several recipes in a row doesn't require
		// re-clicking in between each one.
		recipeSearchInputRef.current?.focus();
	}

	function handleRemoveRecipe(id: string) {
		setSelectedRecipeIds((ids) => ids.filter((recipeId) => recipeId !== id));
	}

	function handleServingsChange(recipe: Recipe, nextServings: number) {
		if (nextServings < 1 || nextServings === recipe.currentServings) return;
		onUpdateRecipe({ ...recipe, currentServings: nextServings });
	}

	function addCustomIngredient(entry: {
		text: string;
		quantity: number;
		unit: string;
	}) {
		setCustomIngredients((items) => [
			...items,
			{ localId: crypto.randomUUID(), ...entry },
		]);
		setCustomText("");
		setCustomQuantity("");
		setCustomUnit("");
	}

	function handleAddCustomIngredient(event: FormEvent) {
		event.preventDefault();
		const text = customText.trim();
		const unit = customUnit.trim();
		const quantity = Number(customQuantity);
		if (!text || !unit || !Number.isFinite(quantity) || quantity <= 0) return;
		addCustomIngredient({ text, quantity, unit });
	}

	// Pressing Enter in just the item field is the explicit trigger for the
	// smart split — e.g. typing "1 pc chicken" and hitting Enter there parses
	// it into Quantity ("1"), Unit ("pc"), and item ("chicken"), then adds it
	// immediately (same as clicking Add), instead of submitting the form
	// natively (the native Enter-submits-form behavior is what Quantity/Unit
	// still use).
	function handleItemFieldKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
		if (event.key !== "Enter") return;
		event.preventDefault();
		const parsed = parseCustomIngredientInput(customText, knownUnits);
		if (!parsed || parsed.quantity <= 0) return;
		addCustomIngredient(parsed);
	}

	function handleRemoveCustomIngredient(localId: string) {
		setCustomIngredients((items) =>
			items.filter((item) => item.localId !== localId),
		);
	}

	function handleNameChange(value: string) {
		setCustomName(value.slice(0, GROCERY_LIST_NAME_MAX_LENGTH));
	}

	function handleConfirmSave() {
		setConfirmOpen(false);
		const finalName = name.trim() || defaultName;
		const recipeIds = selectedRecipes.map((recipe) => recipe.id);
		if (editingList) {
			onSave({
				...editingList,
				name: finalName,
				recipeIds,
				items: carryOverCheckedState(editingList.items, previewItems),
			});
			return;
		}
		onSave({
			id: crypto.randomUUID(),
			createdAt: new Date().toISOString(),
			name: finalName,
			recipeIds,
			items: previewItems,
			expanded: false,
		});
	}

	return (
		<div className="fixed inset-0 z-50 flex items-center justify-center p-4">
			<button
				type="button"
				aria-label="Dismiss dialog"
				className="absolute inset-0 bg-black/40"
				onClick={onClose}
			/>
			<div
				role="dialog"
				aria-modal="true"
				aria-labelledby="grocery-list-create-title"
				className="card relative flex max-h-[90vh] w-full max-w-2xl flex-col bg-card"
			>
				<div className="flex items-center justify-between border-line border-b p-5">
					<h2 id="grocery-list-create-title" className="display-title text-lg">
						{isEditing ? "Edit grocery list" : "Create grocery list"}
					</h2>
					<Button
						variant="secondary"
						className="size-8 shrink-0 rounded-[10px] p-0"
						aria-label="Close"
						onClick={onClose}
					>
						<X className="size-4" aria-hidden="true" />
					</Button>
				</div>

				<div className="flex-1 overflow-y-auto p-5">
					<fieldset>
						<legend className="font-medium text-sm">Recipes</legend>
						{recipes.length === 0 ? (
							<p className="mt-2 text-sm text-ink-dim">
								No saved recipes yet — add a custom ingredient below instead.
							</p>
						) : (
							<>
								<div className="relative mt-2">
									<div className="card flex items-center gap-2 rounded-full bg-surface px-4 py-2">
										<Search
											className="size-4 shrink-0 text-ink-dim"
											aria-hidden="true"
										/>
										<input
											ref={recipeSearchInputRef}
											type="search"
											value={recipeSearch}
											onChange={(event) => setRecipeSearch(event.target.value)}
											placeholder="Search recipes to add…"
											aria-label="Search recipes to add"
											className="w-full bg-transparent text-sm text-ink outline-none placeholder:text-ink-dim"
										/>
									</div>
									{trimmedRecipeSearch ? (
										<ul className="mt-1 flex flex-col gap-1 rounded-[10px] border border-line bg-surface p-1">
											{recipeSearchResults.length === 0 ? (
												<li className="px-3 py-2 text-sm text-ink-dim">
													No matching recipes.
												</li>
											) : (
												recipeSearchResults.map((recipe) => (
													<li key={recipe.id}>
														<button
															type="button"
															onClick={() => handleAddRecipe(recipe.id)}
															className="w-full rounded-[10px] px-3 py-2 text-left text-sm hover:bg-bg2"
														>
															{recipe.title}
														</button>
													</li>
												))
											)}
										</ul>
									) : null}
								</div>

								{selectedRecipes.length > 0 ? (
									<ul className="mt-3 flex flex-col gap-2">
										{selectedRecipes.map((recipe) => (
											<li
												key={recipe.id}
												className="flex items-center justify-between gap-3 rounded-[10px] border border-line px-3 py-2"
											>
												<span className="min-w-0 flex-1 break-words text-sm">
													{recipe.title}
												</span>
												<ServingsStepper
													value={recipe.currentServings}
													onChange={(next) =>
														handleServingsChange(recipe, next)
													}
												/>
												<Button
													variant="secondary"
													className="size-8 shrink-0 rounded-[10px] p-0"
													aria-label={`Remove ${recipe.title}`}
													onClick={() => handleRemoveRecipe(recipe.id)}
												>
													<X className="size-4" aria-hidden="true" />
												</Button>
											</li>
										))}
									</ul>
								) : (
									<p className="mt-3 text-sm text-ink-dim">
										No recipes added yet — search above to add one.
									</p>
								)}
							</>
						)}
					</fieldset>

					<fieldset className="mt-5">
						<legend className="font-medium text-sm">Custom ingredients</legend>
						{customIngredients.length > 0 ? (
							<ul className="mt-2 flex flex-col gap-1.5">
								{customIngredients.map((item) => (
									<li
										key={item.localId}
										className="flex items-center justify-between gap-2 rounded-[10px] bg-bg2 px-3 py-1.5 text-sm"
									>
										<span className="tabular-nums">
											{formatIngredientLine(
												item.quantity,
												item.unit,
												item.text,
											)}
										</span>
										<Button
											variant="secondary"
											className="size-7 shrink-0 rounded-[10px] border-0 bg-transparent p-0"
											aria-label={`Remove ${item.text}`}
											onClick={() => handleRemoveCustomIngredient(item.localId)}
										>
											<X className="size-3.5" aria-hidden="true" />
										</Button>
									</li>
								))}
							</ul>
						) : null}
						<form
							onSubmit={handleAddCustomIngredient}
							className="mt-2 flex flex-col gap-2 min-[420px]:flex-row min-[420px]:flex-wrap min-[420px]:items-center"
						>
							<input
								type="text"
								value={customText}
								onChange={(event) => setCustomText(event.target.value)}
								onKeyDown={handleItemFieldKeyDown}
								placeholder="Item, e.g. 1 pc chicken"
								aria-label="Custom ingredient name"
								className="w-full min-w-0 rounded-full border border-line bg-surface px-3 py-1.5 text-sm outline-none min-[420px]:flex-1"
							/>
							<div className="flex flex-wrap items-center gap-2">
								<input
									type="number"
									inputMode="decimal"
									min="0"
									step="any"
									value={customQuantity}
									onChange={(event) => setCustomQuantity(event.target.value)}
									placeholder="Qty"
									aria-label="Custom ingredient quantity"
									className="w-20 rounded-full border border-line bg-surface px-3 py-1.5 text-sm tabular-nums outline-none [appearance:textfield]"
								/>
								<input
									type="text"
									value={customUnit}
									onChange={(event) => setCustomUnit(event.target.value)}
									placeholder="Unit"
									aria-label="Custom ingredient unit"
									list="grocery-known-units"
									className="w-24 rounded-full border border-line bg-surface px-3 py-1.5 text-sm outline-none"
								/>
								<datalist id="grocery-known-units">
									{knownUnits.map((unit) => (
										<option key={unit} value={unit} />
									))}
								</datalist>
								<Button
									type="submit"
									variant="secondary"
									className="shrink-0 gap-1"
									disabled={
										!customText.trim() ||
										!customUnit.trim() ||
										!(Number(customQuantity) > 0)
									}
								>
									<Plus className="size-4" aria-hidden="true" />
									Add
								</Button>
							</div>
						</form>
					</fieldset>

					<div className="mt-5">
						<h3 className="font-medium text-sm">Ingredient preview</h3>
						{previewItems.length === 0 ? (
							<p className="mt-2 text-sm text-ink-dim">
								Nothing yet — select a recipe or add a custom ingredient.
							</p>
						) : (
							<>
								<ul className="mt-2 grid grid-cols-1 list-disc gap-1.5 pl-5 text-sm min-[420px]:grid-cols-2">
									{previewItems.map((item) => (
										<li key={item.id} className="tabular-nums">
											{formatGroceryItemLine(item)}
										</li>
									))}
								</ul>
								{previewItems.some((item) => item.approximate) ? (
									<p className="mt-2 text-ink-dim text-xs">
										{APPROXIMATE_ITEMS_NOTE}
									</p>
								) : null}
							</>
						)}
					</div>

					<div className="mt-5">
						<label htmlFor="grocery-list-name" className="font-medium text-sm">
							List name
						</label>
						<input
							id="grocery-list-name"
							type="text"
							value={name}
							onChange={(event) => handleNameChange(event.target.value)}
							maxLength={GROCERY_LIST_NAME_MAX_LENGTH}
							className="mt-2 w-full rounded-full border border-line bg-surface px-4 py-2 text-sm outline-none"
						/>
					</div>
				</div>

				<div className="flex items-center justify-between gap-3 border-line border-t p-5">
					<p className="text-ink-dim text-xs">
						{canSave
							? null
							: "Select at least one recipe or add a custom ingredient to save."}
					</p>
					<div className="flex shrink-0 gap-2">
						<Button variant="secondary" onClick={onClose}>
							Cancel
						</Button>
						<Button disabled={!canSave} onClick={() => setConfirmOpen(true)}>
							Save
						</Button>
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={confirmOpen}
				title={
					isEditing
						? "Save changes to this grocery list?"
						: "Save this grocery list?"
				}
				description={
					isEditing
						? SAVE_CONFIRMATION_DESCRIPTION_EDIT
						: SAVE_CONFIRMATION_DESCRIPTION_CREATE
				}
				confirmLabel="Save"
				cancelLabel="Cancel"
				onConfirm={handleConfirmSave}
				onCancel={() => setConfirmOpen(false)}
			/>
		</div>
	);
}
