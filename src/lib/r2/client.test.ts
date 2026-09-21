import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { env } from "#/test-utils/cloudflare-workers-stub";
import { uploadThumbnail } from "./client";

const putMock = vi.fn();
const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	putMock.mockReset();
	putMock.mockResolvedValue(undefined);
	env.THUMBNAILS = { put: (...args: unknown[]) => putMock(...args) };
	process.env.R2_PUBLIC_URL_BASE = "https://pub-example.r2.dev";
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
	delete env.THUMBNAILS;
});

describe("uploadThumbnail", () => {
	it("uploads to the recipes/<id>.png key and returns the public URL", async () => {
		const bytes = new Uint8Array([1, 2, 3]);

		const url = await uploadThumbnail("recipe-1", bytes, "image/png");

		expect(putMock).toHaveBeenCalledWith("recipes/recipe-1.png", bytes, {
			httpMetadata: { contentType: "image/png" },
		});
		expect(url).toBe("https://pub-example.r2.dev/recipes/recipe-1.png");
	});

	it("throws when the THUMBNAILS binding is missing", async () => {
		delete env.THUMBNAILS;

		await expect(
			uploadThumbnail("recipe-1", new Uint8Array(), "image/png"),
		).rejects.toThrow(/THUMBNAILS/);
		expect(putMock).not.toHaveBeenCalled();
	});

	it("throws when R2_PUBLIC_URL_BASE is unset", async () => {
		delete process.env.R2_PUBLIC_URL_BASE;

		await expect(
			uploadThumbnail("recipe-1", new Uint8Array(), "image/png"),
		).rejects.toThrow(/R2_PUBLIC_URL_BASE/);
	});

	it("propagates a rejection from the bucket's put()", async () => {
		putMock.mockRejectedValueOnce(new Error("bucket unavailable"));

		await expect(
			uploadThumbnail("recipe-1", new Uint8Array(), "image/png"),
		).rejects.toThrow("bucket unavailable");
	});
});
