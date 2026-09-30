# IEP / Student Support Evidence — build status

Mission brief: `CLAUDE_IEP_SUPPORT_EVIDENCE_BUILD.md` (repo root) · Design: `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`
Branch: `ai/claude-iep-evidence-20260930` (from `origin/main` @ `1fcd1ea7`, PR #400 merged)

> **If you are picking this up after an interruption:** read this file top to bottom, then the design doc.
> Everything marked ✅ is committed and pushed. The first unchecked item in "Phases" is where to resume.
> Never put real student data in code, tests, docs, commits or screenshots — synthetic fixtures only.

## Current state

- **Phase:** 4 — teacher Support/Evidence UI: aggregation model, drawer section, hub layer, one-click, service log (next)
- **Design:** `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md` (committed with this checkpoint)
- **PR:** _(not opened yet)_

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Reconnaissance, design doc, status doc, first checkpoint push | ✅ |
| 1 | Architecture + schemas + Firestore rules + rule tests | ✅ |
| 2 | Support profile versioning + support resolution / automatic application | ✅ |
| 3 | Telemetry + evidence event logging + engagement metric repair | ⬜ |
| 4 | Teacher Support/Evidence UI (hub + drawer) + one-click events + service log | ⬜ |
| 5 | Student "Support tools" UI | ⬜ |
| 6 | Report model/renderer + grade-impact aggregation + assignment-instance dedup | ⬜ |
| 7 | Browser QA (fake-school harness) + final hardening + security review + PR | ⬜ |

## Environment notes (this machine)

- `npm run test:rules` needs Java; `openjdk-21-jre-headless` was installed on 2026-09-30 for this build.
- CI (`.github/workflows/full-platform-suite.yml`) runs `npm run test:rules` on every PR to `main`.
- Teacher browser harness: `npx vite --config tests/browser/teacherWorkflow/vite.config.mjs` →
  `http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1` (in-memory Firebase fakes).

## Reconnaissance findings (verified against the code on this branch)

These are the facts the design is built on. File references are to `origin/main` @ `1fcd1ea7`.

**Support profile storage**
- The only persisted profile is the flat `grades/{studentId}.profile` =
  `{ inclusionStatus, accommodations: ['text-to-speech', …], modifications: [...], translationLanguage }`,
  written by the teacher's checkboxes (`App.jsx` ~7743-7760; option list ~10084-10100).
- `firestore.rules` (~155-161) leaves `grades.profile` **student-writable** (asserted in
  `tests/rules/securityRules.test.mjs` ~255-262), yet the server derives entitlements from it
  (`functions/index.js` ~11817). It cannot be the authority for deadlines, grading or evidence.
- `normalizeStudentProfile` (`src/studentSupport.js:3`) flattens to four keys; saving a checkbox wipes any
  structured (SIS-shaped) data. The structured shape (`src/platform/supports/supportProfileResolver.js`,
  `supportProfileImporter.js`) is consumed by nothing in production.
- `functions/shared/supportEntitlements.mjs` is the server adapter for both shapes (legacy `extra-time` →
  multiplier 1.5, only used as Path metadata; `extraAttempts` only affects My Math Path).
- Legacy `inclusionStatus: true` implies declutter, chunking, high contrast, large text, hidden countdowns and a
  disabled idle timer (`getStudentSupportPresentation`, `src/studentSupport.js:21`). Preserve this.

**The current IEP Support Report**
- `buildIEPReportHtml` (`src/studentSupport.js:123`), opened by `openIEPReport` (`src/App.jsx` ~8395) from the
  gradebook's per-student detail ("Generate IEP Report").
- **Duplicate/unrelated rows:** `openIEPReport` maps over **every assignment in the teacher's library**, not the
  student's assigned instances.
- **"0 min" on scored work — root cause:** the effect that runs the 1 s engagement counter
  (`src/App.jsx` ~4207) returns early when `activeSupportPresentation.disableIdleTimer` is true — i.e. for every
  inclusion student and every student with `extra-time`/`disable-idle-timer`. Those students never accumulate
  `grades/{id}.assignmentActivity[aid].totalTimeSeconds`. The accommodation disabled the evidence, not just the
  idle overlay.
- Engagement is client-counted (1 s tick, 120 s idle cutoff, hidden tab excluded), flushed every 30 s by
  `flushAssignmentActivity` (`App.jsx` ~2755) → `recordAssignmentActivity` (`src/assignmentLifecycle.js` ~603);
  no server timestamps; post-deadline Practice Mode is intentionally not counted.
- `supportUsageByAssignment` (gradebook MOD badge / "Instructional condition") is **client-claimed** and merged
  by the server (`functions/shared/submissionIngestion.mjs` ~627-629).

**Existing support events**
- `studentSupportEvents` (`src/platform/teacher/studentSupportStore.js`): append-only, teacher-scoped via
  `authorizedTeacherEmails`, top-level `dateKey` + class/date composite index. Holds live-class support signals
  and attendance (both attendance builders), and attendance-correction reviews.

**Deadlines / extensions**
- Class dates: `releaseAt|dueAt|lateDueAt` (end-of-day America/Chicago), resolver `getAssignmentDate`
  (`src/assignmentLifecycle.js` ~110-138); server twins in `functions/shared/sectionDeadline.mjs`.
- Only per-student store: `assignments/{id}.studentOverrides[sid] = { lateDueAt, extension: {…} }`, written only
  by callable `applyStudentAttendanceExtension` (teacher-of-record check, never-shorten). Rules block client
  writes; **the assignment doc is readable by any signed-in user** — no IEP data may go there.
- An override moves only the FINAL cutoff (`max(classFinal, override.lateDueAt)`); it never moves `dueAt`.
  Four copies of that rule: `assignmentLifecycle.js`, `sectionDeadline.mjs#assignmentFinalCloseAt`,
  `functions/index.js#studentLateDueAt`, `gradeTransfer/studentDeadlineResolver.js`.
- The attendance callable replaces the whole `.extension` map — an IEP grant must never share it.

**Grades / export**
- Three engines: TEAMS ZIP (`gradeTransferModel.js` via `canonicalGradeProjection.js`), Classroom whole-assignment
  (`syncGradeToClassroom`), Classroom section items (`classroomSectionEntry.js`, which ignores overrides,
  extensions and Practice Pass). No accommodation/modification reaches any export today.

**Environment**
- Teacher harness: `tests/browser/teacherWorkflow/` (fake Firebase, :5188), journeys A–K.

## Verification log

| When | Command | Result |
| --- | --- | --- |
| Phase 0, untouched main | `npm run test:rules` | 225/225 rule checks + 64/64 rule suites pass |
| Phase 1 | `npm run test:rules` | 225/225 + 81/81 (64 existing + 17 new) |
| Phase 1 | `npm run test:platform` | 6705/6705 |
| Phase 1 | `npm run lint` | exit 0 (450 pre-existing warnings, none in new files) |
| Phase 2 | `npm run test:platform` | 6719/6721 → 2 moved source contracts fixed per AGENTS.md; both files re-run green |
| Phase 2 | `npm run build` | pass |
| Phase 2 | `npx oxlint` (new files) | clean |
| Phase 3 | `npm run test:platform` | 6734/6734 |
| Phase 3 | `npm run build` | pass (after renaming a colliding import the suite cannot see) |

## Phase 1 — done

- `functions/shared/supportCatalog.mjs` — one classification per support (accommodation / modification / service),
  automation level, measurable evidence, neutral student labels, the 7 one-click actions, legacy ids kept verbatim.
- `functions/shared/supportProfileModel.mjs` — revision validation (misfiled modification = error, never moved),
  pinned projection without privileged fields, effective dating (latest start ≤ date; same start → higher revision),
  documented-vs-in-platform (backdating), legacy pre-versioning profiles, teacher warnings.
- `functions/shared/supportDeadline.mjs` — individualized due/final (school days / hours, school time zone),
  governed by the profile in effect on the class due date, never earlier, in-memory injection only.
- `functions/shared/supportEvidenceModel.mjs` — event taxonomy, staff/student builders, provenance + legend +
  limitations text, service-log arithmetic (voids, weeks, expectations without judgement), engagement ledger logic.
- `firestore.rules` — `grades.profile` pinned against student writes (update + create); client `evidenceEvents`
  creation closed (dead writer removed from `evidencePersistence.js`); 4 new immutable subcollections under
  `grades/{sid}`: `supportProfileRevisions`, `supportEvidence`, `supportServiceLog`, `engagementMinutes`.
- Tests: 4 domain suites + rules/model parity suite (tests/platform), `tests/rules/supportEvidenceRules.test.mjs`
  (17 emulator cases, own projectId). Every new assertion mutation-checked (10 rules mutations + 10 model mutations).
- No new composite indexes needed (all new queries are single-field within one student's subcollection).

## Phase 2 — done

- `src/platform/supportEvidence/supportEvidenceStore.js` — revision + projection in one batch (first save snapshots
  the pre-versioning profile as revision 0), staff/student evidence writers, service log, engagement ledger, readers.
- `src/studentSupport.js normalizeStudentProfile` resolves the revision in effect today from `supportPlan` and passes
  the plan through; legacy flat profiles read exactly as before.
- Individualized deadlines honoured by all four readers: `getAssignmentDate` ('due' moves for extra time only;
  'late' = max of class / attendance / support), `sectionDeadline.assignmentFinalCloseAt` + `resolveAuthoritativeClose`
  (new optional `studentProfile`), Grade Export `resolveStudentFinalDeadlineFromAssignment` (generic reason text).
  Wired: student client (`assignmentsForViewer` at both assignment loads + checkpoint close hint), ingestion,
  checkpoint finalizer, 3 recovery callables — all pass the student's pinned `grades.profile`.
- Engagement root cause fixed: the idle-timer accommodation now suppresses only the idle overlay; the counter runs
  (idle time still never counts). `useEngagementLedger` records server-timed active minutes.
- `SupportProfileEditor.jsx` replaces the flat checkbox Supports tab (versioned, effective dates, source, MOD section,
  service expectations, history). `handleUpdateStudentProfile`/`toggleStudentSupport` removed. Roster "Supports"
  column counts accommodations/modifications, not only inclusion. `--mm-mod-*` theme tokens (light + dark).
- Two existing source contracts moved (not regressions), rewritten per AGENTS.md and mutation-checked:
  `assessmentRecoveryPolicy` count (ledger call no longer reuses the counted spelling) and
  `stepAlgebraDirectCancellationUI` (Apply shortcut option now asserted via catalog + editor).

## Phase 3 — done

- `QuestionEngine`: `onSupportEvidence` — Read aloud available/used, calculator available/used (both open paths via
  `markCalculatorOpened`), and `provided` for a modification only where it changed the item.
- `applyStudentSupportToQuestion`: `usage.modifications`/`modified` = applied only (`modificationsAppliedToQuestion`
  lives beside the transformation); `modificationsConfigured` added. Accommodations keep their "presented" meaning.
- App.jsx: `recordStudentSupportEvidence` (entitlement filter, credit work only, no previews/practice, de-dup:
  fixed ids for available/provided, once per question per minute for used), launch records via
  `launchSupportRecords`, `assignedTeacherEmail` loaded verbatim onto the student user for the rules.
- Build caught a duplicate `recordStudentSupportEvent` import (the live-class writer has that name): evidence
  writers renamed `recordStaffSupportEvidence` / `recordStudentSupportEvidence`.

## Phase 4 checklist (next)

- [ ] `evidenceAggregation.js` (written, not yet tested/committed) + tests: one row builder for drawer/hub/report
- [ ] rules + model: staff `voidsEventId` correction; one-time `note` after a one-click (same actor, 15 min)
- [ ] `StudentSupportEvidencePanel` in the student drawer (profile, one-click actions, recent evidence, minutes,
      report/service/edit entry points)
- [ ] `AssignmentSupportLayer` in the hub (supported students, individualized deadlines, condition, one-click)
- [ ] `ServiceLogDialog`; tests; browser pass in the teacher harness

## Remaining work / known gaps

- Phases 2–7 not started. See design §9 for the file plan.
- Adjacent security fixes made (documented in PR): student-writable profile; client-mintable attempt evidence.
- Decisions awaiting product-owner confirmation: design §10.
