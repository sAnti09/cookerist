import { beforeEach, describe, expect, it } from "vitest";
import {
	addPendingTombstone,
	getPendingTombstones,
	removePendingTombstone,
} from "./pending-tombstones";

beforeEach(() => {
	window.localStorage.clear();
});

describe("pending tombstones", () => {
	it("defaults every table to empty", () => {
		expect(getPendingTombstones("recipes")).toEqual([]);
		expect(getPendingTombstones("grocery_lists")).toEqual([]);
		expect(getPendingTombstones("meal_plans")).toEqual([]);
	});

	it("records a pending tombstone independently per table", () => {
		addPendingTombstone("recipes", "r1");

		expect(getPendingTombstones("recipes")).toEqual(["r1"]);
		expect(getPendingTombstones("grocery_lists")).toEqual([]);
	});

	it("does not duplicate the same id", () => {
		addPendingTombstone("recipes", "r1");
		addPendingTombstone("recipes", "r1");

		expect(getPendingTombstones("recipes")).toEqual(["r1"]);
	});

	it("removes only the given id, leaving the rest", () => {
		addPendingTombstone("recipes", "r1");
		addPendingTombstone("recipes", "r2");

		removePendingTombstone("recipes", "r1");

		expect(getPendingTombstones("recipes")).toEqual(["r2"]);
	});

	it("removing an id that was never added is a no-op", () => {
		addPendingTombstone("recipes", "r1");

		removePendingTombstone("recipes", "never-added");

		expect(getPendingTombstones("recipes")).toEqual(["r1"]);
	});

	it("survives corrupted localStorage by falling back to defaults", () => {
		window.localStorage.setItem("cookerist:pending-tombstones", "not json");
		expect(getPendingTombstones("recipes")).toEqual([]);
	});
});
