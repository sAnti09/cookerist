import Groq from "groq-sdk";
import type { ChatCompletionCreateParamsNonStreaming } from "groq-sdk/resources/chat/completions";
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
function providerExtras(provider: AiProvider): {
	provider?: { ignore: string[] };
} {
	return provider === "openrouter" ? { provider: { ignore: ["groq"] } } : {};
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

// The single seam every recipe/meal-plan/dish call goes through. Resolves
// the active provider's client + model and, if that call throws for any
// reason (rate limit, timeout, outage), silently retries once against
// whichever other provider is actually configured — the caller never sees
// the first failure. Only attempted when the other provider has credentials
// set; otherwise the original error surfaces exactly as it did before this
// existed (e.g. a bare AI_PROVIDER switch with no second key configured).
export async function chatCompletion(
	callType: AiCallType,
	contentParams: AiChatParams,
) {
	const primary = getActiveProvider();

	try {
		return await getAiClient(primary).chat.completions.create(
			requestFor(callType, primary, contentParams),
		);
	} catch (error) {
		const fallback = otherProvider(primary);
		if (!hasCredentials(fallback)) {
			throw error;
		}
		return await getAiClient(fallback).chat.completions.create(
			requestFor(callType, fallback, contentParams),
		);
	}
}
