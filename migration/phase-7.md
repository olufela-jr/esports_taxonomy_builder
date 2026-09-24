# Phase 7: final verification and the first Hosting deploy

Commit: `35d1988`. CLAUDE.md checklist step 7. The migration is complete.

## What was done

- Clean room: the dev server stopped, every `node_modules` deleted (318 MB root, 13 MB `apps/web`, an empty one in `packages/shared`), then `pnpm install --frozen-lockfile`. It completed in 5.4 s with no resolution changes, so the lockfile pins everything the code needs. The two ignored build scripts (`@firebase/util`, `protobufjs`) are still ignored and nothing needed them.
- The full check matrix on that pristine tree (numbers below).
- Smoke runs, scripted headlessly with Playwright's Chromium rather than by hand so the numbers are repeatable:
  - Memory mode (`VITE_STORE=memory`, port 5174): signed in as "Local user"; the seed Rule Set listed as "Yours"; Author editor, Build and Check each rendered; after a reload the path, Rule Set and the non-default Rule were intact; no console errors.
  - Firestore mode (`apps/web/.env.local`, port 5173): the sign-in gate with "Sign in with Google", no shell, no console errors.
- `pnpm build` then `firebase deploy --only hosting --project media-taxonomy-tool`: five files uploaded, release complete. Verified on https://media-taxonomy-tool.web.app: `/`, `/check` and `/author` all return 200 with the app shell (the single-page rewrite works on deep links), and the headless check of `/check` shows the sign-in gate with no console errors.
- `CLAUDE.md` records all seven steps done and the deployed URL; the README carries the URL under Firebase.

## Verified

| Check | Result |
|---|---|
| `pnpm install --frozen-lockfile` from clean | 5.4 s, lockfile unchanged |
| `pnpm typecheck` | Clean |
| `pnpm test` | 15 of 15 |
| `pnpm test:e2e` | 17 of 17 (Playwright started its own dev server) |
| `pnpm test:rules` | 5 of 5 on the emulator |
| `pnpm build` | Clean, 838 kB |
| Smoke, memory mode | Author, Build, Check, reload: all pass, no console errors |
| Smoke, Firestore mode | Sign-in gate: pass, no console errors |
| Hosted app | 200 on `/`, `/check`, `/author`; sign-in gate on `/check`; no console errors |

## Decisions not spelled out in the plan

- The plan's "staging Firebase project" is `media-taxonomy-tool` itself; there is one project. Spec v2's O2 (one project with a preview channel, or two projects) is still open, and Hosting preview channels are the cheap answer when a second environment is needed: `firebase hosting:channel:deploy <name>` gives a temporary URL against the same Firestore.
- The smoke runs are scripts in the session scratchpad, not repo files. They duplicate what `auth.spec.ts` and `context-persistence.spec.ts` already assert; committing them would be a second copy of the same checks.

## Leftovers, now the backlog for Stage 2 and v2

- CI: none exists. GitHub Actions running the five checks on every pull request is the next infrastructure step; the clean-room sequence above is exactly what the workflow runs. `test:rules` needs Java in the runner (`actions/setup-java`).
- Bundle size 838 kB, most of it the Firebase SDK. Lazy-loading the Firestore and Auth path only when configured remains an option.
- `firebase deploy` has no `predeploy` build hook, so a deploy ships whatever is in `apps/web/dist`. Run `pnpm build` first, as the README says, or add the hook once CI owns deploys.
- Spec v2's acceptance criteria are not in `docs/spec.md` (they sit in the section of spec-v2 left out by design). Restore them before Gate G0.
- Spec v2 marks "Storage and auth" as Settled; with this phase it now is.
