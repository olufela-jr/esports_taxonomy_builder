# v2 build log

Working notes for the v2 work (hierarchy and UTM tracking URLs) described in `docs/spec.md`,
built in the order given in `CLAUDE.md`. Same cadence as the migration: each step gets one commit
on `main` and one notes file here, written when the step is committed. The migration log in
`migration/` is closed.

| File | What it covers |
|---|---|
| [step-1.md](step-1.md) | `ParentLink` type, `parent?` on `Rule`, `resolveRule` with tests |

Conventions for the notes files are the same as `migration/README.md`:

- What changed, by file, with the reason when it is not obvious from the diff.
- What was verified and how, with the actual numbers.
- Decisions taken during the step that the plan did not spell out.
- Anything left over or worth knowing for the next step.

Closed on 24 September 2026 after step 1. v3 superseded v2; step 2 onward continues as v3
phase 2 in the order given in `CLAUDE.md`, with the log in `v3/`.
