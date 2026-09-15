import {
	canonicalizeUnitForMerging,
	roundGroceryQuantity,
} from "./aggregate-grocery-items";
import type { GroceryListItem } from "./grocery-list";
import { lookupPieceRatio } from "./ingredient-piece-ratio";
import {
	convertFromBase,
	convertToBase,
	getUnitDimension,
	pickDisplayUnit,
	pickMetricDisplayUnit,
} from "./unit-conversion";

type CombinedQuantity = { quantity: number; unit: string };

// Combines two already-finalized grocery quantities into one, reusing the
// same display-unit rules a fresh aggregation would apply (see
// aggregate-grocery-items.ts) — but starting from each item's own
// already-computed quantity/unit rather than re-deriving from raw recipe
// ingredients, since by the time two items reach the merge-suggestion stage
// they're both already in canonical display form (metric mass/volume, a
// piece-ratio container unit, a bare count, or an arbitrary custom unit).
// Returns null when the two units genuinely can't be combined numerically
// (different dimensions, no shared piece ratio, not the same literal unit)
// — the caller should treat that as "not mergeable", not attempt a lossy
// merge.
function tryMergeQuantities(
	canonicalText: string,
	a: { quantity: number; unit: string },
	b: { quantity: number; unit: string },
): CombinedQuantity | null {
	const unitA = a.unit.trim();
	const unitB = b.unit.trim();
	const normA = unitA.toLowerCase();
	const normB = unitB.toLowerCase();
	const pieceRatio = lookupPieceRatio(canonicalText);

	// Piece-ratio aware first, since a container/sub-piece unit (e.g.
	// "bulb"/"clove") isn't in unit-conversion.ts's table at all — checked
	// before the generic dimension branch below so a container+sub-piece
	// combination (e.g. "1 bulb" + "8 cloves") converts correctly too, not
	// just a matching pair of the same form.
	if (pieceRatio) {
		const aContainers = pieceRatio.containerUnits.includes(normA)
			? a.quantity
			: pieceRatio.pieceUnits.includes(normA)
				? a.quantity / pieceRatio.piecesPerContainer
				: null;
		const bContainers = pieceRatio.containerUnits.includes(normB)
			? b.quantity
			: pieceRatio.pieceUnits.includes(normB)
				? b.quantity / pieceRatio.piecesPerContainer
				: null;
		if (aContainers !== null && bContainers !== null) {
			const rounded = roundGroceryQuantity(
				aContainers + bContainers,
				pieceRatio.containerUnitSingular,
			);
			return {
				quantity: rounded,
				unit:
					rounded === 1
						? pieceRatio.containerUnitSingular
						: pieceRatio.containerUnitPlural,
			};
		}
	}

	// Recognized dimension (mass/volume/length/count) next, even when both
	// items already share the exact same unit — e.g. "500 g" + "600 g" must
	// still go through the magnitude-based display pick to come out as
	// "1.1 kg", not stay "1100 g".
	const dimension = getUnitDimension(unitA);
	if (dimension && dimension === getUnitDimension(unitB)) {
		return mergeByDimension(dimension, canonicalText, a, b, unitA, unitB);
	}

	// Fallback: neither of the above, but the two items still share the
	// exact same literal unit string (case/whitespace/simple-plural
	// insensitive) — covers an arbitrary custom/unrecognized unit the table
	// doesn't know about at all (e.g. "pack"/"packs").
	if (canonicalizeUnitForMerging(unitA) === canonicalizeUnitForMerging(unitB)) {
		return {
			quantity: roundGroceryQuantity(a.quantity + b.quantity, unitA),
			unit: unitA,
		};
	}

	return null;
}

function mergeByDimension(
	dimension: "mass" | "volume" | "length" | "count",
	canonicalText: string,
	a: { quantity: number; unit: string },
	b: { quantity: number; unit: string },
	unitA: string,
	unitB: string,
): CombinedQuantity {
	const pieceRatio = lookupPieceRatio(canonicalText);

	const baseTotal =
		(convertToBase(a.quantity, unitA) ?? 0) +
		(convertToBase(b.quantity, unitB) ?? 0);

	if (dimension === "mass" || dimension === "volume") {
		const displayUnit = pickMetricDisplayUnit(dimension, baseTotal);
		return {
			quantity: roundGroceryQuantity(
				convertFromBase(baseTotal, displayUnit),
				displayUnit,
			),
			unit: displayUnit,
		};
	}

	if (dimension === "count") {
		if (pieceRatio) {
			const rounded = roundGroceryQuantity(
				baseTotal,
				pieceRatio.containerUnitSingular,
			);
			return {
				quantity: rounded,
				unit:
					rounded === 1
						? pieceRatio.containerUnitSingular
						: pieceRatio.containerUnitPlural,
			};
		}
		return { quantity: roundGroceryQuantity(baseTotal, ""), unit: "" };
	}

	// "length" — no display-unit table entry of its own here (unlike
	// mass/volume, there's no "always metric" rule for it), so pick whichever
	// of the two contributing units is larger, same as an unbucketed group.
	const displayUnit = pickDisplayUnit([unitA, unitB]);
	return {
		quantity: roundGroceryQuantity(
			convertFromBase(baseTotal, displayUnit),
			displayUnit,
		),
		unit: displayUnit,
	};
}

// Merges two grocery items the user has confirmed are the same ingredient
// (see suggest-grocery-merges.ts) into one. `canonicalText` is whichever
// name the merged item keeps (the suggestion always picks the shorter of
// the two — see suggest-grocery-merges.ts). Returns null when the two
// quantities can't be combined (see tryMergeQuantities) — the caller should
// leave both items alone rather than force a merge that would lose or
// misrepresent a quantity. Only meaningful for two items of the same
// `source` (recipe or custom); mixing an item's `origins` semantics across
// sources isn't handled here, so the caller should not offer merging across
// sources in the first place.
export function mergeGroceryListItems(
	a: GroceryListItem,
	b: GroceryListItem,
	canonicalText: string,
): GroceryListItem | null {
	const combined = tryMergeQuantities(canonicalText, a, b);
	if (!combined) return null;

	return {
		id: crypto.randomUUID(),
		text: canonicalText,
		quantity: combined.quantity,
		unit: combined.unit,
		// Only fully checked once both halves were — otherwise the merged
		// line still represents something not entirely gathered yet.
		checked: a.checked && b.checked,
		source: a.source,
		origins:
			a.source === "recipe"
				? [...(a.origins ?? []), ...(b.origins ?? [])]
				: undefined,
		approximate: (a.approximate || b.approximate) ?? undefined,
		category: a.category ?? b.category,
	};
}
