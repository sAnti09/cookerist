import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	compressImageToDataUrl,
	computeResizedDimensions,
	isImageFile,
} from "./image-capture";

describe("isImageFile", () => {
	it("accepts files with an image/* MIME type", () => {
		expect(isImageFile(new File([], "a.jpg", { type: "image/jpeg" }))).toBe(
			true,
		);
		expect(isImageFile(new File([], "a.png", { type: "image/png" }))).toBe(
			true,
		);
	});

	it("rejects non-image files", () => {
		expect(
			isImageFile(new File([], "a.pdf", { type: "application/pdf" })),
		).toBe(false);
		expect(isImageFile(new File([], "a.txt", { type: "" }))).toBe(false);
	});
});

describe("computeResizedDimensions", () => {
	it("leaves an image already within bounds untouched", () => {
		expect(computeResizedDimensions(800, 600, 1280)).toEqual({
			width: 800,
			height: 600,
		});
	});

	it("scales down a landscape image so the longest edge matches the max", () => {
		expect(computeResizedDimensions(4000, 2000, 1280)).toEqual({
			width: 1280,
			height: 640,
		});
	});

	it("scales down a portrait image so the longest edge matches the max", () => {
		expect(computeResizedDimensions(2000, 4000, 1280)).toEqual({
			width: 640,
			height: 1280,
		});
	});

	it("never produces a zero dimension for an extreme aspect ratio", () => {
		const { width, height } = computeResizedDimensions(10000, 1, 1280);
		expect(width).toBe(1280);
		expect(height).toBeGreaterThanOrEqual(1);
	});
});

describe("compressImageToDataUrl", () => {
	const drawImage = vi.fn();
	const toDataURL = vi.fn(() => "data:image/jpeg;base64,resized");
	const closeBitmap = vi.fn();

	beforeEach(() => {
		drawImage.mockClear();
		toDataURL.mockClear();
		closeBitmap.mockClear();
		vi.stubGlobal(
			"createImageBitmap",
			vi.fn().mockResolvedValue({
				width: 4000,
				height: 2000,
				close: closeBitmap,
			}),
		);
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
			drawImage,
			// biome-ignore lint/suspicious/noExplicitAny: minimal stand-in for CanvasRenderingContext2D in tests
		} as any);
		vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockImplementation(
			toDataURL,
		);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
		vi.restoreAllMocks();
	});

	it("resizes to the max dimension and exports a JPEG data URL", async () => {
		const file = new File([], "photo.png", { type: "image/png" });

		const result = await compressImageToDataUrl(file, 1280, 0.8);

		expect(result).toBe("data:image/jpeg;base64,resized");
		expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 1280, 640);
		expect(toDataURL).toHaveBeenCalledWith("image/jpeg", 0.8);
	});

	it("releases the decoded bitmap even though it isn't needed afterward", async () => {
		const file = new File([], "photo.png", { type: "image/png" });

		await compressImageToDataUrl(file);

		expect(closeBitmap).toHaveBeenCalledTimes(1);
	});

	it("throws when the canvas can't produce a 2D context", async () => {
		vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
		const file = new File([], "photo.png", { type: "image/png" });

		await expect(compressImageToDataUrl(file)).rejects.toThrow(
			"Could not get a 2D canvas context",
		);
	});
});
