import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import { NEW_SITE_URL } from "#/lib/site-domain";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

const SITE_URL = NEW_SITE_URL;
const SITE_DESCRIPTION =
	"Type a dish — or the ingredients you have — and get a full recipe in seconds. Ingredients, steps, and a grocery list, saved right in your browser.";
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

// Meta Pixel ID -- public (visible in every page's source/network tab
// regardless), same "not a secret" treatment as the Cloudflare beacon token
// below. Also used by src/lib/meta-pixel.ts's trackMetaPixelEvent for custom
// conversion events (e.g. recipe generation).
export const META_PIXEL_ID = "1986812921987752";

export const Route = createRootRouteWithContext<MyRouterContext>()({
	head: () => ({
		meta: [
			{
				charSet: "utf-8",
			},
			{
				name: "viewport",
				content:
					"width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no",
			},
			{
				title: "Cookerist",
			},
			{
				name: "description",
				content: SITE_DESCRIPTION,
			},
			{
				name: "theme-color",
				content: "#D9793A",
			},
			{
				name: "apple-mobile-web-app-capable",
				content: "yes",
			},
			{
				name: "apple-mobile-web-app-status-bar-style",
				content: "default",
			},
			{
				name: "apple-mobile-web-app-title",
				content: "Cookerist",
			},
			// Proves domain ownership to Meta Business Settings -> Brand
			// Safety -> Domains, needed for Advantage+ audiences and
			// aggregated event measurement on the Meta Pixel.
			{
				name: "facebook-domain-verification",
				content: "ak2bp6eghj6j6mzhzply5ue7c8rclg",
			},
			// Open Graph (Facebook, LinkedIn, Discord, iMessage, etc.)
			{
				property: "og:type",
				content: "website",
			},
			{
				property: "og:site_name",
				content: "Cookerist",
			},
			{
				property: "og:url",
				content: SITE_URL,
			},
			{
				property: "og:title",
				content: "Cookerist — Prompt it. Shop for it. Cook it.",
			},
			{
				property: "og:description",
				content: SITE_DESCRIPTION,
			},
			{
				property: "og:image",
				content: OG_IMAGE_URL,
			},
			{
				property: "og:image:width",
				content: "1200",
			},
			{
				property: "og:image:height",
				content: "630",
			},
			{
				property: "og:image:alt",
				content:
					"Cookerist — type a dish or your ingredients, get a full recipe with ingredients and steps.",
			},
			// Twitter/X card
			{
				name: "twitter:card",
				content: "summary_large_image",
			},
			{
				name: "twitter:title",
				content: "Cookerist — Prompt it. Shop for it. Cook it.",
			},
			{
				name: "twitter:description",
				content: SITE_DESCRIPTION,
			},
			{
				name: "twitter:image",
				content: OG_IMAGE_URL,
			},
		],
		links: [
			{
				rel: "stylesheet",
				href: appCss,
			},
			{
				rel: "manifest",
				href: "/manifest.webmanifest",
			},
			{
				rel: "icon",
				href: "/favicon.svg",
				type: "image/svg+xml",
			},
			{
				rel: "apple-touch-icon",
				href: "/apple-touch-icon.png",
			},
			{
				rel: "canonical",
				href: SITE_URL,
			},
		],
		// Cloudflare Web Analytics is scoped to the production domain and
		// CORS-rejects beacon calls from any other origin (e.g. localhost) --
		// only load it for a production build so local dev doesn't spam the
		// console with failed https://cloudflareinsights.com/cdn-cgi/rum calls.
		// The Meta Pixel has no such CORS rejection, but is gated the same way
		// regardless -- no reason to send dev/localhost traffic to Meta at all.
		scripts: import.meta.env.PROD
			? [
					{
						type: "module",
						src: "https://static.cloudflareinsights.com/beacon.min.js",
						"data-cf-beacon": '{"token": "8f4009aedfcd4d4bb9069c55df8a9734"}',
					},
					{
						children: `!function(f,b,e,v,n,t,s)
{if(f.fbq)return;n=f.fbq=function(){n.callMethod?
n.callMethod.apply(n,arguments):n.queue.push(arguments)};
if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';
n.queue=[];t=b.createElement(e);t.async=!0;
t.src=v;s=b.getElementsByTagName(e)[0];
s.parentNode.insertBefore(t,s)}(window, document,'script',
'https://connect.facebook.net/en_US/fbevents.js');
fbq('init', '${META_PIXEL_ID}');
fbq('track', 'PageView');`,
					},
				]
			: [],
	}),
	shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
	const { queryClient } = Route.useRouteContext();

	return (
		<html lang="en">
			<head>
				<HeadContent />
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static string, no user input; applies the persisted theme before paint to avoid a flash of the wrong color scheme
					dangerouslySetInnerHTML={{
						__html:
							"(function(){try{var t=localStorage.getItem('cookerist:theme');if(t==='light'||t==='dark'){document.documentElement.setAttribute('data-theme',t);}}catch(e){}})();",
					}}
				/>
			</head>
			<body>
				{import.meta.env.PROD && (
					<noscript>
						<img
							height="1"
							width="1"
							style={{ display: "none" }}
							src={`https://www.facebook.com/tr?id=${META_PIXEL_ID}&ev=PageView&noscript=1`}
							alt=""
						/>
					</noscript>
				)}
				<QueryClientProvider client={queryClient}>
					{children}
					<TanStackDevtools
						config={{
							position: "bottom-right",
						}}
						plugins={[
							{
								name: "Tanstack Router",
								render: <TanStackRouterDevtoolsPanel />,
							},
							TanStackQueryDevtools,
						]}
					/>
				</QueryClientProvider>
				<script
					// biome-ignore lint/security/noDangerouslySetInnerHtml: static string, no user input; registers the app-shell service worker after load so it never competes with initial page resources
					dangerouslySetInnerHTML={{
						__html:
							"(function(){if('serviceWorker' in navigator){window.addEventListener('load',function(){navigator.serviceWorker.register('/sw.js').catch(function(){});});}})();",
					}}
				/>
				<Scripts />
			</body>
		</html>
	);
}
