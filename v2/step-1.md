# Step 1: engine types and `resolveRule`

CLAUDE.md v2 build order, step 1. Engine only; `apps/web`, Firestore rules, seeds and docs are
untouched. The design is the `resolveRule` section of `docs/spec.md` (steps 1 to 8) with the Gate
G0 rulings on D28 and D29.

## What was done

- `packages/shared/src/engine.ts`:
  - `ParentLink = { ruleId, inheritSegmentIds }` and `parent?: ParentLink` on `Rule`. Optional, so
    every existing Rule, seed, fixture and Firestore document stays valid without a migration.
  - `ResolveResult = { rule, errors }` and `resolveRule(rule, ruleSet)`. Recursive with a visited
    set, so a grandchild resolves its parent first and can inherit segments the parent inherited.
    Checks in order: at least one inherited id, parent exists, no cycle, parent resolves, every id
    exists on the resolved parent, the ids are the parent's leading run in order, every inherited
    segment is required, delimiters match, then the combined list passes the existing structural
    checks (`getRuleErrors`) plus a unique-id check.
  - On success the returned Rule has no `parent`, and its segments are copies of the inherited
    parent segments followed by copies of the child's own. `getRuleErrors`, `compose`, `validate`
    and `checkRule` are unchanged.
- `packages/shared/src/engine.test.ts`: a `resolveRule` suite of 15 cases over a three-level
  fixture (campaign, ad group, ad), every fixture deep-frozen so a mutation would throw. Covers no
  parent, one level, two levels, a compose-then-validate round-trip on the resolved child whose
  name starts with the parent's tokens, cycle, self-parent, missing parent, missing inherited id,
  non-leading and out-of-order ids, inherited optional segment, delimiter mismatch, key collision,
  id collision, empty inherit list, and a broken parent reported from the grandchild.

## Verified

| Check | Result |
|---|---|
| `pnpm --filter @taxo/shared test` | 30 of 30 (15 existing unchanged, 15 new) |
| `pnpm typecheck` | Clean in `packages/shared` and `apps/web` |
| `pnpm build` | Clean, 838 kB, unchanged size |
| `pnpm test` at the root | 30 of 30 |
| Playwright | Not run; `apps/web` is untouched. CI runs the full matrix on push |

## Decisions not spelled out in the spec

- On any error `resolveRule` returns the input Rule unchanged, `parent` still set, rather than a
  partial result. Once step 2 lands, a caller that ignores `errors` and passes the Rule on is
  refused by the guard instead of silently validating against the child's own segments only.
- An empty `inheritSegmentIds` is an error. A link that inherits nothing has no meaning and would
  only trip the step 2 guard.
- The unique-id check lives inside `resolveRule` only, not in `getRuleErrors`, so nothing about
  `checkRule`, `compose` or `validate` changes in this step. Step 3 can promote it to
  `checkRuleSet` if wanted.
- Errors from a parent that itself fails to resolve are reported on the child prefixed with
  `Parent "<name>" cannot be resolved:`, so a broken grandparent is visible from any descendant.
- Messages name segments by `label` and Rules by `name`, matching the existing authoring messages,
  except a missing inherited id, which can only be named by the id itself.

## Leftovers

- Step 2 is the runtime guard: `compose` and `validate` refuse a Rule with `parent` set as an
  error result, never a throw (D25 as amended). `enumerate` and `countCombinations` get the same
  guard when they are built.
- `docs/features/d34-child-batch.md` (child batch across parents) is untracked in the repo and
  depends on steps 1, 2, 5, 6 and the batch release. Its section 10 says npm workspaces, which
  conflicts with the pnpm decision in CLAUDE.md; not resolved here.
