# IEP / Student Support Evidence — build status

Mission brief: `CLAUDE_IEP_SUPPORT_EVIDENCE_BUILD.md` (repo root) · Design: `docs/IEP_SUPPORT_EVIDENCE_DESIGN.md`
Branch: `ai/claude-iep-evidence-20260930` (from `origin/main` @ `1fcd1ea7`, PR #400 merged)

> **If you are picking this up after an interruption:** read this file top to bottom, then the design doc.
> Everything marked ✅ is committed and pushed. The first unchecked item in "Phases" is where to resume.
> Never put real student data in code, tests, docs, commits or screenshots — synthetic fixtures only.

## Current state

- **Phase:** complete. A cloud session finished the handoff on 2026-10-01; see **Handoff — completed** at the end of this file.
- PR #401 is ready for review. It is **not merged and not deployed**, and must stay that way until the deploy steps in the PR have been read. The PR body is final.
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
| 7 | Browser QA (fake-school harness) + final hardening + security review + PR | ✅ |

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
- **Cloud sessions** (claude.ai/code containers) run in UTC: run `TZ=America/Chicago npm run test:platform` for the
  school's zone. Playwright (`/opt/node22/lib/node_modules/playwright`) and Chromium (`/opt/pw-browsers/chromium`)
  are the journeys' defaults there. The Firestore emulator jar is not cached; `npx firebase setup:emulators:firestore`
  fetches it before the first `npm run test:rules`.

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
| Phase 7 final (`4341b42a`, cloud, 2026-10-01) | `npm run test:platform` | 6782/6782 in UTC (the container's zone) and with `TZ=America/Chicago` |
| Phase 7 final | `node --test tests/platform/studentIndividualizedDueDates.test.mjs` | 9/9 under UTC, America/Chicago, America/Los_Angeles, Pacific/Auckland, Pacific/Kiritimati; 11 mutations all red in UTC and in America/Chicago |
| Phase 7 final | `npm run test:rules` | 225/225 + 83/83 |
| Phase 7 final | `npm run test:authoring-v5` · `node --test tests/tools/*.test.mjs` | 684/684 · 252/252 |
| Phase 7 final | `npm run lint` · `npm run audit:theme-colors` | exit 0, no warnings in new or changed files · pass |
| Phase 7 final | `npm run build` · `npm run build:firebase` | pass · pass |
| Phase 7 final | `supportEvidenceJourneys.mjs` (1440, 1024, 768×1024, 390×844) + S1 at 844×390 | 28/28 + 1/1; S1's new date checks red under each of their 3 mutations |
| Phase 7 final | `journeys.mjs` A–K + retry (1440, 1024, 768) | 36/36 |

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

## Phase 7 — done

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

**Every student date is the student's own** (commit `4341b42a`). Four surfaces still printed the class due date:
- Home "Do this next";
- the Assignments tab;
- the Grades tab;
- the assignment result.

How it was fixed:
- `studentDueDates(assignment, lifecycle)` sits beside `studentDueDateLines` in `src/assignmentLifecycle.js`. It turns the student-bound lifecycle into the ISO dates a model row stores.
- With no lifecycle, the class fields pass through unchanged.
- The Grade Center entries and the Assignments Center rows use it.
- `resolveNextAction` attaches `dueAt` from the lifecycle each candidate was chosen with: DOL, Warm-Up, resume, in progress, past due, due today, assigned later.
- `WhatShouldIDoNow` prints only that.

The same change makes late and closed rows name an attendance extension's final day.

How it is tested:
- `tests/platform/studentIndividualizedDueDates.test.mjs`: 9 cases, and 11 mutations, each red.
- S1 compares Home "Do this next", the Resume card, the Assignments and Grades rows, the result screen and the header, and rejects the class date.

**Interactive Capability Certification.** The red `certify` runs on this PR are a flaky step in the 3×3 browser test. This branch does not cause them; this was investigated on 2026-10-01.

**What fails.** `tests/browser/algebraicSystems3x3.mjs:239-241` drags the substitution token onto R₂'s z and waits for the Step Algebra solver. The solver never opens.

| Result | Commits |
| --- | --- |
| Failed | `07af5f40`, `f667d11b` (teacherPreview-3x3); `d3cd7ed7` (both 3×3 journeys) |
| Passed | `5c90fd9e`, `70ff9700` and the final head `25e5cc2e` |

`70ff9700` → `d3cd7ed7` changed docs only, so the same code both passed and failed.

**Mechanism, reproduced on untouched `main`:**
- After the isolation solver unmounts, the page scroll settles at a position that depends on timing (smooth `scrollIntoView`, `AlgebraicSystemMode.jsx` ~393).
- When it settles near the top, R₂'s z sits under the sticky `.mathmaster-desktop-action-bar` (`position: sticky; bottom: 0; z-index: 70`).
- Playwright then scrolls to get clear of the bar while the mouse button is held. No dragstart or drop fires, and the mouseup becomes a plain click.

**The same failure happens without this PR.** The identical finding (`:241:14`) appears:
- on `main`: 2 of 17 runs since the test last changed (`7bd8c47e`);
- on unrelated PR branches.

That is about 9% of runs outside this PR.

**Nothing this PR changes reaches that page's layout:**
- The test page mounts `QuestionEngine` directly. It does not render App.jsx, the header, the navigator or Support tools.
- The new CSS targets only `.mathmaster-narrow-support-tools`, or adds `--mm-mod-*` variables.
- The `onSupportEvidence` hooks do nothing without a callback.
- Positions at the drop measure pixel-identical on `main` and on this branch.

**Corrections to the earlier note:**
- Nine files the page loads do change on this branch, although none affects its layout.
- "4 of 18" on `main` counted two Work View failures, which are a different failure.

**Proposed test-only fix.** It is not in this PR, which does not touch the test. Scroll R₂'s z to the centre before that one drag:
```js
const r2z = sub.locator('[aria-label^="R₂: choose where"] [data-variable="z"]');
await r2z.evaluate((el) => el.scrollIntoView({ block: 'center', inline: 'nearest' }));
await settle(page, 150);
await dragTokenOnto(page, token, r2z);
```
- With the scroll forced into the failing position, the current test fails exactly as in CI and the patched one passes.
- Keep the change scoped to this drag. Moving the pre-scroll into the shared `dragTokenOnto` hung an earlier step.

## Handoff — completed 2026-10-01

A cloud session picked this up from the handoff below and finished it on `ai/claude-iep-evidence-20260930`.

1. **Four student surfaces showed the class due date.** Fixed in `4341b42a`, as planned:
   - Home "Do this next" — `resolveNextAction` attaches the date and `WhatShouldIDoNow` prints it;
   - the Assignments tab — `studentAssignmentsCenterModel.js`;
   - the Grades tab and the assignment result — `studentGradeCenterModel.js`.

   All three read the dates through `studentDueDates`. See **Phase 7 — done** for the tests.
2. **Full verification** passed; see the **Verification log**, "Phase 7 final" rows.
3. **CI on PR #401** is green on the final head `25e5cc2e`, including `certify` and Work View. The earlier red `certify` runs are the flaky 3×3 step described above. It is not caused by this PR, and a test-only fix is proposed there.
4. **PR body finalized and the PR marked ready for review.** It is not merged and not deployed.
5. **This file** is marked complete, with the final results in the log.

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
- ~~**"Reduced item count, same rigor" is recorded, not automated.**~~ Superseded: automatic, percentage-based reduction is
  built on `ai/claude-reduced-workload-20261002` (design §11). A bare entry is still recorded-only; see
  `docs/handoffs/STUDENT_SUPPORTS_WORKLOAD_LANGUAGE_STATUS.md`.
- **Offline one-click timestamps reflect server receipt.**

**Pre-existing, backlog:** the student assignment view logs React "Maximum update depth exceeded" in the harness. It was confirmed on untouched `main`.

**Decisions awaiting product-owner confirmation:** design §10. All four were implemented as proposed.
