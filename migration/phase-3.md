# Phase 3: browser regression tests

Commit: `9da20b4`. CLAUDE.md checklist step 3.

## What changed

- `@playwright/test` 1.63 added at the workspace root; Chromium installed with `pnpm exec playwright install chromium`.
- `playwright.config.ts` at the root: `testDir` is `apps/web/e2e`, Chromium only, `baseURL` on port 5173 (override with `PORT`), and a `webServer` entry that runs `pnpm dev` and reuses an already-running server outside CI. Traces are kept on failure.
- Root script `pnpm test:e2e`. The e2e folder is included in `apps/web/tsconfig.json` so the tests are type-checked by `pnpm typecheck`.
- `apps/web/e2e/fixtures.ts`: two Rule Sets in the current stored shape (a two-Rule paid-media set with tags, and a single-Rule global set) seeded into localStorage with `page.addInitScript`. Every Playwright test runs in a fresh browser context, so storage never leaks between tests.
- `apps/web/e2e/editor-typing.spec.ts` (3 tests): opens New Rule Set, then for every editor field types character by character with `pressSequentially`, asserts the same element still has focus, and asserts the exact text is present, including a trailing comma. Fields covered: Rule Set name, Rule name, key, delimiter, platform, entity type, source dataset, table, name column, filter column and values, segment label, key, max length, illegal characters, allowed values. A third test adds a segment, moves it up, and keeps typing into both.
- `apps/web/e2e/context-persistence.spec.ts` (4 tests): the shared Rule Set and the non-default second Rule survive Author, Build, Check, and a reload with All Rules mode intact; opening `/` lands on the last action with context restored and the v4 UI state matches; switching Rule Set falls back to that set's first Rule; a first visit with nothing saved lands on Author with an empty Rule Set dropdown.

## Defects the suite caught on its first run

All three were real, all fixed in this phase in `pages/Author.tsx`:

1. **Filter values dropped commas.** The field was bound straight to `filter.in.join(', ')`, so each keystroke re-rendered from the parsed array and the comma vanished; "google, youtube" became "googleyoutube". A `CommaListInput` component now keeps its own text while typing and only resyncs from the array when the array changed by other means. It backs both filter values and allowed values (which had a one-off draft before).
2. **Max length snapped to 1.** Clearing the number field ran `Number('') || 1`, so typing "24" produced "124". The field may now be empty while editing (`maxLength` 0); `checkRule` still refuses to save a length under 1.
3. **No "Saved locally" after creating.** Creating a Rule Set remounts the editor under its new id, so the saved flag set on the old instance never rendered. `Author` now records the just-created id and the new editor instance starts with the flash on.

One failure was a test bug: the Rule Set switch test asked for a set the fixture did not seed. Fixed by seeding a second set.

## Verified

| Check | Result |
|---|---|
| `pnpm test:e2e` | 7 of 7 pass, run twice in a row (7.0s and 6.1s) |
| `pnpm test` | 15 of 15 |
| `pnpm typecheck` | Clean, e2e files included |

## Decisions not spelled out in the plan

- Tests run against localStorage for now. Phase 4a adds the in-memory store; the fixtures' `seedRuleSets` is the one place to switch seeding when that lands.
- `reuseExistingServer` is on outside CI so a developer's running `pnpm dev` is reused rather than fighting over the port.
- The Chromium build lives in `~/Library/Caches/ms-playwright`; CI will need `playwright install chromium` as a step.

## Leftovers

- The throwaway DevTools-protocol scripts from Phases 1 and 2 are now redundant; nothing in the repo references them.
- No test yet for the Check screen's All Rules flow through the browser; the engine tests cover the rollup and the Phase 2 walk covered the UI once. Worth adding when Check is renamed in Phase 4b.
