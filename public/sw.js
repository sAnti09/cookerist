// Cookerist service worker: caches the static app shell so the installed
// PWA still opens offline. Recipe generation itself always needs the
// network (Groq calls go through POST server functions, which this worker
// never intercepts).
const CACHE_VERSION = "cookerist-shell-v1";
const APP_SHELL = [
	"/",
	"/manifest.webmanifest",
	"/favicon.svg",
	"/apple-touch-icon.png",
	"/icons/icon-192.png",
	"/icons/icon-512.png",
	"/icons/icon-maskable-512.png",
];

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE_VERSION)
			.then((cache) => cache.addAll(APP_SHELL))
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) =>
				Promise.all(
					keys
						.filter((key) => key !== CACHE_VERSION)
						.map((key) => caches.delete(key)),
				),
			)
			.then(() => self.clients.claim()),
	);
});

self.addEventListener("fetch", (event) => {
	const { request } = event;

	// Only ever cache same-origin GETs. POSTs (server functions calling Groq)
	// and cross-origin requests fall through to the network untouched.
	if (request.method !== "GET" || new URL(request.url).origin !== self.location.origin) {
		return;
	}

	if (request.mode === "navigate") {
		event.respondWith(networkFirst(request));
		return;
	}

	event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
	const cache = await caches.open(CACHE_VERSION);
	try {
		const response = await fetch(request);
		cache.put(request, response.clone());
		return response;
	} catch {
		return (await cache.match(request)) ?? (await cache.match("/"));
	}
}

async function staleWhileRevalidate(request) {
	const cache = await caches.open(CACHE_VERSION);
	const cached = await cache.match(request);
	const networkFetch = fetch(request)
		.then((response) => {
			cache.put(request, response.clone());
			return response;
		})
		.catch(() => undefined);
	return cached ?? (await networkFetch);
}
