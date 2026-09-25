# Phase 3: Batch build

v3 release phase 3, the v2 R2 batch build re-based on codes. One commit per step.

## Step 1: batch for a single Rule

### What changed

- `packages/shared/src/engine.ts`: `BatchChoices` (segment key to codes, `""` meaning omit on
  an optional segment), `checkBatchChoices` (an unresolved Rule, a required segment with no
  values, a duplicate, an omitted required, or any value its segment would refuse, so one bad
  freeform line fails before generation), `countCombinations` (linear in the segments: a
  required segment multiplies, an optional one adds its omitted branch) and `enumerate`, a
  generator in a fixed order, first segment slowest, each row produced by `compose`. The D33
  amendment holds: an omitted optional ends the row, so later optionals are omitted and the
  count equals the rows. Three tests, including every row passing `validate` and determinism.
- `apps/web/src/components/BatchBuilder.tsx` (new): each enum control is a checkbox list with
  Select all, each freeform control a one-value-per-line box, each optional segment offers
  Include, Omit or Both. Inherited segments (a child under its parent name) are locked to the
  parsed value. Live count; Generate disabled above 50,000 rows with a prompt to narrow, and
  disabled while the engine reports a problem. Generate streams the engine's rows into CSV
  text and a Blob for download, keeping only the first 500 rows in state for the preview.
  Columns: one per segment, `name`, and `tracking_url` when the Rule has a mapping, every cell
  a code (D48); the URL per row comes from `buildTrackingUrl` with the parent step's name.
- `apps/web/src/components/Builder.tsx`: a Single or Batch toggle in the heading; Batch keeps
  the parent step for a child Rule and runs under that one name (multi-parent is the D34 sheet,
  next step).
- `apps/web/e2e/batch.spec.ts` (2 tests): two types by all markets counts four, previews four
  and downloads exactly the expected CSV; freeform lines drive the count and a bad line is
  refused before generating.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 57 (engine, 3 new), 9, 13 |
| `pnpm test:e2e` | 32 of 32 (2 new) |
| `pnpm --filter @taxo/web build` | Clean |

### Decisions not spelled out in the plan

- `countCombinations` and `enumerate` throw on bad choices, since a generator has no error
  channel; the UI calls `checkBatchChoices` first and never reaches the throw. That is the
  "return the same error" of D25 for batch, expressed as a check function.
- The batch's base URL is the one shown on the Single card for the Rule (the mapping's default
  or the user's edit), not a separate input.
- The download uses a plain `<a download>` with an object URL, released when a new batch is
  generated or the Rule changes.

## Step 2a: the D34 child batch, engine half

`docs/features/d34-child-batch.md` is authoritative. Section 2's seven dependencies all exist
now (`resolveRule`, `parse` returning selections, `compose`, `validate`, `BatchChoices`,
`countCombinations` and `enumerate` refusing unresolved Rules, `buildTrackingUrl`), so this
step implements sections 3 and 4 and stops before the UI, as the sheet's instructions say.

### What changed

- `packages/shared/src/engine.ts`: `ParentLine`, `ParentBatchInput`, `ParentBatchRow`.
  `checkParents(parentRule, lines)` validates each distinct parent name in order.
  `countUnderParents` and `enumerateUnderParents` apply the eight rules of section 4: both
  Rules resolved or a throw; per parent the name is parsed, the inherited segments (the child
  segments whose keys the parent name yields) become single-item lists, the shared choices are
  intersected with that parent's narrow entry, and the work is delegated to `enumerate`; a
  narrow value outside the shared choices throws; duplicate parent names collapse; any invalid
  parent throws naming every failing one; a line missing an ancestor name the child's mapping
  reads throws naming the line; output is parents in input order then enumerate order; the
  count is a product per parent, summed. A parent narrowed to nothing yields zero rows and does
  not block the rest. Five tests covering section 8's engine items.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 62 (engine, 5 new), 9, 13 |

### Decisions not spelled out in the sheet

- Rule 6 (a line missing an ancestor the mapping needs) is enforced in `countUnderParents` and
  `enumerateUnderParents`, which know the child; `checkParents` keeps the signature section 3
  gives it, with the parent Rule only. The UI will need both to flag such a line.
- Inherited segments are detected as the child's segments whose keys the parsed parent name
  supplies, since a resolved child no longer carries its parent link.

## Next

- Step 2b: sections 5 to 7 of the sheet, the Build UI for the child batch, after confirmation.
