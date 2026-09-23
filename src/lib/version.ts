declare const __COMMIT_HASH__: string | undefined;

// The app version displayed in the account drawer footer, sourced from the
// current git commit's short hash injected at build time by vite.config.ts,
// with "dev" as the fallback when git is unavailable.
const rawHash =
	typeof __COMMIT_HASH__ !== "undefined" ? __COMMIT_HASH__ : "dev";

export const APP_VERSION = `v${rawHash}`;
