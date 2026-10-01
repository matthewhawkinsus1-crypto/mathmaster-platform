# Student Case Review / Academic Evidence Deep Dive — build status

Mission brief: `docs/handoffs/STUDENT_CASE_REVIEW_BRIEF.md` · Design: `docs/STUDENT_CASE_REVIEW_DESIGN.md`
Branch: `claude/sharp-wozniak-8x3enm` (the session's designated branch; dedicated to this build) from
`origin/main` @ `a7a3b4e` (PR #401 and PR #404 merged).

> **If you are picking this up after an interruption:** read this file top to bottom, then the design doc.
> Everything marked ✅ is committed and pushed. The first unchecked item in "Phases" is where to resume.
> Never put real student data in code, tests, docs, commits or screenshots — synthetic fixtures only.
> Do not deploy. Do not merge.

## Current state

- **Phase:** 7 — everything is built, verified and pushed; the PR is opened from this branch (not deployed,
  not merged).
- **PR:** see the branch `claude/sharp-wozniak-8x3enm` on GitHub.

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Forensic audit (4 parallel read-only audits), brief, design doc, status doc, checkpoint push | ✅ |
| 1 | Provenance model, narrative guard | ✅ |
| 2 | Attempt analysis, skill/TEKS analysis, DOL vs instruction, error-pattern architecture, completion analysis | ✅ |
| 3 | SIS import + reconciliation, optional saved snapshot (rules + emulator tests) | ✅ |
| 4 | Timeline, narrative facts, needs-attention, case model, CSV/JSON export | ✅ |
| 5 | Callable `loadStudentCaseEvidence` (+ pure projection), client store, UI (one component per tab), drawer entry, print | ✅ |
| 6 | Harness fixture + fake callable, browser journeys (1440 / 1366 / 1024 / 768), PR #400/#401 regression journeys | ✅ |
| 7 | Full gate, mutation checks, docs final, PR (not deployed, not merged) | ✅ |

## Environment notes (this container)

- `npm ci` at the root **and** in `functions/` (two platform suites import `googleapis` / `firebase-admin`; without
  `functions/node_modules` they fail with MODULE_NOT_FOUND — not a regression).
- Baseline on untouched main: `npm run test:platform` 6985/6985 once `functions/` deps are installed.
- Java 21 is present for `npm run test:rules`; the Firestore emulator jar may need
  `npx firebase setup:emulators:firestore` first.
- Teacher harness: `npx vite --config tests/browser/teacherWorkflow/vite.config.mjs` →
  `http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1`. Its fake callables return `{}` for
  anything not implemented; its fake Firestore has no `startAfter` / `documentId` / `collectionGroup`.
- PR #401's warnings hold: don't edit `src/` while a journey runs (Vite reloads the page); don't run a second
  Vite server from this checkout at the same time; CI runs in UTC — run date tests with `TZ=UTC` and
  `TZ=America/Chicago`.
- Start the harness server as a long-lived background job (a 30-minute background limit stopped it mid-run
  once; later runs then fail with `ERR_CONNECTION_REFUSED`, which is not an app failure).
- Journeys: `node tests/browser/teacherWorkflow/caseReviewJourneys.mjs` (C1–C6, default viewports
  1440x900, 1366x768, 1024x768, 768x1024; `ONLY=` / `VIEWPORTS=` to narrow), then the regressions
  `supportEvidenceJourneys.mjs` (PR #401) and `journeys.mjs` (PR #400). Screenshots land in the git-ignored
  `tests/browser/artifacts/`.
- Never `git stash` during an unfinished merge: it drops `MERGE_HEAD`. (It happened once here; the merge was
  redone from the last commit with the identical conflict resolution.)

## Audit findings that shaped the design (verified on `a7a3b4e`)

Full tables: design doc §1. The ones that changed the plan:

1. **Per-attempt evidence exists but is not teacher-readable.** `grades/{sid}/evidenceEvents` holds one event per
   graded attempt (attempt number, correct, partial credit, academic time, TEKS at attempt time), written by the
   Admin SDK — without `authorizedTeacherEmails`, and `tests/rules/securityRules.test.mjs` asserts such records
   stay unreadable by teachers. → New read-only callable `loadStudentCaseEvidence` with teacher-of-record
   authorization (Response Inspector pattern) instead of loosening an existing rule.
2. **The question record is a rolling state, not a log.** No attempts array anywhere. Without events, the attempt
   sequence is derived by the attempt policy's rules and earlier attempts read "not correct".
3. **No "opened" record and no assignment-level "submitted" record exist.** Proxies only; "never opened" is never
   stated. Completion = every question answered once; "completed on" = last recorded answer (derived).
4. **Timer defect:** before PR #401 (`76c96238`) no-idle-timer students recorded 0 browser seconds, 0 session
   active seconds and 0 `timeSpent` → Not recorded.
5. **Practice Mode** attempts live only in owner-only `studentWorkspaceDrafts.practice`; Practice Mode *time* is
   recorded nowhere.
6. **No official-gradebook parser exists**; MathMaster stores no category / weight / points / TEAMS item id. The
   import is new, tolerant, mapping-confirmed, and keeps only the selected student's row.
7. **No misconception code is persisted anywhere.** Error patterns read "not determinable" today; a shared code
   catalog + reader is the architecture for future tools.
8. Standards are question-level only; Honors extension questions carry a platform-inferred TEKS (excluded).

## Verification log

| When | Command | Result |
| --- | --- | --- |
| Phase 0, untouched main | `npm run test:platform` | 6983/6985 → the 2 failures are missing `functions/node_modules`; 6985/6985 after `npm ci` in `functions/` |
| Phase 1–3 | `node --test tests/platform/caseReview*.test.mjs` · `npx oxlint src/platform/caseReview/` | 49/49 · clean |
| Phase 5 (before merging main) | `npm run test:platform` | 7105/7105 |
| Phase 5 | Mutation checks: 22 wiring/privacy/source-contract mutations, 6 grade-state / DOL / abbreviation mutations, 5 rules mutations (M1–M5) | every mutation turned the intended test red (one weak assertion strengthened, then red) |
| Phase 6, first journey run | `caseReviewJourneys.mjs` at 1440/1366/1024/768 | 21/24 — C2 at the three 768-high viewports: the test recorded the scroll before Playwright scrolled the row into view; the app restored the true position. Test fixed to record where the teacher actually was |
| Phase 6 fixes found by the browser | an untaken DOL listed as "DOL 0%"; open, unanswered sections shown as 0; badge overflow in tiles; tabs hidden behind a scroll | fixed: grade-item states (`Not started` / `No answers`), lowest DOLs need an answer, wrapping tabs, folded selection |
| After merging `origin/main` (#405, #406) @ `06c16b4` | `npm run test:platform` (UTC) · (`TZ=America/Chicago`) | 7144/7144 · 7144/7144 |
| same | `npm run test:rules` | 225/225 + 96/96 (7 case-review emulator tests) |
| same | `npm run test:authoring-v5` · `node --test tests/tools/*.test.mjs` | 686/686 · 253/253 |
| same | `npm run lint` · `npm run build` · `npm run build:firebase` · `npm run audit:theme-colors` | 428 warnings on main and on this branch, none new · ✓ · ✓ · ✓ |
| same | `supportEvidenceJourneys.mjs` (PR #401: T1–T6, S1 at 1440 and 1024) | 14/14 |
| same | `journeys.mjs` (PR #400: A–K + retry at 1440 and 1024) | 24/24 |
| same | `caseReviewJourneys.mjs` second run | 22/24 — C2 at 1440x900 and 768x1024: with the selection folded, the Grades tab fits the screen, so the test had nothing to scroll. The test now opens the contribution details first (and checks they are still open after Back) |
| final | `caseReviewJourneys.mjs` C1–C6 at 1440x900, 1366x768, 1024x768, 768x1024 | **24/24** |

## Decisions (for the PR)

1. Per-attempt events, receipts, Practice Mode summaries and override audits through one new read-only callable
   (teacher of record / roster teacher / root admin) — not a rules change to `evidenceEvents`.
2. The SIS snapshot is in-memory unless the teacher chooses to save it (`grades/{sid}/sisGradebookSnapshots`,
   staff-only, immutable, one student's rows only).
3. Teacher-entered next steps are kept in the page only (printed, exported, not saved).
4. The production ingestion path is not changed (no misconception pass-through yet; documented as the next
   step in the catalog header).

## Remaining work / known gaps

Tracked in "Phases". Known limits are listed in design doc §1.5.
