import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.scrollTo and logs a "Not implemented" error
// for every call otherwise — stub it so components that restore scroll
// position (e.g. cook mode's body-scroll lock) don't spam test output.
window.scrollTo = () => {};

// jsdom has no ResizeObserver, and is missing enough of the Pointer Events
// API (PointerEvent itself, plus Element's pointer-capture methods) that
// Radix UI's popper-positioned components (DropdownMenu, etc. — added for
// the photo-picker menu) hang indefinitely under userEvent's pointer-based
// clicks without these stubs.
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
