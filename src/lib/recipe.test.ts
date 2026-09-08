import { describe, expect, it } from "vitest";
import type { Step } from "./recipe";
import { groupSteps } from "./recipe";

function step(section: string | null, text: string): Step {
	return { id: text, section, text, checked: false };
}

describe("groupSteps", () => {
	it("keeps a single flat group when no step has a section", () => {
		const steps = [step(null, "Boil water"), step(null, "Add pasta")];

		const sections = groupSteps(steps);

		expect(sections).toEqual([{ name: null, steps }]);
	});

	it("groups consecutive steps under the same named section", () => {
		const prep1 = step("Prep", "Chop garlic");
		const prep2 = step("Prep", "Peel shrimp");
		const cook1 = step("Cook", "Saute garlic");

		const sections = groupSteps([prep1, prep2, cook1]);

		expect(sections).toEqual([
			{ name: "Prep", steps: [prep1, prep2] },
			{ name: "Cook", steps: [cook1] },
		]);
	});

	it("starts a new section when the same name reappears non-consecutively", () => {
		const a = step("Prep", "a");
		const b = step("Cook", "b");
		const c = step("Prep", "c");

		expect(groupSteps([a, b, c])).toEqual([
			{ name: "Prep", steps: [a] },
			{ name: "Cook", steps: [b] },
			{ name: "Prep", steps: [c] },
		]);
	});

	it("returns an empty list for no steps", () => {
		expect(groupSteps([])).toEqual([]);
	});
});
