# Campaign Naming Rule Set Tool

A precise internal operations workspace for marketing teams who author, build, and audit campaign naming rules.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/campaign-taxonomy-tool run dev` — run the web app through its managed workflow
- `pnpm --filter @taxo/shared run test` — run the naming rule engine tests
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- The Phase 1 web app requires no external credentials; browser-local persistence is used until Firebase is connected.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Web: React + Vite, Wouter, Tailwind, PapaParse
- Naming engine: framework-independent `@taxo/shared`
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/campaign-taxonomy-tool` — the user-facing web app (Campaign Naming Rule Set Tool)
- `lib/taxo-shared` — naming rule types and the canonical compose/validate engine
- `artifacts/api-server` — shared API server, reserved for future server-mediated features

## Architecture decisions

- The app operates on an action-first navigation paradigm: Author, Build, and Check.
- The Rule Set and individual Rule context is persistently shared in the shell across all three actions.
- Build and Check operate on the Rule selected in the shell context.
- Build and Check must always import the same engine from `@taxo/shared`; never duplicate rule logic in the app.
- Phase 1 persists Rule Sets in `localStorage` behind a hook seam.
- BigQuery scanning is deferred to Stage 2 and must remain read-only.

## Product

- Create, edit, reorder, and delete naming Rule Sets and their Rules.
- Define ordered enum and free-form segments with delimiters, source metadata, platforms, and entity types.
- Compose valid names from a selected Rule.
- Validate CSV data against single Rules or whole Rule Sets (All Rules mode), inspect violations, and export results.

## User preferences

- Keep TypeScript plain and readable.
- Keep the rule engine shared and framework-independent.

## Gotchas

- Optional segments may only appear at the end of a Rule.
- Delimiters are always illegal inside segment values.
- Segment keys must be unique within a Rule.
- Enum matching is exact and case-sensitive.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
