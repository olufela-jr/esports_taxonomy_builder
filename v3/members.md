# Members: the admin section

Built 2026-09-30. Phase 1 provisioned people with a script the project owner ran (O11's
manual route). That does not scale past the owner, so membership moves into the interface:
a tenant's admins invite people by email, change roles and remove access, and the person's
own first sign-in completes the join. Claims can only be set server-side, so every change is a
Callable Function; the screen only asks.

Decided with the user on 2026-09-30, before building: a super user above tenants comes as a
separate release after this one, read-only inside tenants it is not an admin of (D35 stands:
no rules relaxation for writes), able to create tenants and invite their first admin.

Three commits, Functions first, screen last.

## Step 1: the membership Callables

### What changed

- `functions/src/members.ts` (new): `inviteMember`, `setMemberRole`, `removeMember`,
  `revokeInvite` for a tenant's admins, `acceptInvite` for a signed-in account with no
  workspace. Pure logic over two ports (an `AuthPort` for accounts and claims, a
  `MembersStore` for the users mirror and invites), so the tests run without the emulator or
  the Admin SDK. The guards, whatever the client sends: only an admin of the caller's own
  tenant changes its membership; a person belongs to one tenant, so an account already in
  another tenant is refused, never moved; the last admin cannot be demoted or removed;
  nobody removes themselves; an invite is claimed only by a signed-in account whose
  verified email matches it, oldest invite first.
- Inviting an email whose Auth account already exists provisions it at once (claims set,
  mirror written); otherwise an invite is stored under the tenant and waits.
- `functions/src/index.ts`: the real ports (Admin Auth, this project's Firestore) and the five
  `onCall` exports in `asia-south1`. Pending invites for an email are found by scanning each
  tenant's `invites` collection with an equality query, which needs no collection-group
  index while tenants stay few; switch to a collection-group index if that changes.
- `functions/src/members.test.ts`: 13 cases.

## Step 2: the invites collection in the rules

- `firestore.rules`: `tenants/{tenantId}/invites/{id}` readable by the tenant's admins, never
  written from a client. The invited person cannot look for their own invite (a query by
  email is refused); the Function claims it for them. One emulator case.

## Step 3: the screen, the service and the invite claim

### What changed

- `apps/web/src/data/types.ts`: `TenantUser` gains `name`; new `Invite` and `InviteStatus`.
- `apps/web/src/data/store.ts`: `ListReader` (read-only list) for `members` and `invites`;
  in Firestore they listen only for admins, since the rules let only admins list them.
  Memory mode keeps replaceable lists (`store.memory`) seeded from two new test hooks, with
  the local user always present as a member.
- `apps/web/src/data/members.ts` (new): the one module for membership changes.
  `createMembersService` wraps the four admin Callables, or, in memory mode, a double over
  the store's lists with the same guards and messages as the Function (a test double, kept
  small on purpose). `createInviteClaimer` wraps `acceptInvite` and exists before any store
  does, for the "No workspace yet" screen.
- `apps/web/src/components/Members.tsx` (new): the member table (name, email, role
  selector, remove; the caller's own remove button is disabled), the invites table (pending
  first, revoke on pending), and the invite form. Notices and errors come from the service.
  `MembersAdminsOnly` is what a standard user sees at `/members`.
- `apps/web/src/components/AppShell.tsx`: an "Admin" group in the sidebar with the Members
  action, admins only. `ui-state.ts` accepts `/members` as a last action.
- `apps/web/src/components/SignIn.tsx`: `NoWorkspace` calls the invite claim on arrival and
  on Retry; when an invite is claimed it refreshes the token and the shell appears without a
  second sign-in. The copy explains the wait otherwise.
- `apps/web/src/App.tsx`: members and invites state, the service, the route and the props.
- `scripts/provision-user.ts`: the mirror now carries the display name too.
- `apps/web/e2e/fixtures.ts`: `seedMembers` and two readers; `apps/web/e2e/members.spec.ts`:
  five cases (list and nav, invite with the three refusals, role change with the last-admin
  guard and revoke, remove with the protections, a standard user's view).

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in every package and the root |
| `pnpm test` | 77 (engine), 28 (functions, 13 new), 22 (scripts) |
| `pnpm test:e2e` | 47 of 47 (5 new) |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 20 of 20 (1 new) |
| `pnpm --filter @taxo/functions build` | `deploy/index.js` 35 kB |

### Decisions not spelled out beforehand

- An admin may step down to user while another admin exists; the screen tells them to sign
  out and in to pick up the new role, since claims live on the token.
- Accepted and revoked invites stay in the list as a record rather than being deleted;
  there is no versioning here, just the row's status.
- Email addresses are compared lowercase and trimmed everywhere; the mirror keeps the
  account's own spelling for display.
- The provisioning script stays for bootstrap (the first admin of a tenant, the super user
  later) and for a rescue if every admin is gone; day to day, Members replaces it.

### Leftovers

- No email is sent for an invite (O17 stands: in-app first). The admin tells the person to
  sign in with that Google account.
- The memory double duplicates the Function's guard messages. If they drift, the Playwright
  cases on the double would still pass; the Function tests are the ones that matter.
- Deploy: Functions first (five new Callables), then rules and hosting together.
