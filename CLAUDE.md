# CLAUDE.md

## What this project is
An internal marketing-operations tool for campaign naming conventions. Users author
naming conventions (Rule Sets containing Rules), build compliant campaign names from
them, and check existing names against them (CSV upload now, BigQuery scan in Stage 2).
Firebase / GCP throughout. Full reference: `docs/spec.md`.

## The one rule that must never break
All naming logic lives in ONE package: `@taxo/shared` (`packages/shared`). It exports
`compose()` and `validate()`. Round-trip guarantee: any name `compose` produces MUST pass
`validate` for the same Rule. `compose` and `validate` take resolved Rules only; call
`resolveRule` first. UTM logic lives in `@taxo/shared` too. Never reimplement or duplicate
engine logic in `apps/web` or `functions`. The Vitest suite in `packages/shared` proves the
round-trip and every violation type; keep it green after every change.

## Canonical terminology (use everywhere: types, UI, storage keys)
- **Rule Set**: the parent container. (The Replit prototype called this "Taxonomy".)
- **Rule**: one complete naming convention inside a Rule Set, aimed at one target the
  author chooses, e.g. "Google Campaigns", "Meta Ad Sets", "TikTok Creatives".
  (The prototype called this "Level".)
- **Segment**: an ordered component of a Rule's name. Unchanged.
- A Rule may inherit leading segments from a parent Rule in the same Rule Set, by reference,
  at build time. Cross-level validation is out of scope.
- Note: a "Rule" here is a whole convention, not a single constraint. Do not confuse it
  with Firestore Security Rules or with individual segment checks.

## Stack and conventions
- React + Vite + TypeScript. Use TypeScript plainly: real types on the data model, no
  advanced generics, conditional, or mapped types.
- pnpm workspaces monorepo. This is deliberate (kept from the prototype). Do NOT convert
  to npm workspaces. Do not add Turborepo or Nx.
- `packages/shared` = `@taxo/shared` engine. `apps/web` = React app. `functions/` =
  Cloud Functions (Stage 2 only).
- Routing: Wouter. CSV: PapaParse. Tests: Vitest.
- State: React `useState` only. No Redux, Context, reducers, or data-fetching libraries.
- No CSS framework, no component library. Native HTML elements, one small stylesheet,
  restrained internal-console styling.
- Firebase: Hosting, Auth, Firestore. One Callable Cloud Function for BigQuery,
  read-only, same GCP project.
- Docs style: no em dashes; colons for bullet lead-ins; commas or connecting words in prose.

## Data model essentials
- A Rule Set document stores its Rules inline. `Rule = { id, key, name, tags?, delimiter,
  segments[], source, parent?, utm? }`. `tags` is optional `{ platform?, entityType? }`.
  `parent` links to another Rule in the same Rule Set and names the segments to inherit;
  `utm` maps built values to UTM parameters. Both reference segments by immutable `id`,
  never by the editable `key`.
- `Segment` is `enum` (`allowedValues`, exact and case-sensitive match) or `freeform`
  (`maxLength`, `illegalChars`). The delimiter is ALWAYS illegal inside any value; the
  engine enforces this, authors never list it.
- Array order is the segment position. Do NOT store a position index (it drifts).
  An immutable `id` on Rules and Segments for React identity is fine and separate from
  the editable `key` slug.
- Optional segments may only appear at the end. Parse positionally.
- `source = { dataset, table, nameColumn, filter? }` per Rule. Stage 1 stores it only.

## UI rule: action-first with persistent context
Top navigation is the three actions: Author, Build, Check. The selected Rule Set and Rule
are persistent context carried across all three. Switching action must NOT reset them.
(Implemented in the prototype, including restore across refresh. Preserve it through
migration; the browser regression test in checklist step 3 guards it.)

## Already done in the Replit prototype (do not redo)
- Renamed throughout to Rule Set / Rule / Segment: types, labels, routes (`/author`,
  `/build`, `/check`), storage keys, tests. Old local "taxonomy" data auto-migrates.
- Action-first shell with persistent Rule Set and Rule context, restored across actions
  and browser refresh.
- Optional `tags` (Platform, Entity type) on Rules.
- Check screen: disabled "Live scan (Stage 2)" placeholder and an "All Rules" mode
  (see step 1: its semantics need reconciling).
- Source mapping fields present and labelled as Stage 2 configuration.

## Migration checklist (do in this order on arrival)
1. Reconcile "All Rules" semantics. The prototype computes combined compliance as
   rows that pass EVERY Rule, each Rule reading its own mapped CSV column (a per-row
   conjunction). Make the PRIMARY Rule-Set-wide figure a POOLED rollup instead: run each
   Rule over its own names and report total valid / total scanned across Rules.
   Implement this as a single `rollup(perRuleResults)` function in `@taxo/shared`, with
   a unit test on a tiny known dataset (for example Rule A 1 valid + 1 invalid, Rule B
   2 valid + 1 invalid, pooled = 3/5). The CSV checker uses it now; the Stage 2 BigQuery
   scan MUST use the same function, so the two can never report different numbers under
   the same "All Rules" label. Keep the per-row "passes every Rule" number only as a
   clearly labelled secondary strict view for wide CSVs.
2. Add an immutable `id` to Rules and Segments for React keys; keep the editable `key`.
   Do not add a position index.
3. Add browser regression tests (Playwright or similar) for: continuous typing in every
   editor field (no focus loss, trailing comma preserved) and shared-context persistence
   across Author, Build, Check, and refresh. These were real recurring bugs.
4. Replace localStorage with Firestore via the Firebase Web SDK. Config from environment
   variables. Keep ALL storage calls behind one module (`apps/web/src/data/store.ts`).
   Keep an in-memory fallback when no Firebase config is present.
5. Add Firebase Auth. Authenticated users read all Rule Sets; create and update only
   where `ownerId == request.auth.uid`. Write matching Firestore Security Rules.
6. Strip Replit-specific files, config, and environment assumptions.
7. Confirm `pnpm -r test`, the browser regression tests, and the full TypeScript check
   all pass. Then proceed to Stage 2.

## v2 build order (after the checklist, before Stage 2)
The v2 work is browser-only and depends on Firestore and the `id` fields from checklist
steps 2 and 4. Full contract in `docs/spec.md`. Build in this order:
1. Engine types and `resolveRule` with tests.
2. Runtime guard: `compose` and `validate` reject a Rule with `parent` set.
3. `checkRuleSet` extensions and `dependentsOf`.
4. Author parent UI.
5. Build parent step and chaining.
6. UTM types, `buildTrackingUrl` and tests.
7. Author UTM panel.
8. Build URL output.
9. Playwright additions.
Batch build (`enumerate`, `countCombinations`) follows as its own release once P12 is
answered. Stage 2 then follows as specified, with the `resolveRule` change.

## Stage 2 (only after the checklist)
Callable Cloud Function `scanCampaigns` in `functions/`, importing `@taxo/shared`:
reads the chosen Rule's `source`, runs `SELECT DISTINCT nameColumn` with the optional
filter, validates each name, returns exact counts over the FULL scan plus a capped
annotated results list (~5,000 rows, `truncated` flag). Whitelist `dataset`, `table`,
`nameColumn`, `filter.column` against `^[A-Za-z0-9_]+$`; pass `filter.in` as query
parameters, never string-concatenated. Service account: `bigquery.dataViewer` +
`bigquery.jobUser`, read-only. Bundle the Function with esbuild so `@taxo/shared` is
inlined: pnpm's symlinked `node_modules` makes this essential, do not rely on hoisting.

## Do not
- Do not duplicate engine logic outside `@taxo/shared`.
- Do not convert pnpm to npm, or add Turborepo or Nx.
- Inheritance by reference at build time is in scope; cross-level validation is not.
- Do not add server-side CSV processing.
- Do not build scheduled scanning, roles, versioning, approval workflows, or an
  exceptions list in this phase. (Legacy noise is handled by a Rule's `source.filter`.)
- Do not let the prototype's "suggested next prompts" reopen settled decisions:
  the items above are deferred (decided).
