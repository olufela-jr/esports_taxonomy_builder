# Phase 2: immutable ids, spec data model, engine owns authoring checks

Commit: `4587f64`. CLAUDE.md checklist step 2, plus the spec's segment reordering and the All Rules leftover from Phase 1.

## Review additions applied

1. After moving the checks into the engine, a grep of `Author.tsx` for validation patterns (`errors.push`, `optionalSeen`, `keys.has`, delimiter checks, and so on) returns only the `checkRuleSet` import and its single call. A repo-wide grep finds no delimiter injection into `illegalChars`, and `toLowerCase` in Author now touches only key slugs and the search box.
2. Engine test: an allowed value `UK` matches `UK` and rejects `uk`, with the "allowed list" reason.
3. UI state migrates alongside the data. The v3 UI state stored the Rule's key; the v4 state stores its new immutable id. On first load the reader looks the key up in the migrated Rule Set and stores the id, so nobody is snapped to the first Rule. The Phase 1 walk was repeated on top of seeded v1 data and v3 UI state (see Verified).

## What changed

Engine, `packages/shared/src/engine.ts`:

- `Rule = { id, key, name, tags?, delimiter, segments, source }`, `Segment` variants gain `id`, engine `RuleSet` gains `id`. `Tags = { platform?, entityType? }`. The comment block at the top states the id versus key distinction and that array order is the position.
- `checkRule(rule)` returns every authoring error: key and name present, delimiter present and single-character, unique segment keys, optional segments last, at least one segment, each segment has key and label, enum values present and free of the delimiter, freeform `maxLength >= 1`, and source dataset, table, and name column present. `checkRuleSet(ruleSet)` adds the Rule Set name check and prefixes each Rule's errors with its position.
- `RuleScan` carries `ruleId`.
- `engine.test.ts` is 15 tests. Fixtures are typed `EnumSegment` and `FreeformSegment` constants so spreads do not trip the excess-property check on the union.

Web app:

- `lib/ids.ts`: `newId()` via `crypto.randomUUID()` with a fallback.
- `hooks/use-rulesets.tsx`: storage key `campaign-naming-rulesets-v2`. Reading v1 data adds ids, renames `label` to `name`, folds `platform` and `entityType` into `tags` (omitted when both empty), and strips the delimiter from `illegalChars`. The v0 "taxonomy" migration now feeds into the v1 migration. Seeds carry fixed ids and two carry tags. Rule Set ids come from `newId()`.
- `context/UiContext.tsx`: storage key `campaign-tool-ui-state-v4`. Readers for v3 (key-based `ruleId`) and v2 (`all_rules` sentinel) map to ids using the Rule Sets, which is why `UiProvider` now reads `useRuleSets()`. The old `'new'` Rule Set sentinel becomes `null`.
- `pages/Author.tsx`: `checkRuleSet` replaces the inline checks; React keys are `rule.id` and `segment.id`; segments get move up and move down buttons; enum values are trimmed but never lowercased, and the field says "matched exactly"; the illegal characters hint says the delimiter is always illegal instead of injecting it; Platform and Entity type write into `tags`, dropped when both are empty; "New Rule Set" opens a local draft and a real id is assigned on save, so the `'new'` sentinel is gone.
- `pages/Check.tsx`: Rules are found by id; `RuleScan` gets `ruleId` and `tags` straight from the Rule; the sample CSV is generated from the selected Rule Set's mapped columns (one valid name, one with a bad first value, one missing its last required segment per Rule) and follows the selection until the user edits the text; the single-mode name column defaults to the selected Rule's column; the All Rules box lists the expected columns; a Rule whose column is absent shows "Missing column" and names it.
- `pages/Build.tsx` and `components/AppShell.tsx`: select by id, display `rule.name`.

## Verified

| Check | Result |
|---|---|
| `pnpm test` | 15 of 15 pass |
| `pnpm typecheck` | Clean |
| Author.tsx residual validation grep | Only the `checkRuleSet` import and call |
| v1 data migration | Rules and Segments have ids, `name` replaces `label`, tags folded, `_` removed from `illegalChars` |
| v3 UI state migration | Stored key `meta_ad_sets` mapped to the migrated Rule's new id; action `/check` and All Rules mode preserved |
| Sample CSV on the seeded set | Columns `campaign_name, ad_set_name`; pooled 33% (1 of 3 per Rule) |
| Missing column | Meta card reads "Missing column" and "The CSV has no ad_set_name column"; pooled falls to 50% from the remaining Rule |
| Author case handling | Typed `Brand, PERF, rtg` saved as `["Brand", "PERF", "rtg"]` |
| Segment reorder | Two segments swapped and persisted; the Rule's id unchanged after save |
| Author, Build, Check walk and reload | Rule Set, the non-default Rule, action, and check mode preserved throughout |

## Decisions not spelled out in the plan

- Source dataset, table, and name column stay required at save time, now inside `checkRule`. Loosening that is a product decision, not a migration one.
- Rule Set name emptiness moved into `checkRuleSet` rather than staying in Author, so the "no residual validation" grep is clean and the check is testable.
- Old localStorage keys (v1 data, v2 and v3 UI state) are left in place after migration rather than deleted. Harmless, and it keeps a rollback path until Phase 4 replaces localStorage anyway.
- Keys are still slugged to lowercase on edit. Only enum values are case-preserving; the spec's case-sensitivity rule is about values.

## Leftovers

- `use-rulesets.tsx` still houses seeds, migrations, and the provider together. Phase 4a splits storage into `data/store.ts`; the migrations should move with it.
- The sample CSV's freeform token is the literal `sample`, which could violate a very short `maxLength`. Cosmetic; the badValue and short variants are what demonstrate failures.
