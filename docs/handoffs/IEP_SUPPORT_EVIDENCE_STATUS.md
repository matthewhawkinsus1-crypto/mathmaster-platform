# IEP / Student Support Evidence — build status

Mission brief: `CLAUDE_IEP_SUPPORT_EVIDENCE_BUILD.md` (repo root) · Design: `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`
Branch: `ai/claude-iep-evidence-20260930` (from `origin/main` @ `1fcd1ea7`, PR #400 merged)

> **If you are picking this up after an interruption:** read this file top to bottom, then the design doc.
> Everything marked ✅ is committed and pushed. The first unchecked item in "Phases" is where to resume.
> Never put real student data in code, tests, docs, commits or screenshots — synthetic fixtures only.

## Current state

- **Phase:** 7, final stretch. Handed off to a cloud session on 2026-09-30. See **Handoff: what remains, in order** at the end of this file.
- PR #401 is still a draft. It is **not merged and not deployed**, and must stay that way. The near-final description is already the PR body.
- **Design:** `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`, with the as-built differences in §9.
- **QA:** `docs/qa/iep-support-evidence.md`. The screenshots come from the fake-school harness only.

## Phases

| # | Phase | Status |
| --- | --- | --- |
| 0 | Reconnaissance, design doc, status doc, first checkpoint push | ✅ |
| 1 | Architecture + schemas + Firestore rules + rule tests | ✅ |
| 2 | Support profile versioning + support resolution / automatic application | ✅ |
| 3 | Telemetry + evidence event logging + engagement metric repair | ✅ |
| 4 | Teacher Support/Evidence UI (hub + drawer) + one-click events + service log | ✅ |
| 5 | Student "Support tools" UI | ✅ |
| 6 | Report model/renderer + grade-impact aggregation + assignment-instance dedup | ✅ |
| 7 | Browser QA (fake-school harness) + final hardening + security review + PR | ◐ finishing — see **Handoff** |

## Environment notes (this machine)

- `npm run test:rules` needs Java; `openjdk-21-jre-headless` was installed on 2026-09-30 for this build.
- CI (`.github/workflows/full-platform-suite.yml`) runs `npm run test:rules` on every PR to `main`.
- Teacher browser harness: `npx vite --config tests/browser/teacherWorkflow/vite.config.mjs` →
  `http://127.0.0.1:5188/tests/browser/teacherWorkflow/index.html?reset=1` (in-memory Firebase fakes).
- **Don't edit files under `src/` or `functions/shared/` while a journey is running**, including mutation checks.
  Vite hot-reloads the harness page mid-journey, and the journey fails for no product reason.
- **Don't start a second Vite server from this checkout while the harness is running.** For example, the main
  config on :5199 for `tests/browser/algebraicSystems3x3.mjs` would share `node_modules/.vite`. Its dependency
  re-optimization makes the harness page fully reload. Run the two one after the other.
- **CI runs in UTC.** Tests of student-facing dates must not assume a Chicago process. Run new date tests with
  `TZ=UTC` as well.

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
| Phase 4 | `npm run test:rules` | 225/225 + 83/83 |
| Phase 4 | `npm run test:platform` | 6749/6750 → moved hub-order contract rewritten + mutation-checked |
| Phase 4 | `npm run build` | pass |
| Phase 6 | `npm run test:platform` | 6771/6771 |
| Phase 6 | `npm run build` | pass |

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

## Phase 4 — done

- `evidenceAggregation.js` — ONE row builder (drawer, hub, report): status from the gradebook's own
  `studentAssignmentProgress`, section scores via `canonicalPresentedSectionGrade`, governing revision on the class
  due date (backdated flag), derived individualized due, Standard vs Modified from what was applied (legacy MOD with
  a caveat), engagement ledger → legacy browser seconds → Not recorded (never "0 min"), gaps phrased as records.
- Evidence corrections: staff `voidsEventId` records (mis-click withdrawn, both excluded from counts) and a one-time
  note added after a one-click by its author within 15 minutes (`noteAddedAt` = server time) — rules + tests.
- Drawer: `StudentSupportEvidencePanel` (profile in effect, MOD separate, extra-time rule, 7 one-click actions with
  optional note / "entered in error", 90-day counts, service minutes this week, recent records, edit-profile dialog).
  Drawer Escape now closes only the top layer.
- Hub: `AssignmentSupportLayer` after Progress — supported students, individual deadlines (extra time AND attendance
  extensions — backlog H5), on-demand evidence rows, per-student one-click actions filed under the assignment.
- `ServiceLogDialog` — minutes by role/service/date/times, weekly total vs profile expectation, corrections by void.
- Student screens show the dates the platform applies (`studentDueDateLines`: "Your due date" / "Your last day to
  turn in"), fixing both extra time and the pre-existing attendance-extension display gap.
- Harness: fake Firestore gained `arrayUnion`/`arrayRemove`; fake `listSignInAccess` now lists roster rows only
  (subcollection docs were being listed as students); fixture seeds a synthetic versioned student and a legacy one.
- Browser pass (fake school, 1440px): drawer section, one-click write + note-after + correction, service log,
  hub layer with loaded evidence, no sideways scroll, no console errors from new code. Found + fixed: absent
  `questionIndex` stored as 0.

## Phase 5 — done

- Student Support tools (`StudentSupportTools.jsx`, `studentSupportTools()`): neutral student labels only, teacher https
  links recorded as "used" when opened, graph paper = grid on the existing scratchpad for entitled students (+ "used").

## Phase 6 — done

- `supportEvidenceReport.js` — the report model: real assigned instances only (class assignment or recorded work;
  unassigned same-title library copies excluded and counted), grading period / dates / assignment filters, profile
  section (revision in effect, revisions in period, expired / backdated / unversioned warnings), executive summary
  (statuses, Standard vs Modified counts and SEPARATE averages, per-support configured / available / provided / used /
  staff records, staff records, active minutes, service minutes, gaps phrased as records), assignment rows with grade
  impact (per-section MathMaster grade + export status from the same history Grade Export reads: not exported /
  exported / uploaded / changed since export / held back / unavailable), chronological timeline (profile, support,
  service, classroom records; withdrawn marked), service summary (weeks vs plan, disclaimer), legend, limitations.
  CSV (formula-neutralised) and JSON exports.
- `SupportEvidenceReportView.jsx` — print-first view (print shows only the report, every section expanded).
  Entry points: drawer "Support evidence report", gradebook and roster buttons (renamed from "Generate IEP Report").
  `openIEPReport`/`buildIEPReportHtml` pop-up retired. Gradebook shows "Time not recorded" instead of "0s".
- Harness: `?as=student&studentId=<id>` signs in a synthetic student (student custom-token claims).
- Browser (fake school): report generated for the versioned and the pre-versioning student (all 7 sections, no library
  copies, no "0 min", CSV download, print hides controls, close returns to the drawer); student view shows
  "Your due date" (individualized), Support tools, and records available / provided / used + a ledger minute.
- Found (pre-existing, confirmed on untouched main in an A/B worktree): the student assignment view logs React
  "Maximum update depth exceeded" in the harness. Not caused by this branch; backlog.

## Phase 7 — done so far

**Browser gate committed.** `tests/browser/teacherWorkflow/supportEvidenceJourneys.mjs` covers:
- T1 drawer section;
- T2 one-click, note-after and "entered in error";
- T3 service log;
- T4 hub supports layer;
- T5 profile editor and a new revision;
- T6 report (7 sections, no library copies, no "0 min", CSV, print);
- S1 student: own due date, neutral Support tools, and available / provided / used records plus a ledger minute.

The existing PR #400 journeys A–K and retry run against the updated fixture.

**Security review hardenings** (commit `07af5f40`):
- A correction (`voidsEventId`) can only withdraw the same author's existing staff record or service entry. This is enforced in the rules and in aggregation, so one staff member cannot erase another's records.
- "Used" counts are de-duplicated per support, assignment, question and minute, so a flood of writes cannot inflate them.
- Teacher-attached student links are re-checked for https at render.

**Narrow screens** (commit `f667d11b`): phones and portrait tablets hide the assignment header by existing design, which hid Support tools there. The panel now also renders in the expanded navigator, under exactly the media conditions that hide the header. A contract test covers this, and S1 passes at 390×844 and 844×390.

**CI fixes** (commit `70ff9700`):
- Two deadline assertions assumed a Chicago process; CI runs in UTC. The suite now passes in five zones, and the rewritten assertions were mutation-checked in two.
- The report's print-only black-on-white is recorded in the theme baseline.

**Interactive Capability Certification** failed twice in CI at `teacherPreview-3x3`: the token drop onto R₂ landed under the floating work bar, so the solver never appeared.
- It is not caused by this branch. The screenshot just before the drag is byte-identical to the green run's, no file the 3×3 page loads changed between the green and red commits, and the journey passes locally (exit 0) on this branch.
- This certification also fails intermittently on `main` (4 of its last 18 runs).

## Handoff: what remains, in order

Everything above is committed and pushed. Resume on `ai/claude-iep-evidence-20260930` (PR #401).

**1. Fix: four student surfaces show the class due date instead of the student's own.**
Found in the browser with the fake student 910002: the class due is Oct 1 and their individualized due is Oct 2. The assignment header and the dashboard assignment card correctly say "Your due date: Oct 2". These four still print "Due Oct 1":
- `src/components/student/WhatShouldIDoNow.jsx:77-79` (Home "Do this next"). It formats `nextAction.assignment.dueAt` directly.
- `src/platform/student/studentAssignmentsCenterModel.js:167-168` (Assignments tab). Rendered at `StudentAssignmentsCenter.jsx:74-76`.
- `src/platform/student/studentGradeCenterModel.js:399-400` (Grades tab and assignment result). Rendered at `StudentGradeCenter.jsx:119-120` and `StudentAssignmentResult.jsx:106-109`.

Each of those models already holds the student-bound lifecycle:
- grade center: `getAssignmentLifecycle(assignment, nowValue, { studentId })` at line 320;
- assignments center: `entry.lifecycle` from the dashboard model, whose provider is bound to the student at `App.jsx` ~11356;
- dashboard output: `dashboard.allEntries[].lifecycle` and `dashboard.resumeLifecycle` for the next-action card.

Planned fix:
- In both models, take `dueAt` / `lateDueAt` from `lifecycle.dueAt` / `lifecycle.lateDueAt` (Dates → ISO strings). Fall back to the class fields when there is no lifecycle.
- For the next-action card, have `resolveNextAction` attach the student's `dueAt`: from `resumeLifecycle` for `resume`, and otherwise from the matching `allEntries` entry. The card then prints that.
- Keep the labels as they are.

Tests:
- Each model gives an individualized date and the class date for another student.
- The next-action card's due comes from the student's lifecycle.
- Mutation-check each assertion.
- Run the new tests under `TZ=UTC` as well, because CI runs in UTC.
- Extend browser journey S1 to assert the "Do this next" card shows the individualized date ("Oct 2" for the fixture).

This also fixes the same pre-existing gap for attendance extensions.

**2. Full verification after the fix:**
- `npm run test:platform`, plus `TZ=UTC npm run test:platform`.
- `npm run test:rules` (needs Java).
- `npm run lint`, `npm run audit:theme-colors`, `npm run build`, `npm run build:firebase`.
- Browser journeys, if Chrome and Playwright are available:
  - `supportEvidenceJourneys.mjs` with `VIEWPORTS=1440x900,1024x768,768x1024,390x844`;
  - `journeys.mjs` (A–K).
  - Run them one at a time, with nothing else editing `src/` or running a second Vite server (see Environment notes).

**3. CI on PR #401.** At `70ff9700`, all checks were green except two:
- **Interactive Capability Certification:** red twice at `teacherPreview-3x3` (a token drop under the floating work bar; analysed above as a CI flake). Re-run the failed job once; if it fails again, investigate. The journey passes locally.
- **Work View Browser Matrix:** still pending at handoff.

**4. Finalize the PR body.** Update the test counts, the browser results and the CI note. Edit with `gh api -X PATCH repos/matthewhawkinsus1-crypto/mathmaster-platform/pulls/401 -F body=@file`; `gh pr edit` silently does nothing on this repo. Then `gh pr ready 401`.
- **Do not merge.**
- **Do not deploy.**

**5. Mark this file complete** and add the final verification results to the log.

## Remaining work / known gaps

**Not done, by instruction:** deploy and merge. The deploy steps, in order, are in the PR description:
- rules;
- the seven listed Cloud Functions;
- Hosting via `npm run deploy:hosting`, which must go with the rules and the functions.

**Known limitations** (PR "Known limitations"):
- **Classroom passback's class-wide `final-deadline` signal still returns a grade at the class cutoff** for students with any individual deadline. This is pre-existing for attendance extensions; it needs a per-student final signal.
- **Per-student Warm-Up and DOL timed windows are not extended by extra time.** Secure-exam multipliers are not applied either.
- **"Next school day" means the next weekday.** A/B meetings and holidays are not known server-side.
- **No provider role.** Providers are recorded by the teacher of record, with a provider role and label.
- **A former teacher's list queries use current-teacher access.**
- **Profile resolution lag in My Math Path.** Its entitlements (`functions/shared/supportEntitlements.mjs`) use the flat keys written at save time. A future-dated revision switches on in the student client and for deadlines automatically, but in Path only at the next save.
- **"Reduced item count, same rigor" is recorded, not automated.** It is recorded as a teacher-documented accommodation; the platform does not pick the items.
- **Offline one-click timestamps reflect server receipt.**

**Pre-existing, backlog:** the student assignment view logs React "Maximum update depth exceeded" in the harness. It was confirmed on untouched `main`.

**Decisions awaiting product-owner confirmation:** design §10. All four were implemented as proposed.
