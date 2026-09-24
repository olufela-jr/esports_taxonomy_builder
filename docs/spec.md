# Campaign Naming Taxonomy Tool: Technical Spec

## Purpose
An internal marketing-operations web app that lets a team author naming conventions (Rule
Sets containing Rules) for campaigns, ad groups, ad sets and creatives, build names and UTM
tracking URLs that are correct by construction, and detect names already in use that break a
convention. Everything runs on Firebase / GCP, and `CLAUDE.md` is the concise, always-loaded
companion that points here. This file is the technical contract, taken verbatim from spec v2
(22 September 2026): Part B (technical detail), Part C (delivery and operations), the
decisions log and the pending list. Version 2 supersedes v1 and adds hierarchy (a child Rule
inherits leading segments from a parent Rule, by reference, at build time), UTM generation
and batch build. The product view (Part A, with the user journeys and worked example) and the
planning phase and gates stay in `docs/spec-v2.md`, the exported copy of the source-of-truth
Claude Doc.

> v3 note (24 September 2026). `docs/spec-v3.md` supersedes this file where the two differ:
> every document now lives under `tenants/{tenantId}/`, access is tenant membership plus an
> `admin` or `user` role carried as Auth custom claims (replacing D12's owner-only writes), Rule
> Set documents carry `createdBy` and `updatedBy` instead of `ownerId`, and enum
> `allowedValues` are `{ label, code }` entries with the code in the name (D39, D40, replacing
> the flat strings of D4 and D5). The engine contract, hierarchy, UTM and batch sections below
> stand. The "Storage and auth" section and D12 are historical.

## Part B: Technical detail

### Architecture (Settled, extended)

The architecture is unchanged from v1: React, Vite and plain TypeScript on Firebase Hosting; Firestore for Rule Sets; Firebase Auth; one read-only Callable Cloud Function for BigQuery in Stage 2; a pnpm workspaces monorepo with `packages/shared` (`@taxo/shared`), `apps/web` and `functions/`. No Turborepo or Nx, no CSS framework, `useState` only, dependencies limited to React, Vite, the Firebase Web SDK, PapaParse, Wouter and Vitest plus Playwright for browser tests.

The v2 extension is entirely inside `@taxo/shared` and the three existing screens. No new service, no new Firestore collection, no new Cloud Function.

### The engine contract

The one rule that must never break still holds: all naming logic, and now all UTM logic, lives in `@taxo/shared`. The exported surface becomes:

| Function | Status | Purpose |
| --- | --- | --- |
| `compose(rule, selections)` | Settled, now requires a resolved Rule | Build a name from segment selections |
| `validate(rule, name)` | Settled, now requires a resolved Rule | Check a name positionally |
| `parse(rule, name)` | Settled, changes in v2 | Split a valid name into selections keyed by segment `key`, failing on an invalid name; used by the parent step. The v1 function is a plain split that cannot fail, so this is engine work in build step 5 |
| `rollup(perRuleResults)` | Settled (migration step 1) | Pooled All Rules figure |
| `resolveRule(rule, ruleSet)` | New (brief) | Flatten a child Rule into a self-contained Rule |
| `checkRuleSet(ruleSet)` | Extended (Settled at G0) | Authoring-time structural checks across Rules, including parent guards and UTM checks. Exists in v1 returning a flat string list; the return shape changes to issues per Rule (one caller, the Author editor) |
| `buildTrackingUrl(resolvedRule, context)` | New (brief, name Proposed) | Produce UTM values and the full URL |
| `validateUtmValue(param, value, policy)` | New (brief, name Proposed) | Per-value UTM checks |
| enumerate(rule, choices) and countCombinations(rule, choices) | New (Settled at G0, release R2) | Batch build: stream every combination of chosen values through compose |

### Round-trip guarantees

The name guarantee is unchanged in meaning: for any Rule R in a valid Rule Set, `validate(resolveRule(R), compose(resolveRule(R), s).name)` passes for every selection set `s` that `compose` accepts. It is extended in two ways (Proposed):

- Parent round-trip: for a parent name P that validates against the parent Rule, `parse` of P pre-fills the child's inherited selections, and the child's composed name begins with exactly the inherited tokens of P in order.
- URL round-trip: every URL `buildTrackingUrl` returns parses with the platform `URL` API, contains each mapped `utm_*` parameter exactly once, and each decoded value passes `validateUtmValue`; `utm_campaign` decodes to exactly the built campaign name.

All three are Vitest property-style tests over small generated fixtures, alongside the existing per-violation tests. The suite must stay green after every change (Settled).

### Why a runtime guard on unresolved Rules (Settled at G0, departs from brief)

The brief says `compose` and `validate` are otherwise unchanged and operate on the resolved Rule. That leaves a silent failure: any caller that forgets `resolveRule` will validate an ad group name against the child's own segments only, and every correct name will fail on token count. The fix is one check in each function: if `rule.parent` is set, `compose` reports it in `errors` and `validate` returns `valid: false` with one violation on the name, each stating the Rule must be resolved first. Neither throws (amended at G0): the CSV checker calls `validate` once per row with no error handling, so a throw would end the whole check instead of reporting one Rule. `enumerate` and `countCombinations` apply the same guard and return the same error. The alternative, a separate `ResolvedRule` type, catches it at compile time but adds a second near-identical type the team must keep in step. Given the plain-TypeScript constraint, the runtime guard plus a test is the better trade.

### Data model

The Rule Set document still stores its Rules inline in `/rulesets/{ruleSetId}`, with array order as segment position and no stored index (Settled). Two optional fields are added to `Rule`; nothing else in the v1 types changes.

```ts
type ParentLink = {
  ruleId: string;              // immutable id of a Rule in the SAME Rule Set
  inheritSegmentIds: string[]; // immutable segment ids on the parent's RESOLVED segments
};

type UtmSource =
  | { kind: "ruleName"; ruleId: string }   // built name of this Rule or an ancestor
  | { kind: "segment"; segmentId: string } // one value in this Rule's resolved segments
  | { kind: "tag"; ruleId: string; tag: "platform" | "entityType" }
  | { kind: "literal"; value: string };    // fixed text, e.g. "cpc"

type UtmMapping = {
  source: UtmSource;       // utm_source, required
  medium: UtmSource;       // utm_medium, required
  campaign: UtmSource;     // utm_campaign, required, must be kind "ruleName"
  content?: UtmSource;
  term?: UtmSource;
  baseUrl?: string;        // default base URL
  baseUrlEditable: boolean;
  casePolicy: "asIs" | "lower";
};

type Rule = {
  id: string;
  key: string;
  name: string;
  tags?: { platform?: string; entityType?: string };
  delimiter: string;
  segments: Segment[];     // the Rule's OWN segments only
  source: Source;
  parent?: ParentLink;     // new
  utm?: UtmMapping;        // new
};
```

Example fragment of a child Rule as stored:

```json
{
  "id": "r_03", "key": "google_ad_groups", "name": "Google Ad Groups",
  "tags": { "platform": "google", "entityType": "ad_group" },
  "delimiter": "_",
  "parent": { "ruleId": "r_01", "inheritSegmentIds": ["s_01", "s_02"] },
  "segments": [
    { "id": "s_10", "kind": "enum", "key": "targeting", "label": "Targeting",
      "required": true, "allowedValues": ["broad", "exact"] }
  ],
  "source": { "dataset": "marketing", "table": "ad_groups", "nameColumn": "ad_group_name" },
  "utm": {
    "source": { "kind": "tag", "ruleId": "r_03", "tag": "platform" },
    "medium": { "kind": "literal", "value": "cpc" },
    "campaign": { "kind": "ruleName", "ruleId": "r_01" },
    "content": { "kind": "ruleName", "ruleId": "r_03" },
    "baseUrlEditable": true, "casePolicy": "lower"
  }
}
```

### Four departures from the brief, with trade-offs

Segment references by id, not key (Settled at G0). The brief names the field `inheritSegmentKeys`. In v1, `key` is an editable slug auto-derived from the label, so relabelling a parent segment silently changes its key and breaks every child that references it. That is exactly the drift inheritance by reference was meant to prevent. Using the immutable `id` costs nothing and removes the failure. The same applies to UTM `segment` sources. `compose` selections stay keyed by `key` at runtime, which is fine because they are never stored.

UTM mapping per Rule, not per Rule Set with overrides (Settled at G0). A Rule Set default sounds less repetitive, but a Rule Set typically holds several platform chains, and a source such as "the campaign's built name" points at a different Rule in each chain. A shared default would need relative references ("root ancestor", "parent") that are harder to explain and to validate. Per-Rule mappings with explicit `ruleId`s are verbose but unambiguous. A "copy mapping from another Rule" action in Author would offset the repetition; it is a follow-up once more than one Rule per Rule Set carries a mapping, not a v2 acceptance item (amended at G0). Revisit if the client confirms one mapping genuinely applies across a whole Rule Set.

A `literal` source (Settled at G0). The brief lists built names, segments and tags as sources. `utm_medium` is almost always a fixed value such as `cpc` or `paid_social`, which none of those supply without inventing a single-value enum segment that would then appear in the name. A literal source is the honest representation. `checkRuleSet` runs `validateUtmValue` on every literal under its mapping's case policy, so a bad literal is refused at save rather than at every build (amended at G0). Whether source and medium come from a literal, a segment or the Platform tag is still Pending (client); the model supports all three.

Runtime guard on unresolved Rules (Settled at G0), explained in the engine contract above.

### Firestore implications

Parent links and UTM mappings live inline in the same document, so the whole Rule Set is still read and written as one unit and a child can never be saved without its parent being in the same write. Firestore Security Rules cannot practically detect cycles or check that inherited ids exist, so those guards run in `checkRuleSet` before every save, and `resolveRule` is defensive (it detects a cycle and returns an error rather than recursing forever) because a document could still be written by an out-of-date or hostile client. The Stage 2 Function must call `resolveRule` for the same reason.

### Engine behaviour

#### resolveRule

`resolveRule(rule, ruleSet)` returns `{ rule: Rule; errors: string[] }`, where the returned Rule has no `parent` and its `segments` are the inherited parent segments followed by the child's own. It works recursively, so a grandchild resolves its parent first and can inherit segments the parent itself inherited. The steps, in order:

1. No `parent`: return a copy of the Rule unchanged.
2. Track visited Rule ids; meeting one twice is a cycle error (brief guard). This covers a Rule naming itself.
3. Find the parent by `ruleId` in the same Rule Set; missing is an error.
4. Resolve the parent; propagate any errors.
5. Every `inheritSegmentId` must exist on the resolved parent (brief guard).
6. The inherited ids must be the first N segments of the resolved parent, in parent order (Proposed, see below).
7. The child's delimiter must equal the parent's (Proposed, see below).
8. Combine, then run the v1 structural checks on the combined list: unique keys, unique ids, optional segments only at the end.

The returned `source`, `tags` and `utm` are the child's own. The function is pure and cheap; callers resolve on demand and never store the result, so the stored document is the only source of truth.

#### Three guard choices the brief leaves open

Inherited segments form a leading run (Settled at G0). The brief says "inherited leading segments" but the data shape allows any subset. Restricting to the first N parent segments keeps the child name a literal prefix-by-tokens of the parent, which makes the future cross-level check a simple token comparison and makes names easy to read. The cost is flexibility: a client who wants to inherit `type` and `objective` but skip `market` cannot. Pending (client) through the "which levels and segments" question; relaxing it later is a guard change, not a data migration.

Delimiters must match (Settled at G0). A resolved Rule has one delimiter and parses positionally, so a campaign using `_` and an ad group using `|` cannot combine without a second parsing mode. Some teams do separate levels with a different character (for example `perf_uk_sales | broad_runners`). Supporting that means a per-join delimiter in the resolved Rule and changes to `validate`, which is real engine work. Recommend matching delimiters for v2 and asking the client.

Inherited segments must be required (Settled at G0, sharpens the brief's guard). The brief says a parent cannot be optional-before-required once combined. Since optional segments may only sit at the end of the parent, inheriting one and then adding any child segment always produces optional-before-required. Stating the rule as "only required parent segments can be inherited" is equivalent in practice and far easier for an author to understand.

#### Parent step

The web app calls `parse(resolvedParent, parentName)`. A failed parse surfaces the parent's violations and stops. A successful parse yields selections keyed by segment `key`; the app copies the inherited ones into the child's selections and renders those controls locked. `compose` on the resolved child then produces the name. Nothing about this touches `validate`, which is why the checker needs no change beyond resolving first.

Override of inherited values defaults to not allowed (Proposed default, Pending (client)). Allowing override breaks the property that a child's leading tokens always match its parent, and it lets `utm_campaign` (the real campaign) disagree with the prefix of `utm_content` (the ad group). If the client needs it, it should be an explicit per-Rule flag, logged in the UI as an override.

#### Ancestor names for UTMs (Open)

This is a gap in the brief. For a two-level chain the parent step already holds the campaign name. For a three-level chain (campaign, ad group, ad), the ad build only receives the ad group name, which contains the campaign's inherited segments but not the campaign's full name if any campaign segment was not inherited. `utm_campaign` then has no value to read. Two options:

- Ask for every ancestor name the UTM mapping references, validate each against its Rule, and check that inherited tokens agree between them. This is consistency among names the user typed, not validation against real campaigns, so it stays inside the brief's scope. Recommended.
- Require a chain's leaf Rule to inherit every segment of the campaign Rule, so the campaign name is recoverable from the ad group prefix. Simpler, but it forces long names on every level.

#### buildTrackingUrl and validateUtmValue

`buildTrackingUrl(resolvedRule, context)` takes the resolved Rule, the built names of the Rule and its ancestors keyed by Rule id, the selections, the Rule Set (for tags) and the base URL. It resolves each mapped source to a string, validates each value, and builds the URL with the standard `URL` and `URLSearchParams` APIs. It never transforms a value: if a value breaks the case policy, the result is an error, not a silently lowercased value, because a transformed `utm_campaign` would no longer equal the campaign name (brief requirement).

Value rules (Settled at G0, defining the brief's "URL-safe, no spaces, consistent case"):

- Non-empty after resolution; a missing optional parameter is omitted, not sent blank.
- Characters limited to the RFC 3986 unreserved set: letters, digits, `-`, `.`, `_`, `~`. With this set no percent-encoding ever happens, so the value in the URL is byte-identical to the name. The cost is that names using `|`, `+`, `&` or spaces cannot feed a UTM. Pending (client) through a question on current delimiters.
- `casePolicy: "lower"` fails on any uppercase letter; `"asIs"` accepts mixed case. Analytics tools treat case as distinct, so `lower` is the recommended default.
- `utm_campaign` must come from a `ruleName` source whose `ruleId` is the Rule itself or an ancestor. Equality with the built campaign name then holds by construction, and a test asserts it.
- Authoring-time check (amended at G0): `checkRuleSet` checks the delimiter and every enum value and literal of each Rule a mapping references against that mapping's character set and case policy. A convention that can never produce a URL, for example an uppercase enum value under `lower` or a pipe delimiter, is refused in Author rather than at every build. Freeform values are still checked at build.

Base URL rules (Settled at G0): absolute `https` or `http` URL; existing non-UTM query parameters and any `#fragment` are preserved; a base URL that already contains any `utm_` parameter is rejected rather than merged, because silently replacing a hand-set UTM is worse than asking.

#### checkRuleSet

`checkRuleSet(ruleSet)` runs before every save and returns issues per Rule: the v1 authoring checks, `resolveRule` errors for every Rule, and UTM mapping checks (required parameters present, every referenced `ruleId` is self or an ancestor, every `segmentId` exists on the resolved Rule, campaign source kind is `ruleName`). A helper `dependentsOf(ruleSet, ruleId, segmentId?)` powers the Author screen's delete protection. Putting these in `@taxo/shared` rather than the editor keeps the Stage 2 Function able to reject a malformed Rule Set with the same logic.

#### enumerate and countCombinations (Settled at G0, added 22 Sep 2026)

Batch build is two pure functions in `@taxo/shared`, so the round-trip guarantee covers it without a new test class: every row is produced by `compose`, so every row passes `validate`.

```ts
type BatchChoices = Record<string, string[]>; // segment key -> values to use
// For an optional segment, include the empty string "" to mean "omit".

function countCombinations(rule: Rule, choices: BatchChoices): number;

function* enumerate(rule: Rule, choices: BatchChoices):
  Generator<{ selections: Record<string, string>; name: string }>;
```

Rules of the functions:

- Both require a resolved Rule and reject one with `parent` set, like `compose` and `validate`.
- Every required segment must have at least one value in `choices`; every value is validated against its segment before generation starts (enum membership, freeform length and characters), so one bad freeform line fails fast rather than on row 40,000.
- `countCombinations` is the product of the list lengths, less the omitted-optional combinations described below, and runs in constant time; the UI calls it on every change for the live count and for the cap check.
- Optional segments (amended at G0): an omitted value for an optional segment in one row implies every later optional segment is omitted in that row, matching the optional-gap rule in `compose`. `countCombinations` and `enumerate` both exclude the other combinations, so the live count equals the rows generated and every row passes `validate`.
- Release (amended at G0): batch ships as release R2 after P12 is answered. The engine functions may land earlier, but nothing in release R1 depends on them. The 50,000-row cap is a web-app constant, revisited under P13.
- `enumerate` is a generator that walks the product in segment order (first segment slowest). It holds one row at a time, so memory is bounded by whatever the caller keeps; the CSV writer streams rows into a Blob and never holds the full array in React state.
- Inherited segments on a child Rule always have exactly one value, the one parsed from the parent name; the UI passes them as single-item lists and locks the controls.
- The tracking URL per row is `buildTrackingUrl` applied to each row's selections, unchanged.

Ordering is deterministic, so the same choices always produce the same file; a test asserts this and the count. The cap is enforced in the web app, not the engine, so the Stage 2 Function could reuse `enumerate` at a different limit if ever needed.

### UI changes

The shell is unchanged: Author, Build and Check in the top navigation, with the selected Rule Set and Rule carried across all three and restored after refresh (Settled). Wireframe-level treatment, native HTML, one stylesheet (Settled).

- Rule picker: shows child Rules indented under their parent so the chain is visible. Selection still stores one Rule id.
- Author: a Parent select and inherit checklist on each Rule; inherited segments shown read-only above the Rule's own; a UTM mapping panel with one row per parameter (source kind select plus a value picker) and base URL settings; delete protection driven by `dependentsOf`.
- Build: a Parent step above the segment controls for child Rules; locked inherited controls; an output panel showing the name, then the URL and a per-parameter validation list.
- Build chaining: "Build child under this" appears after a valid build when the Rule has children. It is the one place the app changes the persistent Rule selection on the user's behalf, which is acceptable because it is an explicit action; the browser regression test for context persistence is extended to cover it.
- Check: no visible change beyond child Rules appearing in the picker.

### UX states

The v1 spec defined no empty, loading or error states. This table closes that gap for v1 and v2 together (Proposed throughout).

| Screen | State | Behaviour |
| --- | --- | --- |
| All | Firestore loading | Picker and workspace show a single "Loading" line; actions disabled |
| All | Firestore unreachable or permission denied | Inline banner with the error; last loaded Rule Set stays readable, saves disabled |
| All | Signed out | Sign-in screen only; persistent context restored after sign-in |
| All | No Firebase config | In-memory mode banner: "Changes are not saved" (Settled fallback, banner Proposed) |
| All | Stored Rule id no longer exists | Clear the Rule selection, keep the Rule Set, show a one-line notice |
| Author | Empty Rule Set | Prompt to add the first Rule |
| Author | Save blocked by `checkRuleSet` | Issues listed per Rule with a link to each; save disabled |
| Author | Delete blocked by dependents | Dialog naming dependent Rules and the segments or mappings involved |
| Author | Save conflict (someone else saved first) | Save refused with a message to reload and reapply; delivered in migration Phase 6 |
| Build | Rule has no segments | Message pointing to Author |
| Build | Rule fails `resolveRule` (broken parent) | Resolution errors shown; building disabled |
| Build | Pasted parent fails validation | Parent's violations listed; child controls hidden |
| Build | UTM mapping incomplete or base URL missing | Name still copyable; URL panel shows what is missing |
| Build | A UTM value fails validation | That parameter flagged with the reason; URL copy disabled |
| Check | CSV parse error or missing column | Error with row number; results hidden |
| Check | Empty CSV | Message, no zero-percent figure |
| Check | Stage 2 scan truncated | Exact counts shown, list marked truncated, export offered (Settled) |
| Check | Live scan before Stage 2 | Disabled placeholder (Settled) |

### Storage and auth (Settled, with one v2 addition)

All storage calls stay behind `apps/web/src/data/store.ts`, with Firestore via the Firebase Web SDK, configuration from environment variables, and an in-memory fallback when no config is present. Firebase Auth with Google sign-in. Firestore Security Rules: authenticated users read all Rule Sets; create and update only where `ownerId == request.auth.uid`.

Security Rules can only check coarse shape on write, because the rules language cannot loop over list elements: `rules` is a list under a size cap, `ownerId` is unchanged on update, timestamps are present. Everything about individual Rules, including parent links and UTM mappings, stays in `checkRuleSet`, for the reason given under Firestore implications.

Concurrent edits (Settled, delivered in migration Phase 6). A Rule Set is one document, so two people saving different Rules in the same Rule Set would overwrite each other, last write wins. Parent links make this more harmful, since one person can remove a segment another's child just started inheriting. v1 ownership (only the owner writes) limits it to one person in two tabs. The fix is in place: `store.ts` updates inside a transaction that refuses the save when `updatedAt` has changed since load, and a Playwright test covers the conflict.

### Stage 2 scan (Settled, with v2 implications)

`scanCampaigns` is unchanged in shape: authenticated Callable, reads the chosen Rule's `source`, `SELECT DISTINCT nameColumn` with the optional parameterised filter, identifiers whitelisted against `^[A-Za-z0-9_]+$`, service account with `bigquery.dataViewer` and `bigquery.jobUser` only, exact counts over the full scan, results capped near 5,000 with a `truncated` flag, esbuild bundle inlining `@taxo/shared`. The All Rules figure uses the same `rollup` as the CSV checker.

The v2 change: the Function must load the whole Rule Set and call `resolveRule` before `validate`, never validate a stored child Rule directly. The runtime guard in `validate` makes forgetting this fail loudly rather than report every ad group as invalid.

Stage 2 items the brief names for later, recorded so they are not lost: cross-level validation against real campaign names, hierarchy from warehouse parent relationships, a parent picker fed by scanned campaign names, and checking UTMs in live landing URLs. Each needs its own decision on data source and scope. Separately, v1 already deferred dirty platform names (appended ids, " - Copy" suffixes); inheritance makes normalisation more likely to be needed, because one dirty campaign name now affects every ad group check under it once cross-level validation arrives.

## Part C: Delivery and operations

None of this section is decided in the source files; everything here is Proposed or Open. The targets are set for an internal tool with a small user base, and should be revised once the client states user numbers and support expectations.

### Non-functional targets (Proposed)

| Area | Target |
| --- | --- |
| Build responsiveness | Name, URL and validation update within 100 ms of each keystroke |
| CSV check | 50,000 rows validated client-side in under 10 s on a standard laptop, with a progress indicator; files above 50 MB rejected with a message |
| Rule Set size | Soft cap of 50 Rules and 5,000 enum values per Rule Set, far inside Firestore's \~1 MiB document limit; warn at 80% |
| Chain depth | Maximum 4 levels (campaign, ad group, ad, creative); deeper is almost certainly a modelling error |
| Browsers | Current Chrome, Edge, Firefox and Safari; no mobile layout commitment |
| Accessibility | Every control labelled and keyboard operable; validation messages announced, not colour-only |
| Availability | Inherits Firebase managed service levels; no separate SLA (Open: confirm client expects none) |

### Operations

- Environments (Open): v1 assumes BigQuery in the same GCP project as the app. A separate dev Firebase project would have no BigQuery data, or a copy of it. Decide between one project with a dev hosting channel, or two projects with a sample dataset in dev.
- Backups (Settled at G0): enable Firestore point-in-time recovery and delete protection on the production database. Rule Sets are small, high-value configuration, and versioning is deferred, so recovery is the only undo for a bad edit. Both were disabled on 24 September 2026; switching them on is a live GCP change made in its own step with explicit approval.
- Audit trail (Settled at G0): write `updatedBy` alongside `updatedAt` on every save, enforced in Security Rules as the caller's uid. This is not versioning, which stays deferred, but it answers "who changed the campaign Rule" once parent edits start affecting child compliance.
- Monitoring (Proposed): Cloud Logging and error alerting on `scanCampaigns`; web errors logged to the console only in v2, to avoid a new dependency.
- Ownership and support (Open): who deploys, who fixes, who answers user questions once the build team hands over.

### CI (Proposed; CI host Open)

On every pull request: `pnpm install --frozen-lockfile`, the full TypeScript check, `pnpm -r test` (Vitest, including the new round-trip tests), Playwright browser regression tests against a Vite preview build, and Security Rules tests against the Firestore emulator. The last needs `@firebase/rules-unit-testing` as a dev dependency; the justification is that the ownership rule is the app's only access control and is otherwise untested. On merge to main: the same checks, then `firebase deploy` of Hosting and rules, and in Stage 2 the esbuild-bundled Function. The source files do not name a CI host; GitHub Actions is the likely default.

### Cost

Hosting, Auth and Firestore costs are negligible at internal-tool scale. Stage 2 needs the Firebase pay-as-you-go plan, because Cloud Functions require it. BigQuery on-demand queries bill by bytes scanned, and `SELECT DISTINCT` on one column reads only that column, so a scan is cheap unless the name column is very large or scanned often. Proposed controls: set `maximumBytesBilled` on every scan query so a misconfigured `source` fails instead of billing, and set a GCP budget alert. The monthly budget figure is Open.

### Risks

| Risk | Likelihood | Impact | Mitigation |
| --- | --- | --- | --- |
| Client's existing ad group names do not repeat campaign segments, so every live ad group fails the new child Rule | Unknown until asked | High | Ask before building; if true, the client must choose between renaming and a non-inheriting ad group Rule |
| A parent edit silently changes what every child accepts, making previously valid names invalid | High | Medium | Warning on parent enum edits, `updatedBy`, point-in-time recovery; versioning stays deferred |
| Pasting a legacy campaign name blocks ad group builds during migration | Medium | Medium | Clear violation display; override question with client |
| Unreserved-only UTM characters clash with current delimiters such as the pipe character | Medium | High | Ask client; fallback is percent-encoding with an agreed definition of "equals" |
| Three-level chains cannot produce `utm_campaign` without the campaign name | Certain for 3 levels | High | Collect referenced ancestor names at build time (Open decision) |
| Concurrent saves overwrite each other | Low in v1 | Medium | `updatedAt` transaction check |
| Added engine complexity exceeds the maintaining team's comfort with the codebase | Medium | Medium | All new logic in pure functions with tests; no UI-side logic; short comments at each seam |

### Testing additions

Vitest in `@taxo/shared`: `resolveRule` for no parent, one level, two levels, cycle, self-parent, missing parent, missing inherited id, non-leading inherited ids, delimiter mismatch, inherited optional segment, key collision; the runtime guard on unresolved Rules; the parent round-trip; `buildTrackingUrl` for each source kind, missing optional parameter, case policy failure, disallowed character, base URL with existing query, fragment and existing `utm_`; the URL round-trip; `checkRuleSet` UTM mapping checks; `dependentsOf`. Playwright: continuous typing in the new UTM and parent fields (the focus-loss bug class from the prototype), and persistent context across the Build chaining action and refresh.

## Acceptance criteria

The v1 list (from spec v1, item 9 updated for the decision to keep Tailwind) and the five v2 additions from the spec v2 build order. Together they are the definition of done for Stage 1, v2 and Stage 2.

1. A Rule authored in the UI is stored in Firestore and immediately drives the builder and both checker paths with no code change.
2. The builder cannot produce an invalid name for the selected Rule.
3. Round-trip: any builder output is marked valid by the checker for that Rule.
4. CSV validation runs fully client-side with no BQ access.
5. Switching between Author, Build, and Check keeps the same Rule Set and Rule selected.
6. On-demand scan reads the selected Rule's `source`, scans `SELECT DISTINCT`, applies the optional filter, validates against that same Rule, and returns exact counts plus a capped annotated list, with identifiers whitelisted and filter values parameterized.
7. `compose` and `validate` live only in `@taxo/shared`, never duplicated.
8. Segment keys are unique within a Rule; enum matching is exact and case-sensitive.
9. pnpm workspaces; Tailwind kept by decision, no component library, no state library; TypeScript used plainly.
10. A child Rule authored in the UI drives Build and Check with no code change, and its names validate against its resolved segments.
11. Author rejects cycles, missing inherited segments, non-leading or optional inherited segments, delimiter mismatch and key collisions.
12. Deleting a parent segment or Rule with dependents is blocked; relabelling is not.
13. The parent, name and URL round-trip tests pass.
14. Every built URL's `utm_campaign` equals the built campaign name byte for byte.

## Decisions log

Thirty-three decisions are recorded: 31 Settled, 2 Reversed. D24 to D33 were Proposed by this spec and settled at Gate G0 on 24 September 2026: D24, D28 and D29 as written, the rest with the amendments in the Gate G0 record below.

| # | Decision | Status | Source |
| --- | --- | --- | --- |
| D1 | One shared engine in `@taxo/shared`; never duplicated in web or functions | Settled | CLAUDE.md, spec v1 |
| D2 | Round-trip guarantee: any composed name validates against the same Rule | Settled | CLAUDE.md |
| D3 | Terminology Rule Set, Rule, Segment used everywhere | Settled | CLAUDE.md |
| D4 | Enum (exact, case-sensitive) and freeform (`maxLength`, `illegalChars`) segments; delimiter always illegal in values | Settled | spec v1 |
| D5 | Array order is position; no stored index; immutable `id` plus editable `key` | Settled | CLAUDE.md |
| D6 | Optional segments only at the end; positional parsing | Settled | CLAUDE.md |
| D7 | Action-first UI with persistent Rule Set and Rule context across actions and refresh | Settled | CLAUDE.md |
| D8 | Pooled All Rules rollup via one `rollup` function, shared by CSV and Stage 2; strict per-row view secondary | Settled | CLAUDE.md step 1 |
| D9 | Per-Rule BigQuery `source` with optional filter; Stage 1 stores only | Settled | spec v1 |
| D10 | Stage 2 scan: read-only Callable, `SELECT DISTINCT`, whitelisted identifiers, parameterised filter, exact counts, capped list | Settled | spec v1 |
| D11 | pnpm workspaces; no Turborepo or Nx; esbuild bundle for the Function | Settled | CLAUDE.md |
| D12 | Firestore plus Google sign-in; owner-only writes | Settled | CLAUDE.md, brief |
| D13 | Plain TypeScript, `useState` only, no CSS framework or component library | Settled | CLAUDE.md |
| D14 | Scheduled scanning, roles, versioning, approvals, exceptions list deferred | Settled | CLAUDE.md |
| D15 | Rules may have a parent in the same Rule Set; inheritance by reference at build time | Reversed | Brief (was: Rules independent) |
| D16 | Cross-level validation and warehouse-derived hierarchy out of scope | Settled | Brief |
| D17 | `resolveRule` flattens a child; `compose` and `validate` run on the resolved Rule | Settled | Brief |
| D18 | Guards: no cycles, inherited segments exist on parent, valid combined ordering | Settled | Brief |
| D19 | Build outputs a full tracking URL; UTM values validated; `utm_campaign` equals built campaign name exactly | Settled | Brief |
| D20 | Checking UTMs in live landing URLs is Stage 2 | Settled | Brief |
| D21 | Rule Sets may contain parent links; independence no longer a system rule | Reversed | Brief |
| D22 | Checker unchanged apart from resolving child Rules first | Settled | Brief |
| D23 | All UTM logic lives in `@taxo/shared` and has its own round-trip test | Settled | Follows from D1 |
| D24 | Parent links and UTM sources reference segment `id`, not `key` | Settled | G0, 24 Sep 2026 (departs from brief) |
| D25 | `compose`, `validate`, `enumerate` and `countCombinations` refuse a Rule with `parent` set as an error result; none of them throws | Settled | G0, 24 Sep 2026, amended (departs from brief) |
| D26 | UTM mapping per Rule with explicit `ruleId`s; a "copy mapping" action in Author is a follow-up, not a v2 acceptance item | Settled | G0, 24 Sep 2026, amended (departs from brief) |
| D27 | `literal` UTM source type; `checkRuleSet` validates every literal under its mapping's case policy at save | Settled | G0, 24 Sep 2026, amended (extends brief) |
| D28 | Inherited segments are the first N required segments of the parent | Settled | G0, 24 Sep 2026; P6 may relax it |
| D29 | Child delimiter must equal parent delimiter | Settled | G0, 24 Sep 2026; P7 may relax it |
| D30 | UTM values: unreserved characters only, no transformation, case policy per mapping, base URL with `utm_` rejected; `checkRuleSet` refuses at save a delimiter, enum value or literal that the mapping's policy could never emit | Settled | G0, 24 Sep 2026, amended |
| D31 | `updatedAt` save check delivered in migration Phase 6; v2 adds `updatedBy` enforced in Security Rules, and enables point-in-time recovery and delete protection on the production database | Settled | G0, 24 Sep 2026, amended |
| D32 | Batch mode in Build: Cartesian product of chosen values per segment, streamed by enumerate in @taxo/shared, CSV output, 50,000 row cap in the web app; ships as release R2 after P12, cap revisited under P13 | Settled | Fela, 22 Sep; G0, 24 Sep 2026, amended |
| D33 | Freeform segments in a batch take a user-supplied value list; optional segments offer include, omit or both, where an omitted optional implies every later optional is omitted in that row and the count excludes the rest; a child batch runs under one parent name | Settled | G0, 24 Sep 2026, amended |

The two Reversed entries replace the v1 statement "Rules are independent: no inheritance, no cross-Rule validation". Only the first half is reversed; cross-Rule validation remains out of scope.

### Gate G0 record (24 September 2026)

Reviewed against the code as deployed after migration Phase 7. Each decision was checked for what it forecloses and whether the code conflicts with it; no code conflicts were found with any of the ten, and the amendments below close gaps the review surfaced. Rulings by Fela.

- D24 accepted. The Author editor rewrites a segment's `key` on every label keystroke, so key-based references would break on any relabel. CLAUDE.md already records id-based references.
- D25 amended. Error results instead of a throw, because `validate` has never thrown and the CSV checker calls it per row with no error handling. The same guard covers `enumerate` and `countCombinations`.
- D26 amended. The "copy mapping" Author action is deferred to a follow-up.
- D27 amended. Literals are validated by `checkRuleSet` at save under the mapping's case policy.
- D28 accepted. Every Rule must have at least one own segment, so "required only" is equivalent to the brief's guard. Keeping the id array rather than a count makes a parent reorder a detectable error.
- D29 accepted. Author must lock the child's delimiter to the parent's; today each Rule chooses freely.
- D30 amended. Enum values are case-sensitive and no transformation is allowed, so an uppercase enum value under `lower`, or a delimiter outside the unreserved set, would make every build fail; `checkRuleSet` refuses such a convention at save.
- D31 amended. The `updatedAt` check is already done. `updatedBy` is absent from the types, the store and the rules; point-in-time recovery and delete protection are both disabled on the production database, verified with gcloud on 24 September 2026. Enabling them is a live change done in its own step.
- D32 amended. Bound to release R2 after P12, matching the CLAUDE.md build order; the cap is a web constant under P13.
- D33 amended. "Both" on an optional segment collided with the optional-gap rule in `compose`; an omitted optional now implies every later optional is omitted, and the count excludes the rest.

The four departures from the scope-change brief are acknowledged: segment references by `id` rather than `key` (D24), the runtime guard on unresolved Rules (D25), UTM mappings per Rule rather than per Rule Set (D26), and the `literal` UTM source (D27).

Two engine changes outside the ten, recorded here for the build order: `parse` today is a plain split that cannot fail, and the parent step needs one that returns selections keyed by `key` and reports violations (build step 5); `checkRuleSet` exists already returning a flat string list, and build step 3 changes it to issues per Rule. Proposed labels outside D24 to D33 (the UX states table, non-functional targets, CI and monitoring) were not gated by G0 and keep their status.

## Decisions pending

Thirteen questions need the client and ten need an internal decision. Each has a default so work can start; the default is what gets built if no answer arrives before that part is reached. P1, P5 and P7 should be asked first, because a bad answer to any of them changes the data model rather than a setting.

### Pending (client)

| # | Question | Blocks | Default if unanswered |
| --- | --- | --- | --- |
| P1 | Which levels exist and nest per platform: campaign, ad group, ad set, ad, creative? Terminology differs by platform | Rule templates, chain depth, NFR cap | Two levels per platform: campaign and ad group (Google) or ad set (Meta) |
| P2 | Where do `utm_source` and `utm_medium` come from: fixed per platform, a segment, or the Platform tag? | UTM mapping authoring defaults | Model supports all three; Author defaults source to Platform tag, medium to a literal |
| P3 | Is the base URL fixed per Rule Set, or entered at build time? | Build form | Default on the mapping, editable at build time unless the owner locks it |
| P4 | Can a child Rule override an inherited segment, or only inherit it? | Parent step, D28 | Inherit only, locked |
| P5 | Do existing live ad group names already repeat the campaign's leading segments? | Whether inheritance fits current data at all | Assume yes; if no, every existing ad group fails the child Rule |
| P6 | Which campaign segments should each child inherit, and are they always the leading ones? | D28 | First N required parent segments |
| P7 | Do all levels share one delimiter, and do current names use characters such as pipe, plus, ampersand or spaces? | D29, D30 | One delimiter per chain; unreserved characters only in UTM values |
| P8 | What case convention should UTM values follow? | Case policy default | Lowercase enforced |
| P9 | Must users be able to build an ad group under an existing campaign whose name is non-compliant? | Parent step behaviour | No; non-compliant parent blocks the build |
| P10 | Do teams currently use platform dynamic macros for UTMs (for example a campaign-name macro in Meta URL parameters)? | Value of UTM output; risk of conflicting parameters | Tool outputs hardcoded values only |
| P11 | Which UTM parameters are required, and is `utm_term` used (for example for keywords)? | Mapping validation | Source, medium, campaign required; content and term optional |
| P12 | What is the batch output used for: a reference list of permitted names, or bulk upload into a platform editor or bulk sheet? If upload, which platforms and templates? | Batch CSV columns; whether per-platform export is a separate feature | Generic CSV: one column per segment, name, tracking URL |
| P13 | How large is a realistic batch, and how are freeform values (custom ids, audiences) sourced today? | Row cap; freeform input design | 50,000 rows; freeform values pasted one per line |

### Open (internal)

| # | Question | Blocks | Recommendation |
| --- | --- | --- | --- |
| O1 | How does a three-level build obtain the campaign name for `utm_campaign`? | Any chain deeper than two | Collect every ancestor name the mapping references; check inherited tokens agree |
| O2 | One GCP project with a dev hosting channel, or separate dev and prod projects? | Environments, Stage 2 testing | One project plus a preview channel until Stage 2; revisit then |
| O3 | Which CI host? | CI setup | GitHub Actions |
| O4 | Who owns deployment and support after handover? | Operations | Name an owner before Stage 2 |
| O5 | Monthly GCP budget and the `maximumBytesBilled` value per scan | Stage 2 cost controls | Set from the largest name table's column size plus headroom |
| O6 | Adopt the `updatedAt` save check now or defer? | Store module | Done in migration Phase 6 (D31) |
| O7 | May any Rule carry a UTM mapping, or only leaf Rules? | Author UI | Any Rule; platforms set URLs at different levels |
| O8 | Is a maximum UTM value length needed? | UTM validation | No limit in v2; add once the client names their analytics tool's limits |
| O9 | Should a child batch span many parent names at once (ad groups across many campaigns)? | Batch parent step | One parent per batch in v2; multi-parent as a second pass once P12 is answered |
| O10 | Reply deadline for the client question pack, after which spec defaults stand | Gate G1 | Two weeks from sending; defaults confirmed in writing by Fela if unanswered |
