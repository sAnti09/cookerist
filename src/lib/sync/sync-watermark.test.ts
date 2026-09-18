import { beforeEach, describe, expect, it } from "vitest";
import {
	getPushWatermark,
	getWatermark,
	setPushWatermark,
	setWatermark,
} from "./sync-watermark";

beforeEach(() => {
	window.localStorage.clear();
});

describe("sync watermark (pull)", () => {
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

describe("sync watermark (push)", () => {
	it("defaults every table to the epoch", () => {
		expect(getPushWatermark("recipes")).toBe(new Date(0).toISOString());
		expect(getPushWatermark("grocery_lists")).toBe(new Date(0).toISOString());
		expect(getPushWatermark("meal_plans")).toBe(new Date(0).toISOString());
	});

	it("persists a per-table push watermark independently of the others and of the pull watermark", () => {
		setPushWatermark("recipes", "2026-02-01T00:00:00.000Z");
		setWatermark("recipes", "2026-01-01T00:00:00.000Z");

		expect(getPushWatermark("recipes")).toBe("2026-02-01T00:00:00.000Z");
		expect(getPushWatermark("grocery_lists")).toBe(new Date(0).toISOString());
		expect(getWatermark("recipes")).toBe("2026-01-01T00:00:00.000Z");
	});

	it("survives corrupted localStorage by falling back to defaults", () => {
		window.localStorage.setItem("cookerist:sync-push-watermark", "not json");
		expect(getPushWatermark("recipes")).toBe(new Date(0).toISOString());
	});
});
