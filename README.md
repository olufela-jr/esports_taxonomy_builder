# Campaign Naming Rule Set Tool

An internal marketing-operations tool for campaign naming conventions. Convention owners
author Rule Sets (each holding one or more Rules, one per target such as "Google Campaigns"),
builders compose names that are correct by construction, and analysts check names already in
use against a Rule, from a CSV now and from BigQuery in Stage 2.

- `CLAUDE.md`: the short, always-loaded working agreement.
- `docs/spec.md`: the technical contract (from spec v2).
- `docs/spec-v2.md`: the full v2 spec, including the product view and the planning phase.
- `migration/`: the log of moving the prototype to this codebase, one file per phase.

## Layout

pnpm workspaces monorepo. All naming logic lives in one package and is never duplicated.

```
packages/shared/         @taxo/shared: the engine (compose, validate, parse, rollup, checkRuleSet) and its Vitest suite
apps/web/                React + Vite app
  src/data/store.ts      every Firestore or in-memory storage call
  src/data/auth.ts       every sign-in call (Google through Firebase Auth, or a local user)
  src/components/        RuleSetList, RuleSetEditor (Author), Builder (Build), CsvChecker (Check), AppShell, SignIn
  e2e/                   Playwright browser regressions
functions/               Stage 2 only: the scanCampaigns Callable Cloud Function (not yet present)
firestore.rules          Security Rules, tested on the emulator by firestore.rules.test.ts
firebase.json            Firestore rules path, Hosting, emulator ports
```

## Prerequisites

- Node 24 or later.
- pnpm through corepack: `corepack enable`, then any `pnpm` command uses the version pinned in
  `package.json` (`packageManager`).
- Java 11 or later, only for the Firestore emulator (`pnpm test:rules`). On macOS with
  Homebrew: `brew install openjdk@21`, which is keg-only, so put it on the path for that
  command: `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules`.
- The Firebase CLI (`npm i -g firebase-tools`, then `firebase login`), only for the emulator,
  rules deploys and Hosting deploys.

## Run

```
pnpm install
pnpm dev            # http://localhost:5173
```

With no Firebase configuration the app runs on an in-memory store persisted to the browser's
localStorage, signed in as a fixed local user. This is for development and tests only; a
production build refuses to start without configuration.

To run against the real project, copy `apps/web/.env.example` to `apps/web/.env.local` and fill
in the `VITE_FIREBASE_*` values from the Firebase console (Project settings, Your apps, the
"Campaign Naming" web app). Restart `pnpm dev` after changing it. `VITE_STORE=memory` in that
file forces the in-memory store even when Firebase is configured.

## Check

| Command | What it runs |
|---|---|
| `pnpm typecheck` | TypeScript across every package |
| `pnpm test` | The engine's Vitest suite, including the compose and validate round-trip |
| `pnpm test:e2e` | Playwright browser regressions (starts or reuses `pnpm dev`; first run needs `pnpm exec playwright install chromium`) |
| `pnpm test:rules` | The Security Rules against the Firestore emulator (needs Java, no Firebase project needed) |
| `pnpm build` | Typecheck, then a production build to `apps/web/dist` |

Keep all of them green after every change; the engine suite is what proves the round-trip
guarantee.

## Firebase

Project `media-taxonomy-tool` (`.firebaserc`), Firestore in `asia-south1`, Google sign-in,
deployed at https://media-taxonomy-tool.web.app. Signed-in users read every Rule Set; only
the owner can change one. The app checks this in the UI and `firestore.rules` enforces it.

- Deploy rules: `firebase deploy --only firestore:rules`.
- Deploy the app: `pnpm build` then `firebase deploy --only hosting` (Hosting serves
  `apps/web/dist` with a single-page rewrite).

Do not run `firebase deploy` against a project that has no Firestore database yet: the deploy
creates one in a default location, and a database's location is permanent.
