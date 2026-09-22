import Groq from "groq-sdk";
import type {
	ChatCompletion,
	ChatCompletionCreateParamsNonStreaming,
} from "groq-sdk/resources/chat/completions";
import { type AiCallType, getModelFor } from "#/lib/ai/models";

export type AiProvider = "groq" | "openrouter";

// Everything a call site needs to specify — model is resolved internally
// (per call type, per provider) by chatCompletion below.
export type AiChatParams = Omit<
	ChatCompletionCreateParamsNonStreaming,
	"model"
>;

// Groq's LPU inference is near-instant (typically 1-3 seconds for 120b, 20b, or
// qwen). If a Groq call hasn't finished in 15 seconds, Groq is hanging or
// severely degraded; fail over to OpenRouter quickly instead of keeping the
// user waiting.
const GROQ_TIMEOUT_MS = 15_000;

// OpenRouter routes to various third-party upstreams that can queue under
// heavy load or take longer on larger responses; give it generous room so
// legitimately slow calls finish on their first attempt.
const OPENROUTER_TIMEOUT_MS = 180_000;

const PROVIDER_CONFIG: Record<
	AiProvider,
	{ apiKeyEnv: string; baseURL?: string; timeout: number }
> = {
	groq: { apiKeyEnv: "GROQ_API_KEY", timeout: GROQ_TIMEOUT_MS },
	openrouter: {
		apiKeyEnv: "OPENROUTER_API_KEY",
		baseURL: "https://openrouter.ai/api/v1",
		timeout: OPENROUTER_TIMEOUT_MS,
	},
};

export function getActiveProvider(): AiProvider {
	return process.env.AI_PROVIDER === "openrouter" ? "openrouter" : "groq";
}

function otherProvider(provider: AiProvider): AiProvider {
	return provider === "groq" ? "openrouter" : "groq";
}

function hasCredentials(provider: AiProvider): boolean {
	return Boolean(process.env[PROVIDER_CONFIG[provider].apiKeyEnv]);
}

// The single seam for swapping AI providers: every recipe/meal-plan/dish
// call builds its client from here instead of constructing groq-sdk
// directly, so switching providers (the AI_PROVIDER env var) never means
// touching a call site.
export function getAiClient(provider: AiProvider = getActiveProvider()): Groq {
	const { apiKeyEnv, baseURL, timeout } = PROVIDER_CONFIG[provider];
	const apiKey = process.env[apiKeyEnv];
	if (!apiKey) {
		throw new Error(`${apiKeyEnv} is not set`);
	}
	return new Groq({
		apiKey,
		baseURL,
		timeout,
		maxRetries: 0,
		defaultHeaders:
			provider === "openrouter"
				? {
						"HTTP-Referer": "https://cookerist.com",
						"X-Title": "Cookerist",
					}
				: undefined,
	});
}

// When routed through OpenRouter, exclude Groq as an upstream so switching
// providers actually escapes Groq's own rate limits instead of silently
// landing back on Groq's capacity via OpenRouter's cross-provider load
// balancing (OpenRouter lists Groq as one of several hosts for gpt-oss).
// `sort: "latency"` overrides OpenRouter's default price-weighted balancing
// with fastest-provider-first — for this model that's Cerebras, at roughly
// 4-5x the completion-token price of the cheapest tier (AkashML/CoreWeave/
// DeepInfra). Tried `sort: "price"` briefly to cut cost ahead of a planned
// free public rollout, but the cheap tier's per-call latency (20-145s+,
// confirmed via a live traced meal-plan build) proved unbearable on a
// mobile PWA specifically — iOS aggressively suspends an installed PWA's
// in-flight fetch on screen-lock/backgrounding, and a call that long gives
// that a wide window to land, surfacing as "Load failed" with no automatic
// recovery. Latency wins over cost here until that failure mode has its own
// fix (e.g. an automatic retry on a failed dish, or a build-time wake lock).
function providerExtras(provider: AiProvider): {
	provider?: { ignore: string[]; sort: "latency" };
} {
	return provider === "openrouter"
		? { provider: { ignore: ["groq"], sort: "latency" } }
		: {};
}

function requestFor(
	callType: AiCallType,
	provider: AiProvider,
	contentParams: AiChatParams,
) {
	return {
		...contentParams,
		model: getModelFor(callType, provider),
		...providerExtras(provider),
	};
}

// groq-sdk's chat.completions.create() always posts to the literal path
// "/openai/v1/chat/completions", hardcoded independent of baseURL — that
// only resolves correctly against Groq's own domain (api.groq.com), whose
// real endpoint happens to have that same "/openai/v1" segment. OpenRouter's
// real endpoint is just "<baseURL>/chat/completions" with no such segment,
// so no baseURL value can make the high-level wrapper hit the right route
// for it (confirmed live: it 404s to OpenRouter's own website, not even a
// JSON API error). Route OpenRouter through the SDK's lower-level post()
// with the correct relative path instead; Groq keeps using the wrapper.
function createChatCompletion(
	client: Groq,
	provider: AiProvider,
	callType: AiCallType,
	contentParams: AiChatParams,
) {
	const body = requestFor(callType, provider, contentParams);
	if (provider === "openrouter") {
		return client.post<ChatCompletion>("/chat/completions", { body });
	}
	return client.chat.completions.create(body);
}

// Per-provider, per-model rate limit cooldown tracker.
// Cooldown expiration timestamp keyed by `${provider}:${model}`.
// Isolates limits per model: e.g. qwen/qwen3.6-27b hitting its strict
// output token/minute limit on Groq will NOT block openai/gpt-oss-120b
// recipe generation on Groq, and a heavy 120b meal plan batch will not
// block dish photo identification.
const modelCooldowns = new Map<string, number>();

export function isModelOnCooldown(
	provider: AiProvider,
	model: string,
): boolean {
	const blockedUntil = modelCooldowns.get(`${provider}:${model}`);
	return Boolean(blockedUntil && Date.now() < blockedUntil);
}

export function setModelCooldown(
	provider: AiProvider,
	model: string,
	durationMs: number,
) {
	modelCooldowns.set(`${provider}:${model}`, Date.now() + durationMs);
}

export function resetModelCooldowns() {
	modelCooldowns.clear();
}

export function parseDurationToMs(duration: string | null | undefined): number {
	if (!duration) return 60_000;
	const trimmed = duration.trim();
	const numeric = Number(trimmed);
	if (!Number.isNaN(numeric) && numeric > 0) {
		return Math.ceil(numeric * 1000);
	}
	let totalMs = 0;
	const hours = trimmed.match(/(\d+(?:\.\d+)?)h/);
	const minutes = trimmed.match(/(\d+(?:\.\d+)?)m(?!s)/);
	const seconds = trimmed.match(/(\d+(?:\.\d+)?)s/);
	const ms = trimmed.match(/(\d+(?:\.\d+)?)ms/);

	if (hours) totalMs += Number(hours[1]) * 3_600_000;
	if (minutes) totalMs += Number(minutes[1]) * 60_000;
	if (seconds && !trimmed.includes("ms")) totalMs += Number(seconds[1]) * 1000;
	if (ms) totalMs += Number(ms[1]);

	return totalMs > 0 ? totalMs : 60_000;
}

export function isRateLimitError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const err = error as { status?: number; name?: string; message?: string };
	if (err.status === 429 || err.name === "RateLimitError") return true;
	if (typeof err.message === "string" && /rate limit/i.test(err.message)) {
		return true;
	}
	return false;
}

export function isTimeoutError(error: unknown): boolean {
	if (!error || typeof error !== "object") return false;
	const err = error as { name?: string; message?: string };
	if (err.name === "APIConnectionTimeoutError") return true;
	if (
		typeof err.message === "string" &&
		/timeout|timed out/i.test(err.message)
	) {
		return true;
	}
	return false;
}

export function extractCooldownMs(error: unknown): number {
	if (error && typeof error === "object") {
		const headers = (error as { headers?: Headers | Record<string, string> })
			.headers;
		if (headers) {
			const getHeader = (name: string): string | null => {
				if (typeof (headers as Headers).get === "function") {
					return (headers as Headers).get(name);
				}
				const record = headers as Record<string, string>;
				return record[name] ?? record[name.toLowerCase()] ?? null;
			};

			const retryAfter = getHeader("retry-after");
			if (retryAfter) return parseDurationToMs(retryAfter);

			const resetRequests = getHeader("x-ratelimit-reset-requests");
			if (resetRequests) return parseDurationToMs(resetRequests);

			const resetTokens = getHeader("x-ratelimit-reset-tokens");
			if (resetTokens) return parseDurationToMs(resetTokens);
		}

		const message = (error as { message?: string }).message;
		if (typeof message === "string") {
			const match = message.match(/try again in ([0-9a-zA-Z.]+)/i);
			if (match?.[1]) {
				return parseDurationToMs(match[1]);
			}
		}
	}
	return 60_000;
}

// The single seam every recipe/meal-plan/dish call goes through. Resolves
// the active provider's client + model and, if that call throws for any
// reason (rate limit, timeout, outage), silently retries once against
// whichever other provider is actually configured — the caller never sees
// the first failure. Only attempted when the other provider has credentials
// set; otherwise the original error surfaces exactly as it did before this
// existed (e.g. a bare AI_PROVIDER switch with no second key configured).
//
// If a model is currently in a 429 rate-limit cooldown for the primary
// provider, it immediately routes to the fallback provider without wasting
// a roundtrip.
//
// `options.provider` overrides the *starting* provider for this one call
// only (e.g. a meal-plan build worker explicitly pinned to "openrouter" to
// run alongside a Groq-pinned worker) — the fallback behavior above is
// unchanged and still applies on top of whichever provider is passed.
// Omitting it keeps the normal global-default behavior via
// getActiveProvider().
export async function chatCompletion(
	callType: AiCallType,
	contentParams: AiChatParams,
	options?: { provider?: AiProvider },
) {
	const requestedPrimary = options?.provider ?? getActiveProvider();
	const primaryModel = getModelFor(callType, requestedPrimary);
	const fallback = otherProvider(requestedPrimary);

	// If this model is currently in rate-limit cooldown on the requested
	// primary, immediately switch to the fallback provider to avoid a
	// wasted roundtrip on a known 429.
	const primary =
		isModelOnCooldown(requestedPrimary, primaryModel) &&
		hasCredentials(fallback)
			? fallback
			: requestedPrimary;

	try {
		return await createChatCompletion(
			getAiClient(primary),
			primary,
			callType,
			contentParams,
		);
	} catch (error) {
		if (isRateLimitError(error)) {
			const model = getModelFor(callType, primary);
			const cooldownMs = extractCooldownMs(error);
			setModelCooldown(primary, model, cooldownMs);
		} else if (isTimeoutError(error)) {
			// If the primary call timed out (e.g. Groq hanging for 15s), cool down
			// this model on the primary provider for 60s so subsequent requests
			// fail over immediately instead of each waiting 15s.
			const model = getModelFor(callType, primary);
			setModelCooldown(primary, model, 60_000);
		}

		const targetFallback = otherProvider(primary);
		if (
			!hasCredentials(targetFallback) ||
			isModelOnCooldown(targetFallback, getModelFor(callType, targetFallback))
		) {
			throw error;
		}
		return await createChatCompletion(
			getAiClient(targetFallback),
			targetFallback,
			callType,
			contentParams,
		);
	}
}
