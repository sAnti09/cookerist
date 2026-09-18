import { describe, expect, it } from "vitest";
import { isSharedWithMe } from "./share-status";

describe("isSharedWithMe", () => {
	it("is false for a local-only entity that has never synced", () => {
		expect(isSharedWithMe({ ownerId: null }, "me")).toBe(false);
		expect(isSharedWithMe({ ownerId: null }, null)).toBe(false);
	});

	it("is false when this account owns the entity", () => {
		expect(isSharedWithMe({ ownerId: "me" }, "me")).toBe(false);
	});

	it("is true when a different account owns the entity", () => {
		expect(isSharedWithMe({ ownerId: "someone-else" }, "me")).toBe(true);
	});

	it("is true when the entity has an owner but this device has no identity yet", () => {
		expect(isSharedWithMe({ ownerId: "someone-else" }, null)).toBe(true);
	});
});
