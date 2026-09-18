import { beforeEach, describe, expect, it } from "vitest";
import { getWatermark, setWatermark } from "./sync-watermark";

beforeEach(() => {
	window.localStorage.clear();
});

describe("sync watermark", () => {
	it("defaults every table to the epoch", () => {
		expect(getWatermark("recipes")).toBe(new Date(0).toISOString());
		expect(getWatermark("grocery_lists")).toBe(new Date(0).toISOString());
		expect(getWatermark("meal_plans")).toBe(new Date(0).toISOString());
	});

	it("persists a per-table watermark independently of the others", () => {
		setWatermark("recipes", "2026-01-01T00:00:00.000Z");

		expect(getWatermark("recipes")).toBe("2026-01-01T00:00:00.000Z");
		expect(getWatermark("grocery_lists")).toBe(new Date(0).toISOString());
	});

	it("survives corrupted localStorage by falling back to defaults", () => {
		window.localStorage.setItem("cookerist:sync-watermark", "not json");
		expect(getWatermark("recipes")).toBe(new Date(0).toISOString());
	});
});
