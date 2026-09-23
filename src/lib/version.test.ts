import { describe, expect, it } from "vitest";
import { APP_VERSION } from "./version";

describe("APP_VERSION", () => {
	it("is defined and starts with 'v'", () => {
		expect(typeof APP_VERSION).toBe("string");
		expect(APP_VERSION.startsWith("v")).toBe(true);
	});
});
