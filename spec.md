# Campaign Naming Taxonomy Tool: Firebase / GCP Spec

Lives at `docs/spec.md` in the repo. `CLAUDE.md` is the concise, always-loaded
companion; this is the full reference it points to.

## Purpose
A web app that lets marketing teams **author naming conventions** for campaigns, ad
groups, ad sets, and creatives, **generate compliant names** from those conventions,
and **detect non-compliant names** already in use. Everything runs on Firebase / GCP.

## Core design principle
There is **one rule model** and **one validation engine**. Everything else consumes it:

- The **authoring UI** writes a Rule Set (and its Rules) to Firestore.
- The **builder** composes a valid name from a Rule (browser).
- The **checker** validates names against a Rule, from two sources
  (live BigQuery scan, CSV upload).

`compose()` and `validate()` live in **one TypeScript package** (`packages/shared`,
imported as `@taxo/shared`). The React app imports it in Stage 1; the Cloud Function
imports the *same* package in Stage 2, no copy, no drift. This guarantees the
round-trip: any name the builder produces will pass the checker, because both run the
same code over the same Rule.

## Terminology
- **Rule Set**: the parent container. (The Replit prototype called this "Taxonomy".)
- **Rule**: one complete naming convention inside a Rule Set, aimed at one target the
  author chooses (a platform, an entity level, a creative type, or any mix), for example
  "Google Campaigns", "Meta Ad Sets", "TikTok Creatives". (Prototype: "Level".)
- **Segment**: an ordered component of a Rule's name.
- Rules are **independent**: no inheritance, no cross-Rule validation. A Rule validates
  only against its own segments.
- A "Rule" is a whole convention, not a single constraint; do not confuse it with
  Firestore Security Rules or with individual segment checks.

## Simplicity and team constraints
The team maintaining this has a **basic grasp of React**. Keep the codebase minimal and
legible so they can build on it. Non-negotiables:

- **TypeScript, used plainly.** Real types on the engine and data model (`RuleSet`,
  `Rule`, `Segment`, `Violation`); no advanced generics, conditional, or mapped types.
- **pnpm workspaces monorepo.** Kept from the prototype; do not convert to npm, and do
  not add Turborepo or Nx.
- **No CSS framework, no component library.** Native HTML elements and one small
  stylesheet. Restrained internal-console styling, easy to restyle later.
- **State: `useState` only.** No Context, Redux, reducers, or data-fetching libraries.
- **Minimal dependencies:** React, Vite, the Firebase Web SDK, PapaParse, Wouter, Vitest.
  Justify anything else.
- **Clear seams.** One job per file; short comments marking where new logic goes.

## Architecture (client-first)
Most of the app is client to Firestore with **no custom backend**. Only the BigQuery
scan is server-mediated.

- **React + Vite (plain TS) on Firebase Hosting**: authoring UI, builder, CSV checker.
- **Firestore**: stores Rule Sets (with their Rules inline). Security Rules enforce
  shape and ownership.
- **Firebase Auth**: users.
- **Callable Cloud Function (`scanCampaigns`)**: on-demand BQ scan. One service-account
  identity holds BigQuery **read only**; the browser never touches BQ directly.
- **Shared package (`@taxo/shared`)**: `compose`, `validate`, `parse`; imported by web
  and (in Stage 2) functions.

> **Scheduled write-back is deferred** (post-v1). See "Deferred". v1 is entirely
> read-only against BigQuery: no `taxonomy_violations` table, no Cloud Scheduler, no BQ
> write permission.

BigQuery data lives in the **same GCP project** as the app, so IAM is a single
project-level read grant, no cross-project access.

## Firestore data model

A **Rule Set** is the top-level object and owns its **Rules** inline. Rules are
independent: each has its own delimiter, segments, and BigQuery source.

### `/rulesets/{ruleSetId}`
```json
{
  "id": "rs_01",
  "name": "Acme UK Paid Media",
  "ownerId": "<uid>",
  "createdAt": "<ts>",
  "updatedAt": "<ts>",
  "rules": [
    {
      "id": "r_01",
      "key": "google_campaigns",
      "name": "Google Campaigns",
      "tags": { "platform": "google", "entityType": "campaign" },
      "delimiter": "_",
      "segments": [
        { "id": "s_01", "kind": "enum", "key": "campaign_type", "label": "Campaign Type",
          "required": true, "allowedValues": ["brand", "perf", "rtg"] },
        { "id": "s_02", "kind": "enum", "key": "market", "label": "Market",
          "required": true, "allowedValues": ["uk", "us", "de"] },
        { "id": "s_03", "kind": "freeform", "key": "custom_id", "label": "Custom ID",
          "required": false, "maxLength": 12, "illegalChars": [" ", "/"] }
      ],
      "source": {
        "dataset": "marketing", "table": "campaigns", "nameColumn": "campaign_name"
      }
    },
    {
      "id": "r_02",
      "key": "meta_ad_sets",
      "name": "Meta Ad Sets",
      "tags": { "platform": "meta", "entityType": "ad_set" },
      "delimiter": "_",
      "segments": [
        { "id": "s_04", "kind": "enum", "key": "targeting", "label": "Targeting",
          "required": true, "allowedValues": ["broad", "exact", "lookalike"] },
        { "id": "s_05", "kind": "freeform", "key": "audience", "label": "Audience",
          "required": true, "maxLength": 20, "illegalChars": [" "] }
      ],
      "source": {
        "dataset": "marketing", "table": "ad_sets", "nameColumn": "ad_set_name",
        "filter": { "column": "platform", "in": ["meta"] }
      }
    }
  ]
}
```

Notes:
- **Rules are independent.** `validate()` and `compose()` operate on one Rule at a time.
- **`id` vs `key`.** `id` is immutable and used for React identity and references, so
  editing a name never remounts a component. `key` is an editable slug auto-derived from
  the name. Both Rules and Segments have both.
- **Array order is the segment position.** No stored position index (it drifts out of
  sync with order). Reordering means reordering the array.
- **Segment keys must be unique within a Rule.** Enforce at authoring.
- **Two segment kinds.** `enum`: a flat list of exact `allowedValues`, stored inline;
  authors add and remove entries. `freeform`: no fixed list, bounded by `maxLength` and
  an `illegalChars` blocklist. No regex or structural validation on freeform in v1;
  anything with a required format goes in an enum.
- **Enum matching is exact and case-sensitive** against `allowedValues`.
- **The delimiter is always illegal inside any value** (enum or freeform), or parsing
  breaks. The engine enforces this; authors never list the delimiter in `illegalChars`.
  Delimiters are a single character.
- **`tags` are optional.** They enable compliance rollups by platform or entity type;
  a Rule with no tags still works everywhere.
- The document is read **whole**, so inline arrays are fine while lists stay small
  (Firestore's ~1 MiB document cap is trivially satisfied here).
- **Parsing constraint:** optional segments may only appear at the end of a Rule. Parse
  positionally; do not infer positions for missing middle segments.

### The `source` block (per Rule)
Each Rule points at its own BigQuery table, so a multi-table project is just multiple
Rules. This is also how scan **routing** is solved: pick a Rule, scan *its* table,
validate against *that same* Rule.

- `dataset` / `table` / `nameColumn`: where this Rule's names live. (`projectId` is the
  app's own GCP project, same-project, so it is implicit.)
- `filter` (optional): for a table holding names governed by different Rules.
  `{ column, in: [...] }` restricts the scan to this Rule's slice; omit it to scan the
  whole table. Two Rules may point at one table with different filters.

**Injection safety (Function-side):** `dataset`, `table`, `nameColumn`, and
`filter.column` come from Firestore, so the Function must **whitelist them against
`^[A-Za-z0-9_]+$`** and reject anything else, and pass `filter.in` values as **query
parameters**, never string-concatenated into SQL.

## The engine (`packages/shared`, `@taxo/shared`)
The types double as the contract for the Firestore document, so a malformed Rule Set is
caught at compile time. Keep them plain:
```ts
type EnumSegment = {
  id: string;              // immutable identity
  kind: "enum";
  key: string;             // editable slug, auto-derived from label
  label: string;
  required: boolean;
  allowedValues: string[];
};

type FreeformSegment = {
  id: string;
  kind: "freeform";
  key: string;
  label: string;
  required: boolean;
  maxLength: number;
  illegalChars: string[];  // delimiter is auto-enforced; not listed here
};

type Segment = EnumSegment | FreeformSegment; // array order = position

type Source = {
  dataset: string;
  table: string;
  nameColumn: string;
  filter?: { column: string; in: string[] };
};

type Rule = {
  id: string;
  key: string;
  name: string;
  tags?: { platform?: string; entityType?: string };
  delimiter: string;
  segments: Segment[];
  source: Source;
};

type RuleSet = {
  id: string;
  name: string;
  rules: Rule[];
};

type Violation = { segmentKey: string; token: string; reason: string; suggestion?: string };

function compose(rule: Rule, selections: Record<string, string>):
  { name: string; errors: string[] };   // selections keyed by segment.key

function validate(rule: Rule, name: string):
  { valid: boolean; violations: Violation[] };
```
`validate` splits `name` on the Rule's delimiter, checks the token count is between the
required count and the total count, then per segment: **enum** requires the token to be
in `allowedValues` (exact); **freeform** requires length within `maxLength` and no
`illegalChars` (and never the delimiter). Near-match suggestions for enums are a
nice-to-have.

The package ships with Vitest tests covering: a valid name passes, each violation type
fails with the right reason, the round-trip (compose then validate) holds, duplicate
keys, and invalid required/optional ordering. Keep them green.

## Feature 1: Rule Set authoring UI (the headline feature)
- Create and edit a **Rule Set**: set its name; add one or more **Rules**.
- Per Rule: set its name, optional tags (platform, entity type), and **delimiter**
  (once, up front). Add segments in order (order = position); reorder and remove them.
  Each segment has a name (`label`) and a **kind**:
  - **Enum**: author maintains the `allowedValues` list (add and remove entries).
  - **Freeform**: author sets `maxLength` and any `illegalChars`.
- Mark each segment required or optional; enforce "optional-only-at-end" per Rule.
- Enforce **unique segment keys within a Rule**.
- Reject any value or illegal-char choice that would let the delimiter appear in a value.
- Add each Rule's BigQuery **source** (dataset, table, name column, optional filter),
  labelled as used for live scanning in Stage 2.
- Save to Firestore (`key`s auto-slugged from names; `id`s immutable). List and open
  existing Rule Sets.

## Feature 2: Builder (compose, browser-only)
- Uses the persistent Rule Set and Rule context. Render one control per segment in
  order: **enum** shows a dropdown of `allowedValues`; **freeform** shows a text input
  validated live against `maxLength`, `illegalChars`, and the delimiter.
- Live-preview the composed name; copy button, disabled until all required segments
  are valid.

## Feature 3: Checker (validate, two inputs)
Both inputs call the same `validate()`.

1. **CSV upload (browser-only, no backend):** upload or paste a file, map the column
   holding the name, validate every row client-side against the selected Rule, show
   pass or fail with reasons and suggested fixes, offer a downloadable results CSV.
2. **On-demand BQ scan (`scanCampaigns` Callable, Stage 2):** the Function reads the
   selected Rule's `source`, queries **`SELECT DISTINCT nameColumn`** (deduping snapshot
   rows) with the optional `filter`, validates each distinct name against that same
   Rule, and returns:
   ```ts
   {
     scanned: number,   // distinct names checked; counts computed over the FULL scan
     valid: number,
     invalid: number,
     results: { name: string; valid: boolean; violations: Violation[] }[], // capped
     truncated: boolean // true if results were capped; counts remain exact
   }
   ```
   The UI shows overall **percent compliant** (`valid / scanned`, always exact) plus the
   browsable pass/fail list. Cap `results` at ~5,000 rows; above that set
   `truncated: true` and offer an export rather than loading everything into React
   state. The scan only ever `SELECT`s the name column.

**"All Rules" rollup:** the Check screen offers an "All Rules" option that runs every
Rule in the Rule Set and combines the counts into a Rule Set-wide compliance figure. With
`tags` present, the same counts can be grouped by platform or entity type.

## UI structure: action-first with persistent context
Top navigation is the three actions. The Rule Set and the selected Rule are persistent
context carried across all three; they are not re-picked inside each action.

```
[ Rule Set: <dropdown> ]                                  (persists)
  Author  |  Build  |  Check                              (top nav)
[ Rule: <dropdown of Rules in this Rule Set> ]            (persists)
  <workspace for the chosen action and Rule>
```
Switching action keeps the same Rule Set and Rule selected. The workspace is identical
at every Rule; only the segments and source differ.

## Security and IAM
- **Firestore Security Rules:** authenticated users read Rule Sets in the workspace;
  create and update allowed where `ownerId == request.auth.uid`. (Single-workspace v1;
  multi-tenant isolation and role separation are deferred.)
- **Function service account:** `roles/bigquery.dataViewer` + `roles/bigquery.jobUser`.
  **Read-only**; no write role in v1.
- `scanCampaigns` requires an authenticated caller (`context.auth`).

## Project structure (pnpm workspaces monorepo)
```
pnpm-workspace.yaml        # packages/*, apps/*, functions
package.json
tsconfig.base.json         # strict but plain; each package extends it
firebase.json              # Hosting + Firestore rules (+ Functions in Stage 2)
firestore.rules

/packages/shared           # @taxo/shared: the engine, framework-agnostic
  src/index.ts             # types + compose / validate / parse
  src/*.test.ts            # Vitest

/apps/web                  # React + Vite app (imports @taxo/shared)
  src/data/store.ts        # ALL storage access (Firestore, in-memory fallback)
  src/lib/firebase.ts      # Firebase init
  src/components/
    RuleSetEditor.tsx      # Feature 1: author a Rule Set and its Rules
    RuleSetList.tsx        # list / open Rule Sets
    Builder.tsx            # Feature 2
    CsvChecker.tsx         # Feature 3a
    ScanResults.tsx        # Feature 3b (Stage 2)
  src/App.tsx              # action-first shell with persistent context

/functions                 # Stage 2 only: Cloud Function (imports @taxo/shared)
```

**Stage 2 packaging decision (pre-made):** bundle the Function with esbuild via a
`firebase.json` predeploy step, inlining `@taxo/shared` into a single deployable file.
pnpm's symlinked `node_modules` makes this essential; do not rely on hoisting.

## Acceptance criteria
1. A Rule authored in the UI is stored in Firestore and immediately drives the builder
   and both checker paths with **no code change**.
2. The builder cannot produce an invalid name for the selected Rule.
3. **Round-trip:** any builder output is marked valid by the checker for that Rule.
4. CSV validation runs fully client-side with no BQ access.
5. Switching between Author, Build, and Check keeps the same Rule Set and Rule selected.
6. On-demand scan reads the selected Rule's `source`, scans `SELECT DISTINCT`, applies
   the optional filter, validates against that same Rule, and returns exact counts plus a
   capped annotated list, with identifiers whitelisted and filter values parameterized.
7. `compose` and `validate` live only in `@taxo/shared`, never duplicated.
8. Segment keys are unique within a Rule; enum matching is exact and case-sensitive.
9. pnpm workspaces; no CSS framework, no state library; TypeScript used plainly.

## Build order
1. Migration from the prototype (see `CLAUDE.md` checklist): rename, ids, tags,
   persistent context, Firestore, Auth, "All Rules", strip Replit config.
2. Stage 2: `scanCampaigns` Callable in `/functions` (esbuild-bundled) + read-only BQ
   IAM + scan results screen.

## Out of scope (v1)
- Natural-language name input.
- Editing platform APIs or writing corrected names back to ad platforms.
- Cross-Rule inheritance or parent-child validation. Rules are independent.
- Server-side CSV processing.

## Deferred (post-v1)
- **Scheduled write-back.** Cloud Scheduler to a `scheduledScan` Function writing to a
  `taxonomy_violations` BQ table, read by the UI and BI tools. Adds Scheduler, a
  destination table, and `roles/bigquery.dataEditor`. Reuses `validate()` as-is.
- **Governance.** (a) Rule versioning and change history: edits to `allowedValues`
  silently change what is compliant; capture `updatedBy` plus a change log, ideally
  versioned Rule Sets. (b) Roles: split "owns the convention" from "builds and checks
  against it"; `ownerId` is not a role model. (c) Full multi-tenant isolation.
  (No separate exceptions list: legacy noise is handled by a Rule's `source.filter`. A
  non-compliant name inside a checked slice still flags, intentionally.)
- **Dirty platform names.** Ad platforms append IDs and " - Copy" suffixes; a
  normalization step may be needed once real data is scanned.

## Framing note for stakeholders
The **builder prevents** bad names (valid by construction). The **checker detects** them
after the fact; it cannot rename a campaign already live in the platform. Both are
needed; they solve different halves of the problem.
