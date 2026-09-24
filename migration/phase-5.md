# Phase 5: Firebase Auth and Security Rules

Commit: `8af738e`. CLAUDE.md checklist step 5.

## What changed

- `apps/web/src/data/auth.ts` (new) owns sign-in state the way `store.ts` owns storage. One `AuthSession` interface, two implementations: `createFirebaseAuth` (Google sign-in through `signInWithPopup`, `onAuthStateChanged` for the session) and `createMemoryAuth` (a fixed `LOCAL_USER` with uid `you`, so development and Playwright need no Firebase). `createAuth(storeKind)` picks the one that matches the store, so there is a single selection point, in `store.ts`.
- `App.tsx` gates the workspace: `undefined` user (Firebase still restoring the session) shows a one-line Loading screen, `null` shows `SignIn`, otherwise the shell. `ownerId` on create is the real uid; `LOCAL_OWNER_ID` is gone. The store subscription now depends on the uid, so it starts on sign-in and stops on sign-out. The workspace context is read from localStorage regardless of user, so it survives the gate; `auth.spec.ts` proves it.
- `components/SignIn.tsx` (new): one card, one button, error shown inline. In memory mode the copy says there is no account to check and the button reads "Continue as local user".
- `AppShell.tsx`: the fake "Raji Taraby / Marketing Emperor" footer and the "System operational" pill are gone. The footer shows the signed-in user's initials, name, email and a sign-out button; the mobile header shows the initials.
- `RuleSetEditor.tsx` takes `readOnly`. When set, the body sits in a disabled `<fieldset>` (every control disabled natively, no per-input plumbing), Save and Delete give way to a "Read only: another user owns this Rule Set" hint, and `onSubmit` returns early as a second guard.
- `RuleSetList.tsx`: the hardcoded owner-name table is gone. Each row shows a "Yours" or "Read only" chip in place of the prototype's "Active" chip, and "Owned by you" or "another user".
- `store.ts`: the Firestore listener starts with the first subscriber and stops with the last (snapshot cleared), and a listener that Firestore terminates on error is forgotten so the next subscriber starts a fresh one. Without this, the first `onSnapshot` fired before sign-in, was denied by the rules, and stayed dead for the session.
- `seeds.ts`: the development seed is owned by `you` so it is editable locally.
- `firestore.rules` (new, root): signed-in users read all Rule Sets; create needs `ownerId == request.auth.uid`, a well-formed document and `id` equal to the document id; update needs the caller to own the stored document and `ownerId` unchanged; delete needs ownership. Well-formed means `id`, `name`, `createdAt`, `updatedAt` are strings and `rules` is a list; the rules language cannot loop over the inline Rules, so everything about their content stays in `checkRuleSet`.
- `firebase.json` (new, root): rules path, Hosting from `apps/web/dist` with the SPA rewrite, emulator ports.
- `firestore.rules.test.ts` and `vitest.rules.config.ts` (new, root) with `pnpm test:rules`: four `@firebase/rules-unit-testing` cases on the emulator (read by anyone signed in and nobody else; create only as the owner and well-formed; update only by the owner and never moving ownership; delete only by the owner). The config file is deliberately not named `vitest.config.ts`: Vitest walks up from `packages/shared` and would adopt a root config, hiding the engine tests.
- `apps/web/e2e/auth.spec.ts` (new): sign out then sign in with the Rule Set, Rule and action restored; a Rule Set owned by someone else is read only in Author but still builds; the owner's set is editable and the list labels ownership.
- Root `package.json`: `@firebase/rules-unit-testing` and `firebase` as dev dependencies (the rules test imports `firebase/firestore` directly), plus the `test:rules` script.

## Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 15 of 15 |
| `pnpm test:e2e` | 14 of 14 (11 existing unchanged, 3 new in `auth.spec.ts`) |
| `pnpm test:rules` | 4 of 4 on the Firestore emulator |
| `pnpm build` | Clean, 831 kB |
| Pre-phase grep | `RuleSetEditor.tsx` has no validation beyond the `checkRuleSet` call on line 116 (line 31 is default segment data) |
| Context walk | `context-persistence.spec.ts` unchanged and green; `auth.spec.ts` adds the walk across sign-out and sign-in with the non-default Rule |
| Firestore store, live | Still not verified: no project id yet (see leftovers) |

## Decisions not spelled out in the plan

- The plan's "fixed fake user" for memory mode is a full `AuthSession`, not a bypass: sign-out and sign-in work in memory mode too, which is what makes the gate testable in Playwright without Firebase.
- Google sign-in only. The plan allowed email and password as well "if not all users have Google accounts"; nobody has said they lack one, so it is not built. Adding a provider is one line in `createFirebaseAuth`.
- Owner display names are not stored (spec-v2 D31 proposes `updatedBy`, still Proposed), so the list says "you" or "another user" rather than inventing names. The prototype's hardcoded name table is removed rather than extended.
- The read-only state keeps Build and Check fully working; only Author's controls are disabled. Reading is the whole point of "authenticated users read all Rule Sets".
- The emulator runs under `--project demo-taxo`, so `pnpm test:rules` needs no real project and no `.firebaserc`.

## Leftovers

- Live verification against a real Firebase project is still pending, now for two things: the Firestore store (carried since Phase 4a) and Google sign-in. Needs the project id in `.firebaserc` and `apps/web/.env.local`, plus the Google provider enabled in the Firebase console. The Firebase CLI's login had expired on this machine; the user is re-authenticating.
- The emulator needs Java. It is installed keg-only through Homebrew, so `pnpm test:rules` needs `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH"`. Document in the root README in Phase 6.
- `pnpm install` reports ignored build scripts for `@firebase/util` and `protobufjs`; neither is needed at runtime, and `onlyBuiltDependencies` stays at `esbuild`.
- Wiring `connectFirestoreEmulator` and `connectAuthEmulator` behind an env flag would let the app itself run against the emulator for a fully local end-to-end check. Not in the plan; worth considering in Phase 7 if the live project is slow to arrive.
- Bundle size 831 kB (was 827 kB); the lazy-loading option from Phase 4 remains a Phase 6 or 7 item.
- The old localStorage keys (v1 data, v2 and v3 UI state) remain; decide in Phase 6.
