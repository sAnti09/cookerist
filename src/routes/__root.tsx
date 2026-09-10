import { TanStackDevtools } from "@tanstack/react-devtools";
import type { QueryClient } from "@tanstack/react-query";
import { QueryClientProvider } from "@tanstack/react-query";
import {
	createRootRouteWithContext,
	HeadContent,
	Scripts,
} from "@tanstack/react-router";
import { TanStackRouterDevtoolsPanel } from "@tanstack/react-router-devtools";
import TanStackQueryDevtools from "../integrations/tanstack-query/devtools";
import appCss from "../styles.css?url";

interface MyRouterContext {
	queryClient: QueryClient;
}

const SITE_URL = "https://cookerist.jameseuangel-limpiado.workers.dev";
const SITE_DESCRIPTION =
	"Type a dish — or the ingredients you have — and get a full recipe in seconds. Ingredients, steps, and a grocery list, saved right in your browser.";
const OG_IMAGE_URL = `${SITE_URL}/og-image.png`;

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
