# Automatic reduced workload + language-access supports — build status

Brief: extend the existing versioned support profile / support evidence architecture (PR #401, design
`docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`) — no new support system, no EB-only profile, no second evidence store.

| PR | Branch | Scope | Status |
| --- | --- | --- | --- |
| A | `ai/claude-reduced-workload-20261002` | Automatic `reduced-item-count-same-rigor` (design §11) | ready for review |
| B | `ai/claude-language-supports-20261002` (based on A) | Language-access supports through Support tools (design §12) | in progress |

> Privacy: every example, fixture and screenshot is synthetic.

## PR A — automatic reduced workload

**What changed (one sentence each).**
- `functions/shared/reducedWorkload.mjs` — the parameter, the governing revision, the deterministic plan, the student
  projection (answered work pinned), the factual summary, and the server helpers.
- `supportCatalog.mjs` — `params: ['itemReduction']`, `supportAutomationFor` (automatic only with a percentage).
- `supportProfileModel.mjs` — validation, `supportPlan.itemReductionHistory`, an `item-reduction-manual` warning.
- `assignmentLifecycle.js` `studentRequiredQuestions` — the one browser answer; `gradeEvidence.js` takes `supportProfile`.
- App.jsx — one closure (`studentRequiredFor`) read by start, workspace, numbering, question changes, DOL close,
  Warm-Up cards, presence, the student PDF, Home, Grades, Recovery, and the teacher gradebook row/drill-down.
- Cloud Functions — `functions/lib/studentWorkloadIndices.js` at Classroom passback (whole + section), classwork
  completion (ingestion, finalizer, override, reconcile), DOL projection, Recovery.
- Teacher surfaces — canonical/TEAMS grades, progress ("Fewer items · 15 of 20"), parent brief, Case Review
  (`not-required` outcome), Recovery audit, worksheets, live monitor (`n` state, pace, walkthrough).
- Evidence — bounded `details` map; `not-applicable` / `unavailable` student types (rules + parity + emulator tests);
  aggregation verifies records against today's projection; report counts out of eligible work.
- Editor — delivery mode + percentage (presets 25/30/40/50; 10–50 validated centrally).

**Verification (2026-10-03, this container, UTC).**

| Command | Result |
| --- | --- |
| `node --test tests/platform/*.test.mjs` | 8183/8183 (before the last 2 test files; re-run in PR) |
| `npm run test:rules` | 225/225 + 109/109 |
| `npm run test:authoring-v5` · `node --test tests/tools/*.test.mjs` | 686/686 · 1175/1175 |
| `npm run lint` | no warnings on added lines |
| `npm run build` · `npm run build:firebase` · `npm run audit:theme-colors` | pass · pass · pass |
| `supportEvidenceJourneys.mjs` (T1–T7, S1, S2) @1440 | 9/9; S2/T7 also @390, 768, 1024 |
| `journeys.mjs` A–K + retry @1440 | all pass |

Mutation checks (each red, then restored): rules details validation (parity + emulator), server passback filter,
ingestion filter, dashboard omission, App closure (S2 journey: 7 findings), `studentDueDateLines` import contract.

**Known limits.** See design §11.9.

## PR B — language-access supports

See design §12 (added with PR B).
