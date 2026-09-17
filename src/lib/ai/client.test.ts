import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, getActiveProvider, getAiClient } from "./client";

const groqConstructorMock = vi.fn();
const groqCreateMock = vi.fn();
const openrouterCreateMock = vi.fn();

// Routes each constructed client's .chat.completions.create to a mock keyed
// by baseURL, so tests can tell which provider a given request actually went
// to (needed for the failover tests below).
vi.mock("groq-sdk", () => ({
	default: class {
		chat: { completions: { create: (...args: unknown[]) => unknown } };
		constructor(opts: { baseURL?: string }) {
			groqConstructorMock(opts);
			const create =
				opts.baseURL === "https://openrouter.ai/api/v1"
					? openrouterCreateMock
					: groqCreateMock;
			this.chat = { completions: { create } };
		}
	},
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	groqConstructorMock.mockReset();
	groqCreateMock.mockReset();
	openrouterCreateMock.mockReset();
});

afterEach(() => {
	process.env = { ...ORIGINAL_ENV };
});

describe("getActiveProvider", () => {
	it("defaults to groq when AI_PROVIDER is unset", () => {
		delete process.env.AI_PROVIDER;
		expect(getActiveProvider()).toBe("groq");
	});

	it("defaults to groq for any unrecognized value", () => {
		process.env.AI_PROVIDER = "something-else";
		expect(getActiveProvider()).toBe("groq");
	});

	it("returns openrouter when explicitly set", () => {
		process.env.AI_PROVIDER = "openrouter";
		expect(getActiveProvider()).toBe("openrouter");
	});
});

describe("getAiClient", () => {
	it("throws when GROQ_API_KEY is not set for the groq provider", () => {
		delete process.env.GROQ_API_KEY;
		expect(() => getAiClient("groq")).toThrow("GROQ_API_KEY is not set");
	});

	it("throws when OPENROUTER_API_KEY is not set for the openrouter provider", () => {
		delete process.env.OPENROUTER_API_KEY;
		expect(() => getAiClient("openrouter")).toThrow(
			"OPENROUTER_API_KEY is not set",
		);
	});

	it("builds a client against Groq's own default base URL, with no attribution headers", () => {
		process.env.GROQ_API_KEY = "groq-key";
		getAiClient("groq");
		expect(groqConstructorMock).toHaveBeenCalledWith({
			apiKey: "groq-key",
			baseURL: undefined,
			defaultHeaders: undefined,
		});
	});

	it("builds a client against OpenRouter's base URL with attribution headers", () => {
		process.env.OPENROUTER_API_KEY = "or-key";
		getAiClient("openrouter");
		expect(groqConstructorMock).toHaveBeenCalledWith({
			apiKey: "or-key",
			baseURL: "https://openrouter.ai/api/v1",
			defaultHeaders: {
				"HTTP-Referer": "https://cookerist.jameseuangel-limpiado.workers.dev",
				"X-Title": "Cookerist",
			},
		});
	});

	it("defaults to the active provider (via AI_PROVIDER) when none is passed explicitly", () => {
		process.env.AI_PROVIDER = "openrouter";
		process.env.OPENROUTER_API_KEY = "or-key";
		getAiClient();
		expect(groqConstructorMock).toHaveBeenCalledWith(
			expect.objectContaining({ baseURL: "https://openrouter.ai/api/v1" }),
		);
	});
});

describe("chatCompletion", () => {
	beforeEach(() => {
		process.env.GROQ_API_KEY = "groq-key";
		process.env.OPENROUTER_API_KEY = "or-key";
	});

	it("sends the request to the active provider with its resolved model, no routing extras", async () => {
		process.env.AI_PROVIDER = "groq";
		groqCreateMock.mockResolvedValueOnce({ choices: [] });

		const result = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "hi" }],
		});

		expect(result).toEqual({ choices: [] });
		expect(groqCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "openai/gpt-oss-120b",
				messages: [{ role: "user", content: "hi" }],
			}),
		);
		expect(groqCreateMock.mock.calls[0]?.[0].provider).toBeUndefined();
		expect(openrouterCreateMock).not.toHaveBeenCalled();
	});

	it("excludes groq as an OpenRouter upstream when OpenRouter is the active provider", async () => {
		process.env.AI_PROVIDER = "openrouter";
		openrouterCreateMock.mockResolvedValueOnce({ choices: [] });

		await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "hi" }],
		});

		expect(openrouterCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "openai/gpt-oss-120b",
				provider: { ignore: ["groq"] },
			}),
		);
		expect(groqCreateMock).not.toHaveBeenCalled();
	});

	it("silently retries on the other provider when the primary call throws", async () => {
		process.env.AI_PROVIDER = "groq";
		groqCreateMock.mockRejectedValueOnce(new Error("rate limited"));
		openrouterCreateMock.mockResolvedValueOnce({ choices: ["fallback"] });

		const result = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "hi" }],
		});

		expect(result).toEqual({ choices: ["fallback"] });
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterCreateMock).toHaveBeenCalledWith(
			expect.objectContaining({
				model: "openai/gpt-oss-120b",
				provider: { ignore: ["groq"] },
			}),
		);
	});

	it("propagates the fallback provider's own error when it also fails", async () => {
		process.env.AI_PROVIDER = "groq";
		groqCreateMock.mockRejectedValueOnce(new Error("groq down"));
		openrouterCreateMock.mockRejectedValueOnce(new Error("openrouter down"));

		await expect(
			chatCompletion("recipeGeneration", {
				messages: [{ role: "user", content: "hi" }],
			}),
		).rejects.toThrow("openrouter down");
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterCreateMock).toHaveBeenCalledTimes(1);
	});

	it("does not attempt failover, and surfaces the original error, when the other provider has no credentials configured", async () => {
		process.env.AI_PROVIDER = "groq";
		delete process.env.OPENROUTER_API_KEY;
		groqCreateMock.mockRejectedValueOnce(new Error("groq down"));

		await expect(
			chatCompletion("recipeGeneration", {
				messages: [{ role: "user", content: "hi" }],
			}),
		).rejects.toThrow("groq down");
		expect(openrouterCreateMock).not.toHaveBeenCalled();
	});
});
