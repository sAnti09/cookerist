import { beforeEach, describe, expect, it } from "vitest";
import {
	addPendingShareRevocation,
	getPendingShareRevocations,
	removePendingShareRevocation,
} from "./pending-share-revocations";

beforeEach(() => {
	window.localStorage.clear();
});

describe("pending share revocations", () => {
	it("defaults every table to empty", () => {
		expect(getPendingShareRevocations("recipes")).toEqual([]);
		expect(getPendingShareRevocations("grocery_lists")).toEqual([]);
		expect(getPendingShareRevocations("meal_plans")).toEqual([]);
	});

	it("records a pending revocation independently per table", () => {
		addPendingShareRevocation("recipes", "r1");

		expect(getPendingShareRevocations("recipes")).toEqual(["r1"]);
		expect(getPendingShareRevocations("grocery_lists")).toEqual([]);
	});

	it("does not duplicate the same id", () => {
		addPendingShareRevocation("recipes", "r1");
		addPendingShareRevocation("recipes", "r1");

		expect(getPendingShareRevocations("recipes")).toEqual(["r1"]);
	});

	it("removes only the given id, leaving the rest", () => {
		addPendingShareRevocation("recipes", "r1");
		addPendingShareRevocation("recipes", "r2");

		removePendingShareRevocation("recipes", "r1");

		expect(getPendingShareRevocations("recipes")).toEqual(["r2"]);
	});

	it("removing an id that was never added is a no-op", () => {
		addPendingShareRevocation("recipes", "r1");

		removePendingShareRevocation("recipes", "never-added");

		expect(getPendingShareRevocations("recipes")).toEqual(["r1"]);
	});

	it("survives corrupted localStorage by falling back to defaults", () => {
		window.localStorage.setItem(
			"cookerist:pending-share-revocations",
			"not json",
		);
		expect(getPendingShareRevocations("recipes")).toEqual([]);
	});

	it("is stored independently of pending-tombstones", async () => {
		const { addPendingTombstone, getPendingTombstones } = await import(
			"./pending-tombstones"
		);
		addPendingShareRevocation("recipes", "shared-r1");
		addPendingTombstone("recipes", "owned-r1");

		expect(getPendingShareRevocations("recipes")).toEqual(["shared-r1"]);
		expect(getPendingTombstones("recipes")).toEqual(["owned-r1"]);
	});
});
