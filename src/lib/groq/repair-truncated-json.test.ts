import { describe, expect, it } from "vitest";
import { repairTruncatedJson } from "./repair-truncated-json";

const complete = {
	title: "Beef Wellington",
	overview: "A showstopper.",
	baseServings: 4,
	difficulty: "hard",
	estimatedMinutes: 240,
	ingredients: [
		{ text: "beef tenderloin", quantity: 1, unit: "kg" },
		{ text: "puff pastry", quantity: 500, unit: "g" },
	],
	steps: [
		{ section: "Prep", text: "Sear the beef." },
		{ section: "Cook", text: "Wrap in pastry and bake." },
	],
};

function stringifyUpTo(value: unknown, cutAfter: string): string {
	const full = JSON.stringify(value);
	const index = full.indexOf(cutAfter);
	if (index === -1) {
		throw new Error(`"${cutAfter}" not found in stringified fixture`);
	}
	return full.slice(0, index + cutAfter.length);
}

describe("repairTruncatedJson", () => {
	it("returns complete JSON unchanged", () => {
		const input = JSON.stringify(complete);
		expect(repairTruncatedJson(input)).toBe(input);
		expect(JSON.parse(repairTruncatedJson(input))).toEqual(complete);
	});

	it("recovers complete ingredients when cut mid-string-value inside a later ingredient", () => {
		const truncated = stringifyUpTo(complete, '"puff past');

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([
			{ text: "beef tenderloin", quantity: 1, unit: "kg" },
		]);
		expect(parsed.title).toBe("Beef Wellington");
	});

	it("recovers complete ingredients when cut right after a comma between elements", () => {
		const full = JSON.stringify(complete);
		const marker = '{"text":"puff pastry"';
		const commaIndex = full.lastIndexOf(",", full.indexOf(marker));
		const truncated = full.slice(0, commaIndex + 1);

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([
			{ text: "beef tenderloin", quantity: 1, unit: "kg" },
		]);
	});

	it("drops the whole element when cut while the array is still open on its first entry", () => {
		const truncated = stringifyUpTo(complete, '"ingredients":[{"text":"beef');

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([]);
	});

	it("drops a dangling key with no value at all", () => {
		const truncated = stringifyUpTo(complete, '"steps":[{"section":"Prep"');
		const withDanglingKey = `${truncated},"text"`;

		const repaired = repairTruncatedJson(withDanglingKey);
		const parsed = JSON.parse(repaired);

		expect(parsed.steps).toEqual([]);
	});

	it("recovers steps that already have complete entries before the cut", () => {
		const truncated = stringifyUpTo(
			complete,
			'{"section":"Cook","text":"Wrap in pastry and bake."}',
		);
		const withPartialNext = `${truncated},{"section":"Plate","text":"Serve imm`;

		const repaired = repairTruncatedJson(withPartialNext);
		const parsed = JSON.parse(repaired);

		expect(parsed.steps).toEqual(complete.steps);
	});

	it("closes a dangling top-level string field when no array has started yet", () => {
		const truncated = '{"title":"Beef Wellington","overview":"A showstop';

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.title).toBe("Beef Wellington");
		expect(parsed.overview).toBeUndefined();
	});

	it("returns the input unchanged when it's malformed but not truncated (balanced brackets)", () => {
		const malformed = '{"title": ,}';
		expect(repairTruncatedJson(malformed)).toBe(malformed);
	});

	it("handles an empty string gracefully", () => {
		expect(repairTruncatedJson("")).toBe("");
	});

	it("recovers a number value cut off right at the end with no trailing bracket", () => {
		const truncated = '{"ingredients":[{"text":"salt","quantity":1';

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([]);
	});

	it("keeps a fully-closed nested array element whose own last field was a bare number", () => {
		const input = '{"ingredients":[{"text":"salt","quantity":1,"unit":"tsp"}';
		// Still missing the closing "]}" for the outer object/array.
		const repaired = repairTruncatedJson(input);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([
			{ text: "salt", quantity: 1, unit: "tsp" },
		]);
	});

	it("doesn't mistake an escaped quote inside a string for the string closing", () => {
		const truncated =
			'{"ingredients":[{"text":"a 6\\" cast iron skillet","quantity":1,"unit":""},{"text":"say \\"hi\\"';

		const repaired = repairTruncatedJson(truncated);
		const parsed = JSON.parse(repaired);

		expect(parsed.ingredients).toEqual([
			{ text: 'a 6" cast iron skillet', quantity: 1, unit: "" },
		]);
	});
});
