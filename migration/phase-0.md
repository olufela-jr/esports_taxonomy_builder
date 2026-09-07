# Phase 0: baseline, toolchain, spec layout, strip Replit

Commits: `741e3cf` (baseline, pushed before any deletion) and `dd245b3` (Phase 0, pushed).

## Why first

CLAUDE.md lists "strip Replit-specific files" as step 6, but nothing in steps 1 to 5 could be verified on a Mac until the toolchain ran. The workspace config removed every darwin native binary (esbuild, rollup, lightningcss, Tailwind oxide) because Replit is linux-x64 only, and the vite config threw without `PORT` and `BASE_PATH`. So a minimal step 6 came first, with the directory moves so every later phase lands in the final paths.

## What changed

Layout (tracked as renames):

- `lib/taxo-shared` to `packages/shared`. Engine file `taxonomy.ts` renamed to `engine.ts`, test likewise; `index.ts` re-exports it.
- `artifacts/campaign-taxonomy-tool` to `apps/web`, package renamed `@taxo/web`.
- `spec.md` to `docs/spec.md`, where CLAUDE.md and the spec's own first line point.

Deleted (186 files): Express `api-server`, Postgres/Drizzle `lib/db`, Orval `lib/api-spec` and the generated `api-client-react` and `api-zod`, the `mockup-sandbox` design canvas, `scripts/`, `screenshots/`, `attached_assets/`, `replit.md`, every `.replit-artifact/`, committed `dist/` output and `.tsbuildinfo` files.

Workspace config:

- `pnpm-workspace.yaml`: packages are `packages/*`, `apps/*`, `functions`. The platform-exclusion overrides, the `@replit` catalog entries, the catalog itself, and the expo pin are gone. `minimumReleaseAge: 1440` kept (review adjustment 2). `onlyBuiltDependencies` keeps only esbuild.
- Root `package.json`: `packageManager: pnpm@10.34.5` (the major that wrote the prototype's lockfile format and supports `minimumReleaseAge`), `engines.node >= 24`, scripts `dev`, `build`, `test`, `typecheck`. Removed `@replit/connectors-sdk`, the `preinstall` guard, and prettier.
- Root `tsconfig.json` deleted: no project references are needed because `@taxo/shared` exports its source and `apps/web` type-checks it directly. `tsconfig.base.json` is now `strict: true` with the per-flag overrides removed.
- Lockfile regenerated. Install went from several hundred packages to 123.

Web app:

- Dependencies pruned to `react`, `react-dom`, `wouter`, `papaparse`, `lucide-react`, `@taxo/shared`, plus Vite, Tailwind, and TypeScript tooling. `lucide-react` stays because every screen uses its icons.
- Deleted the 56-file shadcn/Radix `components/ui` set, `use-toast`, `use-mobile`, `lib/utils`. `App.tsx` no longer wraps in react-query, `TooltipProvider`, or `Toaster`. `not-found.tsx` rewritten without `Card`. `error-boundary.tsx` kept (plain React).
- `index.css`: dropped `tw-animate-css` and `@tailwindcss/typography` after confirming no `animate-` or `prose` classes remain.
- `vite.config.ts`: no `@replit` plugins or `REPL_ID` gate; `PORT` defaults to 5173 and `BASE_PATH` to `/`; removed `host 0.0.0.0`, `allowedHosts`, `strictPort`, and the `@assets` alias.
- `index.html`: title "Campaign Naming Rule Set Tool", Replit and social meta removed. Sidebar brand mark "CT" became "RS".

Added `.gitignore` (node_modules, dist, tsbuildinfo, env files, Firebase and Playwright output).

## Verified

| Check | Result |
|---|---|
| `pnpm install` | Clean; esbuild darwin binary built |
| `pnpm test` | 5 of 5 engine tests pass |
| `pnpm typecheck` | Both packages pass under `strict: true`, no code changes needed |
| `vite build` | 292 kB JS, 38 kB CSS |
| `pnpm dev` | Author, Build, Check render with seed data in headless Chrome |

## Decisions not in the plan

- Dropped the pnpm `catalog` and pinned versions directly in the two package.json files: fewer moving parts for a team with a basic grasp of the tooling.
- Kept Tailwind (user decision at review); only the unused component library and dependencies went.

## Gotchas

- pnpm was not installed; corepack had a stale cache pointing at a missing pnpm 12 binary. `corepack prepare pnpm@10.34.5 --activate` then `corepack enable` fixed it.
- macOS has no `timeout`; poll with a `for` loop and `curl`.
- Headless Chrome's `--screenshot` flag is slow to exit against Vite's HMR websocket. Fine for one-off screenshots; Phase 3 brings Playwright for anything interactive.
