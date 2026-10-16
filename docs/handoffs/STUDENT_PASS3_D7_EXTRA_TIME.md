# Student pass 3 — Session G: extra time on the exit ticket (D7, H-117) and Classroom's own cutoff (H-116)

Branch `claude/pass3-d7-extra-time-dol`, from `claude/modest-pasteur-xzagn7` at `a7dddc7`; the base's later move to
`c803501` (Batch 4 hints; the Batch 8 "Maximum update depth" fix) was merged in with a merge commit (no conflicts)
and the whole gate below was rerun on the merged result. Report:
`docs/qa/student-experience-pass-3.md` (decision D7, adopted 2026-10-16) and
`docs/qa/student-experience-pass-3/05-open-items-handoffs.md` rows H-116, H-117, H-120.

## What a student and a teacher saw → what changed → proof

### D7 / H-117 — a student's extra time now stretches THEIR exit ticket (DOL)

**Before.** `getDOLState` took no profile and `sectionDeadline.mjs` said "Warm-Up / DOL class windows cannot move":
a student with an extended-time accommodation got the class's DOL window. The timer, the lock, Home, the
checkpoint finalizer and Recovery all closed their exit ticket with everyone else's.

**Now.** Decision D7: yes for the DOL, which is graded; the Warm-Up stays class-timed.

- **Who.** Exactly the students a secure exam gives extended time to: the multiplier comes from the one
  entitlement resolver (`supportEntitlements.mjs resolveSupportEntitlements`, which
  `secureExamTimeMultiplierFromProfile` in `functions/index.js` also reads) on the pinned `grades/{id}.profile`.
  So a district (structured) `extendedTimeMultiplier` clamped to 1–4; the teacher's "extra time" box, or inclusion
  status, means 1.5; an expired profile keeps applying, an inactive one does not; an unreadable profile grants
  nothing and never throws. One narrowing a secure exam does not need: a versioned plan whose "extra time" entry is
  limited to activities that exclude the DOL ("Activities Extra time applies to" in the profile editor) does not
  stretch the DOL.
- **How much.** The secure exam's arithmetic (`accommodatedTimeLimitSeconds`): the DOL's authored working time ×
  the multiplier, rounded up to a whole minute. The difference is added to the end of whichever class window is in
  force — the regular one, an early unlock, a teacher's reopen or "+5 min" — so extra time never shortens anything
  and a teacher who gives the class more time gives this student the same more. Default timing (10 minutes,
  closing 5 before the bell) × 1.5 ends exactly at the bell; × 2 runs 5 minutes past it, as a secure exam would.
- **"Close now".** The teacher UI offers it only while the CLASS's DOL is open; it ends the window for everyone,
  including students with extra time. The live view shows who has extra time before they press it. Once the class's
  DOL has closed there is no control that ends one student's extra minutes early (the shared rule would honour a close
  record stamped inside them; no screen writes one).
- **Never past the student's own final cutoff.** Work captured after the assignment's final cutoff is refused by
  ingestion, so the extra minutes stop at the student's own final cutoff (their extension included) — never before
  the class's window. Same cap on the device (`getDOLState`) and the server (`resolveAuthoritativeClose`).
- **One source for the profile.** The device reads the grade document's own `profile` field for the window — exactly
  what every server reader uses (`gradeData.profile || null`) — never the normalized copy that falls back to the whole
  grade document. (This also carries a district multiplier to the device.)
- **Without the accommodation: unchanged, to the millisecond** (unit test compares every field).

Where it lives:

| Reader | Change |
| --- | --- |
| `functions/shared/sectionDeadline.mjs` | `dolExtendedTimeMultiplier`, `accommodatedSeconds`, `dolExtraTimeMs`; `resolveDolWindow({ timeMultiplier })` adds `classEndsAtMs`, `extendedTime`, `extendedTimeMs`, `extendedTimeMultiplier`; `resolveAuthoritativeClose` reads the student's profile for the DOL (adds `extendedTime`, `classClosesAtMs`; reasons unchanged); `dolTeacherRecoveryActiveAt({ studentProfile })` |
| The deadline finalizer, the teacher's sweep, draft recovery (`getStudentPersistenceRecoveryReport`, `applyWorkspaceDraftRecovery`, the Classroom persistence hold), Recovery (`resolveOriginalOpportunity`) | all already passed `studentProfile` to `resolveAuthoritativeClose`; they now get the student's DOL close with no call-site change |
| `src/assignmentLifecycle.js getDOLState` | same window on the device. Shape kept: added `classEndsAt`, `extendedTime`, `extendedTimeMs`, `extendedTimeMultiplier`; for a student with extra time `endsAt`, `millisecondsRemaining` and `status` are theirs. Optional `studentProfile` argument |
| `src/platform/assignments/studentAssignmentControls.js` | the student's own projection attaches their profile in memory (`withStudentTimingProfile`, key `studentTimingProfile`), the way `withStudentSupportDates` attaches their due dates. Every existing student `getDOLState` call (App.jsx's chrome, timers and client close; Home) reads their window without being edited. Teacher copies carry none, so teacher controls stay on the class window |
| `src/platform/assessment/dolCloseCopy.js` | `extraTimeNotice`: **"Your exit ticket closes at 10:52 — extra time."** leads the open notice while they work; names no support and no multiplier |
| `src/platform/teacher/dolExtraTimeRoster.js` + `LiveClassMonitor.jsx` | Live view's "Active timers" gains **"DOL extra time · N students · m:ss"** (title lists who), from the same `getDOLState` with each roster row's profile; never on the projector |
| `src/App.jsx` (three small edits, see "Touched outside my area") | passes `extendedTime`/`endsAt` to the DOL copy; the class pack-up banner stands aside while the student's own exit ticket is open on extra time |

Proof:
- `tests/platform/dolExtraTime.test.mjs` (18 tests): the multiplier is the secure exam's; arithmetic parity with
  `secureExamNavigation.accommodatedTimeLimitSeconds`; period end × multiplier on device AND server to the
  millisecond (1.5×, 2×, 1.25×); no accommodation unchanged to the millisecond; A/B days (an override that drops the
  class meets nothing; the bell of the day); a day the calendar closes (undesignated Friday, cancelled period, early
  release extends from its own bell); expired profile applies, inactive does not, `appliesTo` without the DOL does
  not; the legacy flag extends the timed DOL but moves no due date; the Warm-Up stays class-timed; early unlock,
  "+5 min", reopen, "Close now" (and a close inside the extra minutes); the projection injects in memory only;
  Recovery waits; the normalized profile the device and the teacher roster hold gives the server's multiplier for
  every persisted shape; the copy; the teacher helper; the App.jsx and LiveClassMonitor wiring; the pack-up guard.
- `tests/integration/dolExtraTimeServer.test.mjs` (emulator, real Cloud Functions): the finalizer finalizes a DOL
  response inside the student's own window and not after it (receipt cutoff = their close), reschedules one still
  inside it to their close, and judges classmates by the class window exactly as before; Recovery reports
  `original-still-open` for the student and not for a classmate; ingestion accepts the extended student's answer.
- Browser: `tests/browser/dolCloseCopy.mjs` (new cases from a real `getDOLState` on the projected assignment, 1366×768
  and 390×844) and `tests/browser/teacherWorkflow/dolExtraTimeJourneys.mjs` (the real App.jsx: the student keeps
  working after the class's DOL closed and reads their own close; no pack-up banner for them; a classmate's DOL is
  closed and they are told to pack up; Live view lists who still has extra time). Added to the Student and Teacher
  Journeys workflow.

### H-116 — Google Classroom uses the student's own cutoff

**Before.** The checkpoint schedulers wake the whole roster at the CLASS's due time and final cutoff, and both
Classroom triggers returned a `final-deadline` (or `due-checkpoint`) grade for every student, including one whose own
deadline is later. The student saw a returned, possibly incomplete grade in Classroom while MathMaster was still
accepting their work. The split-section path did not honour attendance extensions at all.

**Now.**
- Both triggers (`syncGradeToClassroom` in `functions/index.js`, `syncSectionGradeToClassroom` in
  `functions/classroomSectionEntry.js` via `lib/classroomGradeRuntime.js`) read the student's own due time and final
  cutoff — their private extension and their extra-time dates from their pinned profile
  (`shared/classroomStudentDeadlines.mjs`, `lib/classroomStudentCheckpoints.js`). A class-wide wake-up speaks for
  them only once their own time has arrived; before it the grade is ordinary progress and is not returned.
- Nothing else would wake the trigger at a per-student time, so the trigger records the deferred student's own time
  on the scheduler's state document (`classroomGradeCheckpointState` / `classroomSectionGradeCheckpointState`:
  `pendingStudentFinalAt`, `pendingStudentDueAt`, `{ studentId: ISO }`), and both schedulers wake them when it
  arrives (a final retires their pending due). The trigger, which holds the full assignment and grade document,
  decides; the schedulers read assignments through a narrow field mask and only wake.
- A student with no individual deadline gets exactly the stage and release they got before.

Proof:
- `tests/platform/classroomStudentCutoff.test.mjs` (7 tests): a matrix of every signal × time × progress against a
  frozen copy of the pre-change stage function (identical in every state the schedulers can produce); own dates
  (extension, extra time, both; the legacy box alone moves nothing); final and due wake-ups deferred, not returned,
  recorded, then final; the waker and recorder against fakes; the wiring of both triggers and both schedulers.
- The emulator suite above: the class's final wake-up is final for a classmate and not returned to the extra-time
  student or the student with an attendance extension; both are recorded; after the extension's real cutoff passes
  the scheduler queues exactly that student, the queue releases it and the trigger calls the grade final.

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

| Test | Pinned | Behaviour it protects | Now |
| --- | --- | --- | --- |
| `attendanceExtensionServerParity` "Google Classroom grade passback resolves stage against the per-student final cutoff" | the text of `studentLateDueAt`, `resolvedStudentFinalCutoff` and the trigger's call | Classroom never calls an extended student final before their own cutoff, read from their private record | behaviour through `studentClassroomDeadlines` (shared copy, private record, none) and the lib stage; anchored wiring for the index.js copy (which cannot be imported) |
| `wave2AppWiring` R2-m4 "a closed DOL says who closed it" | the exact `describeDolClose({ status, teacherClosed, outcome })` call | the DOL copy reads the DOL state and the server receipt | the same three arguments are required; further arguments allowed |
| `wave2AppWiring` R2-m4 "the copy the workspace now shows" | `deepEqual` on the not-open copy | frozen object shape | `extraTimeNotice: ''` added, with a comment |

A real finding, not a rewrite: `teacherIdentityArchitecture` Test I caught the first draft of the Live view helper
naming a student by id; it now uses `formatStudentLabel`.

## Mutation checks

Every new or rewritten assertion was broken once and seen to fail. Platform: D7 window 11 (one equivalent
mutation removed as redundant code), copy/roster/wiring 10, pack-up guard 4, H-116 13, rewritten contracts 4.
Emulator: 5 (server close ignores the profile; the trigger never records; the class final always final; the
scheduler never wakes; the trigger ignores the profile) — all red; this also covers the one source-level mutation
the platform contract cannot see (the recorder disabled behind `&& false`). Browser: the copy helper emptied (4
findings in `dolCloseCopy`), the pack-up guard removed and the profile injection removed (`dolExtraTimeJourneys`:
1 and 3 findings).

## Gate

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | done |
| `npm run test:platform` | 11,451 / 11,451 |
| `node --test tests/tools/*.test.mjs` | 1,644 tests, 1,643 pass, 0 fail, 1 skipped |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run lint` | exit 0 (warnings only; none in lines this branch wrote) |
| `npm run build` | pass |
| `npm run build:firebase` (no tracked file rewritten) | pass; `git status` clean afterwards |
| `npm run test:rules` | not run: no rules change (the new state fields live on server-only documents) |
| `npm run test:challenge-finish` (every top-level integration suite, incl. the new one) | 449 / 449 |
| `npm run test:warmup-reopen:emulator` (section deadlines) | 1 / 1 |
| `npm run test:classroom-regrade-report:emulator` (Classroom) | 5 / 5 |
| `tests/browser/dolCloseCopy.mjs` (+ `--legacy` must fail) | all checks pass at 1366×768 and 390×844; `--legacy` fails as designed |
| `tests/browser/teacherWorkflow/dolExtraTimeJourneys.mjs` | pass, 1366×768 and 390×844 |
| Existing drivers for the screens changed, one at a time | teacher `journeys` (A–K, 1440 and 1024), `prerequisiteEarlyJourneys`, `privateControlsJourneys` (392 checks), `warmupReopenJourneys`: pass. `studentNameJourneys`: 6 findings (Attendance History rows labelled "ID 9100xx"), **identical on the base commit** `a7dddc7` (run in a separate worktree), on a screen this branch does not touch. Before the merge, `warmupReopenJourneys` failed with "Maximum update depth exceeded", identically on the base (264 errors each); the base's own fix cleared it |

## Deploying (not done)

```bash
node scripts/release-firebase.mjs --since a7dddc7   # plan only; run here
node scripts/release-firebase.mjs --execute         # the owner, after review
```

The plan (run in plan mode only) lists `functions` (all 25 groups, because `functions/index.js` changed),
`functions:path-admin` (it shares `functions/shared`) and Hosting. No Firestore rules or indexes change.

Cloud Functions whose behaviour changes — if the release is narrowed, it must include all of them together:
`finalizeStudentResponseCheckpoints`, `expediteCheckpointsOnSectionClose`, `sweepStudentResponseCheckpoints`,
`ingestStudentSubmissions`, `advanceSectionRecovery`, `resolveHeldSectionRecovery`, `getStudentPersistenceRecoveryReport`,
`applyWorkspaceDraftRecovery`, `syncGradeToClassroom`, `queueClassroomGradeCheckpoints`,
`syncSectionGradeToClassroom`, `queueClassroomSectionGradeCheckpoints`, and `platformBuildInfo` (provenance).

**Safe order: functions first, then Hosting** (the script's order). With functions live and the old client, a
student with extra time is locked out on their device at the class's close while the server would still accept
and finalize their work — conservative. The reverse (new client, old server) would show them minutes the old
finalizer does not honour for auto-submitted work. During the window between the Classroom trigger and its
scheduler deploying, a deferred student is recorded but not yet woken: deploy `syncGradeToClassroom` /
`syncSectionGradeToClassroom` and their schedulers in the same release.

## Decisions for the owner

1. **The legacy "extra-time" box and inclusion status extend the timed DOL (1.5×)** — following what the secure
   exams implement — while, per the H-120 decision as implemented, the legacy box still moves no due date. Two
   meanings of one box, now documented in one place (`sectionDeadline.mjs`). Confirm, or say the DOL should wait for
   an explicit timing setting like the due date does.
2. **An expired profile keeps extending the DOL** (H-120 as implemented). Confirm.
3. **Extra time can run past the bell** (2× ends 5 minutes after it; 1.5× ends at it). The class pack-up banner now
   stands aside for that student while their exit ticket is open, as it does for a student mid-Test. Confirm, or
   cap the window at the bell.
4. **"Close now" during the class's DOL ends a student's extra time too**, and after the class's DOL has closed there
   is no control to end one student's extra minutes early. The live view shows who has extra time first.
   Alternatives: the close ends only the class window and the student keeps their extra minutes; or a per-student
   close control.
5. **A versioned plan's "Activities" list is honoured** for the DOL (extra time limited to Classwork/Practice does
   not stretch the DOL). Secure exams ignore it. Confirm.
6. **H-116 during an attendance extension:** the student is no longer called final at the class cutoff, but in the
   class's late window they still get the class's `late-progress` stage, which Classroom returns (as every student in
   the late window does). An extra-time student's own due date moves that too, so they see nothing returned until
   their own due. Confirm the attendance case, or hold late progress until the student's own final cutoff.
   Also: deferring the due checkpoint for an extra-time student leaves Google Classroom's own "Missing" label on
   their item until their own due (up to 72 hours or 5 school days), though the class due checkpoint exists to
   replace that label. Confirm, or send a draft-only (not returned) grade at the class due for them.

## Touched outside my area (minimal)

- `src/App.jsx` (session A's region, 3 small edits): the `describeDolClose` call passes `extendedTime`/`endsAt`;
  `studentExtraTimeDolOpen` imported; a two-line guard in `renderStudentPackUpBanner`. No chrome markup changed.
  Outside session A's region: the student's `timingProfile` (the grade document's `profile` field) is kept on the
  user and the projection ref and passed to the three `projectStudentAssignments` calls.
- `functions/classroomSectionEntry.js` and `functions/lib/classroomGradeRuntime.js`: the split-section Classroom path,
  the same H-116 bug. No secure-exam code was touched.
- `tests/browser/teacherWorkflow/fixture.js`: two opt-in flags (`d7=1`, `p3EndMin`); defaults unchanged.
- `.github/workflows/student-teacher-journeys.yml`: one step for the new journey.

For session A (chrome) and C (Home): `getDOLState` now carries `extendedTime`, `classEndsAt` and the student's own
`endsAt`. The chrome's "DOL open · 2m" already follows the student's window; at 390×844 the extra-time line sits
under the action bar, so an "extra time" word in the chrome's DOL pill would be the more visible place.

## Found, not changed

- `functions/index.js` ingestion recomputes the DOL projection after `buildIngestedAttempt` without `allowReopen`,
  so ingestion never reopens a finalized DOL projection, inside a teacher's reopen or not (for anyone; DOL scores are
  computed from the question records, not the projection). `buildIngestedAttempt`'s reopen check now reads the
  student's extra time, so it is right if that is ever changed.
- A district (structured) profile's multiplier does not survive `normalizeStudentProfile`, which the teacher's roster
  holds (the Live view chip). The student's device now reads the raw `profile` field, so it agrees with the server
  for that shape too. The structured shape is never persisted today (its importer is not wired).
- The teacher-workflow harness's `p3StartMin` default is 0, not the documented 40 (`Number(null)` is 0).
- The profile is read when a server reader runs, not when the student captured the work: a teacher who removes extra
  time mid-DOL ends those minutes for checkpoints not yet finalized. A revoked or shortened extension leaves the
  student's pending Classroom entry at the old time, so their final Classroom grade waits until then (it is right
  then: the trigger recomputes the stage).
- The whole-assignment trigger records a deferral before it reads the assignment's whole-assignment publications (a
  student with no progress gets no stage and must still be woken at their own cutoff), so a section-only assignment
  can get a `classroomGradeCheckpointState` entry no scheduler acts on. Harmless.
- Teacher full-roster screens normalize `data.profile || data`; the Live view's "DOL extra time" chip is computed from
  that row (informational only; the student's device and the server use the `profile` field).
- index.js keeps its own copies of the Classroom stage and release helpers rather than the lib's: the lib's release
  policy returns Test Cycle stages to the student and treats `section-grade-reconcile` as a manual retry, which would
  change the whole-assignment path beyond this work. Both copies are pinned (anchored contracts + emulator cases).

## Not done

- The Warm-Up stays class-timed (D7).
- No "extra time" word in the assignment chrome or on Home (sessions A and C own those; the fields are there).
- Teacher class lesson controls (`classLessonControls.js`) still show the class's DOL state only; the live view is
  where "who still has time" appears.
