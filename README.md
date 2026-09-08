# Cookerist

A single-page app that turns a cooking prompt into a structured recipe — ingredients (with adjustable servings) and step-by-step instructions, generated via Groq.

See [CLAUDE.md](./CLAUDE.md) for the full product spec, tech stack, and project conventions.

## Status

Scaffolded (TanStack Start + Cloudflare Workers + Tailwind v4 + shadcn/ui + Biome + Vitest). Feature work not started yet. Tracked in Beacon: [TEST-115](https://beacon.chro.media/browse/TEST-115) (feature) / [TEST-116](https://beacon.chro.media/browse/TEST-116) (setup sub-task).

## Getting started

```bash
pnpm install
pnpm dev
```

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | Start the dev server (Vite) |
| `pnpm build` | Production build |
| `pnpm preview` | Preview the production build locally |
| `pnpm check` | Biome lint + format check |
| `pnpm format` | Biome format (writes) |
| `pnpm lint` | Biome lint only |
| `pnpm test` | Run the Vitest suite once |
| `pnpm test:watch` | Run Vitest in watch mode |
| `pnpm test:coverage` | Run tests with coverage (90%+ target — see `CLAUDE.md`) |
| `pnpm deploy` | Build and deploy to Cloudflare Workers via Wrangler |

## Stack

- [TanStack Start](https://tanstack.com/start) (React, file-based routing, SSR, server functions)
- [TanStack Query](https://tanstack.com/query) for async/client state
- [Tailwind CSS v4](https://tailwindcss.com/) + [shadcn/ui](https://ui.shadcn.com/) (add components with `pnpm dlx shadcn@latest add <component>`)
- [Biome](https://biomejs.dev/) for linting/formatting
- [Vitest](https://vitest.dev/) + [React Testing Library](https://testing-library.com/react) for tests
- [Cloudflare Workers](https://developers.cloudflare.com/workers/) for hosting (via the Cloudflare Vite plugin + `wrangler.jsonc`)

## Deploying to Cloudflare Workers

1. `wrangler login`
2. Set secrets, e.g. `wrangler secret put GROQ_API_KEY`
3. `pnpm deploy`

## Routing

File-based routing under `src/routes/` (TanStack Router). Add a new route by adding a file there; the route tree regenerates automatically in dev, or run `pnpm generate-routes`.
