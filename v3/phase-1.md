# Phase 1: Foundation

`docs/spec-v3.md`, release phase 1: tenant model, Auth claims, Security Rules, admin and user
roles, tenant config with allowed datasets, migration of the v2 data into a first tenant (O15).
One commit per scope item, in the order below. Phase 2 (the repository) is not started.

## C1: enum entries in the engine (prerequisite for the migration)

D39 makes every enum value a label/code pair. The migration script writes that shape to
Firestore, so the engine and the app must accept it before the data moves.

### What changed

- `packages/shared/src/engine.ts`: `EnumEntry = { label, code }` and
  `EnumSegment.allowedValues: EnumEntry[]`. `compose` selections and `validate` tokens are
  codes (D40): matching, the "did you mean" suggestion and the delimiter check all read
  `entry.code`. `checkRule` adds three checks on an enum list: no blank code or label, no
  code twice, no label twice. `entryFromCode` and `entriesFromCodes` build label = code
  entries; the Author editor, the local-storage migration and (in C6) the Firestore migration
  all use them rather than spelling the shape out.
- `packages/shared/src/engine.test.ts`: fixtures use `entriesFromCodes`; two new cases, one
  proving a name carries the code and never the label (round-trip included), one for the
  uniqueness and blank checks.
- `apps/web/src/components/Builder.tsx`: the dropdown shows the label and submits the code;
  when they differ the option reads "Label (code)".
- `apps/web/src/components/RuleSetEditor.tsx`: the enum field is still one comma list, of
  codes. A code that already has an entry keeps its label; a new code becomes its own label.
  The label control arrives with the shared definitions in phase 2.
- `apps/web/src/components/CsvChecker.tsx`: the sample CSV uses the first entry's code.
- `apps/web/src/data/migrations.ts`: new localStorage key `campaign-naming-rulesets-v3`; the
  v2 key migrates flat strings to entries (objects pass through), v1 and v0 go through the
  same path. Development only, since Firestore users never had browser-local data.
- `apps/web/src/data/seeds.ts`, `apps/web/e2e/fixtures.ts`,
  `apps/web/e2e/editor-typing.spec.ts`: entries instead of strings; the typing test now
  asserts the saved entries are `{ label: 'NA', code: 'NA' }` and so on.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 32 of 32 (30 existing, 2 new) |
| `pnpm test:e2e` | 17 of 17 |
| `pnpm build` | Clean |

### Decisions not spelled out in the plan

- Blank codes or labels are an authoring error, reported once per segment, rather than being
  dropped silently. The editor never produces them (the comma parser filters empties), so
  the check guards documents written by other clients.
- The migration step for browser-local data has no automated test: the memory store in
  Playwright starts from a seed and never reads localStorage, and `apps/web` has no Vitest
  setup. The function is a ten-line map; the Firestore migration in C6 gets the real test.

### Leftovers

- Labels cannot be edited in Author yet; every entry saved from the UI has label = code.

## C2: Auth claims and the two roles

D35 and D36: a user belongs to one tenant and holds one role in it, both carried as custom
claims on the ID token. The app reads them and never guesses; setting them is server-side
(the provisioning script in C6).

### What changed

- `apps/web/src/data/mode.ts` (new): `detectMode()` decides `memory` or `firestore` once,
  before sign-in, with the same four cases `createStore` used to hold (test seed, Firebase
  configured, development fallback, production refusal). The session and the store both
  follow it, so `createAuth` no longer depends on the store.
- `apps/web/src/data/auth.ts`: `Role = 'admin' | 'user'`; `User` gains `tenantId` and `role`,
  read from `getIdTokenResult()` claims (`tenantId` must be a non-empty string, `role` one of
  the two values, anything else reads as null). `refreshClaims()` fetches a fresh token so a
  user provisioned after signing in does not have to sign out. Memory mode: the local user is
  admin in tenant `local`, or a standard user when a Playwright fixture sets
  `window.__taxoTestRole`.
- `apps/web/src/data/store.ts`: `createStore(mode)`; the selection logic moved to `mode.ts`.
- `apps/web/src/App.tsx`: mode first, then auth and store from it. A signed-in user without
  a tenant or role sees the new `NoWorkspace` screen (Retry re-reads the claims, or sign out)
  and the store listener does not start, since the Security Rules would refuse every read.
  `canEdit = role === 'admin'` drives the editor's `readOnly`, the create flow and the list.
- `apps/web/src/components/SignIn.tsx`: role-aware copy and the `NoWorkspace` component.
- `apps/web/src/components/RuleSetList.tsx`: the ownership badge and "Owned by" caption are
  gone; "New Rule Set" and the create copy show only to admins.
- `apps/web/src/components/RuleSetEditor.tsx`: the read-only hint names the admin role.
- `apps/web/src/components/AppShell.tsx`: the role under the user's name (`text-user-role`).
- `apps/web/e2e/fixtures.ts`: `seedRuleSets(page, ruleSets, role)` sets the role hook.
  `apps/web/e2e/auth.spec.ts`: sign-out and sign-in still restore the context; a standard
  user sees everything read only, has no create button and still builds a name; an admin
  edits a Rule Set created by someone else.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 32 of 32 |
| `pnpm test:e2e` | 17 of 17 (auth.spec rewritten, 3 tests) |
| `pnpm build` | Clean |

### Decisions not spelled out in the plan

- `ownerId` stays on the document in this commit; C3 renames it with the tenant path so the
  document shape changes once. Ownership no longer affects the UI anywhere.
- The `NoWorkspace` screen keeps the persisted workspace context untouched, so a user who is
  provisioned and retries lands where they were.
- `AuthSession.kind` is the `Mode` type rather than its own union, so the two cannot drift.

## C3: the tenant path in the store, `createdBy` and `updatedBy`

Every Rule Set now lives at `tenants/{tenantId}/rulesets/{id}` (spec v3 data model, D5 kept:
one document, Rules inline). Ownership is replaced by audit fields.

### What changed

- `apps/web/src/data/types.ts`: `ownerId` becomes `createdBy` (never changes) plus
  `updatedBy` (D31). New `Tenant`, `TenantConfig` and `TenantUser` types document the tenant
  document and the users mirror; the app does not read them yet, the scripts (C6) write them
  and the Function (C5) reads the config.
- `apps/web/src/data/store.ts`: `createStore(mode, { tenantId, uid })`. The Firestore
  collection is `ruleSetsPath(tenantId)`; `create` stamps `createdBy` and `updatedBy`, `update`
  stamps `updatedBy` inside the existing `updatedAt` transaction. Stores are cached per mode,
  tenant and uid for the page's lifetime, so signing out and back in reuses the same instance
  (memory mode keeps its data across that, and a Firestore listener is never opened twice).
- `apps/web/src/App.tsx`: the store is built from the mode and the user's claims with
  `useMemo`, so it exists only while a workspace member is signed in; `store.create(draft)`
  takes no uid. The user-facing flow is unchanged.
- `apps/web/src/data/migrations.ts`: the browser-local v2 step also maps `ownerId` to
  `createdBy` and `updatedBy`.
- `apps/web/src/data/seeds.ts`, `apps/web/e2e/fixtures.ts`: `createdBy` and `updatedBy`;
  `apps/web/e2e/editor-save.spec.ts`: the slow-create patch takes only the draft.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 32 of 32 |
| `pnpm test:e2e` | 17 of 17 (one run had a single failure while an edit reloaded the dev server mid-test; clean on the rerun) |
| `pnpm build` | Clean |
| Context walk | `context-persistence.spec.ts` unchanged and green against the session-bound store |

### Decisions not spelled out in the plan

- The store cache key includes the uid as well as the tenant, so two accounts in one browser
  session never share an instance that stamps the wrong `updatedBy`.
- `readUiState` runs before the store exists and gets an empty list. The only thing it used
  the list for was resolving a Rule key from the two oldest UI-state formats; in Firestore
  mode the snapshot was empty at mount before this change too, so nothing regresses.

## C4: Security Rules on the tenant path

### What changed

- `firestore.rules`: everything sits under `match /tenants/{tenantId}`. `inTenant(tenantId)`
  compares the caller's `tenantId` claim with the path; `isAdmin` adds `role == 'admin'`.
  The tenant document is readable by members and never writable from a client. The users
  mirror is readable by the user themselves or an admin, never writable. Rule Sets: any
  member reads; only an admin creates, updates or deletes; create needs `id == documentId`,
  `createdBy == uid` and `updatedBy == uid`; update keeps `id` and `createdBy` and needs
  `updatedBy == uid`. The coarse `wellFormed` shape check from v2 stays, with the two audit
  fields added. No other path matches, so the legacy `/rulesets` collection and everything
  else are denied to everyone.
- `firestore.rules.test.ts`: rewritten for two tenants (acme with admins alice and carol and
  user uma; other with admin bob), a signed-in account with no claims, and no sign-in.
  Eight cases: member reads and every outsider denied (including a collection list); the
  legacy collection and an arbitrary path denied even to an admin; the tenant document
  readable by members only and never writable (config included); the users mirror readable
  by self or admin and never writable; admin-only well-formed create stamped as self, with
  every wrong stamp, mismatched id, malformed shape and missing field refused; admin-only
  update where a second admin must stamp themselves and `createdBy` and `id` cannot move;
  the read-then-write transaction the store uses; admin-only delete.

### Verified

| Check | Result |
|---|---|
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 8 of 8 on the Firestore emulator |

### Decisions not spelled out in the plan

- `id` is also frozen on update, alongside `createdBy`; the id is the document id and
  moving it would leave a document that no longer matches its path.
- The users mirror is not writable by admins either. An admin changing a role there would
  not change the claims, and a mirror that can disagree with the truth is worse than none;
  the provisioning script writes both.

## C5: `functions/` with the tenant guard

Scope item 4 named `scanCampaigns`, which was never built (Stage 2). This commit scaffolds
the package with the guard the spec requires of every Callable, and a `scanCampaigns` that
runs it end to end before stopping where Stage 2 begins.

### What changed

- `functions/package.json` (`@taxo/functions`, Node 22 runtime, `firebase-functions` 7 and
  `firebase-admin` 14 as dependencies; `@taxo/shared`, esbuild, TypeScript and Vitest as dev
  dependencies), `functions/tsconfig.json`, `functions/build.mjs` (esbuild, ESM, target
  node22, `@taxo/shared` inlined, the two Firebase SDKs external).
- `functions/src/tenant.ts`: `tenantFromAuth(request.auth)` returns `{ uid, tenantId, role }`
  from the token claims or throws `HttpsError` (`unauthenticated` with no sign-in,
  `permission-denied` with no tenant or an unknown role); `assertDatasetAllowed(config,
  dataset)` refuses anything not in `config.allowedDatasets`, exactly matched, and refuses
  everything when the config is missing or empty; `readTenantConfig(db, tenantId)` reads
  `tenants/{tenantId}` through a two-method `DocumentReader` slice so tests fake it.
- `functions/src/index.ts`: `scanCampaigns` (`asia-south1`, same region as the database):
  guard, parse `{ ruleSetId, ruleId }`, load the Rule Set under the caller's tenant (never a
  tenant from the body), find the Rule, check its `source.dataset` against the config,
  `resolveRule`, then `unimplemented`. Stage 2 replaces the last line with the query.
- `functions/src/tenant.test.ts`: nine Vitest cases on the guard.
- `firebase.json`: a `functions` block (source, `nodejs22`, predeploy build, ignore list).
  `.gitignore`: `functions/lib/`. `pnpm-lock.yaml` gains the package; the workspace file
  already listed `functions`, so the recursive `typecheck` and `test` pick it up.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in all three packages |
| `pnpm test` | 32 of 32 (engine), 9 of 9 (functions) |
| `pnpm --filter @taxo/functions build` | `lib/index.js` 6.6 kB with `resolveRule` inlined |

### Decisions not spelled out in the plan

- Dependency ranges are `^14.0.0`, `^7.0.0` and `^0.28.0` rather than pinned to the latest
  patch: firebase-admin 14.5.0 was published within the 24-hour release-age guard, and a
  loose range lets pnpm take the newest eligible version (14.4.0 today) without touching the
  guard.
- Not deployed. Cloud Functions need the Blaze plan, and `@taxo/shared` as a `workspace:*`
  dev dependency will not resolve on the deploy server. Before the first deploy either strip
  dev dependencies from the shipped manifest or run `pnpm deploy`; the bundle itself has no
  workspace import.

### Leftovers

- CI runs on Node 24 while the Function declares Node 22; pnpm warns and continues. The
  bundle targets node22, so that is the runtime to match if the warning is ever promoted.
