import { QueryClient } from "@tanstack/react-query";
import {
	createMemoryHistory,
	createRouter,
	RouterProvider,
} from "@tanstack/react-router";
import { act, render } from "@testing-library/react";
import { routeTree } from "#/routeTree.gen";

// Renders the real app router (the actual route tree, not a hand-built
// stand-in) at a given path — route components use Route.useParams()/<Link>,
// which require a real router context to work at all, so every test that
// touches a routed screen goes through this helper.
export async function renderApp(initialPath = "/recipes") {
	const queryClient = new QueryClient();
	const router = createRouter({
		routeTree,
		context: { queryClient },
		history: createMemoryHistory({ initialEntries: [initialPath] }),
	});
	const utils = render(<RouterProvider router={router} />);
	await router.load();
	// router.load() resolves once the router itself has matched/loaded, but
	// AppDataProvider's own mount effect (reading recipes/grocery lists from
	// localStorage) schedules its state update independently — for some
	// route depths that update is still pending a tick after router.load()
	// resolves. One extra flushed tick guarantees every test sees the loaded
	// data on its very first assertion, not just eventually via findBy.
	await act(async () => {
		await new Promise((resolve) => setTimeout(resolve, 0));
	});
	return { ...utils, router };
}
