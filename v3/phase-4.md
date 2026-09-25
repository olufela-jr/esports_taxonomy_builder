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
