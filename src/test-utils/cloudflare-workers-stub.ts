// Test-only stand-in for the "cloudflare:workers" module (aliased to this
// file in vitest.config.ts). That module only resolves inside a real
// Workers/Miniflare runtime -- Vite's resolver can't resolve the literal
// "cloudflare:workers" specifier at all outside one, so a plain vi.mock()
// isn't enough (mocking happens after Vite's own resolution step, which
// fails first). Tests that need to control `env` (e.g. src/lib/r2/client.ts)
// import this module directly and mutate its properties.
export const env: Record<string, unknown> = {};
