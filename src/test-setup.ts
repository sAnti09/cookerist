import "@testing-library/jest-dom/vitest";
import { vi } from "vitest";

// __root.tsx mounts the real TanStackDevtools panel, whose underlying core
// is a module-level singleton that doesn't handle the repeated mount/unmount
// cycles a router-based test suite naturally does (each render/cleanup
// throws "Devtools is not mounted" on the next mount) — irrelevant to what
// these tests actually verify, so it's stubbed out everywhere.
vi.mock("@tanstack/react-devtools", () => ({
	TanStackDevtools: () => null,
}));

// Some lib/* tests opt into `// @vitest-environment node` (e.g. for Web
// Crypto-heavy code closer to its real server runtime) where `window`
// doesn't exist at all — everything below is jsdom-only.
if (typeof window !== "undefined") {
	// jsdom doesn't implement window.scrollTo and logs a "Not implemented"
	// error for every call otherwise — stub it so components that restore
	// scroll position (e.g. cook mode's body-scroll lock) don't spam test
	// output.
	window.scrollTo = () => {};

	// jsdom has no ResizeObserver, and is missing enough of the Pointer
	// Events API (PointerEvent itself, plus Element's pointer-capture
	// methods) that Radix UI's popper-positioned components (DropdownMenu,
	// etc. — added for the photo-picker menu) hang indefinitely under
	// userEvent's pointer-based clicks without these stubs.
	class ResizeObserverStub {
		observe() {}
		unobserve() {}
		disconnect() {}
	}
	window.ResizeObserver ??= ResizeObserverStub;

	if (typeof window.PointerEvent === "undefined") {
		// biome-ignore lint/suspicious/noExplicitAny: minimal stand-in, not a full PointerEvent polyfill
		window.PointerEvent = MouseEvent as any;
	}
	Element.prototype.hasPointerCapture ??= () => false;
	Element.prototype.setPointerCapture ??= () => {};
	Element.prototype.releasePointerCapture ??= () => {};
	Element.prototype.scrollIntoView ??= () => {};
}
