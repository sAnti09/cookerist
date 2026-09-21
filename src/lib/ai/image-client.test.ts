import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateThumbnailImage } from "./image-client";

const ORIGINAL_ENV = { ...process.env };
const fetchMock = vi.fn();

beforeEach(() => {
	vi.stubGlobal("fetch", fetchMock);
	fetchMock.mockReset();
	process.env.DEEPINFRA_API_KEY = "test-key";
});

afterEach(() => {
	vi.unstubAllGlobals();
	process.env = { ...ORIGINAL_ENV };
});

function jsonResponse(body: unknown, ok = true, status = 200) {
	return {
		ok,
		status,
		statusText: ok ? "OK" : "Internal Server Error",
		json: () => Promise.resolve(body),
	};
}

describe("generateThumbnailImage", () => {
	it("returns an error without calling fetch when DEEPINFRA_API_KEY is unset", async () => {
		delete process.env.DEEPINFRA_API_KEY;

		const result = await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(result).toEqual({
			type: "error",
			message: "DEEPINFRA_API_KEY is not set",
		});
		expect(fetchMock).not.toHaveBeenCalled();
	});

	it("posts to DeepInfra's image-generation endpoint with the expected model/size/format", async () => {
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				data: [{ b64_json: Buffer.from("img").toString("base64") }],
			}),
		);

		await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(fetchMock).toHaveBeenCalledWith(
			"https://api.deepinfra.com/v1/openai/images/generations",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					Authorization: "Bearer test-key",
					"Content-Type": "application/json",
				}),
			}),
		);
		const body = JSON.parse(fetchMock.mock.calls[0]?.[1]?.body);
		expect(body).toMatchObject({
			model: "black-forest-labs/FLUX-1-schnell",
			size: "512x512",
			n: 1,
			response_format: "b64_json",
		});
		expect(body.prompt).toContain("Tacos");
		expect(body.prompt).toContain("Crispy beef tacos.");
	});

	it("decodes the base64 response into bytes on success", async () => {
		const original = "fake-png-bytes";
		fetchMock.mockResolvedValueOnce(
			jsonResponse({
				data: [{ b64_json: Buffer.from(original).toString("base64") }],
			}),
		);

		const result = await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(result.type).toBe("success");
		if (result.type === "success") {
			expect(Buffer.from(result.bytes).toString()).toBe(original);
			expect(result.contentType).toBe("image/png");
		}
	});

	it("returns an error when the HTTP response isn't ok", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 500));

		const result = await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(result).toEqual({
			type: "error",
			message: "DeepInfra image generation failed: 500 Internal Server Error",
		});
	});

	it("returns an error when the response has no b64_json", async () => {
		fetchMock.mockResolvedValueOnce(jsonResponse({ data: [{}] }));

		const result = await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(result).toEqual({
			type: "error",
			message: "Malformed image response from DeepInfra",
		});
	});

	it("returns an error instead of throwing when fetch itself rejects", async () => {
		fetchMock.mockRejectedValueOnce(new Error("network down"));

		const result = await generateThumbnailImage("Tacos", "Crispy beef tacos.");

		expect(result).toEqual({ type: "error", message: "network down" });
	});
});
