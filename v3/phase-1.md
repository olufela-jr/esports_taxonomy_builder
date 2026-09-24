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
