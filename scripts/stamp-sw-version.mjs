// Runs after `vite build`. Rewrites CACHE_VERSION in the built sw.js to the
// current git commit so every deploy changes the service worker's bytes —
// not just ones where a developer remembers to hand-edit sw.js — which is
// what the browser's SW update check actually diffs against.
import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const swPath = join("dist", "client", "sw.js");

if (!existsSync(swPath)) {
	console.warn(`[stamp-sw-version] ${swPath} not found, skipping`);
	process.exit(0);
}

let version;
try {
	version = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
} catch {
	version = Date.now().toString(36);
}

const source = readFileSync(swPath, "utf8");
const stamped = source.replace(
	/const CACHE_VERSION = ".*";/,
	`const CACHE_VERSION = "cookerist-shell-${version}";`,
);

if (stamped === source) {
	throw new Error(
		`[stamp-sw-version] CACHE_VERSION pattern not found in ${swPath}`,
	);
}

writeFileSync(swPath, stamped);
console.log(
	`[stamp-sw-version] stamped ${swPath} with cookerist-shell-${version}`,
);
