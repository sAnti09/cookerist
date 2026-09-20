import { Buffer } from "node:buffer";

// A small, purpose-built seam for image generation only — parallel to
// chatCompletion (src/lib/ai/client.ts), but not built on top of it: Groq/
// OpenRouter don't do image generation, so this goes to a third provider,
// DeepInfra, hosting FLUX.1 [schnell] (~$0.0005/thumbnail at 512x512, 4
// steps — see CLAUDE.md's "Recipe thumbnail images" section). The request/
// response shape (an OpenAI-compatible image endpoint, not a chat
// completion) doesn't fit AiCallType/MODELS/ChatCompletion either, so this
// intentionally doesn't route through chatCompletion.
const DEEPINFRA_IMAGE_ENDPOINT =
	"https://api.deepinfra.com/v1/openai/images/generations";
const DEEPINFRA_IMAGE_MODEL = "black-forest-labs/FLUX-1-schnell";
// Small enough to keep cost negligible while still looking sharp at the
// sizes this app actually displays it at (a 40px list-row thumbnail, an
// ~full-width detail-screen hero).
const THUMBNAIL_SIZE = "512x512";
// DeepInfra's image endpoint only supports b64_json (confirmed against their
// live API docs — there is no hosted-URL option), and doesn't return
// anything indicating format; FLUX's raw output is PNG.
const THUMBNAIL_CONTENT_TYPE = "image/png";

export type GenerateThumbnailImageResult =
	| { type: "success"; bytes: Uint8Array; contentType: string }
	| { type: "error"; message: string };

function buildThumbnailPrompt(title: string, overview: string): string {
	return `A professional, appetizing food photograph of ${title}. ${overview} Shot from directly above or at a 45-degree angle, natural lighting, plated simply on a plate or in a bowl, no text or watermarks.`;
}

type DeepInfraImageResponse = {
	data?: Array<{ b64_json?: string }>;
};

// Never throws to its caller — matches every Groq call site's try/catch,
// return-a-result-type pattern (see src/lib/groq/*.ts).
export async function generateThumbnailImage(
	title: string,
	overview: string,
): Promise<GenerateThumbnailImageResult> {
	const apiKey = process.env.DEEPINFRA_API_KEY;
	if (!apiKey) {
		return { type: "error", message: "DEEPINFRA_API_KEY is not set" };
	}

	try {
		const response = await fetch(DEEPINFRA_IMAGE_ENDPOINT, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
				Authorization: `Bearer ${apiKey}`,
			},
			body: JSON.stringify({
				model: DEEPINFRA_IMAGE_MODEL,
				prompt: buildThumbnailPrompt(title, overview),
				size: THUMBNAIL_SIZE,
				n: 1,
				response_format: "b64_json",
			}),
		});
		if (!response.ok) {
			return {
				type: "error",
				message: `DeepInfra image generation failed: ${response.status} ${response.statusText}`,
			};
		}
		const json = (await response.json()) as DeepInfraImageResponse;
		const b64 = json.data?.[0]?.b64_json;
		if (!b64) {
			return {
				type: "error",
				message: "Malformed image response from DeepInfra",
			};
		}
		return {
			type: "success",
			bytes: new Uint8Array(Buffer.from(b64, "base64")),
			contentType: THUMBNAIL_CONTENT_TYPE,
		};
	} catch (error) {
		return {
			type: "error",
			message:
				error instanceof Error ? error.message : "Thumbnail generation failed",
		};
	}
}
