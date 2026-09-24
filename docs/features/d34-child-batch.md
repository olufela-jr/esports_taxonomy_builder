# Feature spec: D34 Child batch across parents

Status: Settled (Fela, 24 Sep 2026). v3 note: this is v3 phase 3; enum values are label/code entries (D39) and every export holds codes (D48).
Location in repo: `docs/features/d34-child-batch.md`
Authority: this sheet is the source of truth for D34. Where it conflicts with `docs/spec.md` or the v2 product spec on anything inside this feature's scope, this sheet wins. Outside that scope it changes nothing.

## 1. What it does

A child Rule (a Rule with a parent, for example ad group under campaign) can be batch built across one or more parent names at once. The child's own segment choices are set once and applied under every parent, and each parent can be narrowed to drop values that do not belong under it. A child batch never runs without parents, because inherited segments take their values from the parent name.

Single mode is unchanged and keeps its one-parent step. Top-level Rules (no parent) batch exactly as before.

## 2. Dependencies (verify, do not assume)

This feature builds on the following, which must already exist in `@taxo/shared`. Verify each against the code before starting. If any are missing or differ in shape from what is described here, stop and report. Do not implement or adapt them as part of this feature.

- `resolveRule`: returns a resolved Rule with inheritance flattened; `parent` no longer set.
- `parse(resolvedRule, name)`: returns segment selections, holding codes, for a valid name.
- `compose(resolvedRule, selections)`: returns a name.
- `validate(resolvedRule, name)`: returns a result with violations.
- `EnumEntry` `{ label, code }` on every enum segment, with a resolved Rule carrying inline entries for definition-backed segments (D46).
- `BatchChoices`: `Record<string, string[]>`, segment key to codes; `""` means omit for an optional segment.
- `countCombinations(rule, choices)` and `enumerate(rule, choices)`: existing single-Rule batch functions. Both reject an unresolved Rule.
- `buildTrackingUrl`: builds the tracking URL from a row's selections and ancestor names.

## 3. Engine API (`@taxo/shared`)

```ts
type ParentLine = {
  name: string;                          // parent name as pasted or carried
  ancestors?: Record<string, string>;    // ruleId -> name, only when a UTM mapping needs it
};

type ParentBatchInput = {
  parents: ParentLine[];
  choices: BatchChoices;                 // child's own segments, shared by every parent
  narrow?: Record<string, BatchChoices>; // parent name -> subsets of choices
};

function checkParents(parentRule: Rule, lines: ParentLine[]):
  { name: string; result: ReturnType<typeof validate> }[];

function countUnderParents(child: Rule, parentRule: Rule, input: ParentBatchInput):
  { perParent: Record<string, number>; total: number };

function* enumerateUnderParents(child: Rule, parentRule: Rule, input: ParentBatchInput):
  Generator<{ parentName: string; selections: Record<string, string>; name: string }>;
```

## 4. Engine rules

1. Both `child` and `parentRule` must be resolved; reject otherwise, as `enumerate` does.
2. Per parent: `parse` the name against `parentRule`, pass the inherited selections as single-item lists, intersect `choices` with that parent's `narrow` entry, then delegate to `enumerate`. Do not modify `enumerate`.
3. `narrow` may only hold subsets of `choices`. A value not present in `choices` throws.
4. Duplicate parent names collapse to one before counting or enumerating.
5. Any invalid parent makes `countUnderParents` and `enumerateUnderParents` throw, naming every failing parent.
6. A parent line missing an ancestor that the child's UTM mapping references is an invalid parent.
7. Output order: parents in input order, then `enumerate` order within each parent.
8. `countUnderParents` is a product per parent summed; linear in the number of parents.

## 5. UI (`apps/web`, Build > Batch, child Rules only)

- Parent input: a list, filled either by carrying across from a parent-level batch or by pasting.
  - Carry: a "Build children under these names" action on the parent batch output, with checkboxes to take a subset.
  - Paste: one parent per line; extra tab-separated columns are ancestor names, in the column order of the batch CSV.
- Parent check: run `checkParents` on every change. Failing lines are listed with their violations and a remove action; valid lines stay.
- Child controls: shared across all parents; they show labels and submit codes (D40). Inherited controls are locked and show the value per parent. The parent Rule and the child Rule share a platform (D47).
- Narrowing: each parent row expands to untick child values for that parent only. Narrowing can only remove.
- Count: total shown live, plus a count per parent. The existing 50,000 row cap applies to the total.
- Output: preview of the first 500 rows grouped by parent; CSV streamed to a Blob, never held whole in React state.
- State: `useState` only, as elsewhere in the app.

## 6. UX states

| State | Behaviour |
| --- | --- |
| No parent lines | Child controls hidden; prompt to paste parents or carry them from a parent batch |
| One or more parent lines fail validation | Failing lines listed with violations and remove action; count and Generate disabled until none fail |
| Ancestor needed but missing on a pasted line | Line flagged with the missing column; treated as a failing line |
| A parent narrowed to zero values | That parent shows 0 rows and a warning; does not block the rest |
| Total over cap | Generate disabled; total shown with a prompt to narrow |

## 7. CSV output

Columns, in order: `parent_name`, any ancestor names the mapping uses (one column each, named by Rule), one column per child segment, `name`, `tracking_url` (only when the child Rule has a UTM mapping). Every cell holds the code, never the label (D48); labels appear only in inputs. Tracking URLs use each row's own parent and ancestors, so `utm_campaign` is correct per row.

## 8. Acceptance criteria

- Every generated row passes `validate` against the resolved child Rule.
- Every row's name begins with its own parent's inherited tokens, in order.
- Rows generated equal `countUnderParents(...).total`.
- Narrowing a parent to zero values yields 0 rows for that parent and leaves others unchanged.
- An invalid parent anywhere in the list prevents generation in both engine and UI.
- A CSV pasted back as parent input (with ancestor columns) is accepted without editing.
- Single mode and top-level batch behave exactly as before; existing tests pass unchanged.

## 9. Out of scope

- Cross-level validation (which child values are allowed under which parent). Narrowing is the manual substitute.
- Per-parent additions of values not in the shared choices.
- Persisting generated names or a history of parents.
- Stable parent IDs in the CSV. Depends on whether batch output is a reference list or a bulk-upload sheet (open client question P12).
- Writing to any ad platform.

## 10. Stack constraints

Plain TypeScript, pnpm workspaces, Vitest, no new dependencies.
