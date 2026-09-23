import {
	DEFAULT_GROCERY_CATEGORY,
	type GroceryCategory,
} from "./grocery-category";
import type { GroceryListItem, GroceryListItemOrigin } from "./grocery-list";
import { lookupIngredientDensity } from "./ingredient-density";
import { lookupLengthDensity } from "./ingredient-length-density";
import { lookupPieceRatio } from "./ingredient-piece-ratio";
import { isLiquidIngredient } from "./liquid-ingredients";
import type { Recipe } from "./recipe";
import {
	formatIngredientLine,
	formatIngredientQuantity,
	scaleQuantity,
} from "./scale-servings";
import { isSizeWordUnit, stripSizeDescriptor } from "./size-descriptor";
import {
	convertFromBase,
	getUnitDimension,
	pickDisplayUnit,
	pickMetricDisplayUnit,
	resolveUnit,
} from "./unit-conversion";

// Shown wherever a list of GroceryListItems includes one flagged
// `approximate` (grocery-list-detail.tsx and the create/edit form's
// preview) — kept in one place so the two stay in sync.
export const APPROXIMATE_ITEMS_NOTE =
	"≈ estimated by converting between measurements (e.g. cups and grams) using an approximate ingredient density — actual amount may vary.";

// Units that count discrete, whole ingredients — can't take a fractional
// (0.25) amount. Extend this list as new countable units show up from Groq.
export const COUNTABLE_UNITS: readonly string[] = [
	"",
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
	"tin",
	"tins",
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
	"box",
	"boxes",
	"jar",
	"jars",
	"bottle",
	"bottles",
	"packet",
	"packets",
	"package",
	"packages",
	"pack",
	"packs",
	"bag",
	"bags",
	"carton",
	"cartons",
	"tub",
	"tubs",
	"container",
	"containers",
	"pouch",
	"pouches",
	"sprig",
	"sprigs",
	"stalk",
	"stalks",
	"pinch",
	"pinches",
	"dash",
	"dashes",
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
	const normalized = unit.trim().toLowerCase();
	return (
		COUNTABLE_UNITS.includes(normalized) ||
		COUNTABLE_UNITS.includes(canonicalizeUnitForMerging(normalized))
	);
}

// An ingredient-agnostic unit the unit-conversion table doesn't recognize
// (e.g. "can", "slice", "packet" — anything not in unit-conversion.ts or a
// specific ingredient's ingredient-piece-ratio.ts entry) falls back to
// matching on the literal unit string alone, since there's nothing else to
// key on. Folds trailing "-s" or "-es" plurals so e.g. "1 can" and "2 cans"
// or "1 box" and "2 boxes" of the same ingredient merge into one grocery-list
// line rather than two.
export function canonicalizeUnitForMerging(unit: string): string {
	const lower = unit.trim().toLowerCase();
	if (lower.length <= 2) return lower;
	if (
		lower.endsWith("ches") ||
		lower.endsWith("shes") ||
		lower.endsWith("xes") ||
		lower.endsWith("zes") ||
		lower.endsWith("sses")
	) {
		return lower.slice(0, -2);
	}
	if (lower.endsWith("ss")) {
		return lower;
	}
	if (lower.endsWith("s")) {
		return lower.slice(0, -1);
	}
	return lower;
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

// Which running total a merged group accumulates into: "mass" (grams),
// "volume" (ml), and "length" (cm) each merge across differently-spelled/
// scaled units of that dimension (e.g. "tbsp" + "cup" -> both volume, or
// "in" + "cm" -> both length); "count" merges discrete units (e.g. "dozen" +
// "egg", or "clove" + "whole" for an ingredient with a known piece ratio —
// see ingredient-piece-ratio.ts); "liquid" is a recognized liquid
// (liquid-ingredients.ts) with a known density — unlike every other bucket,
// it merges a mass occurrence and a volume occurrence of the same ingredient
// into ONE shared group (see IngredientGroup.nativeMassGrams/
// nativeVolumeMl below), deferring the mass-vs-volume display decision to
// the finalization step once every occurrence has been seen; null is the
// fallback for anything the unit table doesn't recognize, where merging
// still requires an exact unit-string match.
type GroupBucket = "mass" | "volume" | "length" | "count" | "liquid" | null;

type IngredientGroup = {
	text: string;
	bucket: GroupBucket;
	// Every distinct original unit string contributed to this group — used to
	// pick a display unit for a "length"/null-bucket group once merging is
	// done (see pickDisplayUnit); unused for "mass", "volume", and "liquid"
	// (all always display in metric, picked by magnitude — see the
	// finalization step below) and for "count" (display is re-derived from
	// an ingredient-piece-ratio lookup or a filter over this list — see the
	// finalization step below).
	unitsUsed: string[];
	// Running total in the bucket's base unit (grams/ml/cm/one-discrete-item,
	// or container-equivalents for a "count" group with a known piece ratio),
	// or a direct sum in `unitsUsed[0]` when bucket is null. Unused for
	// "liquid" — see nativeMassGrams/nativeVolumeMl instead.
	quantity: number;
	// True once any contribution to this group came from an approximate
	// conversion rather than an exact one — converting a volume or length
	// unit to mass via an ingredient density (ingredient-density.ts /
	// ingredient-length-density.ts), e.g. combining "2 cups sugar" with "500 g
	// sugar", or "2 inches ginger" with "10 g ginger"; or converting a
	// sub-piece count to its container via a piece ratio
	// (ingredient-piece-ratio.ts), e.g. combining "7 cloves garlic" with "1
	// whole garlic". Surfaced on the resulting GroceryListItem so the UI can
	// flag the total as an estimate. Unused (always false) for "liquid" —
	// that bucket decides its own approximate flag at finalization instead,
	// based on whether bridging across dimensions was actually needed.
	approximate: boolean;
	origins: GroceryListItemOrigin[];
	// From whichever occurrence first created this group — later occurrences
	// of the same ingredient are expected to agree (same baseName should mean
	// the same grocery-store section), so this doesn't attempt to reconcile a
	// disagreement, just keeps the first answer.
	category: GroceryCategory;
	// Only used when bucket === "liquid": two running totals kept separate
	// (never combined during merging) so the finalization step can tell
	// whether a genuine mass occurrence exists for this ingredient — if so,
	// mass wins and nativeVolumeMl bridges into it via density (approximate);
	// if not, nativeVolumeMl displays directly in metric volume (exact, no
	// density ever consulted). See liquid-ingredients.ts for the full
	// reasoning.
	nativeMassGrams?: number;
	nativeVolumeMl?: number;
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
			// the base name/description split existed (TEST-255). `description`
			// itself (prep detail like "chopped"/"minced") is never surfaced on
			// the grocery list — see formatGroceryItemLine.
			const rawBaseName = (ingredient.baseName ?? ingredient.text).trim();
			// A leading/trailing size adjective (e.g. "medium onion") describes
			// which specimen to grab, not a different grocery item, so it's
			// stripped from the merge key/display name — see size-descriptor.ts.
			const baseName = stripSizeDescriptor(rawBaseName);
			const normalizedBaseName = baseName.toLowerCase();
			// Groq sometimes puts a size adjective in `unit` instead of the base
			// name (e.g. "1 onion" as quantity 1, unit "large") — treated as
			// unitless (same as unit "") so it doesn't block merging against an
			// occurrence that put "large" somewhere else.
			const rawUnit = ingredient.unit.trim();
			const trimmedUnit = isSizeWordUnit(rawUnit) ? "" : rawUnit;
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
				ingredient.scalingClass,
				baseName,
			);

			// A mass unit always joins the mass bucket (grams). A volume or
			// length unit joins the mass bucket too -- via an approximate density
			// -- whenever this ingredient has a known one (see
			// ingredient-density.ts for volume, ingredient-length-density.ts for
			// length), since most dry/liquid staples are actually bought by
			// weight, not by cup or by the inch; otherwise it joins the volume/
			// length bucket instead (ml/cm), merging only with other units of
			// that same dimension for the same ingredient.
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
			// Only meaningful when bucket ends up "liquid" — see its own type
			// comment above. Exactly one of these is non-zero per occurrence.
			let liquidMassContribution = 0;
			let liquidVolumeContribution = 0;
			if (pieceRatio?.pieceUnits.includes(normalizedUnit)) {
				bucket = "count";
				contribution = scaledQuantity / pieceRatio.piecesPerContainer;
				approximate = true;
			} else if (pieceRatio?.containerUnits.includes(normalizedUnit)) {
				bucket = "count";
				contribution = scaledQuantity;
			} else if (unitDef?.dimension === "mass") {
				const massInGrams = scaledQuantity * unitDef.toBase;
				// A recognized liquid with a known density joins the shared
				// "liquid" bucket instead of plain mass, so it can still merge
				// with a volume occurrence of the same liquid elsewhere (see
				// the finalization step's mass-wins-when-present rule) — e.g.
				// "50 g milk" + "100 ml milk" combine into one approximate
				// total instead of showing as two separate lines.
				if (
					isLiquidIngredient(baseName) &&
					lookupIngredientDensity(baseName) !== null
				) {
					bucket = "liquid";
					liquidMassContribution = massInGrams;
				} else {
					bucket = "mass";
					contribution = massInGrams;
				}
			} else if (unitDef?.dimension === "volume") {
				// A recognized liquid (see liquid-ingredients.ts) defaults to
				// the volume bucket, exact — unless it also has a known
				// density, in which case it joins the shared "liquid" bucket
				// instead, deferring to the finalization step whether this
				// ends up displayed in volume (the common case: nothing else
				// to bridge with) or mass (only when a real mass occurrence of
				// the same liquid shows up too). A liquid with no density
				// entry at all can't bridge either way, so it stays in plain
				// volume regardless. Density bridging straight to mass below
				// is reserved for a non-liquid ingredient a recipe measures
				// interchangeably by cup or by weight (flour, sugar, honey,
				// ...) — those still always prefer mass, unconditionally.
				if (isLiquidIngredient(baseName)) {
					const density = lookupIngredientDensity(baseName);
					if (density !== null) {
						bucket = "liquid";
						liquidVolumeContribution = scaledQuantity * unitDef.toBase;
					} else {
						bucket = "volume";
						contribution = scaledQuantity * unitDef.toBase;
					}
				} else {
					const density = lookupIngredientDensity(baseName);
					if (density !== null) {
						bucket = "mass";
						contribution = scaledQuantity * unitDef.toBase * density;
						approximate = true;
					} else {
						bucket = "volume";
						contribution = scaledQuantity * unitDef.toBase;
					}
				}
			} else if (unitDef?.dimension === "length") {
				const lengthDensity = lookupLengthDensity(baseName);
				if (lengthDensity !== null) {
					bucket = "mass";
					contribution = scaledQuantity * unitDef.toBase * lengthDensity;
					approximate = true;
				} else {
					bucket = "length";
					contribution = scaledQuantity * unitDef.toBase;
				}
			} else if (unitDef?.dimension === "count") {
				// A per-piece weight estimate (see Ingredient.approxGramsPerUnit,
				// populated by Groq only for a unitless produce-style item a
				// shopper could plausibly buy by weight, e.g. one onion — never
				// for a genuinely count-native item like eggs) bridges a bare
				// count into the mass bucket, the same way ingredient-density.ts
				// bridges volume — so "1 onion" and "200 g onion" merge into one
				// grocery-list line instead of staying separate.
				if (ingredient.approxGramsPerUnit != null) {
					bucket = "mass";
					contribution =
						scaledQuantity * unitDef.toBase * ingredient.approxGramsPerUnit;
					approximate = true;
				} else {
					bucket = "count";
					contribution = scaledQuantity * unitDef.toBase;
				}
			}

			const key = bucket
				? `${normalizedBaseName}::bucket:${bucket}`
				: `${normalizedBaseName}::unit:${canonicalizeUnitForMerging(trimmedUnit)}`;

			const existing = groups.get(key);
			if (existing) {
				if (bucket === "liquid") {
					existing.nativeMassGrams =
						(existing.nativeMassGrams ?? 0) + liquidMassContribution;
					existing.nativeVolumeMl =
						(existing.nativeVolumeMl ?? 0) + liquidVolumeContribution;
				} else {
					existing.quantity += contribution;
				}
				existing.approximate = existing.approximate || approximate;
				existing.origins.push(origin);
				if (!existing.unitsUsed.includes(trimmedUnit)) {
					existing.unitsUsed.push(trimmedUnit);
				}
			} else {
				groups.set(key, {
					text: baseName,
					bucket,
					unitsUsed: [trimmedUnit],
					quantity: bucket === "liquid" ? 0 : contribution,
					nativeMassGrams:
						bucket === "liquid" ? liquidMassContribution : undefined,
					nativeVolumeMl:
						bucket === "liquid" ? liquidVolumeContribution : undefined,
					approximate,
					origins: [origin],
					category: ingredient.category ?? DEFAULT_GROCERY_CATEGORY,
				});
			}
		}
	}

	const recipeItems: GroceryListItem[] = Array.from(groups.values()).map(
		(group) => {
			let displayUnit: string;
			let displayQuantity: number;
			// Set only by the count/piece-ratio branch below, where the quantity
			// is already rounded (to a whole container count) before the display
			// unit can even be chosen (singular vs. plural depends on it) --
			// every other branch rounds the usual way, via roundGroceryQuantity
			// on the final displayUnit/displayQuantity once both are known.
			let alreadyRoundedQuantity: number | null = null;
			// Overridden only by the "liquid" bucket below, where it's decided
			// here (based on whether cross-dimension bridging was actually
			// needed) rather than accumulated during merging like every other
			// bucket.
			let finalApproximate = group.approximate;
			if (
				group.bucket === "mass" ||
				(group.bucket === "volume" && isLiquidIngredient(group.text))
			) {
				// Always metric, picked by magnitude (mg/g/kg for mass, ml/l for
				// a genuine liquid's volume) — never a native unit like
				// "lb"/"cup", even when that's the only unit any contributing
				// recipe used. A grocery list merges ingredients from many
				// recipes at once, so one consistent unit system reads better
				// than echoing back whichever unit happened to be used first.
				// Shared with the metric-grocery-units migration (see
				// src/lib/migrations/metric-grocery-units.ts) so an existing
				// stored list converts to the exact same units a fresh
				// aggregation would produce.
				displayUnit = pickMetricDisplayUnit(
					group.bucket === "mass" ? "mass" : "volume",
					group.quantity,
				);
				displayQuantity = convertFromBase(group.quantity, displayUnit);
			} else if (group.bucket === "liquid") {
				const nativeMass = group.nativeMassGrams ?? 0;
				const nativeVolume = group.nativeVolumeMl ?? 0;
				if (nativeMass > 0) {
					// A genuine mass occurrence of this liquid exists somewhere in
					// the aggregation — mass wins (same precedent as any other
					// ingredient with a known density), bridging the volume total
					// into it via density. Only flagged approximate when that
					// bridging was actually needed — e.g. "50 g milk" alone (no
					// volume contribution at all) stays exact.
					const density = lookupIngredientDensity(group.text) ?? 0;
					const totalGrams = nativeMass + nativeVolume * density;
					displayUnit = pickMetricDisplayUnit("mass", totalGrams);
					displayQuantity = convertFromBase(totalGrams, displayUnit);
					finalApproximate = nativeVolume > 0;
				} else {
					// No mass occurrence anywhere for this liquid — nothing to
					// bridge into, so it stays in metric volume, exact (density
					// is never even consulted when there's no reason to).
					displayUnit = pickMetricDisplayUnit("volume", nativeVolume);
					displayQuantity = convertFromBase(nativeVolume, displayUnit);
					finalApproximate = false;
				}
			} else if (group.bucket === "volume") {
				// A volume-measured ingredient with no density entry to bridge
				// it to mass (that case is already "mass" above) and not a
				// recognized liquid either (see liquid-ingredients.ts) — e.g.
				// "1 cup chopped carrots". Forcing this into ml/l would be
				// actively misleading (nobody buys carrots by the milliliter),
				// so it falls back to whichever native unit was actually used,
				// same as the length/unrecognized case below.
				displayUnit = pickDisplayUnit(group.unitsUsed);
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
					// Prefer a bare unitless display ("2 onion") over an explicit
					// "whole"/"piece"/etc. when both were contributed to the same
					// group — reads more naturally, and which one happened to be
					// used first shouldn't be what decides this. Bare is also the
					// fallback when nothing in the group used a toBase-1 unit at all
					// (e.g. a group built entirely from "dozen"/"half dozen") --
					// hardcoding "piece" there would show a unit that was never
					// actually used (a group of "1 dozen" + "2 dozen" eggs
					// previously displayed as "36 piece eggs").
					displayUnit = pieceUnitsUsed.includes("")
						? ""
						: (pieceUnitsUsed[0] ?? "");
					displayQuantity = group.quantity;
				}
			} else {
				// "length" and unbucketed (null) groups display in whichever of
				// their actually-used units is largest (e.g. in + cm -> in) --
				// for an unbucketed group there's only ever one entry in
				// `unitsUsed` (it's the grouping key), so this just echoes it
				// back.
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
				approximate: finalApproximate || undefined,
				category: group.category,
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
	const rawDimension = isPieceRatioUnit ? "count" : getUnitDimension(item.unit);
	const isLiquidWithDensity =
		isLiquidIngredient(item.text) &&
		lookupIngredientDensity(item.text) !== null;
	const dimension =
		isLiquidWithDensity &&
		(rawDimension === "mass" || rawDimension === "volume")
			? "liquid"
			: rawDimension;
	return dimension
		? `${normalizedText}::dim:${dimension}`
		: `${normalizedText}::unit:${canonicalizeUnitForMerging(normalizedUnit)}`;
}

// Carries an item's identity — its `id`, in addition to its checked state —
// from a list's previous items onto its freshly re-aggregated items (e.g.
// after an edit): an item counts as "the same" if its merged text+unit is
// unchanged; anything new or changed gets a fresh id (aggregateGroceryItems
// always mints one) and starts unchecked. Reusing the old id for a surviving
// item is a minor nicety, not load-bearing — it avoids an unnecessary React
// remount of that row, but the whole list is a single whole-record
// last-write-wins unit for sync purposes (see sync-merge.ts's
// mergeGroceryList), so nothing downstream depends on any one item's id
// staying stable across a rebuild.
export function carryOverCheckedState(
	previousItems: GroceryListItem[],
	newItems: GroceryListItem[],
): GroceryListItem[] {
	const previousByKey = new Map<string, GroceryListItem[]>();
	for (const item of previousItems) {
		const key = checkedStateKey(item);
		const list = previousByKey.get(key);
		if (list) {
			list.push(item);
		} else {
			previousByKey.set(key, [item]);
		}
	}
	return newItems.map((item) => {
		const key = checkedStateKey(item);
		const list = previousByKey.get(key);
		const previous = list?.shift();
		return {
			...item,
			id: previous?.id ?? item.id,
			checked: previous?.checked ?? false,
		};
	});
}

// Renders just the "quantity [unit]" portion of a grocery item's display
// line — the part meant to render visually separate from the item name (see
// `IngredientLine`). For a quantity estimated by converting between mass and
// volume via an approximate ingredient density (see ingredient-density.ts),
// prefixes it with "≈" so it doesn't read as an exact total, e.g. "≈425 g".
export function formatGroceryItemQuantity(item: GroceryListItem): string {
	const base = formatIngredientQuantity(item.quantity, item.unit, item.text);
	return item.approximate ? `≈${base}` : base;
}

// Renders a grocery item's display line — deliberately never includes
// per-ingredient prep detail (e.g. "chopped", "minced"): that describes how
// an ingredient is used in a recipe, not what to buy, so it has no place on
// a shopping list. For a quantity estimated by converting between mass and
// volume via an approximate ingredient density (see ingredient-density.ts),
// prefixes it with "≈" so it doesn't read as an exact total, e.g.
// "≈425 g sugar".
export function formatGroceryItemLine(item: GroceryListItem): string {
	const base = formatIngredientLine(item.quantity, item.unit, item.text);
	return item.approximate ? `≈${base}` : base;
}
