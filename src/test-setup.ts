import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement window.scrollTo and logs a "Not implemented" error
// for every call otherwise — stub it so components that restore scroll
// position (e.g. cook mode's body-scroll lock) don't spam test output.
window.scrollTo = () => {};
