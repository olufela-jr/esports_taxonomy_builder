# Migration plan (approved 2026-09-07)

Approved at plan review. Phase notes live alongside this file: one `phase-N.md` per completed phase. See `README.md` in this folder for the index.


## Context

The repo is a Replit-generated pnpm monorepo for the Campaign Naming Rule Set Tool. The read-only audit (delivered in chat, confirmed by the user) found:

- The toolchain cannot run on this Mac: pnpm is not installed, `pnpm-workspace.yaml` strips every darwin native binary (esbuild, rollup, lightningcss, Tailwind oxide), and the vite configs throw without `PORT` and `BASE_PATH`.
- Of the five "Already done in the Replit prototype" claims, three are done (shell with persistent context, Check placeholders and All Rules, source mapping) and two are partial (rename residue in package, directory, file, and `index.html` names; tags exist as flat `platform` / `entityType` fields rather than a `tags` object).
- Engine logic is duplicated in `Author.tsx` (rule validation) and the delimiter is hand-injected into `illegalChars` in four places, against CLAUDE.md's one non-negotiable rule.
- The prototype uses two React Contexts, react-query, Tailwind, and a 56-file shadcn set of which two components are used. Around 50 dependencies are unused.
- Dead Replit scaffolding: Express api-server, Postgres/Drizzle `lib/db`, Orval api-spec and generated clients, a design-canvas `mockup-sandbox`, `screenshots/`, `attached_assets/`, `replit.md`, three `.replit-artifact/` folders, committed `dist/` output, and no `.gitignore`. Git has zero commits.
- Spec-only gaps: segment reordering is missing, enum values are force-lowercased on input (breaks case-sensitive matching), the engine `RuleSet` lacks `id`, per-tag compliance grouping is not implemented, `spec.md` sits at the root instead of `docs/spec.md`.

Decisions made by the user at plan time:

- Keep Tailwind for this migration; delete the unused shadcn components and dependencies only.
- Move to the spec layout (`packages/shared`, `apps/web`) first, before checklist step 1.
- Move `spec.md` to `docs/spec.md`.
- Segment reordering and per-tag rollups are in scope.

Decisions made by me from CLAUDE.md and the spec (push back at review if wrong):

- Drop both React Contexts and react-query in favour of `useState` in `App.tsx` with props (spec: "State: useState only"). Done in Phase 4 where the data layer is rewritten anyway.
- Replace the `'all_rules'` Rule-dropdown sentinel with a Single Rule / All Rules toggle inside Check, so the shell's Rule dropdown only ever holds real Rules.
- Firebase Auth uses Google sign-in (internal team, same GCP project).
- One commit per phase, on `main`, after each phase's checks pass. The first commit is the untouched prototype as a baseline so every later diff is reviewable.

Order deviates from CLAUDE.md's numbering only in that a minimal step 6 (toolchain, layout, strip) happens first; nothing in steps 1 to 5 can be verified otherwise.

Adjustments from plan review (approved 2026-09-07):

1. Push the baseline commit to `origin` before Phase 0 deletes anything.
2. Keep `minimumReleaseAge: 1440` in `pnpm-workspace.yaml`.
3. Phase 4 splits into 4a (store module and Firestore swap, Contexts intact) and 4b (state to `useState` and props, screen renames) so a failure can be bisected. The overlap is only `use-rulesets.tsx`, which 4a rewires to the store and 4b deletes; that is cheap, so the split stands.
4. The memory store hydrates from and persists to localStorage in dev so local work survives refresh; Playwright clears it in `beforeEach`.
5. Google sign-in assumes every user has a Google account. If that is not guaranteed, add email/password as a second provider in Phase 5 at the same time.

---

## Phase 0: baseline, toolchain, layout, strip Replit (minimal step 6)

1. **Baseline commit.** Add `.gitignore` (`node_modules`, `dist`, `*.tsbuildinfo`, `.env*` except `.env.example`, `.firebase`, `playwright-report`, `test-results`, `.DS_Store`). Commit the prototype as-is, minus ignored files.
2. **Install pnpm.** `corepack enable && corepack prepare pnpm@10 --activate` (fall back to `npm i -g pnpm`). Add `"packageManager": "pnpm@10.x"` to root `package.json`.
3. **Layout move** (`git mv`):
   - `lib/taxo-shared` to `packages/shared`; rename `src/taxonomy.ts` to `src/engine.ts` and `taxonomy.test.ts` to `engine.test.ts`; `index.ts` keeps the re-export.
   - `artifacts/campaign-taxonomy-tool` to `apps/web`; package name `@taxo/web`; rename `src/pages/` files to the spec's component names later in Phase 4 (not now, to keep this diff mechanical).
   - `spec.md` to `docs/spec.md`.
4. **Delete**: `artifacts/api-server`, `artifacts/mockup-sandbox`, `lib/db`, `lib/api-spec`, `lib/api-client-react`, `lib/api-zod`, `scripts/`, `screenshots/`, `attached_assets/`, `replit.md`, every `.replit-artifact/`, every `dist/` and `.tsbuildinfo`.
5. **Workspace config**:
   - `pnpm-workspace.yaml`: packages `packages/*`, `apps/*`, `functions`. Remove the platform-exclusion `overrides`, all `@replit` entries, the `expo` comments, `stripe-replit-sync`, and the `catalog` (pin versions directly in the two package.json files; fewer moving parts for the team). Keep `onlyBuiltDependencies: [esbuild]`. Drop `minimumReleaseAge` (note in README that it can be re-added).
   - Root `package.json`: remove `@replit/connectors-sdk` and the `preinstall` script. Scripts: `dev` (`pnpm --filter @taxo/web dev`), `test` (`pnpm -r test`), `typecheck` (`tsc --build && pnpm -r --if-present typecheck`), `build`.
   - Root `tsconfig.json` references: `packages/shared`, `apps/web`. `tsconfig.base.json`: switch to `"strict": true` and drop the individual flags (spec: "strict but plain").
6. **apps/web prune**:
   - Dependencies kept: `react`, `react-dom`, `wouter`, `papaparse`, `lucide-react` (used on every screen; justified in README), `@taxo/shared`. Dev: `vite`, `@vitejs/plugin-react`, `tailwindcss`, `@tailwindcss/vite`, `typescript`, `@types/react`, `@types/react-dom`, `@types/papaparse`, `@types/node`. Everything else removed.
   - Delete `src/components/ui/`, `src/hooks/use-toast.ts`, `src/hooks/use-mobile.tsx`, `src/lib/utils.ts`. Rewrite `pages/not-found.tsx` without `Card`. Remove `QueryClientProvider`, `TooltipProvider`, and `Toaster` from `App.tsx`. Keep `components/error-boundary.tsx` (plain React).
   - `src/index.css`: remove the `tw-animate-css` import and the `@tailwindcss/typography` plugin line; grep the four screens for `animate-` and `prose` first and keep the import only if a hit exists.
   - `vite.config.ts`: remove the three `@replit` plugins, the `REPL_ID` block, and the `@assets` alias. `port: Number(process.env.PORT ?? 5173)`, `base: process.env.BASE_PATH ?? '/'`. Drop `host: 0.0.0.0`, `allowedHosts`, `strictPort`.
   - `index.html`: title "Campaign Naming Rule Set Tool", plain description, remove Replit and og/twitter meta. Sidebar brand mark "CT" in `AppShell.tsx:10` becomes "RS".
7. **Verify and commit**: `pnpm install`, `pnpm test`, `pnpm typecheck`, `pnpm dev` boots and the three screens render with seed data. Commit "Phase 0: layout, toolchain, strip Replit".

## Phase 1: All Rules rollup (checklist step 1, plus per-tag rollups)

Files: `packages/shared/src/engine.ts`, `engine.test.ts`, `apps/web/src/pages/Check.tsx`, `AppShell.tsx`, `UiContext.tsx`.

1. **Engine**: add plain types and one function.
   ```ts
   type RuleScan = { ruleId: string; ruleKey: string; ruleName: string; tags?: Tags; scanned: number; valid: number };
   type Counts = { scanned: number; valid: number; invalid: number; percent: number };
   type Rollup = { total: Counts; perRule: (RuleScan & Counts)[]; byPlatform: Record<string, Counts>; byEntityType: Record<string, Counts> };
   function rollup(scans: RuleScan[]): Rollup
   ```
   Pooled: `total.valid = sum(valid)`, `total.scanned = sum(scanned)`, `percent = Math.round(valid / scanned * 100)` (0 when scanned is 0). Grouping keys fall back to `"untagged"`.
   Test: Rule A 1 valid of 2, Rule B 2 valid of 3, pooled 3/5 = 60%; plus a by-platform case.
2. **Check screen**: replace the `'all_rules'` shell sentinel with a `mode: 'single' | 'all'` toggle at the top of Check, persisted with the rest of UI state. Remove `individualRuleId` and the `all_rules` branches from `UiContext.tsx` and `AppShell.tsx:37-41,95`.
   - All mode: for each Rule, read its `source.nameColumn` from the CSV; rows whose column is missing count as `scanned: 0` for that Rule and are flagged. Feed `rollup()`. Primary figure: pooled percent and "X of Y names valid across N Rules". Per-Rule cards from `perRule`. Per-tag cards from `byPlatform` / `byEntityType` when any Rule has tags. Secondary, clearly labelled "Strict: rows passing every Rule", keep the existing per-row conjunction table. Show `suggestion` in that table as single mode already does.
   - Export: add the pooled summary rows above the existing per-row CSV.
3. Verify: `pnpm test`, `pnpm typecheck`, manual All Rules run on the seed data. Commit.

## Phase 2: immutable ids, spec data model, engine single-source (step 2, plus segment reorder)

Files: `packages/shared/src/engine.ts`, `engine.test.ts`, `apps/web/src/hooks/use-rulesets.tsx`, `pages/Author.tsx`, `pages/Build.tsx`, `pages/Check.tsx`.

1. **Types to spec shape**: `Rule = { id, key, name, tags?, delimiter, segments, source }` (`label` becomes `name` on Rule only; Segment keeps `label`), `Segment` gains `id`, engine `RuleSet = { id, name, rules }`. `tags?: { platform?: string; entityType?: string }` replaces the flat fields. Ids via `crypto.randomUUID()` in a tiny `newId()` helper in the web app (engine stays pure and takes ids as given).
2. **Export the rule checks**: rename `getRuleErrors` to `checkRule(rule): string[]`, export it, and add the checks Author currently owns that belong to the engine (enum `allowedValues` non-empty, no value contains the delimiter, at least one segment, key and name non-empty). `Author.tsx:181-204` becomes one call to `checkRule` plus the Rule Set name check. Test each new reason.
3. **Stop hand-injecting the delimiter**: delete the injection in `use-rulesets.tsx:165-182` and `Author.tsx:163,176,240-246`; drop the "(includes delimiter)" label. The engine's `valueViolations` already rejects it (`engine.ts:101-107`).
4. **Stored-data migration**: bump the storage key to `campaign-naming-rulesets-v2`; on read from v1, add ids, move `platform` / `entityType` into `tags`, rename `label` to `name` on Rules, strip the delimiter from every `illegalChars`. Keep the existing v0 "taxonomy" migration chained before it. Seeds updated to the new shape.
5. **Author**: React keys become `rule.id` / `segment.id`. Add move up / move down for segments (`moveSegment`, mirrors `moveRule` at `Author.tsx:168`). Stop lowercasing enum values (`Author.tsx:124`); trim only. Remove `'new'` as a magic Rule Set id: creating opens the editor with a local draft and a real id is assigned on save.
6. Verify: `pnpm test`, `pnpm typecheck`, open an existing browser profile with v1 data and confirm it migrates. Commit.

## Phase 3: browser regression tests (step 3)

1. Add `@playwright/test` at the root, `playwright.config.ts` with a `webServer` that runs `pnpm dev` on a fixed port, Chromium only. Script `pnpm test:e2e`. Tests live in `apps/web/e2e/`.
2. `editor-typing.spec.ts`: open Author, create a Rule Set, and for every input on the screen (Rule Set name, Rule name, key, delimiter, platform, entity type, each segment's label, key, allowed values, max length, illegal chars, the three source fields, filter column and values) type a string character by character and assert the same element keeps focus and the value is intact, including a trailing comma in allowed values ("na, emea,").
3. `context-persistence.spec.ts`: pick a Rule Set and Rule, walk Author, Build, Check and assert both dropdowns unchanged; reload on Check and assert Rule Set, Rule, and action are restored; switch Rule Set and assert the Rule dropdown resets to that set's first Rule.
4. Tests run against the in-memory store (Phase 4) via `VITE_STORE=memory`; until Phase 4 they run against localStorage as-is. Commit.

## Phase 4: Firestore behind one store module (step 4)

Files: new `apps/web/src/lib/firebase.ts`, `apps/web/src/data/store.ts`, `apps/web/.env.example`, `firebase.json`, `.firebaserc` (placeholder project id), rewrite of `App.tsx`, `AppShell.tsx`, and the three screens' props.

1. Add `firebase` (Web SDK) to `apps/web`. `lib/firebase.ts` reads `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`; exports `app`, `db`, `auth`, or `null` for all three when the project id is unset.
2. `data/store.ts` is the only file that touches storage:
   ```ts
   type RuleSetStore = {
     subscribe(onChange: (ruleSets: RuleSet[]) => void): () => void;
     create(draft: RuleSetDraft, ownerId: string): Promise<RuleSet>;
     update(id: string, draft: RuleSetDraft): Promise<void>;
     remove(id: string): Promise<void>;
   };
   ```
   Two implementations in the same file, chosen once at startup: `firestoreStore` (collection `rulesets`, doc shape from the spec, `onSnapshot`) and `memoryStore` (seeded, in-process, used when Firebase is not configured and by Playwright). localStorage Rule Set persistence is removed; the UI selection state (`ruleSetId`, `ruleId`, `lastAction`, `checkMode`) stays in localStorage because it is per-browser UI state, not data.
3. **State to `useState`**: `App.tsx` owns `ruleSets` (from `store.subscribe`), `user`, and the selection state, and passes them as props to `AppShell` and the screens. Delete `UiContext.tsx` and the `RuleSetsProvider` half of `use-rulesets.tsx`; keep the seed data and migration helpers in `data/`. Rename screens to the spec names while touching them: `Author.tsx` splits into `RuleSetList.tsx` and `RuleSetEditor.tsx`, `Build.tsx` becomes `Builder.tsx`, `Check.tsx` becomes `CsvChecker.tsx`, all under `src/components/`.
4. `firebase.json`: hosting `apps/web/dist` with SPA rewrite, `firestore.rules` path. Rules in Phase 5. README section on creating the Firebase project and filling `.env.local`.
5. Verify: `pnpm test`, `pnpm test:e2e` (memory store), `pnpm typecheck`; with a real `.env.local` confirm create, edit, delete round-trip in the Firestore console. Commit.

## Phase 5: Firebase Auth and Security Rules (step 5)

1. Google sign-in via `signInWithPopup`; a sign-in screen replaces the shell when `auth` is configured and no user is present. Memory-store mode uses a fixed fake user so local dev and Playwright need no Firebase.
2. `ownerId = user.uid` on create. Edit, save, and delete are disabled with a hint when `ownerId !== user.uid`. Remove the fake "Maya Chen" footer and "System operational" pill from `AppShell.tsx:107-127`; show the signed-in user's name and a sign-out button instead.
3. `firestore.rules`: `rulesets/{id}`: read if `request.auth != null`; create if `request.resource.data.ownerId == request.auth.uid` and `name` is a string and `rules` is a list; update and delete if `resource.data.ownerId == request.auth.uid` and `ownerId` is unchanged.
4. Verify: `firebase emulators:exec --only firestore,auth` with a small rules test using `@firebase/rules-unit-testing` (owner can write, non-owner cannot, unauthenticated cannot read). Commit.

## Phase 6: finish stripping and update docs (rest of step 6)

1. Grep the repo for `replit`, `REPL_ID`, `taxonom`, `level` (case-insensitive) and remove any leftovers outside the intentional legacy-migration code.
2. Update CLAUDE.md: "Already done" section becomes "Migration complete" with the date; project-structure notes match reality; note that Tailwind was kept by decision. `docs/spec.md` structure block gains `apps/web/e2e/`.
3. Add a root `README.md`: prerequisites (Node 24, pnpm via corepack), run, test, typecheck, Firebase setup, memory-store mode.
4. Commit.

## Phase 7: final verification (step 7)

`pnpm install --frozen-lockfile` from clean, `pnpm test`, `pnpm test:e2e`, `pnpm typecheck`, `pnpm build`, `pnpm dev` smoke run through Author, Build, Check in both memory and Firestore modes. Report actual outputs. Stage 2 (`functions/` and `scanCampaigns`) starts only after this passes and is not part of this plan.

---

## Verification summary

| Check | Command | Expected from Phase |
|---|---|---|
| Engine unit tests | `pnpm test` | 0 onward, gaining `rollup` and `checkRule` cases in 1 and 2 |
| Full TypeScript | `pnpm typecheck` | 0 onward |
| Browser regressions | `pnpm test:e2e` | 3 onward |
| Firestore rules | emulator rules test | 5 |
| Production build | `pnpm build` | 0 onward |
| Manual smoke | `pnpm dev`, three screens, All Rules on seed CSV | every phase |

## Files that carry the work

- `packages/shared/src/engine.ts`, `engine.test.ts`: types, `compose`, `validate`, `parse`, `checkRule`, `rollup`.
- `apps/web/src/App.tsx`: shell state with `useState`, routing, sign-in gate.
- `apps/web/src/data/store.ts`: every storage call.
- `apps/web/src/lib/firebase.ts`: SDK init from env.
- `apps/web/src/components/AppShell.tsx`, `RuleSetList.tsx`, `RuleSetEditor.tsx`, `Builder.tsx`, `CsvChecker.tsx`.
- `apps/web/e2e/*.spec.ts`, `playwright.config.ts`.
- `pnpm-workspace.yaml`, root `package.json`, `tsconfig.json`, `tsconfig.base.json`, `.gitignore`, `firebase.json`, `firestore.rules`, `README.md`, `docs/spec.md`, `CLAUDE.md`.
