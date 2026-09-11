import { createServerFn } from "@tanstack/react-start";
import { identifyDish as identifyDishCore } from "#/lib/groq/identify-dish";

export const identifyDish = createServerFn({ method: "POST" })
	.validator((data: { imageDataUrl: string; timezone?: string }) => data)
	.handler(async ({ data }) =>
		identifyDishCore(data.imageDataUrl, data.timezone),
	);
