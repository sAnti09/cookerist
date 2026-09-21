import { env } from "cloudflare:workers";

// Server-only. Mirrors src/lib/supabase/admin.ts's "small named operations
// on a service client" pattern, for the same reason: keeps every call site
// mockable in tests instead of reaching for the raw binding directly. Uses a
// native R2 bucket binding (see wrangler.jsonc's r2_buckets) rather than R2's
// S3-compatible REST API — @cloudflare/vite-plugin already wires Cloudflare
// bindings into the SSR environment (see vite.config.ts), so this works both
// in `pnpm dev` (via Miniflare) and in production with no extra signing
// dependency.

type ThumbnailsBucket = {
	put(
		key: string,
		value: Uint8Array,
		options?: { httpMetadata?: { contentType?: string } },
	): Promise<unknown>;
};

function getBucket(): ThumbnailsBucket {
	const bucket = (env as { THUMBNAILS?: ThumbnailsBucket }).THUMBNAILS;
	if (!bucket) {
		throw new Error(
			"Missing THUMBNAILS R2 binding -- see CLAUDE.md's Environment / secrets section.",
		);
	}
	return bucket;
}

function getPublicUrlBase(): string {
	const base = process.env.R2_PUBLIC_URL_BASE;
	if (!base) {
		throw new Error(
			"Missing R2_PUBLIC_URL_BASE -- see CLAUDE.md's Environment / secrets section.",
		);
	}
	return base;
}

// Uploads a recipe thumbnail and returns its public URL. Bucket public
// access (the r2.dev subdomain or a custom domain) must already be enabled
// on the Cloudflare dashboard — see CLAUDE.md's manual one-time setup notes.
export async function uploadThumbnail(
	recipeId: string,
	bytes: Uint8Array,
	contentType: string,
): Promise<string> {
	const key = `recipes/${recipeId}.png`;
	await getBucket().put(key, bytes, { httpMetadata: { contentType } });
	return `${getPublicUrlBase()}/${key}`;
}
