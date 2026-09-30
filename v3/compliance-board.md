# Compliance board: what fails and why, across a Rule Set

Built 2026-09-30, after every v3 release phase. Check answered "is this name valid" one Rule at
a time, and its All Rules mode answered "how many are valid" pooled. Neither answered the
question an ops user has once the number is bad: what is failing, and why. The reason data was
already in hand, typed, all the way into the browser, and was being thrown away at the point it
became useful.

Five commits on `compliance-board`, engine first, screen last.

## Step 1: violation codes in the engine

### What changed

- `packages/shared/src/engine.ts`: `Violation` gains `code: ViolationCode`, `segmentId?` and
  `detail?: ViolationDetail`. `reason` is unchanged, byte for byte, so every existing renderer
  keeps working. `VIOLATION_CODES` fixes the board order and `causeLabel` gives one wording per
  cause, in the style of `PLATFORMS` and `platformName`.
- The reason for a code at all: `reason` is a sentence with its values interpolated in, so
  `Value is longer than 40 characters.` and `Value is longer than 12 characters.` are two
  strings for one cause. Grouping by prose would have needed a regex over wording that no test
  pins.
- `segmentId` is the point of the change. `copySegment` spreads the segment, so an inherited
  segment in a resolved child Rule keeps the parent's segment id even when the child renamed the
  editable key. Grouping on the id pools the same segment across Rules; grouping on `segmentKey`
  cannot.
- `ViolationDetail` is a flat bag of optional fields, not a union keyed on `code`: plain
  TypeScript per CLAUDE.md, and JSON-safe with keys omitted rather than set to undefined. It
  carries the delimiter, the illegal character, the max length and the token's length, the
  expected and found segment counts, and how many codes the segment allows.
- Deliberately not on the violation: the allowed-code list. A `valueNotAllowed` violation
  carrying a 200-code market list on every failing row would be megabytes over the callable
  boundary, repeated per row. The screen holds the resolved Rule and looks the list up by
  `segmentId` for nothing; `detail.allowedCount` covers the "1 of 47 allowed codes" blurb.
- `getRuleErrors` returns `CodedError[]`; `ruleErrorText` flattens for `checkRule`, `compose`,
  `resolveRule` and `checkBatchChoices`, whose behaviour is unchanged.
- `unresolvedViolation` splits the parent case from the definition case. `unresolvedReason`
  stays as a one-line wrapper, so its four internal callers are untouched.
- `NAME_VIOLATION_KEY` is exported. `Builder.tsx` and `ChildBatchBuilder.tsx` stop hardcoding
  `'__name__'`.
- `validateInRuleSet(rule, ruleSet, definitions, name)` moves the resolve-then-validate step out
  of `CsvChecker`, which was synthesising a `'__rule__'` sentinel of its own. That was engine
  logic living in `apps/web`. A Rule with nothing to resolve falls through to `validate`, which
  reports its own structural problems with their own codes.

### Verified

`pnpm -r test`, `pnpm typecheck`, and all 38 Playwright specs green with no spec edited: the
change is invisible to the UI. Six new engine cases, including the one that proves the feature:
a parent and a child that renamed the inherited segment's key both report `segmentId: "s_type"`
with different `segmentKey`s.

## Step 2: the aggregator

### What changed

- `packages/shared/src/engine.ts`, a `compliance board` section next to `rollup`:
  `complianceOfRule(scan)` groups one Rule's failing names by cause, by segment and by offending
  value; `complianceBoard(perRule)` pools those across a Rule Set.
- `complianceBoard` wraps `rollup`, it does not extend it. `RuleScan` keeps its shape and the
  pooled `total`, `byPlatform` and `byEntityType` are literally `rollup`'s output. Migration
  checklist step 1 is explicit that the CSV checker and the BigQuery scan must never report
  different numbers under one label; extending `RuleScan` with a failure dimension would have
  let them drift, wrapping cannot. A test asserts the equality on the checklist's own figures
  (Rule A 1 valid + 1 invalid, Rule B 2 valid + 1 invalid, pooled 3 of 5).
- Counts and reasons are kept apart on purpose. `scanned` and `valid` are exact; `analysed` is
  the subset whose violations are available, and `partial` says the reasons are a sample. The
  screen may never compute a percentage from a partial breakdown.
- A whole-name violation contributes to `byCause` and `bySegment` but never to `byValue`: its
  token is the entire name, which would rank as noise.
- A name counts once per group however many of its violations land there, so `names` is always
  a count of names and `violations` of violations.
- `skipped` carries "the CSV has no such column" and "this Rule's scan failed". Those are not
  engine causes, so they are not `ViolationCode`s.
- `codeOf` reads `violation.code ?? "unclassified"`, the one place that copes with a violation
  from a scan service older than the codes.

### Verified

Eight new engine cases, including the `rollup` equality, the inherited-segment merge, the
partial-coverage case where `rollup.total` stays exact while `coverage.partialRules` names the
Rule, and a legacy violation bucketing as `unclassified`.

## Step 3: the scan Function aggregates over the full scan

### What changed

- `functions/src/scan.ts`: `ScanResult.breakdown`, built by `evaluateNames` over every name
  before the `RESULT_CAP` slice. One extra pass over data it already had.
- This is the honesty fix. The cap is validity-blind: it keeps the first 5,000 names in query
  order, so a breakdown built from `results` can miss every failure on a large table. The test
  places all three failures beyond the cap and asserts `breakdown.analysed === scanned` and
  `partial === false` while `results` is all valid. A second test pins the query-order bias the
  drill panel's copy describes.
- `apps/web/src/data/scan.ts`: `ScanOutcome.breakdown` is optional, so a Function deployed
  before this field is a missing field rather than a crash. The board then falls back to
  `complianceOfRule` over the capped list, which marks itself partial against the exact counts.

### Verified

Unit tests green, `pnpm --filter @taxo/functions build` clean, and `complianceOfRule` confirmed
inlined in `functions/deploy/index.js` (pnpm's symlinks make the esbuild bundling load-bearing).

### Deployed

`firebase deploy --only functions:scanCampaigns --project media-taxonomy-tool` on 2026-09-30,
BEFORE the web app, so the `unclassified` fallback never became a user-visible state. ACTIVE at
asia-south1, revision `scancampaigns-00002-tih`, update time 2026-09-30T10:09:22Z. The CLI still
ends with the known artifact cleanup policy error after a successful deploy; it is not a deploy
failure and `--force` was deliberately not passed (the cleanup policy is left as it is).

`previewImpact` was NOT redeployed: only `scanCampaigns` changed shape, and `impactOf` discards
violations, so the two functions now run different bundles with identical behaviour. Redeploy it
with the next Functions change to bring them back onto one bundle.

## Step 4: shared result pieces lifted out of Check

### What changed

`CsvChecker.tsx` was 616 lines with every result-rendering piece module-private. No behaviour
change in this step:

- `apps/web/src/lib/csv.ts`: `parseCsv`, `readCsv`, `downloadCsv`, `mappedColumns`, `sampleCsv`,
  and a new `namesForRule` factoring out the column lookup the single and all-Rules paths each
  had their own copy of. That lookup is where "missing mapped column" is decided, so both
  screens now decide it identically. Parsing stays in the browser.
- `apps/web/src/components/results.tsx`: `percent`, `ModeButton`, `StatusPill`, `CountCard`,
  `TagBreakdown`, a `ResultsTable` shell for the card-with-scrolling-table shape, and one
  `EmptyState` replacing the block that was copy-pasted across Builder and Check twice.
- `apps/web/src/components/styles.ts`: the class strings themselves, which is where CLAUDE.md
  says shared ones live.
- `apps/web/src/data/scan.ts`: `scanRuleSet`, the sequential per-Rule live scan lifted verbatim,
  because all Function calls go through that module and the board must not grow its own loop.

No `scanRuleSet` Cloud Function was added: N BigQuery queries in one invocation would lose the
per-Rule partial results and per-Rule error messages the live view already shows.

### Verified

All 38 Playwright specs pass with no spec edited. That was the acceptance criterion for
isolating this step.

## Step 5: the board screen

### What changed

- `apps/web/src/components/Compliance.tsx`: the fifth action. Source panel (CSV or live scan,
  gated the same way Check gates it), the pooled headline, failing segments, why names fail,
  top offending values, the per-Rule grid, the platform and entity-type breakdowns, the strict
  secondary view, and the drill panel.
- `apps/web/src/components/CsvChecker.tsx`: narrowed to one Rule. Its All Rules toggle became a
  line linking to the board, per the decision to replace it rather than run two renderers of the
  same numbers.
- The strict per-row "passes every Rule" view moved to the board rather than being dropped:
  migration checklist step 1 kept it deliberately. It still needs one wide CSV carrying a name
  per Rule in each row, so it shows on the CSV source only, and a live scan clears it.
- `ui-state.ts`: `ActionPath` gains `/compliance` and `checkMode` leaves `UiState`. The storage
  key is not bumped: an unknown action already falls back, and a new key would discard everyone's
  Rule Set selection. Instead `actionFrom` sends a stored Check-in-All-Rules state to
  `/compliance`, which is where that person was actually working.
- `AppShell.tsx`: the `/compliance` branch goes before `/check` in the `current` chain, and the
  nav item sits between Check and Dictionary. `App.tsx`: the route, and `checkMode` unthreaded.
- The shell's Rule select stays enabled on a Rule-Set-scoped screen rather than being disabled,
  which would look broken and would invite a "reset on blur" bug against the rule that switching
  action must not reset context. It gets a job instead: clicking a per-Rule row selects that Rule
  and opens it in Check, so the board is the way in to single-Rule checking rather than a dead
  end.
- Honesty in the UI: percentages come from `board.rollup`, never from a partial breakdown; a
  sampled Rule is badged and named in a coverage line above the rankings; the drill panel says
  how many of a row's names it can actually list, because a live scan's aggregate describes names
  the browser never received.

### Verified

42 Playwright specs. `check-all-rules.spec.ts` was replaced by `compliance.spec.ts`, which
reasserts the same numbers on the same CSV: 67% pooled (4 of 6 across two Rules) and 33% strict
(1 of 3 rows), plus the cause row, the two segment rows, the `de` value row carrying the engine's
`Did you mean "uk"?`, the drill, the skipped Rule, and Check's link across.

Deployed to https://media-taxonomy-tool.web.app on 2026-09-30 with `./deploy.sh`, after the
Function. Rules were unchanged and skipped as already up to date; the live bundle
`assets/index-D3oNziyR.js` was verified to be the one just built and to carry `/compliance`, the
cause labels and the per-Rule row ids.

Still to do by hand: the live path against the demo data ("Paid search (demo)",
`pnpm seed:ruleset`, `marketing.paid_search_names`, expected 14 of 24 valid). The Function is now
deployed, so this is just a matter of signing in and running it.

## Decisions taken here

- The board is its own top-level action, not a mode inside Check. It is Rule-Set-scoped and
  Check is Rule-scoped.
- Check's All Rules mode is replaced rather than kept alongside. One renderer of a number cannot
  drift from itself.
- `code` is required on `Violation`, not optional. Optional would let the engine's own emission
  sites silently forget it, which is the exact failure the change exists to prevent. The runtime
  fallback lives in one place in the aggregator instead.

## Guardrails this feature sits next to

CLAUDE.md forbids scheduled scanning and an exceptions list, and a compliance board is exactly
where both would creep in. The constraints, worth restating so a later prompt does not reopen
them:

- On demand only. The board persists nothing: no snapshot document, no new collection, no write.
- No dismiss, ignore, accept or mute control anywhere. Legacy noise is handled where CLAUDE.md
  says it is handled, by a Rule's `source.filter`.
- No trend over time, no "last week's score", no stored history (D43: no versioning anywhere).
  Every number on the board comes from the run you just did.
- All grouping, ranking, labelling and the `unclassified` fallback live in `@taxo/shared`. The
  screen only formats, rounds through `percent`, and filters its own local annotations for the
  drill. A quick `reduce` in the component is precisely what that rule protects against.
