import { getGroqClient } from "./client";
import { extractJson } from "./extract-json";
import { regionHint } from "./region-hint";
import { dishIdentificationResponseSchema } from "./schema";

const IDENTIFY_MODEL = "qwen/qwen3.6-27b";

// This account's on-demand tier caps qwen/qwen3.6-27b at 1000 output tokens
// per minute — well below the model's own 2048-token default, which Groq
// reserves upfront based on max_completion_tokens (not actual output length),
// so an unset/high value gets rejected before the call even runs. The actual
// JSON reply here is tiny (a boolean plus a short phrase), so 200 is
// generous headroom while comfortably clearing that per-minute budget.
const IDENTIFY_MAX_COMPLETION_TOKENS = 200;

const IDENTIFY_SYSTEM_PROMPT = `You look at a photo and identify whether it shows a specific prepared food, drink, or dessert that could be turned into one recipe. Respond with ONLY a JSON object of the exact shape {"is_food": boolean, "description": string}. No other text.

Set "is_food" to true only when the photo clearly shows a specific prepared dish, drink, or dessert — not a raw/unprepared ingredient on its own, not a menu or packaging, not an unrelated photo.

When true, "description" is used verbatim as a recipe request, so name the dish as specifically as you can:
- First, check whether it matches a specific, well-known traditional or regional dish, not just its generic category — e.g. "chicken adobo" (not "braised chicken stew"), "beef bulgogi" (not "grilled marinated beef"), "chicken tikka masala" (not "curry"), "pad thai" (not "stir-fried noodles"), "jollof rice", "beef pho", "moussaka", "biryani". Look for cues like sauce color/sheen and ingredients, garnish, rice or side, and plating style before settling for a generic description — dark, glossy braised meat with garlic and bay leaf is very often adobo rather than a plain "beef stew", for instance. If you recognize the specific dish, lead with that name (e.g. "Filipino chicken adobo with garlic and bay leaf", "beef bulgogi with rice and scallions").
- Only fall back to a purely descriptive phrase (the standout ingredients/style, e.g. "creamy garlic butter shrimp pasta with parmesan and herbs") when you genuinely don't recognize a specific named dish.
- Either way, phrase it the way someone would type a recipe request — specific enough to anchor one recipe, never a bare one-or-two-word label like "pasta" or "dessert".

When "is_food" is false, "description" must be "".`;

export type IdentifyDishResult =
	| { type: "not_food" }
	| { type: "error"; message: string }
	| { type: "success"; description: string };

export async function identifyDish(
	imageDataUrl: string,
	// IANA timezone (e.g. "Asia/Manila") — a soft regional cuisine tiebreaker,
	// see region-hint.ts.
	timezone?: string,
): Promise<IdentifyDishResult> {
	const client = getGroqClient();

	try {
		const completion = await client.chat.completions.create({
			model: IDENTIFY_MODEL,
			response_format: { type: "json_object" },
			max_completion_tokens: IDENTIFY_MAX_COMPLETION_TOKENS,
			// This is a plain classification, not a task that benefits from
			// step-by-step reasoning — disabling it also avoids reasoning
			// tokens eating into the small max_completion_tokens budget above.
			reasoning_effort: "none",
			messages: [
				{ role: "system", content: IDENTIFY_SYSTEM_PROMPT },
				{
					role: "user",
					content: [
						{
							type: "text",
							text: `Identify the dish in this photo.${regionHint(timezone)}`,
						},
						{ type: "image_url", image_url: { url: imageDataUrl } },
					],
				},
			],
		});
		const parsed = dishIdentificationResponseSchema.safeParse(
			extractJson(completion.choices[0]?.message?.content),
		);
		if (!parsed.success) {
			return {
				type: "error",
				message: "Malformed dish identification response from Groq",
			};
		}
		if (!parsed.data.is_food || !parsed.data.description.trim()) {
			return { type: "not_food" };
		}
		return { type: "success", description: parsed.data.description };
	} catch (error) {
		return {
			type: "error",
			message:
				error instanceof Error ? error.message : "Dish identification failed",
		};
	}
}
