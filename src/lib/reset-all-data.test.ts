import { beforeEach, describe, expect, it } from "vitest";
import { resetAllData } from "./reset-all-data";

beforeEach(() => {
	window.localStorage.clear();
});

describe("resetAllData", () => {
	it("clears every key cookerist has stored in localStorage", () => {
		window.localStorage.setItem("cookerist:recipes", "[]");
		window.localStorage.setItem("cookerist:grocery-lists", "[]");
		window.localStorage.setItem("cookerist:theme", "dark");

		resetAllData();

		expect(window.localStorage.length).toBe(0);
	});
});
