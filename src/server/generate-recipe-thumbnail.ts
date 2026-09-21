import { createServerFn } from "@tanstack/react-start";
import { generateThumbnailImage } from "#/lib/ai/image-client";
import { uploadThumbnail } from "#/lib/r2/client";

export type GenerateRecipeThumbnailResult =
	| { type: "success"; url: string }
	| { type: "error"; message: string };

export const generateRecipeThumbnail = createServerFn({ method: "POST" })
	.validator(
		(data: { recipeId: string; title: string; overview: string }) => data,
	)
	.handler(async ({ data }): Promise<GenerateRecipeThumbnailResult> => {
		const image = await generateThumbnailImage(data.title, data.overview);
		if (image.type !== "success") {
			return { type: "error", message: image.message };
		}
		try {
			const url = await uploadThumbnail(
				data.recipeId,
				image.bytes,
				image.contentType,
			);
			return { type: "success", url };
		} catch (error) {
			return {
				type: "error",
				message:
					error instanceof Error ? error.message : "Thumbnail upload failed",
			};
		}
	});
