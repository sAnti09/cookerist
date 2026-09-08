# Cookerist

## What this is

A single-page web app. A user types a prompt describing a dish (e.g. "creamy garlic butter shrimp pasta for 2"). The app sends it to Groq (GroqCloud), which returns a structured recipe: ingredients (with measurements) and cooking steps. Every past result is kept in a list on the same page, each collapsible/expandable, and persisted only in the browser's `localStorage` — there is no backend database and no user accounts.

## Product spec

### Page layout
- Single page. Prompt textbox pinned at the top.
- Below it, a reverse-chronological list of past results, one collapsed row each (dish title + short overview).
- Clicking a row expands it in place; expanded rows can be collapsed back.

### Prompt handling
- The prompt must be validated as on-topic (a specific dish / cooking request) before calling Groq for a full recipe. Off-topic prompts (not about cooking/food) must be rejected with a friendly inline message and must **not** consume a full recipe generation call.
- Implement this as a cheap up-front check, e.g. a lightweight Groq classification call (or a single combined prompt with a strict system prompt that asks the model to refuse/return an "off_topic" flag instead of a recipe when the request isn't about cooking a specific dish). Do not attempt to hardcode keyword filters as the primary defense — they're easy to bypass and produce false negatives; use the model, but keep the check cheap (small/fast model, short output — e.g. Llama 3.1 8B on Groq).

### Expanded result contents
- Title of the dish
- The original user prompt
- Short overview/description of the dish
- Servings
  - Numeric, user-editable (stepper or input)
  - Changing it rescales all ingredient quantities proportionally in real time (client-side math, no re-call to Groq)
- Ingredients
  - Each has a checkbox; a "check/uncheck all" control at the top of the section
- Steps
  - Each has a checkbox to mark progress
  - Steps may be grouped into named subsections (e.g. "Prep", "Cook", "Plate") when the recipe warrants it — this grouping should be optional/flat when Groq doesn't return sections

### Persistence
- Every generated result (including checkbox/serving state) is stored in `localStorage`, keyed by an id, so it survives reloads.
- No server-side storage of results.

## Visual design (from TEST-148 — provisional, expect refinement)

Direction: warm minimalism leaning white/light in light mode — a near-white canvas (not a full cream/peach wash) with warmth carried by accent color, typography, and shape rather than the background itself. No food photography (Groq recipes are text-only); a flame mark worked into the "Cookerist" wordmark is the one illustrative touch. Mockup: https://claude.ai/code/artifact/ae0a29ee-801c-4049-a387-043c9b7cdde7 (private artifact — not a substitute for this doc if it's ever deleted/regenerated).

### Tokens

| Token | Light | Dark |
|---|---|---|
| `--bg` | `#FFFFFF` | `#221B14` |
| `--bg2` (subtle top glow / hover / track fills) | `#F7F3EC` | `#2B2117` |
| `--surface` (cards) | `#FFFFFF` | `#2C241B` |
| `--ink` | `#211C16` | `#F4EBDD` |
| `--ink-dim` (metadata, placeholders) | `#8A8072` | `#B6A891` |
| `--line` (borders) | `#E9E4D9` | `#3E3324` |
| `--accent` (flame — primary CTA, brand) | `#D9793A` | `#E8935A` |
| `--sage` (checked/done state — second, nature-inspired accent) | `#63805F` | `#8FAE73` |
| `--warn` (off-topic rejection) | `#B65A3A` | `#DD8264` |
| `--warn-wash` (rejection card background) | `#F8EEE5` | `#3B2A21` |

Cards sit on an equal-or-near-equal background and are separated by `--line` border + a soft warm shadow (`0 8px 22px -14px rgba(33,28,22,0.16)` light / darker+stronger in dark) — not by a contrasting fill. Dark mode keeps more of the original warm gradient (deeper, richer) since the "lean white" note from the user was about light mode specifically.

### Typography
- Display (wordmark, dish titles, section headings): **Fraunces** (serif, optical-size axis) — used sparingly, not for body copy.
- Body: **Work Sans**.
- No monospace anywhere in this direction (a deliberate change from the earlier 3-direction pitch) — numbers use `font-variant-numeric: tabular-nums` on the body face instead.

### Shape & layout
- Radius scale by role, not one flat value: pill (`999px`) for the prompt bar, stepper, and buttons; `18px` for cards; `10px` for small chips/icon buttons.
- Ingredients render as a **2-column grid** (`grid-template-columns: 1fr 1fr`, collapsing to 1 column under 420px); steps stay single-column (sequential, longer text).
- Checked-item styling uses a custom circular checkbox (not the browser default) filled with `--sage`.

### States covered (per TEST-148 AC2)
Prompt entry, loading (flickering flame + "Simmering your …" copy), off-topic rejection (`--warn`/`--warn-wash`, distinct from the loading/normal card), expanded detail (title, prompt echo, overview, servings stepper, ingredients w/ check-all + progress bar, steps grouped into subsections), and collapsed rows (title + date + delete icon). Expansion is accordion-style, in place — see TEST-158.

## Tech stack

| Concern | Choice |
|---|---|
| App framework | [TanStack Start](https://tanstack.com/start) (React, Vite + Nitro, file-based routing, server functions, SSR) |
| Data/async | TanStack Query for client state around the Groq call; TanStack Store only if plain `useState`/`useReducer` + localStorage isn't enough |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix-based, copied into the repo, fully owned/customizable) |
| AI provider | Groq (GroqCloud API, OpenAI-compatible) — fast LPU inference over open models (e.g. Llama 3.3 70B Versatile for recipe generation, Llama 3.1 8B for the cheap on-topic check); JSON mode/structured outputs for the recipe schema — called from a TanStack Start **server function**, never from the client, so the API key never reaches the browser |
| Hosting | Cloudflare Workers (via Wrangler; static assets served free/unlimited, Worker requests on the free tier). Live: [cookerist.jameseuangel-limpiado.workers.dev](https://cookerist.jameseuangel-limpiado.workers.dev) |
| Deployment | `pnpm run deploy` (builds + `wrangler deploy`) — run by the agent only with explicit per-deploy user approval (auto-mode blocks it otherwise); not yet wired to auto-deploy on push |
| Package manager | pnpm |
| Linting/formatting | Biome (single config, replaces ESLint + Prettier) |
| Testing | Vitest + React Testing Library + `@testing-library/jest-dom` + `@testing-library/user-event`; `@vitest/coverage-v8` for coverage |
| Language | TypeScript, strict mode |
| Repository | Public GitHub repo |
| Project management | beacon.chro.media, project code `TEST` (ticket: [TEST-115](https://beacon.chro.media/browse/TEST-115) "James Limpiado - Cookerist", sub-task [TEST-116](https://beacon.chro.media/browse/TEST-116) "Setup project") |

### Why these choices (context for future sessions)
- **TanStack Start over plain TanStack Router**: we need a server function to hide the Groq API key — Start gives us that plus SSR for free while staying "just React."
- **Cloudflare Workers over Vercel**: TanStack Start deploys natively via Nitro's Cloudflare preset, static assets are free/unlimited on Workers, and Cloudflare's MCP tooling supports auto-deploy from Claude Code out of the box.
- **Biome over ESLint+Prettier**: greenfield project with no dependency on niche ESLint plugins (e.g. no need for framework-specific rule packs beyond what Biome already covers for React/JSX/a11y). Revisit if we hit a rule Biome doesn't support.
- **shadcn/ui over daisyUI**: we own the component source directly (no black-box dependency), better long-term customization for a distinctive "modern" look.

## Data model (draft — refine when implementing)

```ts
type Recipe = {
  id: string;
  createdAt: string; // ISO timestamp
  prompt: string;
  title: string;
  overview: string;
  baseServings: number;   // servings the ingredient list was generated for
  currentServings: number; // user-adjusted; drives the scaling math
  ingredients: Array<{
    id: string;
    text: string;        // e.g. "garlic, minced"
    quantity: number;     // numeric part, scaled by servings ratio
    unit: string;         // e.g. "cloves", "g", "cups"
    checked: boolean;
  }>;
  steps: Array<{
    id: string;
    section: string | null; // e.g. "Prep" — null when ungrouped
    text: string;
    checked: boolean;
  }>;
  expanded: boolean;
};
```

- Ingredient quantities must be stored as a clean numeric `quantity` + `unit` (not baked into a free-text string) specifically so the serving-count scaling can do simple multiplication client-side.
- Ask Groq to return this shape directly (structured outputs / JSON mode) rather than parsing free text.

## Coding standards
- TypeScript strict mode everywhere; no `any` without a comment justifying it.
- Biome handles lint + format; run it in CI and as a pre-commit check.
- Keep components small and colocate tests next to source (`Component.tsx` + `Component.test.tsx`).
- No premature abstraction — this is a single-page app; don't build a router/multi-page structure or a generic "plugin" system for the recipe schema unless a second real use case appears.
- **Commit messages must be prefixed with the Beacon ticket key** being worked on, e.g. `TEST-148: Document finalized visual design direction`. Ask if the work doesn't map cleanly to one ticket.
- Never commit, push, or make any Beacon write (`create_ticket`/`update_ticket`/`add_attachment`/`delete_comment`/etc.) without the user's explicit approval first — make the change, show it, then wait.

## Testing
- Target **90%+ coverage** (statements/branches/functions/lines) via `@vitest/coverage-v8`, enforced in CI.
- Unit tests for: serving-scaling math, localStorage read/write layer, prompt on-topic classification logic, checkbox check/uncheck-all behavior.
- Component tests (React Testing Library) for: prompt form validation/error states, expand/collapse behavior, ingredient/step checklists, servings stepper.
- Mock the Groq API in tests — never hit the real network in the test suite.

## Environment / secrets
- `GROQ_API_KEY` must be set as a Cloudflare Workers secret (`wrangler secret put`), never committed, never exposed to the client bundle.

## Working with Beacon (learned this session)
- Project code is `TEST` ("Learning session Test project") — the only project this Beacon token currently has access to.
- Ticket `description` is sanitized rich text/HTML server-side, **not** markdown. Only these tags survive: `p, h1, h2, h3, ul, ol, li, strong, em, a, code, pre, blockquote, table, thead, tbody, tr, th, td, input[type=checkbox]`. Anything else (markdown syntax, plain unstructured text, extra tags) gets silently stripped or rejected.
- `create_ticket`/`update_ticket` enforce one of several fixed HTML templates (Bug, Bug-needing-review, Story/Task/Feature, Infra/Ops, Epic, Theme) tied to `work_type`. A non-templated description is rejected — but as observed here, the rejection error surfaced to the agent had **no template detail in it** (just a bare "Error executing tool"), even though the tool's own docs say it should include the full template text.
- The actual templates live behind an MCP **prompt** called `write_ticket_description` (and a related `write_user_story` prompt). MCP prompts are a different primitive from tools/resources — there is no agent-side tool to list or fetch them (`ListMcpResourcesTool`/`ReadMcpResourceTool` only cover resources, and they aren't registered as invocable skills either). Only the **user** can trigger them, as a slash command (`/mcp__claude_ai_beacon-production__write_ticket_description`) — the output then lands in the conversation and the agent can use it from there.
- Practical workflow when the description template is needed: ask the user to run the slash command themselves and paste the result, rather than guessing template shapes or repeatedly retrying `create_ticket`/`update_ticket` with free text.
- Don't leave placeholder content (e.g. a plain-text comment standing in for a missing description) once the real templated description is applied — go back and delete it (`delete_comment`) so the ticket doesn't carry stale scaffolding.
- `work_type="SUBTASK"` requires `parent_id`; a plain feature/overview ticket without a parent fits `work_type="STORY"` (or `TASK` if it isn't naturally an "As a ... I want ... so that ..." statement).

## Local environment notes (learned this session)
- This machine's `nvm`-installed Node shipped a `pnpm` shim (via corepack) on `PATH` ahead of any other install, and that shim was broken: corepack's shim script expected a `pnpm.cjs` binary, but the cached pnpm package only had `pnpm.mjs` (a version-format mismatch between corepack and pnpm 12.x) — `corepack enable && corepack prepare pnpm@latest --activate` did not fix it. Installed `pnpm` via Homebrew (`brew install pnpm`) as the real binary, then **permanently fixed PATH resolution by running `corepack disable pnpm`**, which removes the broken shim from the nvm Node install so plain `pnpm` resolves straight to the Homebrew install — no need to prefix `/opt/homebrew/bin/pnpm` or modify `PATH` after that.
- `gh` (GitHub CLI) also wasn't preinstalled — installed via `brew install gh`, then the user ran `gh auth login` interactively (browser-based OAuth; must be done by the user, not the agent).
- `pnpm deploy` (bare) is pnpm's own **built-in** command (for monorepo workspace deploys) and shadows a same-named script in `package.json` — it fails with `ERR_PNPM_INVALID_DEPLOY_TARGET`. Use `pnpm run deploy` to actually run our `"deploy": "pnpm run build && wrangler deploy"` script.
- Claude Code's auto-mode permission classifier blocks `wrangler deploy` (and similar "creates/updates live infrastructure" commands) even after the user says "ok" to deploying in conversation — it requires either the user running it themselves, or the user explicitly granting a Bash permission rule (e.g. via `/permissions` or their own `.claude/settings.local.json`). The agent cannot self-grant this — attempting to write a permissions file to allow it is itself blocked by the same classifier (by design, to prevent self-escalation).

## Scaffolding (done this session)
- App scaffolded with the official TanStack CLI, **not** `create-cloudflare`/C3 — C3's `--framework=tanstack-start` errored with "Unsupported framework" on this version (2.72.5) despite being listed in its own `--help`. Command used:
  ```
  pnpm dlx @tanstack/cli create <name> --framework React --deployment cloudflare --toolchain biome --add-ons shadcn,tanstack-query --package-manager pnpm --no-examples --non-interactive --no-git
  ```
  Note: `create-tsrouter-app` (the older CLI) is deprecated in favor of `@tanstack/cli create`; the deprecated one also defaults to **router-only** mode (file-based routing without Start's SSR/server functions) unless you explicitly pass `--router-only` to the *new* tool to replicate that — so for a full Start app, use `@tanstack/cli create` without `--router-only`. Verify with `routerOnly: false` in the generated `.cta.json`.
  Also do **not** pass `-y`/`--accept-defaults` together with `--framework` on C3, or with the TanStack CLI — it can silently override the framework choice back to a generic default; pass every option explicitly and use `--non-interactive` instead of `-y`.
- Manually added on top of the scaffold (not covered by the CLI's add-ons): Vitest + `@testing-library/react` + `@testing-library/jest-dom` + `@testing-library/user-event` + `@vitest/coverage-v8` + `jsdom`, with `vitest.config.ts` (90% coverage thresholds) and `src/test-setup.ts`. Use `defineConfig` from `vitest/config` (not plain `vite`) so the `test` key type-checks.
- Colocating a test file directly under `src/routes/` (e.g. `src/routes/index.test.tsx`) makes TanStack Router's file-based routing treat it as a route file and warn/skip it at build time. Fixed via `tsr.config.json`: `"routeFileIgnorePattern": "\\.test\\.(ts|tsx)$"`.
- `biome.json`'s `files.includes` is an explicit allowlist (not just excludes) — a new root config file like `vitest.config.ts` needs to be added to it explicitly or Biome silently skips formatting/linting it.
- Result: `pnpm check` (Biome), `pnpm exec tsc --noEmit`, `pnpm test` / `pnpm test:coverage`, `pnpm build`, and `pnpm dev` all verified working before committing.

## Deployment (done this session)
- Cloudflare account already authenticated (`wrangler whoami` showed a valid OAuth token — no `wrangler login` needed this time).
- `GROQ_API_KEY` set via `wrangler secret put GROQ_API_KEY`, run by the user directly in their own terminal (never pasted into the agent conversation) — verified after with `wrangler secret list`.
- First deploy done via `pnpm run deploy`. Live at **https://cookerist.jameseuangel-limpiado.workers.dev**.
- `workers_dev`/`preview_urls` are enabled by default since neither is set explicitly in `wrangler.jsonc` — revisit if a custom domain or disabling the `workers.dev` route is wanted later.

## Open items / assumptions to revisit
- Exact Groq-hosted model(s) to call (cost/latency/quality trade-off, e.g. Llama 3.3 70B Versatile vs Llama 4 Maverick for generation, Llama 3.1 8B for the on-topic check) — decide during setup once an API key is available.
- Unit system (metric vs. US customary) — MVP assumption: use whatever unit Groq naturally returns per-ingredient; no forced conversion system unless requested later.
- ~~GitHub org/repo name — to be finalized when the repository is created.~~ Done: [github.com/sAnti09/cookerist](https://github.com/sAnti09/cookerist) (public, `main` branch).
