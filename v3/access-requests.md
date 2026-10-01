# Access requests: anyone with the link asks, the super user places them

Built 2026-10-01. Until now the only way into a workspace was an invite: an admin had to know
the person's email in advance, and anyone else who signed in with the link hit "No workspace
yet" with nothing to do but wait. The user asked for the reverse direction: anyone can click
the link and request access, and the super user (admin of everything) decides which workspace
they join and at what level.

Decided with the user on 2026-10-01, before building:

- Approver: the super user only. One queue across every workspace; tenant admins never see
  requesters' emails, including people meant for other teams.
- The request: just a button. Name and email come from the Google sign-in; no note.
- Who may ask: any Google account. One request per account (the uid is the document id), so
  one account cannot flood the queue.

Three commits: Functions and rules, the web app, these notes.

## Step 1: the Callables and the rules

### What changed

- `functions/src/access.ts` (new): pure logic over ports, as in `members.ts`.
  - `requestAccess`: any signed-in account without tenant claims. Refuses an unverified email
    with a plain message. Idempotent: asking again returns the request as it stands, so a
    declined request stays declined. A caller who already has a workspace gets
    `{ status: 'member' }` and nothing is written.
  - `decideAccessRequest`: super user only (`superFromAuth`). Decline marks it declined. Approve
    checks the tenant exists and the role is valid, then calls `inviteMember` with the super
    user scoped as an admin of that tenant, exactly as `inviteScope` does for an invite. So
    claims are set the one existing way, with the existing guards (one workspace per person,
    no duplicate membership), and only then is the request marked approved. A declined request
    can still be approved later; an approved one is final.
- `functions/src/index.ts`: the Firestore ports (`accessRequests/{uid}`), the two exports, and
  the tenants store pulled out so `tenantPorts` and `accessPorts` share it.
- `firestore.rules`: `accessRequests/{uid}` readable by the super user and by the requester for
  their own document only; no client writes. The header comment records the exception below.
- `functions/src/access.test.ts`: nine cases. `firestore.rules.test.ts`: one case covering the
  requester, another requester, a tenant admin, the super user, signed-out access and every
  write path.

### Decisions not spelled out beforehand

- The collection sits outside `tenants/`. CLAUDE.md said every document lives under
  `tenants/{tenantId}/`; a person asking for access has no tenant, so there is nothing to put
  the request under. It is the only top-level collection, readable by its owner and the super
  user, written only by the Functions. CLAUDE.md now records the exception.
- The Function sets the claims before it marks the request approved. The requester's screen
  watches the request, so by the time it sees "approved" a fresh token already carries the
  workspace.

## Step 2: the web app

### What changed

- `apps/web/src/data/access.ts` (new): the one module for access requests. Callables for both
  actions, a Firestore listener on the requester's own document, and the super user's queue
  as a listener on the collection. Memory mode keeps one list both sides share, with the
  Function's guards.
- `apps/web/src/components/SignIn.tsx`, "No workspace yet": the invite check still runs first.
  With no invite there is a **Request access** button. The screen then follows the request:
  - pending: "Access requested", and the page opens the workspace by itself once approved;
  - approved: one forced token refresh, and the app renders the shell, with no Retry and no
    second sign-in;
  - declined: "Access declined", with Sign out and no way to ask again;
  - approved but still here after the refresh (removed since): says so and points to the
    administrator.

  Retry stays for an invite sent while they wait.
- `apps/web/src/components/Tenants.tsx`: an **Access requests** table at the top, pending first,
  then the decided ones as a record. Each open row has a workspace select and a role select
  (User by default). The workspace is preselected only when there is exactly one; with more,
  Approve stays disabled until one is picked, so nobody lands in the wrong client's workspace
  by default. `AppShell.tsx`: the Tenants nav item counts the waiting requests.
- `apps/web/src/App.tsx`: the requester and the queue (the latter for the super user only),
  wired to the screen, the standalone Tenants view and the shell.
- `apps/web/src/data/auth.ts`: `__taxoTestNoWorkspace`, a memory-mode hook for a signed-in
  account with no workspace. That screen had no browser coverage before this.
- `apps/web/e2e/access-requests.spec.ts`: six cases (ask and wait, declined, the queue and its
  count, approve with an explicit workspace and role, decline then approve, a plain admin sees
  no queue).

## Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean in every package and the root |
| `pnpm test` | 77 (engine), 44 (functions, 9 new), 22 (scripts) |
| `pnpm exec playwright test` | 58 of 58 (6 new) |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 23 of 23 (1 new) |
| `pnpm build` | Clean |
| `pnpm --filter @taxo/functions build` | `deploy/index.js` 43.6 kB, both new Callables in it |

## Not deployed yet

Nothing here is live, and it depends on the super user release, which is not live either:
`firebase functions:list` on 2026-10-01 showed seven Callables, without `createTenant` or
`updateTenant`. To ship both releases:

1. `firebase deploy --only functions --force`: creates `createTenant`, `updateTenant`,
   `requestAccess` and `decideAccessRequest`, and updates the re-scoped `inviteMember` and
   `revokeInvite` plus the rest.
2. `./deploy.sh`: rules and hosting together (the app and the rules must agree).
3. `pnpm provision:user --email misterfela@gmail.com --superuser`, then sign out and in. Until
   that claim is on the token there is no queue to approve from.

## Leftovers

- No notification. A request appears in the queue and the Tenants nav count, but nothing tells
  the super user one has arrived (O17: in-app first). Worth revisiting if requests sit unseen.
- The requester is told to contact "the person who sent you the link" when declined. There is
  no contact address in the app.
- Removing someone does not end their session at once. `removeMember` clears the claims but
  does not revoke refresh tokens, so the already-issued ID token keeps working until it expires
  (up to an hour). Unchanged by this release; noted because "approve, then change your mind"
  is now a more likely sequence.
- A removed person cannot ask again: their request stays approved, and the screen tells them
  to ask the administrator. Re-adding them is an invite from Members or Tenants.
- The Callable is open to any Google account, as decided. If the queue fills with strangers,
  an email-domain allowlist in `requestAccess` is the smallest fix.
