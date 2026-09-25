# Phase 4: the BigQuery scan and the impact preview

v3 release phase 4 (the v2 Stage 2 scan plus D44's preview), in the same GCP project as the
app (O2 decided 2026-09-25: one project). One commit per step.

## Step 1: the Function

### What changed

- `functions/src/scan.ts` (new, SDK-free so it is unit tested with arrays): `buildScanQuery`
  whitelists dataset, table, name column and filter column against `^[A-Za-z0-9_]+$` and
  builds `SELECT DISTINCT nameColumn ... WHERE nameColumn IS NOT NULL [AND filterColumn IN
  UNNEST(@filterIn)]` with the filter values as a query parameter, never in the text;
  `evaluateNames` judges every name with the engine, exact counts over all of them, the first
  5,000 annotated with a `truncated` flag; `impactOf` counts the names valid under the current
  Rule that fail under the proposed one, with a few examples. `MAX_BYTES_BILLED` is 1 GB per
  query (O5): a misconfigured source fails instead of billing.
- `functions/src/index.ts`: `scanCampaigns` now runs the query through the BigQuery client in
  this project and returns the counts and list. New `previewImpact` (admins only): for every
  Rule that reads the definition, resolves it with the current and the proposed entries,
  scans its source and returns per-Rule and total counts of names that would start failing,
  plus the Rules it had to skip and why. Synchronous, 120 s timeout (O16).
- `functions/package.json`: `@google-cloud/bigquery`. `functions/build.mjs`: the bundle and a
  generated `deploy/package.json` with the runtime dependencies only go to `functions/deploy/`
  (gitignored), which `firebase.json` now names as the source; `deploy/node_modules` links to
  the package's so the CLI can load the code locally to discover the functions, while the
  upload ignores it. This closes the phase 1 leftover about the workspace dependency.
- `functions/src/scan.test.ts`: four tests (query and parameters, every identifier refused,
  exact counts with the cap, the impact count).

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 62 (engine), 13 (functions, 4 new), 13 (scripts) |
| `pnpm --filter @taxo/functions build` | `deploy/index.js` 19 kB, runtime manifest written |

## Step 2: the live scan in Check and the impact preview in the Dictionary

### What changed

- `apps/web/src/data/scan.ts` (new): the one module that calls the Cloud Functions,
  `scanRule` and `previewImpact`, through `httpsCallable` in the database's region; `null` in
  memory mode, so the screens can say the feature needs the shared workspace.
  `apps/web/src/lib/firebase.ts` adds the Functions handle.
- `apps/web/src/components/CsvChecker.tsx`: the Source toggle's "Live scan" is enabled with the
  shared workspace. It shows what will be read (the Rule's dataset, table and column, or every
  Rule's own source under All Rules) and a "Scan BigQuery" button. A single-Rule scan shows the
  exact counts in a banner and the capped list in the same panel the CSV check uses; All Rules
  scans each Rule in turn and pools the counts through the engine's `rollup`, the same figure
  the CSV check reports, with the per-platform and per-entity-type breakdowns, and any Rule
  whose scan failed shows the reason.
- `apps/web/src/components/Dictionary.tsx`: saving a definition with a changed or removed code
  now asks the Function for the impact first: the confirm names how many live names would
  start failing, per Rule, with examples, and any Rule it could not scan. Without the shared
  workspace, or if the scan fails, the plain confirm stands (O16 fallback).
- `apps/web/e2e/live-scan.spec.ts`: in memory mode the live source is disabled and says why.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test:e2e` | 35 of 35 (1 new) |
| `pnpm --filter @taxo/web build` | Clean |

### Live setup on 2026-09-25, each with approval

- APIs enabled: Compute, Cloud Functions, Cloud Run, Cloud Build, Artifact Registry, Eventarc.
- The Function's runtime account (`231944894886-compute@developer.gserviceaccount.com`) holds
  `roles/bigquery.dataViewer` and `roles/bigquery.jobUser`. It also holds Google's default
  `roles/editor` for that account, which predates this work and is not needed by the scan.
- BigQuery dataset `marketing` (asia-south1) with table `campaign_values` (`name`, `status`,
  `platform`) and 14 demonstration names shaped for the live "Google Laws" Rule: eight valid,
  six deliberately wrong (case, an unknown market, a missing title, an overlong title, a legacy
  name, the wrong join character).
