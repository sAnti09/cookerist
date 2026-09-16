import { createFileRoute, redirect } from "@tanstack/react-router";

// Recipes is the default tab — bookmarking/visiting the bare domain lands
// there. Everything that used to live here (prompt bar, results list, view
// toggle) moved into the _tabs layout and its child routes.
export const Route = createFileRoute("/")({
	beforeLoad: () => {
		throw redirect({ to: "/recipes" });
	},
});
