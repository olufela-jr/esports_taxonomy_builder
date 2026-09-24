# CLAUDE.md

## What this project is
An internal marketing-operations tool for campaign naming conventions. Users author
naming conventions (Rule Sets containing Rules), build compliant campaign names from
them, and check existing names against them (CSV upload now, BigQuery scan in Stage 2).
Firebase / GCP throughout. Full reference: `docs/spec.md` (engine and v2 contract) and
`docs/spec-v3.md` (multi-tenancy, roles, shared definitions; supersedes spec.md where they
differ).

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
- Routing: Wouter. CSV: PapaParse. Tests: Vitest for the engine, Playwright for browser
  regressions (`apps/web/e2e`), `@firebase/rules-unit-testing` on the emulator for the
  Security Rules (`pnpm test:rules`, needs Java).
- State: React `useState` only. No Redux, Context, reducers, or data-fetching libraries.
- Tailwind (v4, kept from the prototype by decision), no component library. Native HTML
  elements, shared class strings in `components/styles.ts`, restrained internal-console
  styling.
- Firebase: Hosting, Auth (Google sign-in), Firestore. Project `media-taxonomy-tool`,
  Firestore in `asia-south1`. One Callable Cloud Function for BigQuery, read-only, same
  GCP project. All storage calls go through `apps/web/src/data/store.ts`, all sign-in
  calls through `apps/web/src/data/auth.ts`; an update carries the `updatedAt` it loaded
  and is refused if the document moved on.
- Tenancy (v3, D35, D36): every document lives under `tenants/{tenantId}/`. A user belongs
  to one tenant and holds one role, `admin` or `user`, carried as custom claims on the ID
  token and set only by `scripts/provision-user.ts`. The app, the Security Rules and the
  Function read the claims; nothing reads a tenant from data or a request body. Any member
  reads the tenant's Rule Sets; only an admin creates, updates or deletes, and every write
  stamps `updatedBy` with the caller's uid (D31). The runtime mode (`memory` or
  `firestore`) is decided once in `apps/web/src/data/mode.ts`; auth and the store follow it.
- Docs style: no em dashes; colons for bullet lead-ins; commas or connecting words in prose.

## Data model essentials
- A Rule Set document lives at `tenants/{tenantId}/rulesets/{id}` and stores its Rules
  inline, with `createdBy`, `updatedBy`, `createdAt` and `updatedAt`. The tenant document
  `tenants/{tenantId}` holds `name` and `config: { allowedDatasets[], platforms[] }`;
  `tenants/{tenantId}/users/{uid}` mirrors a member's role (the claims are the truth).
  `Rule = { id, key, name, tags?, delimiter, segments[], source, parent?, utm? }`. `tags`
  is optional `{ platform?, entityType? }`.
  `parent` links to another Rule in the same Rule Set and names the segments to inherit;
  `utm` maps built values to UTM parameters. Both reference segments by immutable `id`,
  never by the editable `key`.
- `Segment` is `enum` or `freeform` (`maxLength`, `illegalChars`). An enum's
  `allowedValues` is a list of `EnumEntry = { label, code }` (D39): the code is what goes
  into a name and what the checker matches, exact and case-sensitive; the label is display
  only (D40); codes and labels are each unique within a list. `entryFromCode` builds a
  label = code entry. The delimiter is ALWAYS illegal inside any code; the engine enforces
  this, authors never list it.
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

## v3 phase 1, Foundation, done (2026-09-24)
The code side of `docs/spec-v3.md` release phase 1 is in place; the log is in `v3/`, one
file per phase. Commits C1 to C7 on `main`:
- Enum entries as label/code pairs in the engine; Author still edits one comma list of codes
  with label = code until phase 2.
- `tenantId` and `role` claims in `auth.ts`, a `NoWorkspace` screen for accounts without
  them, admin-only authoring in the UI.
- Rule Sets under `tenants/{tenantId}/rulesets` with `createdBy` and `updatedBy`;
  `ownerId` is gone.
- Security Rules keyed on the claims, eight emulator cases; the legacy `/rulesets`
  collection matches nothing.
- `functions/` with the tenant guard (`tenantFromAuth`, `assertDatasetAllowed`) and a
  `scanCampaigns` that runs it and stops at `unimplemented`; built and unit tested, not
  deployed (Blaze plan and a deploy-time manifest without `workspace:*` still needed).
- `scripts/migrate-v3.ts` (backup, transform, dry run, verify, explicit `--delete-legacy`)
  and `scripts/provision-user.ts` (claims plus the users mirror).
Run live on 2026-09-24: the first tenant is `esports` ("Esports", `allowedDatasets:
["marketing"]`), the one v2 Rule Set migrated and verified, misterfela@gmail.com is its admin,
rules and hosting deployed together, the legacy `/rulesets` collection deleted after a
backup. Phase 2 (the repository: definitions,
`definitionId` segments, `checkDefinition`, platform scoping) is next; nothing of it is
started.

## Migration complete (2026-09-24)
The Replit prototype has been migrated to this codebase; the log is in `migration/`, one
file per phase. All seven checklist steps below are done, and the app is deployed at
https://media-taxonomy-tool.web.app. Stage 2 and the v2 build order come next. In place now:
- Rule Set / Rule / Segment naming throughout, with immutable `id`s and editable `key`s.
  Old local "taxonomy" data still auto-migrates in `apps/web/src/data/migrations.ts`.
- Action-first shell with persistent Rule Set and Rule context across actions, refresh,
  and sign-out and sign-in.
- Pooled "All Rules" `rollup` in the engine, with the strict per-row view secondary.
- Firestore behind `store.ts`, Google sign-in behind `auth.ts`, owner-only editing
  (superseded by v3 roles), Security Rules with an emulator test, an `updatedAt` conflict
  check on every update.
- Playwright coverage for editor typing, shared context, All Rules, the sign-in gate,
  ownership, slow saves and save conflicts.
- Stage 2 configuration (per-Rule `source`) stored and labelled, not yet scanned.

## Migration checklist (all seven steps done, kept as the record)
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

## v3 phase 2 build order (repository, hierarchy and UTMs on codes)
v2 step 1 (`resolveRule`, log in `v2/`) is done; the rest of the v2 order continues here,
re-based on label/code entries (D39, D40) and tenants. Engine contract in `docs/spec.md`;
v3 Gate G0 passed 2026-09-24, record under the decisions log in `docs/spec-v3.md`. Exports
hold codes, inputs show labels (D48). Point-in-time recovery and delete protection were
enabled on the production database on 2026-09-24 (D43). Build in this order:
1. Platform list in `@taxo/shared` (O12) and a `--platforms` flag on provisioning (D38).
2. Definitions: type, `tenants/{id}/definitions` in `store.ts` and the Security Rules,
   `checkDefinition` sharing one entry-list check with `checkRule` (O14).
3. `definitionId` enum segments; `resolveRule(rule, ruleSet, definitions)` resolving parents
   and definitions in one call (D46) with the platform guard (D47); the runtime guard on
   `compose` and `validate` (D25: error result, never a throw).
4. `checkRuleSet` per Rule and `dependentsOf` (return shape changes from a flat string list
   to issues per Rule; one caller, the Author editor).
5. Author: definitions screen with the label control (D39), definition picker on enum
   segments filtered by platform, parent UI. Code edits save with a plain warning until
   phase 4 (D44).
6. Build parent step and chaining; `parse` returns selections by code, failing on an
   invalid name (today it is a plain split).
7. UTM types, `buildTrackingUrl`, `validateUtmValue` and tests, plus the `checkRuleSet`
   UTM checks (literals, codes and delimiters under the mapping's policy).
8. Author UTM panel; Build URL output.
9. Playwright additions.
Phase 3 is batch (`enumerate`, `countCombinations`, then the D34 child batch in
`docs/features/`); phase 4 the BigQuery scan and the impact preview; phase 5 requests.

## Stage 2 (only after the checklist)
Callable Cloud Function `scanCampaigns` in `functions/`, importing `@taxo/shared`. The
tenant guard is in place (v3 phase 1): the tenant comes from the token, the Rule Set is
loaded from `tenants/{tenantId}/rulesets`, the Rule's dataset must be in the tenant's
`config.allowedDatasets`, and the Rule is resolved with `resolveRule`. Stage 2 replaces the
final `unimplemented` with the scan: read the chosen Rule's `source`, run
`SELECT DISTINCT nameColumn` with the optional filter, validate each name, return exact
counts over the FULL scan plus a capped annotated results list (~5,000 rows, `truncated`
flag). Whitelist `dataset`, `table`,
`nameColumn`, `filter.column` against `^[A-Za-z0-9_]+$`; pass `filter.in` as query
parameters, never string-concatenated. Service account: `bigquery.dataViewer` +
`bigquery.jobUser`, read-only. Bundle the Function with esbuild so `@taxo/shared` is
inlined: pnpm's symlinked `node_modules` makes this essential, do not rely on hoisting.

## Do not
- Do not duplicate engine logic outside `@taxo/shared`.
- Do not convert pnpm to npm, or add Turborepo or Nx.
- Inheritance by reference at build time is in scope; cross-level validation is not.
- Do not add server-side CSV processing.
- Do not build scheduled scanning or an exceptions list. (Legacy noise is handled by a
  Rule's `source.filter`.) Roles are done (v3 phase 1); the request queue and approvals are
  v3 phase 5, not before. No versioning and no retired codes, anywhere (D43).
- Do not let the prototype's "suggested next prompts" reopen settled decisions:
  the items above are deferred (decided).
