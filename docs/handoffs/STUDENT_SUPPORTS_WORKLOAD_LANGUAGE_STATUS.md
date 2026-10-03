# Automatic reduced workload + language-access supports — build status

Brief: extend the existing versioned support profile / support evidence architecture (PR #401, design
`docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`) — no new support system, no EB-only profile, no second evidence store.

| PR | Branch | Scope | Status |
| --- | --- | --- | --- |
| A | `ai/claude-reduced-workload-20261002` (PR #418) | Automatic `reduced-item-count-same-rigor` (design §11) | ready for review |
| B | `ai/claude-language-supports-20261002` (PR #419, based on A) | Language-access supports through Support tools (design §12) | ready for review; merge after #418 |

> Privacy: every example, fixture and screenshot is synthetic.

## PR A — automatic reduced workload

**What changed (one sentence each).**
- `functions/shared/reducedWorkload.mjs` — the parameter, the governing revision, the deterministic plan, the student
  projection (answered work pinned), the factual summary, and the server helpers.
- `supportCatalog.mjs` — `params: ['itemReduction']`, `supportAutomationFor` (automatic only with a percentage).
- `supportProfileModel.mjs` — validation, `supportPlan.itemReductionHistory` (a step function: a revision governs
  only work due on or after the day it was saved; one row per policy change), an `item-reduction-manual` warning.
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
| `node --test tests/platform/*.test.mjs` | 8214/8214 |
| `npm run test:rules` | 225/225 + 109/109 |
| `npm run test:authoring-v5` · `node --test tests/tools/*.test.mjs` | 686/686 · 1175/1175 |
| `npm run lint` | no warnings on added lines |
| `npm run build` · `npm run build:firebase` · `npm run audit:theme-colors` | pass · pass · pass |
| `supportEvidenceJourneys.mjs` (T1–T7, S1, S2) @1440, 1024 | 18/18; S2/T7 also @390, 768 |
| `journeys.mjs` A–K + retry @1440 | all pass |

Mutation checks (each red, then restored): rules details validation (parity + emulator), server passback filter,
ingestion filter, dashboard omission, App closure (S2 journey: 7 findings), `studentDueDateLines` import contract.

**Known limits.** See design §11.9.

## PR B — language-access supports

**What changed (one sentence each).**
- One effective profile: `effectiveFlatSupportProfile` read by both the student runtime and the Path's entitlement
  adapter (future-dated revisions switch on the same day on the Path); explicit bridge tests.
- Catalog: `translation` derived from the language (never ticked), `glossary-lookup` → Vocabulary platform tool,
  new `chunked-directions` (Break it down, automatic) and `sentence-frames` (Help me say it).
- `src/platform/language/` — math-safe text, math-aware speech, translation providers (authored, then a lazy
  curated Spanish pack; no external service), bilingual vocabulary (lazy), steps, frames, the tools model.
- Student UI — `StudentSupportTray` (lazy) under each question, a Work View "Support tools" drawer, and the same tray
  on My Math Path (whose payload now carries the student's applicable supports and language).
- Evidence/report — per-question facts (available/provided/not-applicable/unavailable with language, provider,
  coverage, surface), "used" on first open; rules accept them only for entitled supports; report headline
  "Available in X of Y eligible", use supplemental; Vocabulary's staff history preserved.
- Editor — the language field explains what it gives the student (no separate Translation box).

**Known limits.** See design §12.11.

**Verification (2026-10-03, this container, UTC).**

| Command | Result |
| --- | --- |
| `node --test tests/platform/*.test.mjs` | 8247/8247 |
| `npm run test:rules` | 225/225 + 110/110 |
| `npm run test:authoring-v5` · `node --test tests/tools/*.test.mjs` | 686/686 · 1175/1175 |
| `npm run lint` · `npm run build` | no warnings on added lines · pass (tray 8.9 kB gzip, `es` pack 10 kB, glossary 19 kB, all lazy) |
| `supportEvidenceJourneys.mjs` (T1–T8, S1–S3) @1440, 1024 | 22/22; S3/T8 also @390, 768, 1366 |
| `journeys.mjs` A–K + retry | all pass |
| Student runtime gates (studentUxPlatform, renderStability, mathEntryContract, toolPolicyGates, stagedQuestion) | all pass |

Mutation checks (each red, then restored): 14 code mutations across the bridge (Path reads stale flat keys, English
counts as a translation, derived ids not entitled), the language modules (math check, curated-pack check, steps check,
authored-translation check, tools shown without a resource, frames everywhere, Read aloud without a speech engine) and
evidence (partial note, Vocabulary staff record and history, language tools recorded at launch), plus the rules'
English-is-not-a-translation clause (emulator). Three guards first survived and gained tests: the curated pack, Break
it down (a real seed-bank prompt, "Determine a and write…"), and authored translations on assignments.

Review of #419 (Codex, 5 findings, all fixed in `fix(supports): Support tools review findings…`, pinned by
`languageSupportsReviewFindings.test.mjs`, 16 mutations each seen red): Path tool questions take the server's list and
record delivery; activity-role scope honoured; translations keyed to their item; capital-letter names guarded; one
authored-translation lookup and rule for regional languages. Re-verified after the fixes: platform 8247/8247, build,
support-evidence journeys 22/22 (+ S3/T8 at 390, 768, 1366), studentUxPlatform and renderStability gates.
