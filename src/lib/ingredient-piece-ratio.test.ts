import { describe, expect, it } from "vitest";
import { lookupPieceRatio } from "./ingredient-piece-ratio";

describe("lookupPieceRatio", () => {
	it("finds a single-word match", () => {
		const ratio = lookupPieceRatio("garlic");
		expect(ratio).toMatchObject({
			piecesPerContainer: 10,
			containerUnitSingular: "bulb",
			containerUnitPlural: "bulbs",
		});
		expect(ratio?.pieceUnits).toContain("clove");
		expect(ratio?.containerUnits).toContain("whole");
	});

	it("finds a multi-word match", () => {
		const ratio = lookupPieceRatio("green onion");
		expect(ratio).toMatchObject({
			piecesPerContainer: 6,
			containerUnitSingular: "bunch",
			containerUnitPlural: "bunches",
		});
	});

	it("is case/whitespace-insensitive", () => {
		expect(lookupPieceRatio("  Garlic  ")).toMatchObject({
			piecesPerContainer: 10,
		});
	});

	it("falls back to a generic single-word match when a descriptive modifier precedes it", () => {
		expect(lookupPieceRatio("fresh garlic")).toMatchObject({
			piecesPerContainer: 10,
		});
		expect(lookupPieceRatio("large green onion")).toMatchObject({
			piecesPerContainer: 6,
		});
	});

	it("does not confuse scallion and green onion despite sharing no words", () => {
		const scallion = lookupPieceRatio("scallion");
		const greenOnion = lookupPieceRatio("green onion");
		expect(scallion).toMatchObject({
			piecesPerContainer: 6,
			containerUnitSingular: "bunch",
		});
		expect(greenOnion).toMatchObject({
			piecesPerContainer: 6,
			containerUnitSingular: "bunch",
		});
	});

	it("returns null for an ingredient with no known piece ratio", () => {
		expect(lookupPieceRatio("onion")).toBeNull();
		expect(lookupPieceRatio("chicken breast")).toBeNull();
		expect(lookupPieceRatio("")).toBeNull();
	});

	it("finds bread's loaf-to-slice ratio", () => {
		expect(lookupPieceRatio("bread")).toMatchObject({
			piecesPerContainer: 20,
			containerUnitSingular: "loaf",
			containerUnitPlural: "loaves",
		});
	});
});
