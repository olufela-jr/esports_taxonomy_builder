# Phase 4a: one store module, Firestore and in-memory implementations

Commit: `bebd0d6`, preceded by `205f78e` (Check screen All Rules coverage). CLAUDE.md checklist step 4, first half. React Contexts stay in place; 4b lifts state and renames screens.

## Pre-4a items from review

1. **Check All Rules coverage first.** `apps/web/e2e/check-all-rules.spec.ts` (4 tests) covers the pooled figure and its caption, per-Rule cards with counts, platform and entity-type breakdowns, the strict secondary view, the generated sample CSV matching the mapped columns, the missing-column message naming the column, and All Rules mode surviving a reload. Selectors are roles (`All Rules`, `Validate names`), the `CSV data` label, and behaviour test ids, so the 4b rename of the screen's file does not touch it.
2. **Throwaway scripts.** The DevTools-protocol drivers from Phases 1 and 2 were never in the repo: `git ls-files` and a disk search found nothing. The copies in the session scratchpad were deleted too.
3. **Seeding switch designed up front.** See "Test hook" below. The suite stayed green through the swap: 11 of 11 before and after.
4. **Phase 2 grep reconfirmed.** `Author.tsx` still matches only the `checkRuleSet` import and its single call.

## What changed

- `apps/web/src/data/store.ts`: the only module that touches Rule Set storage.
  - `RuleSetStore` interface: `kind`, `getSnapshot()`, `subscribe(listener)` (calls back immediately, then on change), `create(draft, ownerId)`, `update(id, draft)`, `remove(id)`. All writes return promises.
  - `createFirestoreStore(db)`: `onSnapshot` on the `rulesets` collection, documents cast to the `RuleSet` type (Security Rules enforce shape in Phase 5), sorted newest first by `createdAt`; `setDoc` on create, `updateDoc` with a fresh `updatedAt` on update, `deleteDoc` on remove.
  - `createMemoryStore(initial, persist?)`: an array plus listeners; `persist` is called after every commit.
  - `createStore()` picks the runtime in this order: test seed on `window`, Firebase config (unless `VITE_STORE=memory`), development without config (memory store hydrated from localStorage through the migrations and persisted back), production without config (throw `ConfigurationError`).
- `apps/web/src/data/migrations.ts`: the v0 and v1 localStorage readers moved here from the hook, plus `readLocalRuleSets()` (null when nothing stored) and `writeLocalRuleSets()`. `data/seeds.ts` holds the demo data; `data/types.ts` holds the stored `RuleSet` and `RuleSetDraft` types.
- `apps/web/src/lib/firebase.ts`: `isFirebaseConfigured()` and a lazy `getFirebase()` returning `app`, `db`, `auth`. Firestore is initialised with `ignoreUndefinedProperties` so an omitted `tags` is dropped rather than rejected. Config comes from `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`; `apps/web/.env.example` documents them and `src/vite-env.d.ts` types them.
- `apps/web/src/lib/config-error.ts`: `ConfigurationError`. The error boundary in `components/error-boundary.tsx` renders these in full, in every environment, under a "Configuration error" heading in an alert region. Other errors keep the generic fallback with details in development only.
- `hooks/use-rulesets.tsx`: now a thin binding: `useMemo(createStore)`, `useState(store.getSnapshot)`, `useEffect(store.subscribe)`. `createRuleSet`, `updateRuleSet`, `deleteRuleSet` return the store's promises; `ownerId` is the constant `"you"` until Phase 5 supplies a uid.
- `pages/Author.tsx`: save is async and shows a store error in the existing error banner.
- `firebase` 12.18 added to `apps/web` dependencies.

## Test hook

`window.__taxoTestSeed`, set by the Playwright fixture with `page.addInitScript` before the app loads, makes `createStore()` return an in-memory store holding exactly that data with no persistence. The store is exposed as `window.__taxoStore`, and the fixture's `readRuleSets(page)` reads back through `getSnapshot()`. No test references a storage key for Rule Sets any more. UI selection state (Rule Set, Rule, action, mode) is per-browser and stays in localStorage; the one test that asserts on it does so deliberately.

## Verified

| Check | Result |
|---|---|
| `pnpm test` | 15 of 15 |
| `pnpm test:e2e` | 11 of 11, on the seed hook |
| `pnpm typecheck` | Clean |
| `pnpm build` | Clean; bundle 829 kB (was 292 kB) because the Firestore SDK is now included |
| Dev store, headless Chrome | v1 data in localStorage hydrated through the migrations (ids added, tags folded, delimiter stripped); an update persisted to the v2 key; the rename survived reload and rendered |
| Production build without config, `vite preview` | "Configuration error" heading and the full Firebase message rendered in an alert region on first paint |
| Firestore store, live | **Not verified.** No Firebase project config is available, and the Firestore emulator needs a Java runtime, which this machine does not have |

## Decisions not spelled out in the plan

- The loud production failure was pulled forward from the "later phases" reminder into 4a, because the store's selection function is where it belongs and the boundary needed a matching change.
- Firestore results are sorted newest first by `createdAt` so the list order is stable across edits, matching the memory store's prepend-on-create behaviour.
- Documents are cast to `RuleSet` on read rather than validated in the client. The spec makes the types the contract and puts shape enforcement in Security Rules (Phase 5).
- Timestamps are ISO strings, not Firestore `Timestamp`s, so the stored document is exactly the app type.

## Leftovers

- Verify the Firestore store live before Phase 5 rules work: either a `.env.local` for a dev or staging project, or Java installed so `firebase emulators:exec --only firestore` can run. Phase 5's rules tests need the emulator anyway.
- Bundle size: the Firestore SDK could be loaded lazily only when configured. Worth doing in Phase 6 or 7 if the 829 kB matters for Hosting.
- The old localStorage keys (v1 data, v2 and v3 UI state) are still not deleted after migration. Decide in 4b or 6.
