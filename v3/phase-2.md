# Phase 2: Repository

The v3 phase 2 build order in `CLAUDE.md`, one commit per step, this file updated with each.

## Step 1: platform list and the provisioning flag

O12 (a fixed product platform list) and D38 (a way to set a tenant's platforms). Nothing about
definitions yet; this step gives the three places that will name platforms one vocabulary.

### What changed

- `packages/shared/src/engine.ts`: `PLATFORMS`, a list of `{ id, name }` (google, microsoft,
  meta, tiktok, linkedin, pinterest, snapchat, dv360, amazon), with `isPlatform(value)` and
  `platformName(id)`. `Tags.platform` stays a string but `checkRule` now refuses a value that
  is not a platform id, naming the known ids. No tag is still fine.
- `scripts/lib/v3-transform.ts`: `tenantDocument` takes an optional platforms list;
  `parsePlatforms(value)` turns a comma-separated `--platforms` value into trimmed,
  lowercased, deduplicated ids and throws on an unknown one.
- `scripts/provision-user.ts`: `--platforms google,meta` sets the tenant's platform list,
  on a new tenant document or replacing the list on an existing one. Without the flag the
  list is left alone. Validated before connecting.
- `apps/web/src/components/RuleSetEditor.tsx`: the Platform field is a select over
  `PLATFORMS` (display names, id as the value) with "None". A stored value that is not a known
  id shows as its own option marked "(not a known platform)" so the admin can see and fix it;
  `checkRuleSet` blocks the save until they do.
- `apps/web/e2e/editor-typing.spec.ts`: the platform step selects an option instead of typing.
- Tests: two engine cases (the list and the tag check), two script cases (`tenantDocument`
  with platforms, `parsePlatforms`).

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in shared, functions, web and the root |
| `pnpm test` | 34 (engine), 9 (functions), 13 (scripts) |
| `pnpm test:e2e` | 17 of 17 |
| `pnpm --filter @taxo/web build` | Clean, 845 kB |

### Decisions not spelled out in the plan

- Nine platforms to start: the four the specs name (Google, Microsoft, Meta, TikTok) plus the
  paid media platforms a marketing operations team commonly runs. Adding one is a one-line
  change in the engine; there is no per-tenant custom platform (O12).
- `Tags.platform` keeps the type `string` rather than a union of the ids, so no Firestore
  document becomes unreadable; the check lives in `checkRule` and runs before every save.
- Unknown values are surfaced in the select rather than silently dropped or lowercased, so
  the fix is a visible choice by the admin.
- `rollup` still groups by the raw tag, so Check breakdowns show ids (`google`), the same as
  before.

### Leftovers

- The live `esports` Rule Set has one Rule tagged platform `Google` (capital G, from the
  prototype). Its next save in Author will require picking Google Ads from the list. No data
  was changed.
- The `esports` tenant's platform list is still empty. Setting it is a live run,
  `pnpm provision:user --email misterfela@gmail.com --tenant esports --role admin --platforms google`,
  with the platforms the client actually uses; it needs explicit approval like every live run.
- Step 2 next: the `Definition` type, `tenants/{id}/definitions` in the store and the rules,
  and `checkDefinition` sharing one entry-list check with `checkRule`.

## Step 2a: shared definitions, Firebase side

The client repository's storage half: the `Definition` type, its check, its Firestore path with
rules and tests, and a store that holds it beside the Rule Sets. Nothing references a definition
yet (step 3) and nothing shows one (step 2b).

### What changed

- `packages/shared/src/engine.ts`: `Definition = { id, name, platforms, entries }`. The entry
  checks moved out of `checkRule` into one `entryErrors` helper (O14) that both `checkRule` and the
  new `checkDefinition` call: no blank code or label, no code twice (exact), no label twice
  ignoring case (the D39 amendment, the one behaviour change to `checkRule`). `checkDefinition`
  also requires a name and known, unrepeated platforms; an empty entry list is allowed.
- `firestore.rules`: `tenants/{tenantId}/definitions/{definitionId}` beside `rulesets`, same
  shape: members read, admins write, `wellFormedDefinition`, id and `createdBy` frozen,
  `updatedBy` stamped by the caller. `firestore.rules.test.ts`: one definition seeded under acme
  and four new cases (read, create, update, delete by role).
- `apps/web/src/data/types.ts`: `Audit` shared by `RuleSet` and the new `Definition` and
  `DefinitionDraft`.
- `apps/web/src/data/store.ts`: the store is now the tenant's store: `{ kind, ruleSets,
  definitions, tenant }`. One `memoryCollection` and one `firestoreCollection` factory serve both
  collections with the same `updatedAt` transaction check and `updatedBy` stamping; `tenant` is a
  read-only subscription to `tenants/{tenantId}` so the front end knows the platform subset.
  `__taxoTestDefinitions` joins the test seed hooks; `__taxoStore` is the whole store.
- `apps/web/src/data/migrations.ts`: `readLocalDefinitions` and `writeLocalDefinitions` on a new
  key, no migration. `seeds.ts`: Market (all platforms) and Campaign objective (google,
  microsoft) for development.
- Call sites moved to `store.ruleSets.*`: `App.tsx`, `e2e/fixtures.ts`, `editor-save.spec.ts`,
  `editor-conflict.spec.ts`. The `RuleSetStore` type is now `Store`.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in shared, functions, web and the root |
| `pnpm test` | 38 (engine, 4 new), 9 (functions), 13 (scripts) |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 12 of 12 (4 new) |
| `pnpm test:e2e` | 17 of 17, unchanged, so the store reshape broke nothing |
| `pnpm --filter @taxo/web build` | Clean, 847 kB |

### Decisions not spelled out in the plan

- `Collection<T, Draft>` carries a `T extends Stored` constraint so the factories can compare
  `updatedAt`; that is ordinary TypeScript, not the advanced generics CLAUDE.md rules out. The
  two `create` results are cast through `unknown`, since a spread of a type parameter cannot be
  proven to be `T`.
- The conflict messages lost the words "Rule Set" so they read correctly for a definition too.
- The memory tenant reports no platforms, matching the live `esports` tenant, so the front end's
  fallback to the full platform list is exercised in development.

### Leftovers

- The definitions collection is deployed by the next `./deploy.sh` (rules) but has no screen
  until step 2b, so nothing can write to it yet.

## Step 2b: the Dictionary tab

Changed at review from the planned Author sub-route: the user wanted the shared definitions
visible in their own tab, "Dictionary", with the request flow for new values in it. So the
tab shows every definition to every member, admins author there, and the submit-and-approve
half of phase 5's request queue arrives now (chosen at review: submit and approve, no drafts
or Build blocking, which stay D42 phase 5).

### What changed

- `apps/web/src/data/types.ts`: `ValueRequest` (definitionId, label, code, note,
  requestedByName, status pending/approved/rejected, reason, audit fields) and its draft.
- `firestore.rules`: `tenants/{tenantId}/requests/{id}`: any member creates their own, status
  pending, stamped; the requester or an admin reads one, so a member's list must be filtered
  to `createdBy == uid`; only an admin updates (status, reason), `createdBy` frozen; admin
  deletes. `firestore.rules.test.ts`: a pending request seeded, four new cases including the
  refused unfiltered list.
- `apps/web/src/data/store.ts`: a `requests` collection from the same factory. The session now
  carries the role, because a standard user's Firestore subscription is a `where('createdBy',
  '==', uid)` query and the memory store applies the same visibility filter, so the two modes
  behave alike. Local persistence key and `__taxoTestRequests` hook added.
- `apps/web/src/data/ui-state.ts`: `/dictionary` is an action path, so it persists as the last
  action and survives a refresh like the other three. `AppShell.tsx`: the fourth nav item.
- `apps/web/src/components/Dictionary.tsx` (new): list of definitions on the left; on the right
  an admin editor (name, platform checkboxes over the tenant's platforms or all of them while
  the tenant has none, an entries table with stable row ids, `checkDefinition` errors, Save
  disabled until clean and dirty, Delete with confirm, the D44 plain confirm when an existing
  code is changed or removed, the stale-version reload) or, for a standard user, a read-only
  values table with a "Request a new value" form that refuses a collision up front. Below,
  the requests: admins see pending ones with the collision check, a reason field, Reject and
  Approve (Approve writes the entry to the definition first, then marks the request); members
  see their own with status and reason.
- `apps/web/src/App.tsx`: definitions, requests and tenant state from the store, the
  `/dictionary` route, five new handlers passed through `Workspace`.
- `apps/web/e2e/dictionary.spec.ts` (new, 4 tests): admin creates a definition typing freely
  and it is stored with entries and platforms, refresh returns to the Dictionary; a duplicate
  code blocks Save; a standard user reads and submits a request and cannot request an
  existing code; an admin approves one request (entry added) and rejects another with a
  reason. `e2e/fixtures.ts`: two definition fixtures, `readDefinitions`, `readRequests`, and
  `seedRuleSets` takes definitions and requests.
- `CLAUDE.md`: the UI rule names the fourth action; build order step 2 done; the Do-not list
  says submit and approve are done, drafts and blocking are phase 5.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean everywhere |
| `pnpm test` | 38 (engine), 9 (functions), 13 (scripts) |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 16 of 16 (4 new) |
| `pnpm test:e2e` | 21 of 21 (4 new) |
| `pnpm --filter @taxo/web build` | Clean, 871 kB |

### Decisions not spelled out in the plan

- A request has no `platforms` of its own, unlike the v3 spec's sketch: the definition it
  targets already carries the scope, and an entry has none. Recorded as a spec change to make
  in Phase C.
- A request has no `draftId` yet; D42 drafts add it in phase 5.
- Approve writes the definition before the request, so a refused definition save (a conflict,
  or a collision that appeared meanwhile) leaves the request pending rather than approved
  with no entry.
- A member's request form runs `checkDefinition` on the proposed entry, so a request that
  could never be approved is refused before it reaches an admin.
- Deleting a definition is allowed with a confirm; the dependents block arrives in step 3
  when Rules can reference definitions.

### Leftovers

- The tenant's platform list is still empty on `esports`, so the Dictionary offers all nine
  platforms; set it with `provision-user.ts --platforms` when the client's platforms are known.
- `docs/spec-v3.md` still describes requests with `platforms[]` and `draftId` and puts the
  whole queue in phase 5; update in the Phase C spec pass.
