import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
	chatCompletion,
	getActiveProvider,
	getAiClient,
	isModelOnCooldown,
	parseDurationToMs,
	resetModelCooldowns,
} from "./client";

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
	resetModelCooldowns();
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
			timeout: 15_000,
			maxRetries: 0,
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
			maxRetries: 0,
			defaultHeaders: {
				"HTTP-Referer": "https://cookerist.com",
				"X-Title": "Cookerist",
			},
		});
	});

	it("configures provider-specific timeouts: tight 15s for Groq, generous 180s for OpenRouter", () => {
		process.env.GROQ_API_KEY = "groq-key";
		process.env.OPENROUTER_API_KEY = "or-key";
		getAiClient("groq");
		getAiClient("openrouter");
		expect(groqConstructorMock.mock.calls[0][0].timeout).toBe(15_000);
		expect(groqConstructorMock.mock.calls[1][0].timeout).toBe(180_000);
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

	it("excludes groq as an OpenRouter upstream and sorts by latency when OpenRouter is the active provider", async () => {
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
					provider: { ignore: ["groq"], sort: "latency" },
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
					provider: { ignore: ["groq"], sort: "latency" },
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

	it("isolates rate limits per model: a 429 on qwen/qwen3.6-27b puts only qwen on cooldown, keeping oss-120b on groq", async () => {
		process.env.AI_PROVIDER = "groq";

		// Step 1: identifyDish (qwen/qwen3.6-27b) hits a 429 rate limit
		const rateLimitError = Object.assign(
			new Error(
				"Rate limit reached for model qwen/qwen3.6-27b on tokens per minute. Please try again in 30s.",
			),
			{ status: 429 },
		);
		groqCreateMock.mockRejectedValueOnce(rateLimitError);
		openrouterPostMock.mockResolvedValueOnce({
			choices: ["dish-from-openrouter"],
		});

		const firstResult = await chatCompletion("identifyDish", {
			messages: [{ role: "user", content: "identify this" }],
		});

		expect(firstResult).toEqual({ choices: ["dish-from-openrouter"] });
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
		expect(isModelOnCooldown("groq", "qwen/qwen3.6-27b")).toBe(true);
		expect(isModelOnCooldown("groq", "openai/gpt-oss-120b")).toBe(false);

		// Step 2: Next identifyDish call immediately skips Groq and goes directly to OpenRouter
		groqCreateMock.mockClear();
		openrouterPostMock.mockClear();
		openrouterPostMock.mockResolvedValueOnce({
			choices: ["dish-bypassed-groq"],
		});

		const secondResult = await chatCompletion("identifyDish", {
			messages: [{ role: "user", content: "identify another" }],
		});

		expect(secondResult).toEqual({ choices: ["dish-bypassed-groq"] });
		expect(groqCreateMock).not.toHaveBeenCalled(); // Groq was never called!
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);

		// Step 3: recipeGeneration (openai/gpt-oss-120b) still calls Groq since 120b is not on cooldown
		groqCreateMock.mockClear();
		openrouterPostMock.mockClear();
		groqCreateMock.mockResolvedValueOnce({ choices: ["recipe-from-groq"] });

		const recipeResult = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "generate recipe" }],
		});

		expect(recipeResult).toEqual({ choices: ["recipe-from-groq"] });
		expect(groqCreateMock).toHaveBeenCalledTimes(1); // Groq handled it!
		expect(openrouterPostMock).not.toHaveBeenCalled();
	});

	it("respects retry-after and reset header durations when calculating cooldown", async () => {
		process.env.AI_PROVIDER = "groq";

		const headers = new Headers();
		headers.set("retry-after", "45");
		const rateLimitError = Object.assign(new Error("Rate limit"), {
			status: 429,
			headers,
		});

		groqCreateMock.mockRejectedValueOnce(rateLimitError);
		openrouterPostMock.mockResolvedValueOnce({ choices: ["fallback"] });

		await chatCompletion("onTopicCheck", {
			messages: [{ role: "user", content: "check" }],
		});

		expect(isModelOnCooldown("groq", "openai/gpt-oss-20b")).toBe(true);
	});

	it("silently fails over to OpenRouter and cools down Groq when a Groq request times out", async () => {
		process.env.AI_PROVIDER = "groq";

		const timeoutError = Object.assign(new Error("Request timed out."), {
			name: "APIConnectionTimeoutError",
		});
		groqCreateMock.mockRejectedValueOnce(timeoutError);
		openrouterPostMock.mockResolvedValueOnce({
			choices: ["recovered-from-timeout"],
		});

		const result = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "recipe" }],
		});

		expect(result).toEqual({ choices: ["recovered-from-timeout"] });
		expect(groqCreateMock).toHaveBeenCalledTimes(1);
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
		expect(isModelOnCooldown("groq", "openai/gpt-oss-120b")).toBe(true);

		// Subsequent call skips Groq entirely due to cooldown
		groqCreateMock.mockClear();
		openrouterPostMock.mockClear();
		openrouterPostMock.mockResolvedValueOnce({
			choices: ["direct-openrouter"],
		});

		const secondResult = await chatCompletion("recipeGeneration", {
			messages: [{ role: "user", content: "recipe 2" }],
		});
		expect(secondResult).toEqual({ choices: ["direct-openrouter"] });
		expect(groqCreateMock).not.toHaveBeenCalled();
		expect(openrouterPostMock).toHaveBeenCalledTimes(1);
	});
});

describe("parseDurationToMs", () => {
	it("parses seconds, minutes, hours, and plain numbers", () => {
		expect(parseDurationToMs("45")).toBe(45_000);
		expect(parseDurationToMs("30s")).toBe(30_000);
		expect(parseDurationToMs("2.5s")).toBe(2500);
		expect(parseDurationToMs("1m30s")).toBe(90_000);
		expect(parseDurationToMs("2h")).toBe(7_200_000);
		expect(parseDurationToMs("500ms")).toBe(500);
		expect(parseDurationToMs(undefined)).toBe(60_000);
	});
});
