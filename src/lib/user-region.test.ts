import { afterEach, describe, expect, it, vi } from "vitest";
import { getUserTimezone } from "./user-region";

describe("getUserTimezone", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("returns the resolved IANA timezone", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
			resolvedOptions: () => ({ timeZone: "Asia/Manila" }),
		} as unknown as Intl.DateTimeFormat);

		expect(getUserTimezone()).toBe("Asia/Manila");
	});

	it("returns undefined when Intl throws", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockImplementation(() => {
			throw new Error("not supported");
		});

		expect(getUserTimezone()).toBeUndefined();
	});

	it("returns undefined when the resolved timezone is empty", () => {
		vi.spyOn(Intl, "DateTimeFormat").mockReturnValue({
			resolvedOptions: () => ({ timeZone: "" }),
		} as unknown as Intl.DateTimeFormat);

		expect(getUserTimezone()).toBeUndefined();
	});
});
