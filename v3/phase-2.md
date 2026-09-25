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

## Step 3: Rules take values from the Dictionary

Definition-backed segments, the single resolve call (D46), the platform guard on parent
links (D47), the runtime guard (D25) and delete protection for definitions in use. Build and
Check look the same to a user; they now work on resolved Rules.

### What changed

- `packages/shared/src/engine.ts`: `EnumSegment.definitionId?` (own `allowedValues` is `[]`
  when set). `resolveRule(rule, ruleSet, definitions = [])` fills every definition-backed
  segment, own or inherited through a parent, with the definition's entries and drops the
  reference; errors when the definition is missing, has no values, is scoped to platforms the
  Rule is not on or the Rule has no platform (O13), or a code contains the delimiter. D47: a
  child's platform must equal its parent's, both set or both unset. D25: `unresolvedReason`,
  used by `compose` (returns it in `errors`) and `validate` (one violation on the name); neither
  throws. `checkRule` skips the own-list checks for a definition-backed segment; `checkRuleSet`
  takes the definitions and adds each Rule's resolution errors. `definitionDependents` lists the
  Rules using a definition. 7 new tests, 45 in the engine.
- `apps/web/src/components/RuleSetEditor.tsx`: each enum segment has a "Values from" select:
  this Rule's own list, or a definition, offered only when it has no platforms or the Rule's
  platform is among them (a chosen one that no longer fits stays offered so it can be changed).
  A definition-backed segment shows its values read-only with a link to the Dictionary. The
  editor passes the definitions to `checkRuleSet`, so a missing or ill-fitting definition
  blocks the save.
- `Builder.tsx` and `CsvChecker.tsx`: resolve first. Build shows the resolution errors and no
  controls when a Rule cannot be resolved; Check fails every name of such a Rule with those
  errors as the reason. The sample CSV is built from resolved Rules so it carries real codes.
- `Dictionary.tsx`: a definition in use shows its dependents and cannot be deleted.
- `functions/src/index.ts`: loads the tenant's definitions and passes them to `resolveRule`.
- `scripts/seed-definitions.ts` (`pnpm seed:definitions --tenant <id> --as <admin email>
  [--dry-run]`): four demonstration definitions (Market, Campaign objective, Funnel stage for
  meta/tiktok/snapchat, Match type for google), skipping ids that exist. Run against `esports`
  on 2026-09-25 with approval: all four written.
- `scripts/lib/v3-transform.test.ts`: the fixture's child Rule gained its parent's platform,
  which D47 now requires.
- `apps/web/e2e/definitions-in-rules.spec.ts` (2 tests): Author points a segment at a
  definition and Build offers its labels and writes the code; a definition in use cannot be
  deleted and a search-only definition is not offered to a Meta Rule.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean everywhere |
| `pnpm test` | 45 (engine, 7 new), 9 (functions), 13 (scripts) |
| `pnpm test:e2e` | 23 of 23 (2 new) |
| `pnpm --filter @taxo/web build` | Clean, 877 kB |
| `pnpm --filter @taxo/functions build` | 9.3 kB, definitions resolution inlined |
| Live seed | 4 definitions written to `tenants/esports/definitions` |

### Decisions not spelled out in the plan

- A resolved segment loses its `definitionId`, so "resolved" means no parent and no definition
  reference, and the D25 guard tests exactly that.
- `checkRuleSet` runs `resolveRule` per Rule only when the Rule's own checks pass, so an author
  sees one layer of errors at a time. Its return stays a flat string list; the per-Rule shape
  is step 4.
- Deleting a definition in use is blocked outright rather than cascading; editing its values
  stays allowed with the D44 confirm (D43).
- `resolveRule` on a Rule with a missing definition returns the input unchanged, so Check
  reports the resolution errors rather than the guard's generic message.

### Leftovers

- Step 4: `checkRuleSet` issues per Rule and `dependentsOf` for parent links (segment and Rule
  delete protection inside a Rule Set), then the Author parent UI (step 5).
- The live app is still on step 1 until the next deploy; steps 2a, 2b and 3 are local.

## Step 4: issues per Rule and delete protection in Author

### What changed

- `packages/shared/src/engine.ts`: `checkRuleSetIssues(ruleSet, definitions)` returns
  `{ ruleSet: string[], rules: Record<ruleId, string[]> }`, each Rule's own checks or, once those
  pass, its resolution errors. `checkRuleSet` keeps its flat, position-prefixed list, now derived
  from the grouped form, so the migration script's `verifyRuleSet` is unchanged. `dependentsOf(
  ruleSet, ruleId, segmentId?)` lists the Rules whose parent link names the Rule, or whose
  inherited ids include the segment (a grandchild counts, since it inherits the id through its
  parent). Two new tests.
- `apps/web/src/components/RuleSetEditor.tsx`: the issues are computed live from the draft and
  listed beside each Rule (and above the list for Rule Set level ones); Save is disabled while
  any exist and the submit path says so instead of showing the first message only. A Rule other
  Rules inherit from shows "Parent of ..." and its Remove button is disabled; a segment a child
  inherits has its Remove disabled with the dependents in the tooltip. Renaming stays free.
- `apps/web/e2e/author-hierarchy.spec.ts` (2 tests): a broken child delimiter lists the problem
  on that Rule only and blocks Save until fixed; a parent Rule and an inherited segment cannot
  be removed while other segments and Rules still can.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 47 (engine, 2 new), 9, 13 |
| `pnpm test:e2e` | 25 of 25 (2 new) |

### Decisions not spelled out in the plan

- Save is disabled on any issue rather than refusing on submit only; the message is live, so an
  author sees the reason before reaching for the button.
- Delete protection disables the control rather than showing a dialog: the reason is beside the
  Rule already, and a dialog naming the same Rules would add a click.

## Step 5: the parent picker in Author

### What changed

- `apps/web/src/components/RuleSetEditor.tsx`: each Rule has a "Parent rule" select over the
  other Rules in the Rule Set. Picking one copies the parent's delimiter and platform onto the
  child and locks both controls (D29, D47); clearing it frees them. A second select, "Inherit the
  parent's segments through", lists the parent's leading required segments (its resolved
  segments, so a grandparent's show too) and stores the first N ids (D28). The inherited
  segments are listed read-only above the child's own, labelled with the parent's name. A
  delimiter or platform change on a parent cascades to every descendant, so the locked
  controls can never drift from it.
- `apps/web/e2e/author-hierarchy.spec.ts`: a third test links Meta Ad Sets under Google
  Campaigns, inherits two segments, saves, reads the link back by id, sees the parent's Remove
  and inherited segments locked, then clears the link. The step 4 test now breaks the child
  with a key collision, since the delimiter can no longer be edited on a child.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test:e2e` | 26 of 26 (1 new) |

### Decisions not spelled out in the plan

- The inherited run is chosen by its last segment ("through Market") rather than a checklist,
  which makes the leading-run rule (D28) impossible to break from the screen.
- Cycles are not prevented by the select (every other Rule is offered); the engine's cycle
  error appears beside the Rule and blocks Save, which is simpler than hiding descendants.

## Step 6: the Build parent step and chaining

### What changed

- `packages/shared/src/engine.ts`: `parse(rule, name)` now returns `{ valid, violations,
  selections }`: a valid name read back into selections keyed by segment key, each holding the
  code at that position, an omitted optional left out; an invalid name yields no selections and
  the violations `validate` reports, including the D25 guard on an unresolved Rule. The raw split
  is an internal `splitName`. Three new tests.
- `apps/web/src/components/Builder.tsx`: a child Rule shows a parent step above its controls:
  paste the parent name, which is parsed against the resolved parent. Until it parses, the
  child's controls are hidden; a bad name lists the parent's violations. A good name fills the
  inherited controls, locks them with an "Inherited" badge, and the name composes from the
  inherited codes plus the child's own choices. After a valid build, "Build <child> under this"
  appears for each child Rule; it carries the built name across and switches the persistent
  Rule selection through `onSelectRule`, the one place the app changes that selection for the
  user. Parent names are kept per Rule in component state, so switching Rules never loses one.
- `apps/web/src/App.tsx`: Build receives `onSelectRule`.
- `apps/web/e2e/fixtures.ts`: `googleAdGroupsRule` and `hierarchyRuleSet`, shared by the Author
  and Build hierarchy specs. `apps/web/e2e/build-hierarchy.spec.ts` (2 tests): a child built
  under a pasted parent, a non-compliant parent blocking it; chaining from a parent build into
  the child, and the switched Rule surviving a refresh.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 50 (engine, 3 new), 9, 13 |
| `pnpm test:e2e` | 28 of 28 (2 new) |
| `pnpm --filter @taxo/web build` | Clean |
| `pnpm --filter @taxo/functions build` | Clean |

### Decisions not spelled out in the plan

- `parse` changed signature rather than gaining a sibling: nothing outside the engine called
  the old split, and the D34 sheet's contract names `parse` as returning selections.
- A grandchild's parent step asks for the immediate parent's name only, as the spec says; that
  name already carries the grandparent's inherited segments because the parent is resolved
  before parsing.
- Chained parent names live in Build's own state, not the persistent context, so a refresh
  keeps the child Rule selected but asks for the parent name again.

### Leftovers

- Steps 7 and 8 (UTM types, `buildTrackingUrl`, `validateUtmValue`, the Author UTM panel and
  Build URL output) and step 9 (further Playwright) remain in phase 2.
- Seven commits since the last deploy (steps 2a to 6); the live app is on step 1.

## Step 7: UTM types, validation, the URL builder and the authoring checks

### What changed

- `packages/shared/src/engine.ts`: `UtmSource` (ruleName, segment, tag, literal), `UtmMapping`
  (source, medium, campaign required; content, term optional; base URL and whether it is
  editable; case policy) and `utm?` on `Rule`, exactly the spec's shapes. `validateUtmValue`
  applies D30: non-empty, unreserved characters only, no uppercase under "lower", never a
  transformation. `ancestorsOf` walks parent links. `checkUtmMapping` runs from
  `checkRuleSetIssues` once a Rule's own checks and resolution pass: required parameters,
  campaign from a built name, every named Rule is self or an ancestor, every segment source on
  the resolved Rule, literals valid, the base URL absolute with no `utm_` of its own, and the
  D30 amendment: the delimiter and every enum code of each Rule whose name feeds a value must
  be emittable under the mapping, each segment reported once. `buildTrackingUrl(resolvedRule,
  ruleSet, context)` resolves each source from the built names (keyed by Rule id), the
  selections and the tags, validates every value, omits an empty optional parameter, keeps the
  base URL's own query and fragment, and returns the URL with the standard `URL` API. Four
  tests, including the URL round-trip: every mapped parameter exactly once, decoding to the
  built value, and `utm_campaign` equal to the campaign name byte for byte.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 54 (engine, 4 new), 9, 13 |

### Decisions not spelled out in the plan

- A missing base URL is a build-time error, not an authoring one, since D3/P3 let it be typed
  at build time; an authored base URL is still checked at save.
- The ancestor-name gap (O1) is reported per value: "utm_campaign needs the built name of
  X", so a three-level chain fails clearly until Build collects that name.

## Step 8: the Author tracking panel and the Build URL output

### What changed

- `apps/web/src/components/RuleSetEditor.tsx`: a "Tracking URL" checkbox per Rule. Ticking it
  creates a mapping with the P2 defaults (source from the platform tag, medium the fixed text
  `cpc`, campaign the top of the Rule's chain, content the Rule itself when it has a parent).
  One row per parameter: a source kind select, then by kind a Rule select over this Rule and
  its ancestors, a segment select over the resolved segments, a Rule plus tag select, or a text
  input; campaign is fixed to a built name. Base URL, "Editable in Build" and the case policy
  below. Every problem comes from `checkUtmMapping` through the Rule's issue list.
- `apps/web/src/components/Builder.tsx`: a "Tracking URL" card for a Rule with a mapping: the
  base URL (editable per the mapping, kept per Rule in state), then once the name is valid the
  per-parameter values with any errors, the URL, and a Copy URL button enabled only when the
  URL builds. The built names passed in are this Rule's and, on a child, the parent step's name.
- `apps/web/e2e/utm.spec.ts` (2 tests): Build's URL for a child under a pasted parent, with
  `utm_campaign` the parent name and `utm_content` the built name, and a base URL carrying a
  UTM refused; Author switching tracking on, a bad base URL listed beside the Rule, a term
  source from a segment, and the mapping read back.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 54, 9, 13 |
| `pnpm test:e2e` | 30 of 30 (2 new) |
| `pnpm --filter @taxo/web build` | Clean |

### Decisions not spelled out in the plan

- "Copy mapping from another Rule" is not built (D26 as amended).
- A grandchild's `utm_campaign` still needs the campaign name (O1); Build only has the
  immediate parent's, so a three-level mapping reports "needs the built name of X" until that
  is collected. Two levels, the P1 default, work end to end.

### Leftovers

- Step 9, further Playwright coverage, is largely done along the way (30 browser tests); the
  spec's remaining item is continuous typing in the UTM literal and base URL inputs.
- Phase 3 (batch, then the D34 child batch) is next after step 9.
