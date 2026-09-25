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

## Step 2b: the D34 child batch, Build UI

Sections 5 to 7 of the sheet, after confirmation.

### What changed

- `apps/web/src/components/ChildBatchBuilder.tsx` (new): in Batch mode a child Rule shows a
  parent list instead of the single parent step. Parents are pasted one per line (a tab or
  comma separates the name from ancestor names, in the batch CSV's column order; a header line
  and further columns are ignored, so a batch CSV pastes back as it is) or carried across from
  a parent batch. `checkParents` runs on every change; failing lines are listed with their
  violations, or the missing ancestor column, and a remove action; valid lines stay. The
  child's own controls are shared across parents, inherited segments are shown as taken from
  each parent name. Each valid parent row shows its count and expands to untick shared values
  for that parent only; narrowing can only remove and survives changes to the shared choices.
  Total live, the 50,000 cap on the total, Generate disabled while any line fails. Output: a
  preview of the first 500 rows grouped by parent and a streamed CSV with `parent_name`, one
  column per needed ancestor, one per child segment, `name` and `tracking_url` when mapped,
  every cell a code (D48); each row's URL uses its own parent and ancestors.
- `apps/web/src/components/BatchBuilder.tsx`: after a parent-level batch, "Build <child>
  under these names" with a checkbox list to leave names out; carrying switches to the child
  in Batch mode with the list filled. A parent batch that itself ran under a parent name
  passes that name as the carried lines' ancestor.
- `apps/web/src/components/Builder.tsx`: carried lines kept per child Rule; Batch on a child
  renders the child batch.
- `apps/web/e2e/child-batch.spec.ts` (2 tests): pasted parents checked, a bad one removed,
  narrowing one parent to one row and to nothing, the grouped preview, the exact CSV, and the
  CSV pasted back; a parent batch carrying a chosen subset into the child batch.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test:e2e` | 34 of 34 (2 new) |
| `pnpm --filter @taxo/web build` | Clean |

### Decisions not spelled out in the sheet

- Section 6's "ancestor needed but missing" state is detected in the UI from the child's
  mapping and shown on the line as a failing line, since `checkParents` sees the parent only.
- The base URL for every row is the one on the Rule's Single card, as for a single-Rule batch.
- Narrowing state is keyed by parent name, so it persists while the name stays in the list.

Section 8's acceptance items: every row passes `validate` and starts with its parent's
inherited tokens (engine tests); rows equal the total (engine and browser); narrowing to zero
yields 0 for that parent only (both); an invalid parent blocks generation (both); a CSV
pasted back is accepted (browser); Single mode and top-level batch unchanged (the earlier 32
browser tests still pass).
