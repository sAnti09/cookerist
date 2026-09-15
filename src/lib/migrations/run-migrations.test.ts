import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Migration, runMigrations } from "./run-migrations";

const COMPLETED_KEY = "cookerist:completed-migrations";

beforeEach(() => {
	window.localStorage.clear();
});

describe("runMigrations", () => {
	it("runs a migration that hasn't completed yet", () => {
		const run = vi.fn();

		runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("never runs the same migration id twice, across separate calls", () => {
		const run = vi.fn();
		const migration: Migration = { id: "m1", run };

		runMigrations([migration]);
		runMigrations([migration]);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("records completed migration ids in localStorage", () => {
		runMigrations([{ id: "m1", run: vi.fn() }]);

		const stored = JSON.parse(
			window.localStorage.getItem(COMPLETED_KEY) ?? "[]",
		);
		expect(stored).toEqual(["m1"]);
	});

	it("runs multiple migrations in array order", () => {
		const order: string[] = [];

		runMigrations([
			{ id: "m1", run: () => order.push("m1") },
			{ id: "m2", run: () => order.push("m2") },
		]);

		expect(order).toEqual(["m1", "m2"]);
	});

	it("only runs a migration not already marked completed, leaving other completed ones alone", () => {
		window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(["m1"]));
		const run1 = vi.fn();
		const run2 = vi.fn();

		runMigrations([
			{ id: "m1", run: run1 },
			{ id: "m2", run: run2 },
		]);

		expect(run1).not.toHaveBeenCalled();
		expect(run2).toHaveBeenCalledTimes(1);
	});

	it("marks a throwing migration completed anyway, so it never retries", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const run = vi.fn(() => {
			throw new Error("boom");
		});

		runMigrations([{ id: "m1", run }]);
		runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("still runs a later migration after an earlier one throws", () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const run2 = vi.fn();

		runMigrations([
			{
				id: "m1",
				run: () => {
					throw new Error("boom");
				},
			},
			{ id: "m2", run: run2 },
		]);

		expect(run2).toHaveBeenCalledTimes(1);
		consoleError.mockRestore();
	});

	it("does not write to localStorage when every migration was already completed", () => {
		window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(["m1"]));
		const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

		runMigrations([{ id: "m1", run: vi.fn() }]);

		expect(setItem).not.toHaveBeenCalledWith(COMPLETED_KEY, expect.anything());
		setItem.mockRestore();
	});

	it("treats corrupt completed-migrations JSON as an empty completed set", () => {
		window.localStorage.setItem(COMPLETED_KEY, "not valid json");
		const run = vi.fn();

		runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
	});
});
