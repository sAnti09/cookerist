# Cookerist

## What this is

A single-page web app. A user types a prompt describing a dish (e.g. "creamy garlic butter shrimp pasta for 2"). The app sends it to Grok, which returns a structured recipe: ingredients (with measurements) and cooking steps. Every past result is kept in a list on the same page, each collapsible/expandable, and persisted only in the browser's `localStorage` — there is no backend database and no user accounts.

## Product spec

### Page layout
- Single page. Prompt textbox pinned at the top.
- Below it, a reverse-chronological list of past results, one collapsed row each (dish title + short overview).
- Clicking a row expands it in place; expanded rows can be collapsed back.

### Prompt handling
- The prompt must be validated as on-topic (a specific dish / cooking request) before calling Grok for a full recipe. Off-topic prompts (not about cooking/food) must be rejected with a friendly inline message and must **not** consume a full recipe generation call.
- Implement this as a cheap up-front check, e.g. a lightweight Grok classification call (or a single combined prompt with a strict system prompt that asks Grok to refuse/return an "off_topic" flag instead of a recipe when the request isn't about cooking a specific dish). Do not attempt to hardcode keyword filters as the primary defense — they're easy to bypass and produce false negatives; use the model, but keep the check cheap (small/fast model, short output).

### Expanded result contents
- Title of the dish
- The original user prompt
- Short overview/description of the dish
- Servings
  - Numeric, user-editable (stepper or input)
  - Changing it rescales all ingredient quantities proportionally in real time (client-side math, no re-call to Grok)
- Ingredients
  - Each has a checkbox; a "check/uncheck all" control at the top of the section
- Steps
  - Each has a checkbox to mark progress
  - Steps may be grouped into named subsections (e.g. "Prep", "Cook", "Plate") when the recipe warrants it — this grouping should be optional/flat when Grok doesn't return sections

### Persistence
- Every generated result (including checkbox/serving state) is stored in `localStorage`, keyed by an id, so it survives reloads.
- No server-side storage of results.

## Tech stack

| Concern | Choice |
|---|---|
| App framework | [TanStack Start](https://tanstack.com/start) (React, Vite + Nitro, file-based routing, server functions, SSR) |
| Data/async | TanStack Query for client state around the Grok call; TanStack Store only if plain `useState`/`useReducer` + localStorage isn't enough |
| Styling | Tailwind CSS v4 |
| Components | shadcn/ui (Radix-based, copied into the repo, fully owned/customizable) |
| AI provider | xAI Grok API (structured/JSON-mode output for the recipe schema) — called from a TanStack Start **server function**, never from the client, so the API key never reaches the browser |
| Hosting | Cloudflare Workers (via Wrangler; static assets served free/unlimited, Worker requests on the free tier) |
| Deployment | Cloudflare's MCP server / `wrangler deploy` — auto-deploy from Claude Code sessions |
| Package manager | pnpm |
| Linting/formatting | Biome (single config, replaces ESLint + Prettier) |
| Testing | Vitest + React Testing Library + `@testing-library/jest-dom` + `@testing-library/user-event`; `@vitest/coverage-v8` for coverage |
| Language | TypeScript, strict mode |
| Repository | Public GitHub repo |
| Project management | beacon.chro.media, project code `TEST` (ticket: [TEST-115](https://beacon.chro.media/browse/TEST-115) "James Limpiado - Cookerist", sub-task [TEST-116](https://beacon.chro.media/browse/TEST-116) "Setup project") |

### Why these choices (context for future sessions)
- **TanStack Start over plain TanStack Router**: we need a server function to hide the Grok API key — Start gives us that plus SSR for free while staying "just React."
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
- Ask Grok to return this shape directly (structured outputs / JSON schema mode) rather than parsing free text.

## Coding standards
- TypeScript strict mode everywhere; no `any` without a comment justifying it.
- Biome handles lint + format; run it in CI and as a pre-commit check.
- Keep components small and colocate tests next to source (`Component.tsx` + `Component.test.tsx`).
- No premature abstraction — this is a single-page app; don't build a router/multi-page structure or a generic "plugin" system for the recipe schema unless a second real use case appears.

## Testing
- Target **90%+ coverage** (statements/branches/functions/lines) via `@vitest/coverage-v8`, enforced in CI.
- Unit tests for: serving-scaling math, localStorage read/write layer, prompt on-topic classification logic, checkbox check/uncheck-all behavior.
- Component tests (React Testing Library) for: prompt form validation/error states, expand/collapse behavior, ingredient/step checklists, servings stepper.
- Mock the Grok API in tests — never hit the real network in the test suite.

## Environment / secrets
- `XAI_API_KEY` (Grok) must be set as a Cloudflare Workers secret (`wrangler secret put`), never committed, never exposed to the client bundle.

## Working with Beacon (learned this session)
- Project code is `TEST` ("Learning session Test project") — the only project this Beacon token currently has access to.
- Ticket `description` is sanitized rich text/HTML server-side, **not** markdown. Only these tags survive: `p, h1, h2, h3, ul, ol, li, strong, em, a, code, pre, blockquote, table, thead, tbody, tr, th, td, input[type=checkbox]`. Anything else (markdown syntax, plain unstructured text, extra tags) gets silently stripped or rejected.
- `create_ticket`/`update_ticket` enforce one of several fixed HTML templates (Bug, Bug-needing-review, Story/Task/Feature, Infra/Ops, Epic, Theme) tied to `work_type`. A non-templated description is rejected — but as observed here, the rejection error surfaced to the agent had **no template detail in it** (just a bare "Error executing tool"), even though the tool's own docs say it should include the full template text.
- The actual templates live behind an MCP **prompt** called `write_ticket_description` (and a related `write_user_story` prompt). MCP prompts are a different primitive from tools/resources — there is no agent-side tool to list or fetch them (`ListMcpResourcesTool`/`ReadMcpResourceTool` only cover resources, and they aren't registered as invocable skills either). Only the **user** can trigger them, as a slash command (`/mcp__claude_ai_beacon-production__write_ticket_description`) — the output then lands in the conversation and the agent can use it from there.
- Practical workflow when the description template is needed: ask the user to run the slash command themselves and paste the result, rather than guessing template shapes or repeatedly retrying `create_ticket`/`update_ticket` with free text.
- Don't leave placeholder content (e.g. a plain-text comment standing in for a missing description) once the real templated description is applied — go back and delete it (`delete_comment`) so the ticket doesn't carry stale scaffolding.
- `work_type="SUBTASK"` requires `parent_id`; a plain feature/overview ticket without a parent fits `work_type="STORY"` (or `TASK` if it isn't naturally an "As a ... I want ... so that ..." statement).

## Open items / assumptions to revisit
- Exact Grok model to call (cost/latency/quality trade-off) — decide during setup once an API key is available.
- Unit system (metric vs. US customary) — MVP assumption: use whatever unit Grok naturally returns per-ingredient; no forced conversion system unless requested later.
- GitHub org/repo name — to be finalized when the repository is created.
