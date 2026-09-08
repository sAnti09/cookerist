import { describe, expect, it } from "vitest";
import { generateGroceryListName } from "./grocery-list";

describe("generateGroceryListName", () => {
	it("joins recipe titles with a comma and space", () => {
		expect(generateGroceryListName(["Shrimp Pasta", "Garlic Bread"])).toBe(
			"Shrimp Pasta, Garlic Bread",
		);
	});

	it("returns a single title unchanged", () => {
		expect(generateGroceryListName(["Shrimp Pasta"])).toBe("Shrimp Pasta");
	});

	it("returns an empty string for no titles", () => {
		expect(generateGroceryListName([])).toBe("");
	});

	it("leaves a joined string at exactly the max length untouched", () => {
		const title = "a".repeat(255);
		expect(generateGroceryListName([title])).toBe(title);
		expect(generateGroceryListName([title]).length).toBe(255);
	});

	it("truncates a joined string over 255 characters and appends an ellipsis", () => {
		const title = "a".repeat(300);

		const name = generateGroceryListName([title]);

		expect(name.length).toBe(255);
		expect(name.endsWith("…")).toBe(true);
		expect(name).toBe(`${"a".repeat(254)}…`);
	});

	it("truncates the joined result of multiple titles, not each title individually", () => {
		const titles = ["a".repeat(200), "b".repeat(100), "c".repeat(100)];

		const name = generateGroceryListName(titles);

		expect(name.length).toBe(255);
		expect(name.endsWith("…")).toBe(true);
	});
});
