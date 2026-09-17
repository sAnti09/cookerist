import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chatCompletion, getActiveProvider, getAiClient } from "./client";

const groqConstructorMock = vi.fn();
const groqCreateMock = vi.fn();
const openrouterPostMock = vi.fn();

// Routes each constructed client's request method to a mock keyed by
// baseURL, so tests can tell which provider a given request actually went
// to (needed for the failover tests below). Groq goes through
// .chat.completions.create() (matches its real domain shape); OpenRouter
// must go through the lower-level .post() — see client.ts's
// createChatCompletion for why .create() can never reach OpenRouter's real
// endpoint.
vi.mock("groq-sdk", () => ({
	default: class {
		chat: { completions: { create: (...args: unknown[]) => unknown } };
		post: (...args: unknown[]) => unknown;
		constructor(opts: { baseURL?: string }) {
			groqConstructorMock(opts);
			const isOpenrouter = opts.baseURL === "https://openrouter.ai/api/v1";
			this.chat = { completions: { create: groqCreateMock } };
			this.post = isOpenrouter
				? openrouterPostMock
				: () => {
						throw new Error("post() should not be called for groq");
					};
		}
	},
}));

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
	groqConstructorMock.mockReset();
	groqCreateMock.mockReset();
	openrouterPostMock.mockReset();
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
			timeout: 180_000,
			defaultHeaders: undefined,
		});
	});

	it("builds a client against OpenRouter's base URL with attribution headers", () => {
		process.env.OPENROUTER_API_KEY = "or-key";
		getAiClient("openrouter");
		expect(groqConstructorMock).toHaveBeenCalledWith({
			apiKey: "or-key",
			baseURL: "https://openrouter.ai/api/v1",
			timeout: 180_000,
			defaultHeaders: {
				"HTTP-Referer": "https://cookerist.jameseuangel-limpiado.workers.dev",
				"X-Title": "Cookerist",
			},
		});
	});

	it("passes an explicit request timeout longer than groq-sdk's 1-minute default, for both providers", () => {
		process.env.GROQ_API_KEY = "groq-key";
		process.env.OPENROUTER_API_KEY = "or-key";
		getAiClient("groq");
		getAiClient("openrouter");
		for (const call of groqConstructorMock.mock.calls) {
			expect(call[0].timeout).toBeGreaterThan(60_000);
		}
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
		expect(openrouterPostMock).not.toHaveBeenCalled();
	});

	it("excludes groq as an OpenRouter upstream and sorts by price when OpenRouter is the active provider", async () => {
		process.env.AI_PROVIDER = "openrouter";
		openrouterPostMock.mockResolvedValueOnce({ choices: [] });

		await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "hi" }],
		});

		// Must go through client.post("/chat/completions", ...) rather than
		// chat.completions.create() — the latter always posts to the literal
		// "/openai/v1/chat/completions" path, which 404s against OpenRouter's
		// real endpoint regardless of baseURL (see client.ts's
		// createChatCompletion for the full explanation).
		expect(openrouterPostMock).toHaveBeenCalledWith(
			"/chat/completions",
			expect.objectContaining({
				body: expect.objectContaining({
					model: "openai/gpt-oss-120b",
					provider: { ignore: ["groq"], sort: "price" },
				}),
			}),
		);
		expect(groqCreateMock).not.toHaveBeenCalled();
	});

	it("silently retries on the other provider when the primary call throws", async () => {
		process.env.AI_PROVIDER = "groq";
		groqCreateMock.mockRejectedValueOnce(new Error("rate limited"));
		openrouterPostMock.mockResolvedValueOnce({ choices: ["fallback"] });

		const result = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "hi" }],
		});

		expect(result).toEqual({ choices: ["fallback"] });
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
		expect(openrouterPostMock).toHaveBeenCalledWith(
			"/chat/completions",
			expect.objectContaining({
				body: expect.objectContaining({
					model: "openai/gpt-oss-120b",
					provider: { ignore: ["groq"], sort: "price" },
				}),
			}),
		);
	});

	it("propagates the fallback provider's own error when it also fails", async () => {
		process.env.AI_PROVIDER = "groq";
		groqCreateMock.mockRejectedValueOnce(new Error("groq down"));
		openrouterPostMock.mockRejectedValueOnce(new Error("openrouter down"));

		await expect(
			chatCompletion("recipeGeneration", {
				messages: [{ role: "user", content: "hi" }],
			}),
		).rejects.toThrow("openrouter down");
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
	});

	it("uses the explicitly passed provider instead of the global AI_PROVIDER default", async () => {
		process.env.AI_PROVIDER = "groq";
		openrouterPostMock.mockResolvedValueOnce({ choices: ["from-override"] });

		const result = await chatCompletion(
			"recipeGeneration",
			{ messages: [{ role: "user", content: "hi" }] },
			{ provider: "openrouter" },
		);

		expect(result).toEqual({ choices: ["from-override"] });
		expect(groqCreateMock).not.toHaveBeenCalled();
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
	});

	it("still fails over from an explicitly passed provider when that call throws", async () => {
		process.env.AI_PROVIDER = "openrouter";
		groqCreateMock.mockResolvedValueOnce({ choices: ["from-groq-fallback"] });
		openrouterPostMock.mockRejectedValueOnce(new Error("openrouter down"));

		const result = await chatCompletion(
			"recipeGeneration",
			{ messages: [{ role: "user", content: "hi" }] },
			{ provider: "openrouter" },
		);

		expect(result).toEqual({ choices: ["from-groq-fallback"] });
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
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
		expect(openrouterPostMock).not.toHaveBeenCalled();
	});
});
