import { execSync } from "node:child_process";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { devtools } from "@tanstack/devtools-vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

let gitCommit = "dev";
try {
	gitCommit = execSync("git rev-parse --short HEAD", {
		encoding: "utf8",
	}).trim();
} catch {
	// git unavailable in build environment
}

const config = defineConfig({
	define: {
		__COMMIT_HASH__: JSON.stringify(gitCommit),
	},
	resolve: { tsconfigPaths: true },
	plugins: [
		devtools(),
		cloudflare({ viteEnvironment: { name: "ssr" } }),
		tailwindcss(),
		tanstackStart(),
		viteReact(),
	],
});

export default config;
