# Phase 6: finish stripping, docs match reality, conflict check on saves

Commit: `80427ee`. CLAUDE.md checklist step 6 (the rest), plus two items pulled forward from the v2 spec's pending list with the user's approval: the `updatedAt` save check (D31, O6) and a look at Firestore long polling.

## What changed

- Leftover grep (`replit`, `REPL_ID`, `taxonom`, `level`, case-insensitive, whole repo minus `node_modules`, `dist`, the lockfile): every hit is intentional. `apps/web/src/data/migrations.ts` keeps the v0 "taxonomy" and `levels` migration for old local data; `migration/` and `docs/` record history; CLAUDE.md's "the prototype called this Taxonomy" note stays as terminology context; `engine.ts:174` says "Rule Set level checks" in plain English. Nothing to delete. The prototype's user-facing residue (fake footer, status pill, owner-name table, "Active" chip) went in Phase 5.
- `CLAUDE.md`: "Already done in the Replit prototype (do not redo)" is now "Migration complete (2026-09-24)" listing what is in place; the checklist heading records steps 1 to 6 done and 7 next. The stack section now matches the code: Tailwind v4 kept by decision (the old line claimed no CSS framework), three test layers, the real project id and Firestore region, the store and auth modules, and the conflict check. The "Do not" bullet from the spec v2 pass stays verbatim, as decided.
- Root `README.md` (new): purpose, layout, prerequisites (Node 24, corepack pnpm, keg-only JDK with the `PATH` prefix for `pnpm test:rules`, Firebase CLI), run in memory or Firebase mode, the five check commands, rules and Hosting deploys, and the warning never to deploy against a project with no database.
- `store.update(id, draft, baseUpdatedAt)` refuses a save with a `ConflictError` when the stored `updatedAt` is not the one the editor loaded, and resolves to the new stamp. Firestore does the check and the write in one `runTransaction`; the memory store checks synchronously. `RuleSetEditor` keeps `baseUpdatedAt` in state (the `existing` prop keeps following the store, so it cannot serve as the base), shows a "changed since you opened it" notice with a Reload button as soon as the document moves on, surfaces the refusal in the error banner, and continues from the new stamp after a successful save.
- `apps/web/e2e/editor-conflict.spec.ts` (new): a second writer renames the Rule Set through `window.__taxoStore`; the open editor shows the notice, its Save is refused with the stored name intact, Reload catches up, and a save from the fresh base succeeds. A second test saves twice in a row from one editor. `fixtures.ts` exposes `updatedAt` in `readRuleSets`.
- `firestore.rules.test.ts` gains the read-then-write transaction case: the owner's transaction succeeds, a non-owner's is refused. 5 cases.

## Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 15 of 15 |
| `pnpm test:e2e` | 17 of 17 (2 new) |
| `pnpm test:rules` | 5 of 5 on the emulator (1 new) |
| Leftover grep | No unintentional hits (list above) |
| Pre-phase grep | `RuleSetEditor.tsx` still has no validation beyond the `checkRuleSet` call |

## Decisions not spelled out in the plan

- The plan said `docs/spec.md`'s project-structure block gains `apps/web/e2e/`. That block no longer exists: `spec.md` is now the verbatim technical sections of spec v2, which has no structure block. The layout lives in the root README instead, and `spec.md` is untouched, keeping it byte-identical to its source.
- Long polling: the recommendation to set `experimentalAutoDetectLongPolling` was wrong, the installed SDK's typings say it has defaulted to `true` since May 2023. The only real lever is `experimentalForceLongPolling`, which skips the detection window at a permanent transport cost. Not set: the slow first save has been seen once, its harmful effect (the duplicate create) is fixed by the Save pending state, and the flip is one line in `lib/firebase.ts` if it recurs.
- Conflict resolution is refuse-and-reload, not merge. Rule Sets are small and edits are rare, so "drop my edits and start again from theirs" is honest and cheap; a three-way merge of inline Rules is not worth building before v2's parent links exist.
- The v0 to v2 localStorage migration code stays. It is 60 lines, tested by use, and the prototype's data may still sit in someone's browser.

## Leftovers

- Phase 7: clean-room `pnpm install --frozen-lockfile`, the full check matrix, the `pnpm dev` smoke run in both modes, and the first `firebase deploy --only hosting` to `media-taxonomy-tool`.
- Bundle size 831 kB; lazy-loading the Firestore path is still an option for Phase 7 or later.
- CI: no configuration exists. Recommended for Phase 7 or straight after: GitHub Actions running `typecheck`, `test`, `test:e2e` and `test:rules` on every pull request.
- The old localStorage keys (v1 data, v2 and v3 UI state) remain readable and are not cleaned up; harmless.
