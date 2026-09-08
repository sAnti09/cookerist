import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Home });

export function Home() {
	return (
		<div className="mx-auto max-w-2xl p-8">
			<h1 className="text-4xl font-bold">Cookerist</h1>
			<p className="mt-4 text-lg text-muted-foreground">
				Tell us what you want to cook, and get back the ingredients and steps.
			</p>
		</div>
	);
}
