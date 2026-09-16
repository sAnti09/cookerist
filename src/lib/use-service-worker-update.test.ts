import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useServiceWorkerUpdate } from "./use-service-worker-update";

class MockServiceWorker extends EventTarget {
	state: string;
	postMessage = vi.fn();

	constructor(state = "installing") {
		super();
		this.state = state;
	}

	setState(state: string) {
		this.state = state;
		this.dispatchEvent(new Event("statechange"));
	}
}

class MockRegistration extends EventTarget {
	waiting: MockServiceWorker | null = null;
	installing: MockServiceWorker | null = null;
	update = vi.fn().mockResolvedValue(undefined);
}

function stubServiceWorker({
	registration,
	controller = {},
}: {
	registration: MockRegistration;
	controller?: object | null;
}) {
	const container = Object.assign(new EventTarget(), {
		controller,
		ready: Promise.resolve(registration),
	});
	vi.stubGlobal("navigator", {
		...window.navigator,
		serviceWorker: container,
	});
	return container;
}

afterEach(() => {
	vi.unstubAllGlobals();
});

describe("useServiceWorkerUpdate", () => {
	it("does nothing when the browser doesn't support service workers", () => {
		// Deleting the key (not setting it to `undefined`) so the hook's own
		// `"serviceWorker" in navigator` check reads as truly unsupported.
		const navigatorWithoutServiceWorker: Record<string, unknown> = {
			...window.navigator,
		};
		delete navigatorWithoutServiceWorker.serviceWorker;
		vi.stubGlobal("navigator", navigatorWithoutServiceWorker);
		const { result } = renderHook(() => useServiceWorkerUpdate());

		expect(result.current.updateAvailable).toBe(false);
	});

	it("flags an update already waiting from an earlier page load", async () => {
		const registration = new MockRegistration();
		registration.waiting = new MockServiceWorker("installed");
		stubServiceWorker({ registration });

		const { result } = renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});

		expect(result.current.updateAvailable).toBe(true);
	});

	it("does not flag a waiting worker on the very first install (no controller yet)", async () => {
		const registration = new MockRegistration();
		registration.waiting = new MockServiceWorker("installed");
		stubServiceWorker({ registration, controller: null });

		const { result } = renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});

		expect(result.current.updateAvailable).toBe(false);
	});

	it("flags an update once a newly-found worker finishes installing", async () => {
		const registration = new MockRegistration();
		stubServiceWorker({ registration });

		const { result } = renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});
		expect(result.current.updateAvailable).toBe(false);

		const worker = new MockServiceWorker("installing");
		registration.installing = worker;
		act(() => {
			registration.dispatchEvent(new Event("updatefound"));
		});
		expect(result.current.updateAvailable).toBe(false);

		act(() => {
			worker.setState("installed");
		});
		expect(result.current.updateAvailable).toBe(true);
	});

	it("checks for updates when the document becomes visible again", async () => {
		const registration = new MockRegistration();
		stubServiceWorker({ registration });
		renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});

		vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
		act(() => {
			document.dispatchEvent(new Event("visibilitychange"));
		});

		expect(registration.update).toHaveBeenCalledTimes(1);
	});

	it("posts SKIP_WAITING to the waiting worker on applyUpdate", async () => {
		const registration = new MockRegistration();
		const worker = new MockServiceWorker("installed");
		registration.waiting = worker;
		stubServiceWorker({ registration });

		const { result } = renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			result.current.applyUpdate();
		});

		expect(worker.postMessage).toHaveBeenCalledWith({ type: "SKIP_WAITING" });
	});

	it("reloads the page once the controller changes", async () => {
		const registration = new MockRegistration();
		const container = stubServiceWorker({ registration });
		const reload = vi.fn();
		Object.defineProperty(window, "location", {
			configurable: true,
			value: { ...window.location, reload },
		});
		renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});

		act(() => {
			container.dispatchEvent(new Event("controllerchange"));
		});

		expect(reload).toHaveBeenCalledTimes(1);
	});

	it("dismiss hides the prompt", async () => {
		const registration = new MockRegistration();
		registration.waiting = new MockServiceWorker("installed");
		stubServiceWorker({ registration });

		const { result } = renderHook(() => useServiceWorkerUpdate());
		await act(async () => {
			await Promise.resolve();
		});
		expect(result.current.updateAvailable).toBe(true);

		act(() => {
			result.current.dismiss();
		});

		expect(result.current.updateAvailable).toBe(false);
	});
});
