# Phase 4b: state in App.tsx, screens renamed to the spec

Commit: `4e9b2cf`. CLAUDE.md checklist step 4, second half, plus the spec's project structure for `apps/web`.

## What changed

- `App.tsx` owns all shared state with `useState`: the store instance (`useMemo(createStore)`), the Rule Sets (`useState(store.getSnapshot)` fed by `store.subscribe`), and the workspace context (`useState(readUiState)` written back with `writeUiState`). Selection helpers are plain functions in the component: select a Rule Set (resets the Rule), select a Rule, set the check mode, set the last action. The "fall back to the first Rule" effect moved here from the shell.
- A `Workspace` component inside the Wouter router syncs the last action with the URL, redirects `/` to it, composes the Author route (open Rule Set edits it; otherwise the list, or a new draft), and passes props to the shell and the three actions. It is the only component that uses `useLocation` besides the shell.
- `data/ui-state.ts` replaces `context/UiContext.tsx` (tracked as a rename) with plain functions: `readUiState(ruleSets)` handling v4 plus the v3 and v2 migrations, and `writeUiState(state)`. The `CheckMode` and `UiState` types live here.
- `hooks/use-rulesets.tsx` deleted; nothing else needed a hook once App held the store.
- Screens renamed to the spec's component names, all under `src/components/`:
  - `pages/Author.tsx` split into `RuleSetList.tsx` (list, search, stats, New Rule Set) and `RuleSetEditor.tsx` (the editor, with `onCreate`, `onUpdate`, `onDelete`, `onSaved`, `onClose` props).
  - `pages/Build.tsx` to `Builder.tsx` (`ruleSet`, `rule` props).
  - `pages/Check.tsx` to `CsvChecker.tsx` (`ruleSet`, `rule`, `checkMode`, `onCheckModeChange` props).
  - `pages/not-found.tsx` to `NotFound.tsx` (named export).
- `components/styles.ts` holds the five shared Tailwind class strings and `components/PageHeading.tsx` the heading, replacing three copies of each.
- `AppShell` takes `ruleSets`, `ruleSetId`, `ruleId`, `onSelectRuleSet`, `onSelectRule`. The nav links no longer set the last action on click; the URL effect in `Workspace` covers it.

## Verified

| Check | Result |
|---|---|
| `pnpm test` | 15 of 15 |
| `pnpm test:e2e` | 11 of 11, no test changed (roles and behaviour test ids survived the rename, as intended in Phase 3 and the pre-4a Check coverage) |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean, 827 kB |
| No Context or state library | `grep` for `createContext`, `useContext`, `react-query`, `redux`, `zustand`, `useReducer` in `apps/web/src` returns nothing |
| Context walk | Covered by `context-persistence.spec.ts`: Author, Build, Check, reload, with the non-default Rule |

## Decisions not spelled out in the plan

- The Author route's "creating" and "just created" flags live in `Workspace` as local `useState`, not in the persisted UI state, so an abandoned draft never survives a refresh (the prototype's `'new'` sentinel did, and left users on an empty editor).
- `Workspace` receives one props bag rather than each screen reading the store, so the data flow is visible in one file. It is verbose by design; the team can trace every value from `App` to the screen that uses it.
- The last action is now derived from the URL alone. The prototype set it both on link click and on location change; one source is enough.

## Leftovers

- Bundle size: the Firebase imports are already the modular SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`), confirmed by grep. The remaining option is lazy-loading the Firestore path only when configured. Still a Phase 6 or 7 item.
- The old localStorage keys (v1 data, v2 and v3 UI state) remain after migration; decide in Phase 6.
- The Firestore store is still unverified live (Java or a project config pending); required before Phase 5 begins.
