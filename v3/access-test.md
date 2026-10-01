# Access test: the first real outside sign-in

To run after the super user and access request releases are deployed (`v3/access-requests.md`,
"Not deployed yet"). Every access path had only ever been exercised by the account that is
already the `esports` admin, plus Playwright cases against the in-memory doubles. This is the
test of what a person handed the link actually sees, run live against
https://media-taxonomy-tool.web.app with one colleague, through the path real use will take:
they open the link, they request access, you approve it.

Fill each **Result** in as you go. Where a result does not match the expectation, say what
happened instead rather than smoothing it over: the mismatches are the whole value of the file.

## Live state going in

Read on 2026-10-01, before testing:

- Deployed Callables (`firebase functions:list`): `acceptInvite`, `inviteMember`,
  `setMemberRole`, `removeMember`, `revokeInvite`, `scanCampaigns`, `previewImpact`. Seven,
  all `asia-south1`. No `createTenant` or `updateTenant`, so the super user release is
  committed but not live, and no super user path is covered here.
- Google sign-in provider: enabled. No Auth blocking functions configured.
- Authorized domains: `localhost`, `media-taxonomy-tool.firebaseapp.com`,
  `media-taxonomy-tool.web.app`.
- The GCP project sits under organization `1021587057179`, which `misterfela@gmail.com`
  cannot describe. The OAuth consent screen's audience could not be read from the CLI (the
  IAP API is disabled on the project), so it is step 0 below.

## Step 0: the OAuth consent screen

Console: https://console.cloud.google.com/auth/audience?project=media-taxonomy-tool

Audience mode found: _(Internal / External Testing / External In production)_

Test users listed, if Testing: _()_

**Result:** _()_

If Internal, an account outside the organization is blocked by Google before the app loads,
and nothing in the app can change that.

## Step A: they open the link and ask

Sent to the colleague: the URL and which Google account to use. No invite beforehand.

Expected: Sign in, the Google popup, then "No workspace yet" naming their email, with a
**Request access** button. They press it; the heading becomes "Access requested" and the text
says the page opens their workspace by itself once approved.

What they saw, verbatim, before and after pressing: _()_

**Result:** _()_

## Step B: you approve while they wait

Your side, signed in as the super user: the Tenants nav item shows a count of 1. On Tenants,
their row is under Access requests. With only `esports` the workspace is preselected; leave the
role on User and press **Approve**.

Expected on their side, without touching anything: the page opens their workspace, role
"User" in the sidebar. No Retry, no reload, no second sign-in.

Did it open by itself, and how long after you pressed Approve: _()_

If not, what got them in (Retry / sign out and in / neither): _()_

Your side: the row shows approved, Esports, user; they appear in Members: _()_

**Result:** _()_

## Step C: what a standard user can and cannot do

| Check | Expected | Result |
| --- | --- | --- |
| Author | opens a Rule Set read-only, no New Rule Set button | |
| Build | fully usable | |
| Check | fully usable | |
| Dictionary | sees definitions, can request a value, cannot add one | |
| Members nav | hidden | |
| `/members` direct | "Only a workspace admin can see and manage members." | |
| Compliance scan | runs; "Paid search (demo)" reports 14 of 24 valid | |

Notes: _()_

## Step D: promote, then demote

Set their row to Admin, they sign out and in.

Expected: Members nav appears, Author becomes editable.

**Result:** _()_

Set back to User afterwards: _()_

## Step E: removal, and how long it takes

Remove them in Members, then they reload.

Expected: still inside for up to an hour. `removeMember` clears the claims but does not call
`revokeRefreshTokens` (`functions/src/members.ts:189`), and the app loads the cached token
(`apps/web/src/data/auth.ts:135`, `forceRefresh: false`), so the already-issued ID token keeps
satisfying the Security Rules until it expires. Signing out and in drops them to No workspace
at once.

**Result:** _()_

How long until the reload actually locked them out: _()_

Then they sign out and back in. Their request is still marked approved, so expect the screen
to say their access was approved but they are not in a workspace now, and to point them at the
administrator. They cannot ask again; re-adding them is an invite from Members.

Message read back verbatim: _()_

Did it make the next step obvious to them: _()_

## What this changes

_(Fill in after. Anything that surprised you, and whether it needs a code change, a doc change
or nothing. Known before the test, from `v3/access-requests.md`: nothing notifies you when a
request arrives; removal is not immediate.)_
