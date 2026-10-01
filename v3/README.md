# v3 build log

Working notes for the v3 work (multi-tenancy, roles, shared client definitions) described in
`docs/spec-v3.md`. Same cadence as the migration and the v2 log: each scope item gets one commit
on `main`, and each phase gets one notes file here, updated with every commit in that phase.

| File | What it covers |
|---|---|
| [phase-1.md](phase-1.md) | Foundation: enum entries, Auth claims and roles, tenant path, Security Rules, Function guard, migration scripts |
| [phase-2.md](phase-2.md) | Repository: platform list, definitions, resolution on codes, Author and Build for hierarchy and UTMs |
| [phase-3.md](phase-3.md) | Batch build: combinations of codes as a CSV, then the child batch across parents |
| [phase-4.md](phase-4.md) | The BigQuery scan and the impact preview, Functions deployed in the same project |
| [phase-5.md](phase-5.md) | Drafts, blocking in Build while a request is pending, in-app notice |
| [members.md](members.md) | The admin section: Members screen, invites claimed on first sign-in, membership Callables |
| [superuser.md](superuser.md) | A level above tenants: the superuser claim, read-only across tenants, the Tenants screen and workspace switcher |
| [access-requests.md](access-requests.md) | Anyone with the link asks for access; the super user picks their workspace and role |
| [access-test.md](access-test.md) | The live test of sending someone the link, to run once access requests are deployed |
| [compliance-board.md](compliance-board.md) | The Compliance action: violation codes, the cross-Rule aggregator, and the board that says what fails and why |
| [demo-data.md](demo-data.md) | The "Paid search (demo)" Rule Set, its sample names and the BigQuery table, for testing every feature end to end |
| [ui-revamp.md](ui-revamp.md) | Homepage, Manage Rules with the Rule Set tree and the chip-row Rule editor, Definitions with Global and Local lists |

Conventions for the notes files are the same as `migration/README.md`:

- What changed, by file, with the reason when it is not obvious from the diff.
- What was verified and how, with the actual numbers.
- Decisions taken during the step that the plan did not spell out.
- Anything left over or worth knowing for the next step.
