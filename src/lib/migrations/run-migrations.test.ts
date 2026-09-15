import { beforeEach, describe, expect, it, vi } from "vitest";
import { type Migration, runMigrations } from "./run-migrations";

const COMPLETED_KEY = "cookerist:completed-migrations";

beforeEach(() => {
	window.localStorage.clear();
});

describe("runMigrations", () => {
	it("runs a migration that hasn't completed yet", async () => {
		const run = vi.fn();

		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("awaits an async migration before moving on", async () => {
		const order: string[] = [];
		const run1 = vi.fn(async () => {
			await Promise.resolve();
			order.push("m1");
		});
		const run2 = vi.fn(() => {
			order.push("m2");
		});

		await runMigrations([
			{ id: "m1", run: run1 },
			{ id: "m2", run: run2 },
		]);

		expect(order).toEqual(["m1", "m2"]);
	});

	it("never runs the same migration id twice, across separate calls", async () => {
		const run = vi.fn();
		const migration: Migration = { id: "m1", run };

		await runMigrations([migration]);
		await runMigrations([migration]);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("records completed migration ids in localStorage", async () => {
		await runMigrations([{ id: "m1", run: vi.fn() }]);

		const stored = JSON.parse(
			window.localStorage.getItem(COMPLETED_KEY) ?? "[]",
		);
		expect(stored).toEqual(["m1"]);
	});

	it("runs multiple migrations in array order", async () => {
		const order: string[] = [];

		await runMigrations([
			{
				id: "m1",
				run: () => {
					order.push("m1");
				},
			},
			{
				id: "m2",
				run: () => {
					order.push("m2");
				},
			},
		]);

		expect(order).toEqual(["m1", "m2"]);
	});

	it("only runs a migration not already marked completed, leaving other completed ones alone", async () => {
		window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(["m1"]));
		const run1 = vi.fn();
		const run2 = vi.fn();

		await runMigrations([
			{ id: "m1", run: run1 },
			{ id: "m2", run: run2 },
		]);

		expect(run1).not.toHaveBeenCalled();
		expect(run2).toHaveBeenCalledTimes(1);
	});

	it("marks a throwing migration completed anyway, so it never retries", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const run = vi.fn(() => {
			throw new Error("boom");
		});

		await runMigrations([{ id: "m1", run }]);
		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("marks a rejecting async migration completed anyway, so it never retries", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const run = vi.fn(() => Promise.reject(new Error("network boom")));

		await runMigrations([{ id: "m1", run }]);
		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
		expect(consoleError).toHaveBeenCalled();
		consoleError.mockRestore();
	});

	it("still runs a later migration after an earlier one throws", async () => {
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const run2 = vi.fn();

		await runMigrations([
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

	it("does not write to localStorage when every migration was already completed", async () => {
		window.localStorage.setItem(COMPLETED_KEY, JSON.stringify(["m1"]));
		const setItem = vi.spyOn(window.localStorage.__proto__, "setItem");

		await runMigrations([{ id: "m1", run: vi.fn() }]);

		expect(setItem).not.toHaveBeenCalledWith(COMPLETED_KEY, expect.anything());
		setItem.mockRestore();
	});

	it("treats corrupt completed-migrations JSON as an empty completed set", async () => {
		window.localStorage.setItem(COMPLETED_KEY, "not valid json");
		const run = vi.fn();

		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(1);
	});

	it("does not mark a migration completed when it returns { retry: true }", async () => {
		const run = vi.fn(() => ({ retry: true }));

		await runMigrations([{ id: "m1", run }]);

		const stored = JSON.parse(
			window.localStorage.getItem(COMPLETED_KEY) ?? "[]",
		);
		expect(stored).toEqual([]);
	});

	it("runs a { retry: true } migration again on the next call", async () => {
		const run = vi.fn(() => ({ retry: true }));

		await runMigrations([{ id: "m1", run }]);
		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(2);
	});

	it("marks a migration completed once it stops asking to be retried", async () => {
		const run = vi
			.fn()
			.mockReturnValueOnce({ retry: true })
			.mockReturnValueOnce(undefined);

		await runMigrations([{ id: "m1", run }]);
		await runMigrations([{ id: "m1", run }]);
		await runMigrations([{ id: "m1", run }]);

		expect(run).toHaveBeenCalledTimes(2);
	});

	it("still runs a later migration after an earlier one asks to be retried", async () => {
		const run1 = vi.fn(() => ({ retry: true }));
		const run2 = vi.fn();

		await runMigrations([
			{ id: "m1", run: run1 },
			{ id: "m2", run: run2 },
		]);

		expect(run2).toHaveBeenCalledTimes(1);
	});
});
