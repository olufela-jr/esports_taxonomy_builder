# Migration log

Working notes for moving the Replit prototype to the target described in `CLAUDE.md` and `docs/spec.md`. Each phase gets one commit on `main` and one notes file here, written when the phase is committed.

| File | What it covers |
|---|---|
| [plan.md](plan.md) | The approved plan: audit findings, decisions, phases 0 to 7, review adjustments |
| [phase-0.md](phase-0.md) | Baseline, toolchain, spec layout, strip Replit scaffolding |
| [phase-1.md](phase-1.md) | Pooled All Rules rollup in the engine, scope toggle in Check |
| [phase-2.md](phase-2.md) | Immutable ids, spec data model, engine owns authoring checks, segment reorder |
| [phase-3.md](phase-3.md) | Playwright regression tests for editor typing and shared context; three defects fixed |
| [phase-4a.md](phase-4a.md) | One store module with Firestore and in-memory implementations; Check All Rules coverage; loud production failure without config |
| [phase-4b.md](phase-4b.md) | State in App.tsx with useState and props, no Context; screens renamed to the spec's component names |
| [phase-5.md](phase-5.md) | Firebase Auth with Google sign-in, owner-only editing, Security Rules with an emulator test |

Phases still to come: 6 (finish stripping, docs), 7 (final verification).

Conventions for the notes files:

- What changed, by file, with the reason when it is not obvious from the diff.
- What was verified and how, with the actual numbers.
- Decisions taken during the phase that the plan did not spell out.
- Anything left over or worth knowing for the next phase.
