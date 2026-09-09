import type { GroceryListItem, GroceryListItemOrigin } from "./grocery-list";
import { lookupIngredientDensity } from "./ingredient-density";
import { lookupPieceRatio } from "./ingredient-piece-ratio";
import type { Recipe } from "./recipe";
import { formatIngredientLine, scaleQuantity } from "./scale-servings";
import {
	convertFromBase,
	getUnitDimension,
	pickDisplayUnit,
	resolveUnit,
} from "./unit-conversion";

// Units that count discrete, whole ingredients — can't take a fractional
// (0.25) amount. Extend this list as new countable units show up from Groq.
export const COUNTABLE_UNITS: readonly string[] = [
	"piece",
	"pieces",
	"clove",
	"cloves",
	"egg",
	"eggs",
	"slice",
	"slices",
	"can",
	"cans",
	"unit",
	"units",
	"whole",
	"each",
	"ear",
	"ears",
	"head",
	"heads",
	"loaf",
	"loaves",
	"bunch",
	"bunches",
	"bulb",
	"bulbs",
	"dozen",
	"half dozen",
	"half-dozen",
];

export type CustomGroceryIngredient = {
	text: string;
	quantity: number;
	unit: string;
};

const EPSILON = 1e-9;

function roundUpToMultiple(value: number, multiple: number): number {
	const result = Math.ceil((value - EPSILON) / multiple) * multiple;
	// Squash float drift (e.g. 1.5000000000000002) introduced by the division above.
	return Math.round(result * 1e6) / 1e6;
}

export function isCountableUnit(unit: string): boolean {
	return COUNTABLE_UNITS.includes(unit.trim().toLowerCase());
}

export function roundGroceryQuantity(quantity: number, unit: string): number {
	const normalizedUnit = unit.trim().toLowerCase();
	if (normalizedUnit === "mg" || normalizedUnit === "ml") {
		return roundUpToMultiple(quantity, 100);
	}
	if (isCountableUnit(normalizedUnit)) {
		return roundUpToMultiple(quantity, 1);
	}
	return roundUpToMultiple(quantity, 0.25);
}

// Which running total a merged group accumulates into: "mass" (grams) and
// "volume" (ml) both merge across differently-spelled/scaled units of that
// dimension (e.g. "tbsp" + "cup" -> both volume); "count" merges discrete
// units (e.g. "dozen" + "egg", or "clove" + "whole" for an ingredient with a
// known piece ratio — see ingredient-piece-ratio.ts); null is the fallback
// for anything the unit table doesn't recognize, where merging still
// requires an exact unit-string match.
type GroupBucket = "mass" | "volume" | "count" | null;

type IngredientGroup = {
	text: string;
	bucket: GroupBucket;
	// Every distinct original unit string contributed to this group — used to
	// pick a display unit for a "volume"/null-bucket group once merging is
	// done (see pickDisplayUnit); unused for "mass" (see roundGroceryQuantity
	// call below, which picks g/kg by magnitude instead, since a mass group
	// may include no native mass unit at all — see `approximate`) and for
	// "count" (display is re-derived from an ingredient-piece-ratio lookup or
	// a filter over this list — see the finalization step below).
	unitsUsed: string[];
	// Running total in the bucket's base unit (grams/ml/one-discrete-item, or
	// container-equivalents for a "count" group with a known piece ratio), or
	// a direct sum in `unitsUsed[0]` when bucket is null.
	quantity: number;
	// True once any contribution to this group came from an approximate
	// conversion rather than an exact one — either converting a volume unit
	// to mass via an ingredient density (ingredient-density.ts), e.g.
	// combining "2 cups sugar" with "500 g sugar"; or converting a sub-piece
	// count to its container via a piece ratio (ingredient-piece-ratio.ts),
	// e.g. combining "7 cloves garlic" with "1 whole garlic". Surfaced on the
	// resulting GroceryListItem so the UI can flag the total as an estimate.
	approximate: boolean;
	// Unique, order-preserved descriptions collected from every ingredient
	// merged into this group (e.g. "chopped", "minced") — kept as detail since
	// combining on the shared base name would otherwise lose it (TEST-255).
	descriptions: string[];
	origins: GroceryListItemOrigin[];
};

export function aggregateGroceryItems(
	recipes: Recipe[],
	customIngredients: CustomGroceryIngredient[] = [],
): GroceryListItem[] {
	const groups = new Map<string, IngredientGroup>();

	for (const recipe of recipes) {
		for (const ingredient of recipe.ingredients) {
			// Grocery combination keys on the base name (e.g. "garlic") rather
			// than the full descriptive text (e.g. "garlic, chopped") so
			// differently-described ingredients that are really the same item
			// still merge — falling back to `text` for ingredients saved before
			// the base name/description split existed (TEST-255).
			const baseName = (ingredient.baseName ?? ingredient.text).trim();
			const description = (ingredient.description ?? "").trim();
			const normalizedBaseName = baseName.toLowerCase();
			const trimmedUnit = ingredient.unit.trim();
			const origin: GroceryListItemOrigin = {
				recipeId: recipe.id,
				ingredientId: ingredient.id,
			};
			// Scale to the recipe's current servings, not the base quantity, so
			// adjusting servings before building the list changes what's on it.
			const scaledQuantity = scaleQuantity(
				ingredient.quantity,
				recipe.baseServings,
				recipe.currentServings,
			);

			// A mass unit always joins the mass bucket (grams). A volume unit
			// joins the mass bucket too -- via an approximate density -- whenever
			// this ingredient has a known one (see ingredient-density.ts), since
			// most dry/liquid staples are actually bought by weight, not by cup;
			// otherwise it joins the volume bucket (ml), merging only with other
			// volume units of the same ingredient.
			//
			// A count-based unit is checked first (most ingredient-specific
			// signal): if this ingredient has a known container/piece ratio (see
			// ingredient-piece-ratio.ts) and the unit is one of its recognized
			// sub-piece aliases (e.g. "clove"), the quantity converts to
			// container-equivalents via that approximate ratio -- the one case
			// that actually estimates rather than counts exactly. If the unit is
			// instead one of the ingredient's own container aliases (e.g.
			// "bulb"), it's already in container terms, no ratio math needed. A
			// bare generic count word with no ingredient-specific meaning
			// (dozen/piece/egg/etc.) is accumulated as-is via its exact
			// dozen/half-dozen/piece multiplier -- "18 eggs" merges exactly from
			// "6 eggs" + "1 dozen eggs", never estimated.
			//
			// Anything else the unit table doesn't recognize gets no bucket and
			// falls back to matching on the literal unit string.
			const pieceRatio = lookupPieceRatio(baseName);
			const normalizedUnit = trimmedUnit.toLowerCase();
			const unitDef = resolveUnit(trimmedUnit);
			let bucket: GroupBucket = null;
			let contribution = scaledQuantity;
			let approximate = false;
			if (pieceRatio?.pieceUnits.includes(normalizedUnit)) {
				bucket = "count";
				contribution = scaledQuantity / pieceRatio.piecesPerContainer;
				approximate = true;
			} else if (pieceRatio?.containerUnits.includes(normalizedUnit)) {
				bucket = "count";
				contribution = scaledQuantity;
			} else if (unitDef?.dimension === "mass") {
				bucket = "mass";
				contribution = scaledQuantity * unitDef.toBase;
			} else if (unitDef?.dimension === "volume") {
				const density = lookupIngredientDensity(baseName);
				if (density !== null) {
					bucket = "mass";
					contribution = scaledQuantity * unitDef.toBase * density;
					approximate = true;
				} else {
					bucket = "volume";
					contribution = scaledQuantity * unitDef.toBase;
				}
			} else if (unitDef?.dimension === "count") {
				bucket = "count";
				contribution = scaledQuantity * unitDef.toBase;
			}

			const key = bucket
				? `${normalizedBaseName}::bucket:${bucket}`
				: `${normalizedBaseName}::unit:${trimmedUnit.toLowerCase()}`;

			const existing = groups.get(key);
			if (existing) {
				existing.quantity += contribution;
				existing.approximate = existing.approximate || approximate;
				existing.origins.push(origin);
				if (!existing.unitsUsed.includes(trimmedUnit)) {
					existing.unitsUsed.push(trimmedUnit);
				}
				if (description && !existing.descriptions.includes(description)) {
					existing.descriptions.push(description);
				}
			} else {
				groups.set(key, {
					text: baseName,
					bucket,
					unitsUsed: [trimmedUnit],
					quantity: contribution,
					approximate,
					descriptions: description ? [description] : [],
					origins: [origin],
				});
			}
		}
	}

	const recipeItems: GroceryListItem[] = Array.from(groups.values()).map(
		(group) => {
			// A mass group with no density estimate involved prefers the largest
			// *native* mass unit actually used (e.g. "500 g" + "1 kg" -> "kg", or
			// a lone "1 lb" stays "lb") — same heuristic as volume/unbucketed
			// groups. But once any contribution came from a density estimate
			// (`approximate`), a native unit is no longer trustworthy as the
			// display anchor: e.g. "1 cup sugar" (~200 g, estimated) + "500 mg
			// sugar" (native) would otherwise lock onto "mg" for the whole total
			// just because it's the only native mass unit present, producing an
			// unreadable "≈200500 mg" instead of "≈200.5 g". So an approximate
			// group always picks whichever of mg/g/kg fits the total's magnitude
			// instead, same as a group with no native mass unit at all (e.g. "1
			// tbsp" + "1 cup" sugar, entirely density-estimated).
			const massUnitsUsed = group.approximate
				? []
				: group.unitsUsed.filter(
						(unit) => resolveUnit(unit)?.dimension === "mass",
					);

			let displayUnit: string;
			let displayQuantity: number;
			// Set only by the count/piece-ratio branch below, where the quantity
			// is already rounded (to a whole container count) before the display
			// unit can even be chosen (singular vs. plural depends on it) --
			// every other branch rounds the usual way, via roundGroceryQuantity
			// on the final displayUnit/displayQuantity once both are known.
			let alreadyRoundedQuantity: number | null = null;
			if (group.bucket === "mass") {
				displayUnit =
					massUnitsUsed.length > 0
						? pickDisplayUnit(massUnitsUsed)
						: group.quantity >= 1000
							? "kg"
							: group.quantity < 1
								? "mg"
								: "g";
				displayQuantity = convertFromBase(group.quantity, displayUnit);
			} else if (group.bucket === "count") {
				const pieceRatio = lookupPieceRatio(group.text);
				if (pieceRatio) {
					// Always the ingredient's purchasable container unit (e.g. a
					// "bulb" of garlic), rounded up since you can't buy a fraction
					// of one -- regardless of which unit(s) the recipe(s) actually
					// used. Same principle as always showing a known-density
					// ingredient's total in grams rather than cups: once we know how
					// something is actually bought, show that.
					const roundedContainers = roundGroceryQuantity(
						group.quantity,
						pieceRatio.containerUnitSingular,
					);
					displayUnit =
						roundedContainers === 1
							? pieceRatio.containerUnitSingular
							: pieceRatio.containerUnitPlural;
					displayQuantity = roundedContainers;
					alreadyRoundedQuantity = roundedContainers;
				} else {
					// No ingredient-specific container: always the individual-item
					// count. "18 eggs" is more precise and useful than rolling up to
					// "2 dozen" (which would overstate what's needed by 6) -- unlike
					// a continuous quantity (cups, grams), picking a bigger discrete
					// unit here would misrepresent the total, not just make it
					// easier to read.
					const pieceUnitsUsed = group.unitsUsed.filter(
						(unit) => resolveUnit(unit)?.toBase === 1,
					);
					displayUnit = pieceUnitsUsed[0] ?? "piece";
					displayQuantity = group.quantity;
				}
			} else {
				// "volume" and unbucketed (null) groups display in whichever of
				// their actually-used units is largest (e.g. tbsp + cup -> cup) --
				// for an unbucketed group there's only ever one entry in
				// `unitsUsed` (it's the grouping key), so this just echoes it back.
				displayUnit = pickDisplayUnit(group.unitsUsed);
				displayQuantity = group.bucket
					? convertFromBase(group.quantity, displayUnit)
					: group.quantity;
			}

			return {
				id: crypto.randomUUID(),
				text: group.text,
				quantity:
					alreadyRoundedQuantity ??
					roundGroceryQuantity(displayQuantity, displayUnit),
				unit: displayUnit,
				checked: false,
				source: "recipe",
				origins: group.origins,
				descriptions:
					group.descriptions.length > 0 ? group.descriptions : undefined,
				approximate: group.approximate || undefined,
			};
		},
	);

	const customItems: GroceryListItem[] = customIngredients.map(
		(ingredient) => ({
			id: crypto.randomUUID(),
			text: ingredient.text,
			quantity: ingredient.quantity,
			unit: ingredient.unit,
			checked: false,
			source: "custom",
		}),
	);

	return [...recipeItems, ...customItems];
}

// Keys on dimension rather than the literal unit string when the unit is
// convertible, so checked state still carries over when re-aggregation picks
// a different display unit for the same merged group (e.g. a list that was
// "1.25 cup sugar" becomes "20 tbsp sugar" after a recipe is removed) — see
// `pickDisplayUnit` in unit-conversion.ts. A Tier-2 container/piece unit
// (e.g. "bulb"/"bulbs"/"clove" for garlic) isn't in unit-conversion.ts's
// table at all -- it's only meaningful relative to the specific ingredient's
// piece ratio (ingredient-piece-ratio.ts) -- so getUnitDimension alone would
// miss it and fall back to literal-unit matching, meaning a garlic total
// crossing the singular/plural boundary ("1 bulb" -> "2 bulbs") would
// needlessly reset its checked state. Checking the ingredient's own piece
// ratio first catches that case and keys it as "count", same smoothing as
// mass/volume already get.
function checkedStateKey(item: GroceryListItem): string {
	const normalizedText = item.text.trim().toLowerCase();
	const normalizedUnit = item.unit.trim().toLowerCase();
	const pieceRatio = lookupPieceRatio(item.text);
	const isPieceRatioUnit =
		pieceRatio?.containerUnits.includes(normalizedUnit) ||
		pieceRatio?.pieceUnits.includes(normalizedUnit);
	const dimension = isPieceRatioUnit ? "count" : getUnitDimension(item.unit);
	return dimension
		? `${normalizedText}::dim:${dimension}`
		: `${normalizedText}::unit:${normalizedUnit}`;
}

// Carries checked state from a list's previous items onto its freshly
// re-aggregated items (e.g. after an edit) — an item counts as "the same" if
// its merged text+unit is unchanged; anything new or changed resets to
// unchecked rather than guessing.
export function carryOverCheckedState(
	previousItems: GroceryListItem[],
	newItems: GroceryListItem[],
): GroceryListItem[] {
	const previouslyChecked = new Map(
		previousItems.map((item) => [checkedStateKey(item), item.checked]),
	);
	return newItems.map((item) => ({
		...item,
		checked: previouslyChecked.get(checkedStateKey(item)) ?? false,
	}));
}

// Renders a grocery item's display line, appending any preserved descriptions
// (TEST-255) after the base quantity/unit/name line, e.g.
// "2 cloves garlic (chopped, minced)" — and, for a quantity estimated by
// converting between mass and volume via an approximate ingredient density
// (see ingredient-density.ts), prefixing it with "≈" so it doesn't read as
// an exact total, e.g. "≈425 g sugar".
export function formatGroceryItemLine(item: GroceryListItem): string {
	const base = formatIngredientLine(item.quantity, item.unit, item.text);
	const withApproximation = item.approximate ? `≈${base}` : base;
	if (!item.descriptions || item.descriptions.length === 0) {
		return withApproximation;
	}
	return `${withApproximation} (${item.descriptions.join(", ")})`;
}
