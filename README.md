# Campaign Naming Rule Set Tool

An internal marketing-operations tool for campaign naming conventions. Each client is a
tenant with its own workspace. Admins author Rule Sets (each holding one or more Rules, one
per target such as "Google Campaigns"), everyone in the workspace composes names that are
correct by construction and checks names already in use against a Rule, from a CSV now and
from BigQuery in Stage 2.

- `CLAUDE.md`: the short, always-loaded working agreement.
- `docs/spec-v3.md`: the v3 spec (multi-tenancy, roles, shared definitions); supersedes the
  storage and auth parts of the v2 contract.
- `docs/spec.md`: the technical contract from spec v2 (engine, hierarchy, UTMs, batch).
- `docs/spec-v2.md`: the full v2 spec, including the product view and the planning phase.
- `migration/`: the log of moving the prototype to this codebase, one file per phase.
- `v2/`, `v3/`: the build logs for the v2 and v3 work, one file per step or phase.

## Layout

pnpm workspaces monorepo. All naming logic lives in one package and is never duplicated.

```
packages/shared/         @taxo/shared: the engine (compose, validate, parse, resolveRule, rollup, checkRuleSet) and its Vitest suite
apps/web/                React + Vite app
  src/data/mode.ts       decides memory or Firestore once, before sign-in
  src/data/store.ts      every Firestore or in-memory storage call, scoped to the signed-in tenant
  src/data/auth.ts       every sign-in call (Google through Firebase Auth, or a local user) and the tenant and role claims
  src/components/        RuleSetList, RuleSetEditor (Author), Builder (Build), CsvChecker (Check), AppShell, SignIn
  e2e/                   Playwright browser regressions
functions/               @taxo/functions: the scanCampaigns Callable with the tenant guard (BigQuery body is Stage 2)
scripts/                 one-off Admin SDK scripts: migrate-v3 (data into the first tenant) and provision-user (claims)
firestore.rules          Security Rules, tested on the emulator by firestore.rules.test.ts
firebase.json            Firestore rules path, Hosting, Functions, emulator ports
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
| `pnpm test` | The Vitest suites: the engine (including the compose and validate round-trip), the Function's tenant guard, and the migration transform |
| `pnpm test:e2e` | Playwright browser regressions (starts or reuses `pnpm dev`; first run needs `pnpm exec playwright install chromium`) |
| `pnpm test:rules` | The Security Rules against the Firestore emulator (needs Java, no Firebase project needed) |
| `pnpm build` | Typecheck, then a production build to `apps/web/dist` |

Keep all of them green after every change; the engine suite is what proves the round-trip
guarantee.

## Firebase

Project `media-taxonomy-tool` (`.firebaserc`), Firestore in `asia-south1`, Google sign-in,
deployed at https://media-taxonomy-tool.web.app.

Every document lives under `tenants/{tenantId}/`. A signed-in account carries `tenantId` and
`role` (`admin` or `user`) as custom claims; without them the app shows "No workspace yet".
Members read every Rule Set in their tenant; only admins change them. The UI follows the
role and `firestore.rules` enforces it, refusing any read or write whose path does not match
the caller's tenant.

- Deploy: `./deploy.sh` runs the unit suites, the typecheck and the production build, then
  deploys rules and hosting together and confirms the live page serves the bundle just
  built. `./deploy.sh --check` does everything but the deploy; `--skip-tests` skips the unit
  suites. It refuses to run without `apps/web/.env.local` pointing at the project, or with
  `VITE_STORE=memory` set. By hand, the same is `pnpm build` then
  `firebase deploy --only firestore:rules,hosting` (Hosting serves `apps/web/dist` with a
  single-page rewrite).
- The Function is built (`pnpm --filter @taxo/functions build`) but not deployed yet: it
  needs the Blaze plan and a deploy-time manifest without the `workspace:*` dependency.

### Provisioning and migration (Admin SDK scripts)

Both scripts use Application Default Credentials for the project owner. To keep that login
apart from the machine's default gcloud credentials, log in once into a separate config
directory and point the scripts at the file it writes through a gitignored `.env.scripts`:

```
CLOUDSDK_CONFIG=~/.config/gcloud-media-taxonomy gcloud auth application-default login
CLOUDSDK_CONFIG=~/.config/gcloud-media-taxonomy gcloud auth application-default set-quota-project media-taxonomy-tool
echo "GOOGLE_APPLICATION_CREDENTIALS=$HOME/.config/gcloud-media-taxonomy/application_default_credentials.json" > .env.scripts
```

The person being provisioned must have signed in to the app once so their Auth account
exists.

```
pnpm provision:user --email someone@example.com --tenant <id> --role admin
pnpm provision:user --email someone@example.com --tenant <id> --role user
pnpm provision:user --email someone@example.com --tenant <id> --role admin --tenant-name "New client"   # creates the tenant document
```

The v3 migration moves the pre-v3 `/rulesets` collection into one first tenant, rewriting
flat enum values as label = code entries. Every run writes a JSON backup under `backups/`
first; the legacy collection stays until deleted explicitly.

```
pnpm migrate:v3 --tenant <id> --name "Client name" --dry-run   # backup, transform, verify, write nothing
pnpm migrate:v3 --tenant <id> --name "Client name"             # write the tenant and its Rule Sets, then verify
pnpm migrate:v3 --tenant <id> --delete-legacy                  # later, once everything is verified live
```

After provisioning, the user signs out and in (or presses Retry on the "No workspace yet"
screen) so the token carries the claims.

Do not run `firebase deploy` against a project that has no Firestore database yet: the deploy
creates one in a default location, and a database's location is permanent.
