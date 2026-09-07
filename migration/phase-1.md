# Phase 1: pooled All Rules rollup, scope toggle in Check

Commit: `75b7060` (local at time of writing). CLAUDE.md checklist step 1, plus the spec's per-tag rollups.

## Review adjustments applied

1. The engine returns raw counts only. There is no percent field in `rollup()`; the UI rounds in one `percent()` helper in `Check.tsx`. The engine stays a pure data contract that the Stage 2 Function will consume.
2. Because this phase touched the persistent-context code before the Phase 3 regression test exists, verification included a manual walk: pick a Rule Set and Rule, visit Author, Build, Check, refresh, and confirm both dropdowns and the action are preserved.

## What changed

Engine, `packages/shared/src/engine.ts`:

- New plain types `Tags`, `RuleScan` (one Rule's scan totals: key, name, optional tags, scanned, valid), `Counts` (scanned, valid, invalid), and `Rollup` (total, per-Rule, by platform, by entity type). `UNTAGGED` is the group key for Rules without a tag.
- `rollup(scans)` pools valid and scanned across Rules and groups by tag. The CSV checker uses it now; the Stage 2 scan must use it too so "All Rules" never means two different things.
- Tests in `engine.test.ts`: pooled 3 of 5 from 1 of 2 plus 2 of 3; tag grouping with untagged fallback; zero-count edge cases. 8 tests total.

Web app:

- `Check.tsx`: a Single Rule / All Rules scope toggle sits above the Source selector. In All Rules mode each Rule reads its own `source.nameColumn` from the CSV; a Rule whose column is missing scans nothing and is flagged. The primary figure is the pooled rollup, followed by per-Rule cards and, when any Rule carries tags, By platform and By entity type cards. The old per-row conjunction remains below as "Strict view: rows passing every Rule", now with suggested fixes. The export CSV leads with summary rows (Rule Set, each Rule, each tag group) before the per-row table.
- `UiContext.tsx`: state is `{ ruleSetId, ruleId, lastAction, checkMode }` under storage key `campaign-tool-ui-state-v3`. A v2 reader maps the old `all_rules` sentinel and `individualRuleId` to `checkMode: 'all'` and the real Rule.
- `AppShell.tsx`: the Rule dropdown lists only real Rules; the effect simply falls back to the first Rule when the selection is missing or stale.

## Verified

| Check | Result |
|---|---|
| `pnpm test` | 8 of 8 pass |
| `pnpm typecheck` | Clean |
| Pooled figure on a two-Rule test set | 67% (4 of 6 names) |
| Strict view on the same CSV | 33% (1 of 3 rows), proving the two figures are distinct |
| Per-Rule, by-platform, by-entity-type cards | Present with correct counts |
| Rule dropdown options | Only the two real Rules |
| Author, Build, Check walk | Rule Set and the non-default second Rule preserved on every screen |
| Reload on Check | Rule Set, Rule, action, and All Rules mode all restored |

The browser walk used a throwaway Node script driving headless Chrome over the DevTools protocol (no dependencies; Node 24 ships `fetch` and `WebSocket`). It seeded a two-Rule Rule Set with tags into localStorage, then set selects and the textarea through the native value setters plus `change` and `input` events so React's controlled inputs picked them up. Phase 3 replaces this with Playwright.

## Decisions not spelled out in the plan

- Tags are read from the prototype's flat `platform` and `entityType` fields for now. Phase 2 moves them into the `tags` object the spec defines; `RuleScan.tags` already has that shape.
- `ruleId` is not in `RuleScan` yet because Rules have no ids until Phase 2. Add it there.
- The `checkMode` toggle is persisted with the rest of the UI state, so a reload on Check comes back in the same mode.

## Leftovers

- The only remaining `all_rules` and `individualRuleId` references are inside the v2 storage migration in `UiContext.tsx`, on purpose.
- The default sample CSV still has a single `name` column, so All Rules on the seed Rule Sets reports every Rule as "Missing" until a matching CSV is pasted. Worth revisiting when seeds change in Phase 2.
