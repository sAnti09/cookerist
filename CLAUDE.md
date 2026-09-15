# Cookerist

## What this is

A single-page web app. A user types a prompt describing a dish (e.g. "creamy garlic butter shrimp pasta for 2"). The app sends it to Groq (GroqCloud), which returns a structured recipe: ingredients (with measurements) and cooking steps. Every past result is kept in a list on the same page, each collapsible/expandable, and persisted only in the browser's `localStorage` — there is no backend database and no user accounts.

## Product spec

### Page layout
- Single page. Prompt textbox pinned at the top.
- Below it, a reverse-chronological list of past results, one collapsed row each (dish title + short overview).
- Clicking a row expands it in place; expanded rows can be collapsed back.

### Prompt handling
- The prompt must be validated as on-topic before calling Groq for a full recipe. On-topic accepts ANY level of specificity, from a fully specific dish name down to a completely open-ended food question, as long as it's about food/cooking/what to eat: naming a specific dish (e.g. "creamy garlic butter shrimp pasta for 2"); listing ingredients on hand and asking what to cook with them (e.g. "what can I cook with eggs, soy sauce and rice"); describing a craving/mood/goal with some anchor — a meal type, ingredient category, cuisine, dietary/health goal, or mood/occasion — but no named dish or ingredients (e.g. "delicious and nutritious vegetable dinner"); a bare one- or two-word food mention with no other anchor (e.g. "vegetable", "pasta"); or a fully open-ended request with no anchor at all (e.g. "what should I eat", "I'm hungry", "surprise me"). All of these are deliberate capabilities, not an oversight: the model invents one specific dish appropriate to whatever was given — using most/all listed ingredients plus reasonable pantry staples for the ingredients-on-hand shape, satisfying every anchor present for the craving/mood shape, or a broadly appealing dish of its choosing when the request is fully open-ended. Off-topic is reserved for requests that have nothing to do with food/cooking/eating at all (coding help, trivia, chit-chat, jailbreak/instruction-override attempts) — these must be rejected with a friendly inline message and must **not** consume a full recipe generation call.
- Implement this as a cheap up-front check, e.g. a lightweight Groq classification call (or a single combined prompt with a strict system prompt that asks the model to refuse/return an "off_topic" flag instead of a recipe when the request isn't about cooking). Do not attempt to hardcode keyword filters as the primary defense — they're easy to bypass and produce false negatives; use the model, but keep the check cheap (small/fast model, short output — e.g. `openai/gpt-oss-20b` on Groq).

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
| AI provider | Groq (GroqCloud API, OpenAI-compatible) — fast LPU inference over open models (`openai/gpt-oss-120b` for recipe generation, `openai/gpt-oss-20b` for the cheap on-topic check — see TEST-149 note below); JSON mode/structured outputs for the recipe schema — called from a TanStack Start **server function**, never from the client, so the API key never reaches the browser |
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
    text: string;        // full display name, e.g. "garlic, minced" — always present
    quantity: number;     // numeric part, scaled by servings ratio
    unit: string;         // e.g. "cloves", "g", "cups"
    checked: boolean;
    // Base name (e.g. "garlic") + description (e.g. "minced") split (TEST-255)
    // so grocery combination can key on the base name while `text` keeps the
    // full display string. Optional: absent on ingredients saved before this
    // split existed — fall back to `text` as the base name, "" as description.
    baseName?: string;
    description?: string;
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

## One-time local data migrations (`src/lib/migrations/`)
Since there's no backend (see "What this is"), a change to how data is computed/displayed doesn't retroactively apply to what's already sitting in a user's `localStorage` — a migration is needed. `run-migrations.ts` is the generic runner: each `Migration` has a permanent `id` (never reuse/rename once shipped) and a `run()` that may be sync or async (returns `MigrationRunResult | Promise<MigrationRunResult>`, where `MigrationRunResult` is `void | { retry?: boolean }`); `runMigrations` tracks completed ids in `localStorage["cookerist:completed-migrations"]` so each runs exactly once ever, per browser, persisting that incrementally (after each migration, not batched at the end) so a page closed mid-run doesn't lose credit for ones that did finish.

A migration that **throws/rejects** is still marked completed (logged, never retried) — a broken migration retrying forever is worse than a one-time data gap; this is the right default for a local, synchronous rewrite that can't meaningfully fail outside a code bug. But a migration that calls a network (Groq) can genuinely fail for reasons that have nothing to do with its own logic — confirmed in production: `categorize-recipe-ingredients` "completed" having categorized zero ingredients on a phone, almost certainly because a mobile browser suspended the in-flight fetch when the tab was backgrounded/screen-locked mid-request, and since "completed" is forever, that phone's data was stuck showing every ingredient as "Other" with no path to recovery. The fix: such a migration can explicitly **return `{ retry: true }`** instead of throwing when it made *zero* progress despite having something to do — `runMigrations` then leaves it off the completed list so it gets another attempt on the next page load. Reserve this for total failure only; a migration that got *some* real work done (e.g. some Groq batches succeeded, others didn't) still marks itself completed as before, accepting the partial gap — otherwise a persistently-failing subset would retry every single load forever, and a genuine code-bug migration would never stop retrying either.

Called from `routes/index.tsx`'s mount effect as `runMigrations(MIGRATIONS).catch(...)`, deliberately **not awaited** — a synchronous migration's localStorage writes still land before the immediately-following `loadRecipes()`/`loadGroceryLists()` calls (its whole body runs before `runMigrations`'s first `await` yields control back to an unawaited caller), but a genuinely async migration (one that calls Groq, via a server function — never `getGroqClient()` directly from a migration) doesn't block the initial render; its result only shows up on the next reload, not live in an already-open tab.

`MIGRATIONS` in `index.ts` is the ordered registry — order matters when one migration's correctness depends on another having already run (e.g. `reaggregate-grocery-lists` must run after `categorize-recipe-ingredients` so it re-aggregates against already-corrected recipes).

Shipped so far: `metric-grocery-units` (converts existing grocery-list items to the always-metric display rule), `categorize-recipe-ingredients` (batches every saved ingredient to Groq once for a category tag + baseName/description correction + approxGramsPerUnit), `reaggregate-grocery-lists` (re-runs `aggregateGroceryItems` + `carryOverCheckedState` for every existing list so it picks up a recipe correction without a manual edit-and-resave). Note `categorize-recipe-ingredients.ts` and `reaggregate-grocery-lists.ts` each export **more than one id for the same underlying function** — every time a later fix changes what that function computes (the non-liquid-volume fix, the approxGramsPerUnit backfill, the liquid-vs-density priority fix, then the liquid-hybrid mass/volume merge — 5 reaggregate ids total as of this writing), a browser that already ran an earlier id needs a *new* id to actually re-run it; the function itself doesn't change behavior based on which id triggered it. Follow this same pattern for the next fix that changes categorization/aggregation output, rather than just editing an existing id's behavior in place.

## Grocery list aggregation logic (TEST-237, extended this session)

Ingredients from multiple recipes merge into one grocery-list line by **base name** (normalized, case/whitespace-insensitive, size adjective stripped) plus a **bucket** determined by unit. Implemented across `src/lib/aggregate-grocery-items.ts`, `src/lib/unit-conversion.ts`, `src/lib/ingredient-density.ts`, `src/lib/ingredient-length-density.ts`, `src/lib/ingredient-piece-ratio.ts`, and `src/lib/size-descriptor.ts`.

### Bucket resolution (checked in this order, per ingredient occurrence)
1. **Piece-ratio sub-piece** (e.g. "clove" for garlic) — if the ingredient has a known container↔piece ratio (`ingredient-piece-ratio.ts`), converts to container-equivalents via that ratio. The one case that's an *estimate* — flags the merged item `approximate: true`.
2. **Piece-ratio container** (e.g. "bulb"/"bunch"/"loaf") — already container-equivalent, exact, no ratio math.
3. **Mass** (g/kg/mg/oz/lb) — for a plain (non-liquid) ingredient, joins the mass bucket, converted to grams, exact. For a **recognized liquid with a known density** (`liquid-ingredients.ts`), joins a shared **"liquid"** bucket instead (see #4) — tracked as a separate `nativeMassGrams` running total, not combined with any volume occurrence until finalization decides which wins.
4. **Volume** (cup/tbsp/ml/l/...) — for a non-liquid ingredient with a known density, converts to grams via that density and **always** joins the mass bucket (approximate), unconditionally — most dry staples are actually bought by weight, not by the cup (e.g. "2 cups flour" + "500 g flour" merge into one weight). No density entry → joins the plain volume bucket instead (ml), exact. For a **recognized liquid with a known density**, joins the same shared **"liquid"** bucket as #3 (tracked as `nativeVolumeMl`, separate from any mass occurrence) instead of committing to mass or volume per-occurrence; a liquid with no density entry at all just stays in the plain volume bucket, exact (nothing to bridge with either way).

   **The "liquid" bucket's finalization** (once every occurrence of that ingredient has been seen): if a real mass occurrence exists (`nativeMassGrams > 0`), mass wins — any volume total bridges into it via density, flagged approximate only if that bridging was actually needed; otherwise the group displays in metric volume, exact, and density is never even consulted. Concretely: "100 g" + "200 g" spaghetti sauce → exact 300 g (density never touched, mass was already the only unit used); "1 cup" + "100 ml" milk → exact 400 ml (both volume, no density needed); "50 g" + "100 ml" milk → ≈153.25 g (mass wins since it's present, ml bridged in, flagged approximate). This mirrors the existing "mass always wins for a solid" rule above, but only actually bridges when real mass data exists to justify it — the earlier, simpler "liquid always forces volume unconditionally" design showed "2 cups chicken broth" alone as "≈480 g" from a stale density entry, which is what motivated this refinement.
5. **Generic count word** (dozen/piece/egg/whole/ear/head/loaf/...) — if Groq gave a per-piece weight estimate (`Ingredient.approxGramsPerUnit`, only ever set for a unitless produce-style item — see prompt-rules.ts's `APPROX_WEIGHT_RULE`), converts to grams via that estimate and **also joins the mass bucket** (approximate) — the count-dimension analog of the volume→mass density bridge above (e.g. "1 onion" + "200 g onion" merge into one weight). No estimate (the common case — Groq is told to return `null` for a genuinely count-native item like eggs or a dozen of something) → exact multiplier into the count bucket instead (`unit-conversion.ts`'s `"count"` dimension: dozen=12, half dozen=6, everything else=1). `""` (unitless — Groq's own convention for "no unit") is itself a count-dimension alias for a single discrete item, same as "whole"/"piece", so e.g. `unit: "whole"` and `unit: ""` for the same ingredient still merge.
6. **Unrecognized unit** — no bucket; falls back to merging on the literal unit string, canonicalized by folding a simple trailing-"s" plural first (`canonicalizeUnitForMerging` in `aggregate-grocery-items.ts`) so e.g. "can"/"cans" or "slice"/"slices" of the same ingredient still merge. Not a full pluralization rule (an "-es" plural like "box"/"boxes" won't fold) — see Known limitations.

A leading/trailing size adjective (e.g. "medium onion") or a size word Groq put directly in `unit` (e.g. `unit: "large"`) is stripped/treated as unitless before any of the above, so it doesn't block a merge on its own — see `size-descriptor.ts`. Per-ingredient prep detail (`description`, e.g. "chopped"/"minced") never affects the merge key and is never shown on the grocery list at all (deliberately removed — it describes how an ingredient is used in a recipe, not what to buy).

### Display unit per bucket
- **Mass**: always metric, picked by magnitude (mg/g/kg) — never a native non-metric unit like "lb"/"oz", even when that's the only unit any contributing recipe used (e.g. "1 lb shrimp" displays as "453.75 g", not "1 lb"). A grocery list merges ingredients from many recipes at once, so one consistent unit system reads better than echoing back whichever unit happened to be used first — this superseded an earlier "prefer whatever native unit was used" rule.
- **Volume**: same reasoning as mass — always metric, picked by magnitude (ml/l), never a native unit like "cup"/"tbsp" — but *only* for a **non-liquid** ingredient with no density entry, or a recognized liquid (`liquid-ingredients.ts`: water, milk, broth, oil, wine, vinegar, juice, cream, syrup, extract, sauce, etc. — matched on the last word; a "dry"/"dried"/"powder"/"powdered" modifier anywhere excludes it, so "dry milk"/"powdered milk" are never mistaken for the liquid) whose "liquid" bucket finalization decided volume wins (see Bucket resolution #4) — which is the common case (no competing mass occurrence for that ingredient), but not guaranteed: a liquid *with* a real mass occurrence elsewhere displays in mass instead, with the volume total bridged in via density. A volume-measured ingredient that isn't a recognized liquid and has no density entry either (e.g. "1 cup chopped carrots") falls back to its native unit instead (see Length/unrecognized below) — forcing that to ml/l would be actively misleading, since nobody buys carrots by the milliliter (bug found in production: showed as "300 ml carrots", "100 ml black pepper corns", then later "≈480 g chicken broth" from an unconditional density bridge, which is what motivated the "liquid" bucket's mass-only-when-present rule). Note a pure-volume liquid can still round up to at least 100 ml for a small quantity (e.g. 1 tsp + 1 tbsp), same trade-off mass already had for small mg amounts.
- **Length / unrecognized / non-liquid volume**: largest actually-used unit (in + cm → in) — unaffected by the mass/volume metric-only change above.
- **Count, with a piece-ratio entry**: *always* the container unit (bulb/bunch/loaf), rounded up — that's what's actually purchasable, regardless of which units the recipes used. (Deliberately kept as-is — considered dropping the container word for garlic specifically since it's only ever sold as a whole bulb, but garlic can also be bought/specified by weight, and the container word is what disambiguates "1 garlic" from a clove-sized reading given recipes almost always measure it in cloves.)
- **Count, no piece-ratio entry**: *always* the individual-item count ("18 eggs", never "2 dozen" — rolling up would overstate what's needed), displayed bare/unitless when possible (e.g. "2 onion", not "2 whole onion") rather than echoing back whichever alias unit happened to be used first. A group built entirely from a scaled multiplier like "dozen" (no toBase-1 unit contributed at all) also falls back to bare display, not a hardcoded "piece" label that was never actually used.

### Rounding (always up, never down — under-buying is worse than over-buying)
- mg/ml → next multiple of 100.
- Countable units (`COUNTABLE_UNITS` in `aggregate-grocery-items.ts`) → next whole number.
- Everything else → next multiple of 0.25.

### Density table (`ingredient-density.ts`)
135 ingredients, g/mL, sourced from USDA FoodData Central's SR Legacy dataset (`food_portion.csv`, release 2018-04) — `density = gram_weight / (amount × mL_per_unit)`, with a handful of manual corrections where a raw SR Legacy portion doesn't represent what a recipe means by the ingredient (e.g. "cottage cheese" has no SR Legacy cup portion at all, so its value is a widely-cited nutrition-label figure instead; "heavy cream"/"whipping cream"'s only SR Legacy cup portion is the post-whip, aerated volume). Matched to an ingredient's `baseName` via decreasing-length word-suffix lookup (checks the last 3, then 2, then 1 words), so a specific product (e.g. "brown sugar") is checked before its generic fallback ("sugar") — this also means a word that's only a *modifier*, not the head noun, never misfires (e.g. "sugar snap peas" doesn't match "sugar", since the head noun "peas" is what gets checked). No entry → no cross-dimension merging for that ingredient; guessing wrong is worse than not merging. **Includes genuine liquids too** (milk, oil, broth/stock, cream, vinegar, sauces, ...) — a density entry existing here does *not* mean that ingredient always displays in mass, though: see Bucket resolution #4's "liquid" bucket, which only consults this table to bridge a liquid's volume occurrence into mass when a real mass occurrence of the same ingredient also exists to justify it (e.g. "50 g milk" + "100 ml milk"); "1 cup milk" alone never touches this table at all. (An earlier, simpler design tried excluding liquids from this table entirely so they'd *always* show in ml/l — that overcorrected and broke "100 g" + "200 g" spaghetti sauce style cases where mass was already the only unit in play; the current "liquid" bucket is the resulting compromise.) A "dry"/"powder"/"powdered" form of a liquid word (e.g. "milk powder", "dry milk") is not treated as the liquid at all — it's a genuinely dry, weighable product, and `liquid-ingredients.ts`'s own dry/powder guard keeps it from ever being misclassified as one.

### Piece-ratio table (`ingredient-piece-ratio.ts`)
Approximate pieces-per-container for ingredients commonly sold in bulk: garlic (10 cloves/bulb), celery (9 stalks/bunch), green onion & scallion (6 stalks/bunch), bread (20 slices/loaf). General culinary-knowledge estimates, not from a dataset — extend as new common cases come up.

### The `approximate` flag
Set on a `GroceryListItem` whenever its quantity involved a density or piece-ratio estimate (never for an exact merge, even across differently-spelled units of the same dimension). `formatGroceryItemLine` prefixes the line with "≈"; `GroceryListDetail` shows an explanatory caption when any item in the list is approximate.

### Merge suggestions (`suggest-grocery-merges.ts`, `merge-grocery-items.ts`)
A lightweight client-side (no Groq call) mitigation for the baseName-inconsistency limitation below: `suggestGroceryMerges` scans a list's items for a pair whose text differs only by a leading/trailing word (e.g. "onion" vs. "yellow onion") and whose quantities are actually combinable (`mergeGroceryListItems` reuses the same metric/piece-ratio/count display rules as a fresh aggregation), then `GroceryListDetail` shows one dismissible "might be the same item — merge?" banner at a time. Confirming replaces both items with one combined item (origins concatenated, checked only if both halves were); dismissing is remembered only for as long as the list stays expanded, not persisted. Deliberately conservative in scope: same-`source` pairs only (no recipe↔custom merges), and a word-overlap heuristic has no notion of synonyms (won't catch "chicken broth" vs. "chicken stock") or of the app's own cut/form distinctions (will suggest "chicken" vs. "chicken breast" even though `prompt-rules.ts`'s baseName rule treats those as deliberately different products) — acceptable since a wrong suggestion is just a dismiss, never a silent merge.

### Known limitations / gaps to address later
- **Cross-dimension merging needs a table entry.** Mass ↔ volume needs a `ingredient-density.ts` entry; length ↔ mass needs `ingredient-length-density.ts`. An ingredient with no entry (most of them) merges only within its own dimension (e.g. "2 cups quinoa" + "500 g quinoa" stay separate) — no entry beats a wrong guess.
- **Piece-ratio ingredients (garlic/celery/scallion/bread) never bridge to mass either**, and there's no table for it at all — "3 cloves garlic" + "50 g garlic" show as two separate grocery-list lines (`"≈1 bulb garlic"` and `"50 g garlic"`), not one. Would need a per-ingredient "grams per clove/stalk/slice" table, analogous to the density table but for the count dimension.
- **Custom grocery-list ingredients never merge** — with recipe-derived items or with each other. Adding "2 eggs" as a custom ingredient twice produces two separate "2 eggs" lines instead of one "4 eggs" line, and a custom "onion" never combines with a recipe's "onion". `customIngredients`/`customItems` in `aggregate-grocery-items.ts` bypass the whole baseName/bucket pipeline entirely — would need folding them into the same keying logic (or at minimum de-duping identical text+unit customs).
- **Size-word and piece-ratio unit lists are fixed whitelists.** `SIZE_WORDS` (`size-descriptor.ts`) only recognizes a specific list (small/medium/large/jumbo/extra-large/extra-small) and each `ingredient-piece-ratio.ts` entry's `pieceUnits`/`containerUnits` are hand-enumerated (e.g. garlic only recognizes "clove"/"cloves", not a synonym like "wedge"/"segment") — an unlisted synonym silently fails to strip/convert, with nothing surfaced to the user that it happened. Same trade-off as the density table (no entry beats a wrong guess), but worth revisiting if a real miss shows up.
- **Arbitrary LLM baseName inconsistency is only partially mitigated.** A leading/trailing size adjective is stripped client-side regardless of whether Groq puts it in `baseName` or `unit` (`stripSizeDescriptor`/`isSizeWordUnit`); a one-time migration (`categorize-recipe-ingredients.ts`) asks Groq to re-check/correct every saved ingredient's baseName against the rule; and merge suggestions (above) catch a same-list leading/trailing-word mismatch a user can confirm. None of these catch a synonym rewording (e.g. "chicken broth" vs. "chicken stock") — that would need fuzzy/synonym matching or a smarter prompt constraint, neither planned yet.

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
- ~~Exact Groq-hosted model(s) to call~~ Done (TEST-149): the Llama 3.x models originally planned (`llama-3.3-70b-versatile`, `llama-3.1-8b-instant`) are no longer available on this Groq account's model catalog as of implementation time (`GET /openai/v1/models` no longer lists any `llama-*` text model — Groq's hosted lineup had moved on to `openai/gpt-oss-*`, `qwen/*`, `groq/compound*`, etc.). Verified against this account: `openai/gpt-oss-120b` for recipe generation, `openai/gpt-oss-20b` for the on-topic check — both support `response_format: {type: "json_object"}` as long as the system prompt contains the literal word "json" somewhere (Groq's API rejects JSON mode otherwise). If the catalog changes again, re-check with `GET https://api.groq.com/openai/v1/models` before assuming a model name still exists.
- ~~Unit system (metric vs. US customary) — MVP assumption: use whatever unit Groq naturally returns per-ingredient; no forced conversion system unless requested later.~~ Partially revisited (TEST-237 extension): grocery-list aggregation now merges compatible units and, for known ingredients, bridges across mass/volume/count dimensions — see "Grocery list aggregation logic" above. Each individual recipe's own ingredient list is still displayed exactly as Groq returned it, unconverted.
- ~~GitHub org/repo name — to be finalized when the repository is created.~~ Done: [github.com/sAnti09/cookerist](https://github.com/sAnti09/cookerist) (public, `main` branch).

## Future features (not yet built — scoped 2026-09-10)
- **Modify a saved recipe via prompt.** User types a follow-up prompt against an already-generated recipe (e.g. "make it spicier", "swap shrimp for chicken"); Groq returns a full revised recipe (reuse `recipeResponseSchema` rather than asking the model for a diff format); a client-side diff util compares old vs. new ingredients/steps and renders an added/removed/changed preview in `recipe-detail.tsx` with Approve / Discard / "refine again" (refining should re-prompt against the still-pending draft, not re-diff from the original, so edits compound until approved). Closest precedent in this repo: the TEST-243 `continueRecipe` flow (Groq call + schema + server fn + storage — ~930 changed lines). This one is larger due to the diff UI and multi-round refine loop — expect roughly 2 sessions (backend/schema/basic replace-and-approve, then diff UI + refine-loop polish). Note: each modification call is a full `openai/gpt-oss-120b` generation, same cost as a fresh search, not the cheap classifier — relevant to the rate-limit item below.
- **Rate-limit AI usage (search + the modify-recipe flow above) to N requests/hour**, enforced client-side via localStorage since there's no backend/accounts to anchor state to. Important caveat: this can only ever be *tamper-evident with fail-closed behavior* (checksum the `{windowStart, count}` record, e.g. via a keyed Web Crypto hash, and block until the next hour boundary on mismatch) — it cannot be made actually tamper-proof, since a user with devtools can always inspect/edit/wholesale-clear localStorage (clearing it looks identical to a fresh install, and there's nothing to detect that against). Also out of scope to solve: system-clock rollback to dodge the window, and multi-tab increment races. Roughly one session; most of the time is fake-timer test-writing for hour rollover and tamper injection, not the logic itself.
