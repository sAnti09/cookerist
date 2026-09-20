import { fileURLToPath } from "node:url";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
	resolve: {
		tsconfigPaths: true,
		alias: {
			// "cloudflare:workers" (src/lib/r2/client.ts) only resolves inside a
			// real Workers/Miniflare runtime -- see the stub file's own comment
			// for why vi.mock() alone can't stand in for this.
			"cloudflare:workers": fileURLToPath(
				new URL("./src/test-utils/cloudflare-workers-stub.ts", import.meta.url),
			),
		},
	},
	plugins: [viteReact()],
	test: {
		environment: "jsdom",
		globals: true,
		setupFiles: ["./src/test-setup.ts"],
		coverage: {
			provider: "v8",
			reporter: ["text", "html", "lcov"],
			thresholds: {
				statements: 90,
				branches: 90,
				functions: 90,
				lines: 90,
			},
			exclude: [
				"src/routeTree.gen.ts",
				"src/router.tsx",
				"src/integrations/**",
				"src/components/ui/**",
				"**/*.config.*",
			],
		},
	},
});
