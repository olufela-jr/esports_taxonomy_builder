# Super user: a level above tenants

Built 2026-09-30, straight after Members. Decided with the user the same day: a separate
`superuser` claim, read-only inside tenants it is not an admin of (D35 stands, no rules
relaxation for writes), able to create tenants and invite their first admin. This changes
D36's "no further gradations" by one level, deliberately, and O11's "superadmin only if a
third tenant arrives" is now answered: it arrived as a product need rather than a third tenant.

Three commits, Functions first, screen last.

## Step 1: the scope and the tenant Callables

- `functions/src/tenant.ts`: `isSuperuser` (the claim must be exactly `true`), `superFromAuth`,
  and `inviteScope(auth, requestedTenantId)`: an admin invites into their own tenant (a tenant
  named in the body is ignored), the super user into any tenant they name, or their own by
  default. `inviteMember` and `revokeInvite` now take that scope; `setMemberRole` and
  `removeMember` keep the plain admin guard, so the super user manages roles only where they
  hold the role.
- `functions/src/tenants.ts` (new): `createTenant` and `updateTenant` over a two-method store
  port. The id is a slug, the name non-empty, allowed datasets match BigQuery's id rule and
  are sorted and deduplicated, platforms must be known and are lowercased. A duplicate id is
  refused. `functions/src/tenants.test.ts`: seven cases.

## Step 2: the rules

- `firestore.rules`: `isSuper()` and `canRead(tenantId)`. The super user reads every tenant
  document (so the `tenants` collection lists), Rule Sets, definitions, requests, drafts,
  users and invites. No write rule changed. Two emulator cases, including a super user who is
  also an admin of another tenant: writes there as any admin, reads the first tenant, never
  writes it.

## Step 3: the app

- `apps/web/src/data/auth.ts`: `User.superuser`, from the claim; the memory session takes a
  `__taxoTestSuper` hook.
- `apps/web/src/data/ui-state.ts`: `tenantId`, the workspace a super user is looking at,
  persisted per browser like the Rule Set and Rule. `/tenants` is a last action.
- `apps/web/src/data/store.ts`: the session gains `readAll` (an admin, or the super user):
  it decides what the requests, drafts, members and invites readers ask for, in place of the
  role. In memory mode a tenant other than the local one starts empty.
- `apps/web/src/data/tenants.ts` (new): the tenants directory (a Firestore listener on the
  collection, which the rules now allow the super user) with `create` and `update` through
  the Callables, and a memory directory with the same checks and normalisation.
- `apps/web/src/data/members.ts`: `invite` takes an optional tenant for the super user.
- `apps/web/src/App.tsx`: the viewed tenant is a member's own, or for the super user the one
  picked, their own by default, else the first in the directory. `roleHere` is the caller's
  role in that tenant (null when not a member), `canEdit` follows it, `readAll` adds the super
  user. Switching workspace drops the Rule Set and Rule selection. A super user with no tenant
  at all sees the Tenants screen on its own.
- `apps/web/src/components/Tenants.tsx` (new): tenant cards (platforms, allowed datasets, an
  "Open now" badge, Open, Edit, invite a first admin), the create and edit form with the
  Function's checks applied early. `apps/web/src/components/AppShell.tsx`: the Workspace
  switcher above the Rule Set, a Tenants item under Admin, and the role line "Super user,
  admin here" or "read only here". `Members.tsx`: for a super user who is not an admin of the
  workspace, roles and removal are locked and invites still work.
- `scripts/provision-user.ts`: `--superuser` and `--revoke-superuser`, on their own (tenant
  claims untouched) or alongside a tenant and role.
- `apps/web/e2e/tenants.spec.ts`: five cases (switcher and screen, create with validation and
  duplicate refusal, edit, open another tenant read-only plus invite plus switch back plus
  reload, a plain admin's view).

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in every package and the root |
| `pnpm test` | 77 (engine), 35 (functions, 7 new), 22 (scripts) |
| `pnpm test:e2e` | 52 of 52 (5 new) |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 22 of 22 (2 new) |
| `pnpm --filter @taxo/functions build` | `deploy/index.js` 39.7 kB |

### Decisions not spelled out beforehand

- The super user's own tenant membership is untouched by the claim. Someone can be super user
  and admin of one tenant, or super user with no tenant; the role line says which applies in
  the workspace shown.
- A super user viewing a tenant they are not a member of is `role: 'user'` for the store and
  the UI, with `readAll` for the lists. The Security Rules, not the UI, are what stop a write;
  the UI simply does not offer one.
- The memory doubles (directory and members service) mirror the Function's normalisation and
  guards so the Playwright cases read back what the Function would store.

### Leftovers

- Granting the claim is a script step by design; nothing in the app makes a super user.
- Cross-tenant reporting (one screen over every tenant) is not built; the super user opens
  one workspace at a time.
