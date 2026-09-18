// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
	constantTimeEqual,
	generateDeviceSecret,
	generatePairingCode,
	hashToken,
} from "./secret";

describe("generateDeviceSecret", () => {
	it("returns a unique, URL-safe string each call", () => {
		const a = generateDeviceSecret();
		const b = generateDeviceSecret();
		expect(a).not.toBe(b);
		expect(a).toMatch(/^[A-Za-z0-9_-]+$/);
		// 32 random bytes, base64url-encoded without padding.
		expect(a.length).toBe(43);
	});
});

describe("generatePairingCode", () => {
	it("returns an 8-character code from the unambiguous alphabet", () => {
		const code = generatePairingCode();
		expect(code).toMatch(/^[0-9A-HJ-KM-NP-TV-Z]{8}$/);
	});

	it("returns different codes across calls", () => {
		const codes = new Set(
			Array.from({ length: 20 }, () => generatePairingCode()),
		);
		expect(codes.size).toBe(20);
	});
});

describe("hashToken", () => {
	it("is deterministic for the same input", async () => {
		const a = await hashToken("same-token");
		const b = await hashToken("same-token");
		expect(a).toBe(b);
	});

	it("differs for different input", async () => {
		const a = await hashToken("token-a");
		const b = await hashToken("token-b");
		expect(a).not.toBe(b);
	});

	it("matches the known SHA-256 hex digest of an empty string", async () => {
		expect(await hashToken("")).toBe(
			"e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
		);
	});
});

describe("constantTimeEqual", () => {
	it("returns true for identical strings", () => {
		expect(constantTimeEqual("abc123", "abc123")).toBe(true);
	});

	it("returns false for different strings of the same length", () => {
		expect(constantTimeEqual("abc123", "abc124")).toBe(false);
	});

	it("returns false for strings of different lengths", () => {
		expect(constantTimeEqual("abc", "abcd")).toBe(false);
	});
});
