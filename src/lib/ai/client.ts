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

const PROVIDER_CONFIG: Record<
	AiProvider,
	{ apiKeyEnv: string; baseURL?: string }
> = {
	groq: { apiKeyEnv: "GROQ_API_KEY" },
	openrouter: {
		apiKeyEnv: "OPENROUTER_API_KEY",
		baseURL: "https://openrouter.ai/api/v1",
	},
};

// groq-sdk defaults to a 1-minute request timeout when none is given.
// That was always the effective ceiling here too (getAiClient never
// overrode it), but harmless as long as every response came back in a
// handful of seconds — which stopped being true once OpenRouter's
// `provider.sort` moved from "latency" (Cerebras, always fast) to "price"
// (routinely 20-145s+ on the cheapest tier). Once real responses started
// approaching/exceeding 60s, the SDK's own timeout began firing and
// silently doubling latency via chatCompletion's cross-provider failover
// (a full second ~60s-capped attempt on top of the first) — the actual
// cause behind a wave of "Load failed" errors, since a real browser is far
// more likely to abort a 60-145s in-flight request than my scripted test
// was. A longer, explicit timeout gives a legitimately-slow-but-succeeding
// call room to finish on its first attempt instead of being killed and
// retried.
const AI_REQUEST_TIMEOUT_MS = 180_000;

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
	const { apiKeyEnv, baseURL } = PROVIDER_CONFIG[provider];
	const apiKey = process.env[apiKeyEnv];
	if (!apiKey) {
		throw new Error(`${apiKeyEnv} is not set`);
	}
	return new Groq({
		apiKey,
		baseURL,
		timeout: AI_REQUEST_TIMEOUT_MS,
		defaultHeaders:
			provider === "openrouter"
				? {
						"HTTP-Referer":
							"https://cookerist.jameseuangel-limpiado.workers.dev",
						"X-Title": "Cookerist",
					}
				: undefined,
	});
}

// When routed through OpenRouter, exclude Groq as an upstream so switching
// providers actually escapes Groq's own rate limits instead of silently
// landing back on Groq's capacity via OpenRouter's cross-provider load
// balancing (OpenRouter lists Groq as one of several hosts for gpt-oss).
// `sort: "price"` makes OpenRouter deterministically try the single cheapest
// provider first (with automatic failover to the next-cheapest on error),
// instead of its default weighted-random balancing (mostly cheap, but
// occasionally a pricier provider "for redundancy") or `sort: "latency"`
// (always the fastest, which for this model is Cerebras — 4-5x the
// completion-token price of the cheapest tier). Cost matters more than
// wall-clock speed once meal-plan building isn't just for one paying user
// (a planned free public rollout) — `sort: "price"` is also strictly better
// than the default here: it avoids the default's occasional pricier pick
// AND the inconsistent per-call speed that caused (some OpenRouter-routed
// dishes taking 20-50s vs. under 10s for others, before this was added).
function providerExtras(provider: AiProvider): {
	provider?: { ignore: string[]; sort: "price" };
} {
	return provider === "openrouter"
		? { provider: { ignore: ["groq"], sort: "price" } }
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

// The single seam every recipe/meal-plan/dish call goes through. Resolves
// the active provider's client + model and, if that call throws for any
// reason (rate limit, timeout, outage), silently retries once against
// whichever other provider is actually configured — the caller never sees
// the first failure. Only attempted when the other provider has credentials
// set; otherwise the original error surfaces exactly as it did before this
// existed (e.g. a bare AI_PROVIDER switch with no second key configured).
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
	const primary = options?.provider ?? getActiveProvider();

	try {
		return await createChatCompletion(
			getAiClient(primary),
			primary,
			callType,
			contentParams,
		);
	} catch (error) {
		const fallback = otherProvider(primary);
		if (!hasCredentials(fallback)) {
			throw error;
		}
		return await createChatCompletion(
			getAiClient(fallback),
			fallback,
			callType,
			contentParams,
		);
	}
}
