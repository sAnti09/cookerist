import type { AiProvider } from "#/lib/ai/client";

export type AiCallType =
	| "identifyDish"
	| "onTopicCheck"
	| "recipeGeneration"
	| "recipeContinuation"
	| "recipeModification"
	| "mealPlanDraft"
	| "mealPlanRefine"
	| "categorizeIngredients";

// Explicit per-call-type, per-provider model slugs. Even where the string
// happens to be identical on both providers today, spelling out every entry
// means a future mismatch shows up as a one-line diff here, not a runtime
// surprise from an unrecognized model on whichever provider is active.
const MODELS: Record<AiCallType, Record<AiProvider, string>> = {
	identifyDish: { groq: "qwen/qwen3.6-27b", openrouter: "qwen/qwen3.6-27b" },
	onTopicCheck: {
		groq: "openai/gpt-oss-20b",
		openrouter: "openai/gpt-oss-20b",
	},
	recipeGeneration: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
	recipeContinuation: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
	recipeModification: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
	// Same generation model as full recipes — planning a whole week with
	// variety warrants the larger model even though each entry's own output
	// (title + overview only) is much smaller than a full recipe.
	mealPlanDraft: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
	mealPlanRefine: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
	// Reuses the recipe-generation model rather than the cheap on-topic-check
	// one — this pass has to correctly apply the same nuanced baseName rule a
	// fresh generation does (see prompt-rules.ts), and a wrong correction here
	// would misfile an ingredient for good, so it's worth the extra cost for
	// a one-time cleanup.
	categorizeIngredients: {
		groq: "openai/gpt-oss-120b",
		openrouter: "openai/gpt-oss-120b",
	},
};

export function getModelFor(
	callType: AiCallType,
	provider: AiProvider,
): string {
	return MODELS[callType][provider];
}
