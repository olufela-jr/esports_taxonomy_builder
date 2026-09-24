# v3 build log

Working notes for the v3 work (multi-tenancy, roles, shared client definitions) described in
`docs/spec-v3.md`. Same cadence as the migration and the v2 log: each scope item gets one commit
on `main`, and each phase gets one notes file here, updated with every commit in that phase.

| File | What it covers |
|---|---|
| [phase-1.md](phase-1.md) | Foundation: enum entries, Auth claims and roles, tenant path, Security Rules, Function guard, migration scripts |

Conventions for the notes files are the same as `migration/README.md`:

- What changed, by file, with the reason when it is not obvious from the diff.
- What was verified and how, with the actual numbers.
- Decisions taken during the step that the plan did not spell out.
- Anything left over or worth knowing for the next step.
