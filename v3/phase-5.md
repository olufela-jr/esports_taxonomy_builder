# Phase 5: drafts, blocking and in-app notice

v3 release phase 5, the rest of the request flow after the Dictionary's submit and approve
(phase 2 step 2b). D42: a member with a pending request is blocked on that segment, the build
is saved as a draft and resumes on approval. O17: in-app notice first.

## Step 1: the data layer

### What changed

- `apps/web/src/data/types.ts`: `BuildDraft` (Rule Set, Rule, the selections so far, the parent
  step's name, the blocked segment's id and key, the request it waits on, status blocked, ready
  or done) and its draft type; `ValueRequest.draftId?` for the spec's shape, though the app links
  the two by the draft's `requestId`.
- `firestore.rules`: `tenants/{tenantId}/drafts/{id}`: a member creates, updates and deletes
  their own, an admin reads every one and updates one (to mark it ready), the owner never
  moves, every write stamped. `firestore.rules.test.ts`: a blocked draft seeded and three new
  cases, including a request carrying a draft id.
- `apps/web/src/data/store.ts`: a `drafts` collection from the same factory, own-only for a
  standard user like requests; local persistence key and `__taxoTestDrafts` hook.
- `apps/web/src/components/Dictionary.tsx`: approving a request also marks the draft waiting on
  it ready; a pending request with a draft shows "Build waiting".
- `apps/web/src/components/AppShell.tsx` and `App.tsx`: a badge on the Dictionary action, the
  count of pending requests for an admin, or of decided requests a member has not yet seen (seen
  ids kept per browser; opening the Dictionary clears it).

## Step 2: Build

### What changed

- `apps/web/src/components/Builder.tsx`: on a definition-backed segment in Single mode, "Value
  missing? Request it" opens an inline form (label, code, note) checked against the definition
  the way the Dictionary form is. Sending creates the request and a draft with the selections
  so far, and the segment is blocked: control disabled, a notice with the request's state, Copy
  disabled, a "Discard draft" action. "Your drafts for <Rule>" lists the member's open drafts
  for the Rule with their state (waiting, rejected with the reason, or approved and ready to
  resume); Open returns to a blocked draft, Resume on a ready one fills the selections plus the
  approved code and marks the draft done.
- `apps/web/e2e/drafts.spec.ts` (3 tests): a member requests a value and the build becomes a
  blocked draft that reopens later; an approved request's draft resumes with the new value and
  the member's badge clears on visiting the Dictionary; an admin sees the pending badge and
  approving marks the draft ready.

### Verified

| Check | Result |
|---|---|
| `pnpm typecheck` | Clean |
| `pnpm test` | 62, 13, 13 |
| `PATH="/opt/homebrew/opt/openjdk@21/bin:$PATH" pnpm test:rules` | 19 of 19 (3 new) |
| `pnpm test:e2e` | 38 of 38 (3 new) |
| `pnpm --filter @taxo/web build` | Clean |

### Decisions not spelled out in the spec

- A draft is linked to its request by `requestId` on the draft, written in one create; the
  spec's `draftId` on the request is accepted by the rules but not relied on, which avoids a
  second write to the request.
- Blocking applies to Single mode; Batch offers no request form, since a batch needs every
  value present.
- Rejection leaves the draft blocked with the reason shown; the member discards it or keeps it
  and asks again through the Dictionary. No automatic re-request.
- The notice is a badge, not a toast or email (O17: in-app first). The "seen" list is a
  per-browser convenience in localStorage, never shared.
