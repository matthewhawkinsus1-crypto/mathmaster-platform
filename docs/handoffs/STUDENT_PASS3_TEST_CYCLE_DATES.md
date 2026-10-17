# Student pass 3 — Test Cycle dates (PR-19, PR-20, PR-21)

Branch `claude/pass3-test-cycle-dates`, from `claude/modest-pasteur-xzagn7` at
`6accda1`. Evidence: `docs/qa/student-experience-pass-3/07-open-items-prs.md`
rows PR-19, PR-20 and PR-21. The report was written at 25250b4. All three were
first reproduced on the base before anything changed.

Nothing was deployed. Emulators only.

## PR-21: a Test day nobody could sit closed on the whole class

**Reproduced on the base** with a scratch script against
`functions/shared/testCycleAvailability.mjs`:

- At 13:00 on a Monday, `upcomingClassPeriodDays({ fromDateKey: today })`
  offered today's 10:15–11:05 meeting, which had already ended. Storing it as
  the Test day resolved to `closed` straight away.
- A Test day on an undesignated Friday resolved to `closed` at 00:01 Saturday.

`closed` with no Test started is the missed-Test path
(`studentMissedOriginalTest`). The first card each student opened then created
a stand-in Retest, so one teacher action moved the whole class to Retests.

**What a student saw:** "The Test window closed …", and a Retest instead of
the Test they had not yet been given a chance to take.

**What changed** (`4b64b0f`):

| Where | Change |
| --- | --- |
| `upcomingClassPeriodDays` | Takes `now` and leaves out a meeting whose close is at or before it. Every server caller passes `now`: the teacher's offered days, "set the day for every class from …", and the "It next meets: …" list. |
| `updateTestCycleAvailability` `setClassTestDay` | Refuses today's meeting once it has ended (`failed-precondition`, reason `meetingEnded`). The message says when the class next meets and that the teacher can reopen the window between two times instead. |
| `resolveClassWindows` | A bell-schedule window whose meeting had already ended when it was set (`window.at`) is unresolved, with reason `endedBeforeSet`. This covers data an older server already wrote, and a bell schedule moved earlier on the same day. |
| `resolveTestWindowStatus` | An unresolved window never makes the Test `closed`. That covers a day that passed while undesignated, a class that no longer meets that day, and `endedBeforeSet`. If nothing is open or upcoming, the status is `upcoming` with `stranded: true` and `pendingReason` `dayPassedWithoutTimes` or `endedBeforeSet`. It stays enforced, so the Test cannot be started, and Corrections and the Retest stay closed (they wait on the Test). |
| Words | `describeTestWindow`: "Waiting for a new Test day", with the reason and "so you have not missed it" (to the teacher: "so no student missed it. Set a new Test day, or reopen the window …"). `testWindowRefusal`: "This Test is waiting for a new Test day. Your teacher will set one." Teacher window label: "… (that day's class had ended when it was set: choose a new day)". |

**Cases I checked:**
- **Time zones.** All comparisons are instants, and today is the school zone's day (`schoolTodayKey`). The emulator test uses `SCHOOL_TIME_ZONE`.
- **Periods that span midnight.** `resolvePeriodWindow` already refuses `end <= start`. Such a day is unresolved, so it is refused when set (`does not meet`), and a stored one is stranded, never missed.
- **A teacher setting the day during the period.** Allowed, and the window is open for the rest of the period.
- **A teacher re-setting the day.** It replaces the stranded window with a real one.
- **An extension.** One set before the extended close is a real window.
- **Students already in progress.** Starting is gated, finishing is not, so an attempt under way is untouched. A stand-in Retest that is in progress, submitted or released stays missed, as before (`retestUnderWay`). A stand-in Retest that was assigned but **not started** under the old behaviour now goes back to waiting for a Test day. See owner decision 4 for exactly what such a student sees.

### Review round (integrator, at 89edd87)

The review found a **blocker** in the first version: one stranded day hid a real window that had closed, and a stranded status held the home window shut. For example, a teacher fixes a stranded day the way the panel offers ("Open between two times"), and the reopen runs and closes. Then everyone who sat it was blocked from Corrections and the Retest, absent students were never marked missed, and the teacher read "so no student missed it". I reproduced it with the reviewer's two probes: every mixed case was stranded and blocked.

Fixed in `c9f1b60` and `4d1f157`:

| Where | Change |
| --- | --- |
| `resolveTestWindowStatus` | Falls back to stranded **only when no resolved window has closed**. Otherwise the Test is closed at the windows that ran, as if the stranded day were not there. That covers a reopen, an added day that resolved, and one student's make-up. |
| `resolveFollowUpWindow` | A stranded status **never holds the home window**. A student who sat the Test goes on to Corrections and the Retest even when the window they sat later stops resolving. That covers a rotation flip, a renamed period, a class with no period (as the server's Corrections gate reads it, without the grade document), and old data whose `at` an older server rewrote on re-save. A student who never sat has nothing there to open. |
| `withClassTestDay` | Saving the same day again keeps the first `at`, so new data cannot make a day the class sat read as "set too late". |
| Words | The stranded text claims nothing about who sat or missed it. Teacher: "… Students who have not started the Test cannot start it until you set a new Test day or reopen the window between two times." Student: "… Your teacher will set a new Test day." |
| Teacher panel | New `needsNewDay` field on each class's Test. The panel says "Needs a new Test day: \<classes\>" (should-fix 1). |
| `setTestDayForClasses` | Keeps any class whose window has already opened, and says so in the result ("kept — its Test window already opened …; change its day on its own row"). If nothing is left to move, it refuses with those notes (should-fix 4). |

After the fix, both probes give the reviewer's expected results. Probe 1 cases A, B, D and E are closed: sat students can enter, and never-started students are missed. Probe 2: the sat student enters Corrections under every schedule.

Probe 1 case C (a day the class sat, saved again after it met) is handled two ways:
- **Built by today's `withClassTestDay`:** it keeps the first `at`, so the window is closed.
- **Old data, where `at` was rewritten:** it reads `endedBeforeSet`. Students who sat it still go on. Students who never started it wait for a new day instead of being marked missed, and the panel flags the class.

I kept `endedBeforeSet` rather than dropping it. Its failure mode is reversible: the teacher sets a day, and the absent student sits the real Test. The alternative marks a student missed, gives them a Retest capped at 70, and can't be undone once they start it. This is owner decision 5.

**Proof:**
- `tests/platform/testCycleAvailability.test.mjs`. A new test covers: an ended meeting is not offered; one that is in progress is; `endedBeforeSet`; set before the bell still closes; set mid-period is open; re-setting; extension. The old assertion "an undesignated day ends at its midnight, and then it is over" pinned the defect. It now asserts the day waits, weeks later too, with the words for the student, the teacher and the refusal, and that the follow-up window does not open.
- `tests/platform/testCycleScheduledStages.test.mjs`. A new test: neither case puts a student on the missed-Test path, and neither opens the Test early.
- `tests/integration/testCycleCertification.test.mjs` scenario **J**, run against the emulator with the real callables:
  - `setClassTestDay` for today after the class met is refused with when it next meets, and nothing is stored.
  - `setTestDayForClasses` from today picks tomorrow, and the teacher is offered tomorrow first.
  - A day stored after its meeting ended, and an undesignated day two days ago, both leave the card at `test` / not enterable / not missed, with no Retest and the teacher row not `missedTest`. Start is refused with the new words.
- **Mutation checks**, each confirmed red: drop the `now` filter, drop `endedBeforeSet`, drop the stranded fallback (unit tests); drop the callable refusal, and drop `now` from `setTestDayForClasses` (J).
- **Review round:** `testCycleAvailability.test.mjs` gained two tests:
  - Mixed lists: a closed class reopen, an added day that resolved, a closed student make-up, and a reopen still to come.
  - Re-resolution: a rotation flip, a renamed period, no period, and old re-saved data.
  Each checks the Test state, the home window and the refusal. The assertion that a stranded day keeps the home window "upcoming" pinned the harm and is rewritten. `testCycleScheduledStages.test.mjs` checks who can enter what, beside a reopen and alone. Emulator scenario **L** follows the reviewer's probe through the real callables:
  - old-bug data, then the panel's `reopenClassWindow`;
  - one student sits it, finalizes and fails, and results are released;
  - the reopen closes.
  Then: that student is in Corrections and is issued a Correction question; the absent student is missed and gets the Retest; the teacher row is `closed`, not flagged, and never says "no student missed it"; and the bulk action keeps the class. A wiring contract covers the banner.
- **Mutation checks**, each confirmed red: the `ranAndClosed` guard (unit and L), the follow-up `stranded` guard, keeping `at` on re-save, the bulk keep (L), and `needsNewDay` (L and contract).

## PR-19: the card used the class's late date, not the student's

**Reproduced on the base.** `src/App.jsx` passed
`activeTestCycleAssignment?.lateDueAt || …lateDueDate` to `TestCycleCard`.
That is the class-level field on the shared document. A student's attendance
extension sits under `studentOverrides`, and their individualised extra time is
injected in memory by `projectStudentAssignments`. Only
`getAssignmentLifecycle` resolves either one.

**What a student saw:** after the class's final date, an extended student got
no "Late work is still open", even though they could still work. Between the
class's final date and theirs, the card also showed an earlier final date than
the platform enforces.

**What changed** (`2124043`):
- App builds `activeTestCycleDates` with `getAssignmentLifecycle(activeTestCycleAssignment, Date.now(), { studentId: user.id })` and passes its `dueAt` and `lateDueAt`. That is `resolveStudentDeadlines`, the same precedence the server's `assignmentFinalCloseAt` uses. No deadline math is added.
- `TestCycleCard` takes an optional `dueAt` and uses `dueAt || card.dueAt` (extra time moves the on-time boundary). This is a two-line edit, kept small because session C is also changing this file.

**Review round** (`06b7c60`, should-fix 2): with only the change above, an extended student **in Corrections or the Retest** read "Late work is still open: final late due \<their date\>". But the server closes those at its home window (`resolveFollowUpWindow`), which does not follow an individual extension. The card now picks dates by stage, through `testCycleCardDueFacts`:
- **Ahead of the Test:** the student's own dates.
- **In Corrections or the Retest, or after a missed Test:** the home-window close the server enforces, or the class's final date when no home window is enforced.

App also passes the class's date as `classLateDueAt`. Whether the home window should follow the student's own date stays owner decision 2.

**Proof:**
- `tests/platform/secureTestStudentScreen.test.mjs`. The contract that pinned the class-level read is rewritten per the playbook. It now asserts: the lifecycle call is bound to the Test Cycle screen region; both props are passed; the class-level field is not; and `getAssignmentLifecycle` is imported next to its use.
- A behaviour test: an extended student, after the class's late date, gets "late work still open" until their own date. The old input gives none. A classmate keeps the class's date.
- **Mutation checks**, both confirmed red: App back to the class field; the card ignoring `dueAt`.
- Review round: behaviour cases for each stage (Test ahead: their date; Corrections: the enforced close; Retest with no home window: the class's date; missed: the enforced close). Mutation-checked.

## PR-20: Tests & Exams said "Nothing here yet" about an assigned Test

**Reproduced on the base.** `StudentSecureExamDashboard` listed sessions only,
and a Test Cycle has none until the teacher opens them. "My Course Tests"
showed "Nothing here yet".

**What changed** (`aafbdb9`, `2a1b211`):
- `getStudentTestCycle` accepts `preview: true`. This is a **read-only look**. It returns the same question-free card but does not open a stand-in Retest for a missed Test, and reads no Corrections plan or answer-release state. The response says `preview: true`. The card's own call is unchanged.
- `src/platform/student/assignedTestCyclesModel.js` is pure. `testCyclesWithoutSession` picks the student's own non-archived Test Cycles that have no course-test session in the list. `assignedTestCycleRow` builds a row from the card's own helpers: `studentScheduleBlocks` for when and where, `sittingFactsFor` for the length, and `testCycleDueFacts` for due and final late dates. Nothing is computed a second way.
- The dashboard takes `testCycles` (`{ assignment, dueAt, lateDueAt }`). App passes the student's own Test Cycles with their `getAssignmentLifecycle` dates. Each row fetches a preview of its card.
- Each row shows the status, how long the Test is, the class-time window and whether it is taken in class, and due / "late work still open". Its only action is **Open in Assignments**, the same hand-off a session row uses. There is no Start button. A cycle whose preview fails (not assigned after all, deleted) is left off; Assignments still shows it. "Nothing here yet" appears only when there are no sessions and no assigned rows.
- **"What to bring":** the card says nothing about materials. The row says where the Test is taken (in class or not from home), because that is what the card says. Calculator rules or materials would be new content. Owner decision 3.

**Review round** (`874c230`, should-fix 3): `listStudentSecureExamSessions` is capped at 50 and unordered, so a cycle missing from that list could still have a session. That list now only supplies **candidates**. The read-only preview reports `hasSecureSession` from the student's own record, and a row is shown only when it is explicitly `false`. A missed student's row uses the same stage-aware dates as the card. There is still one preview call per candidate, usually none or one; batching would need a new callable (Not done).

**Nothing withheld is revealed.** The preview is the same payload the student's
own card already gets, plus a yes/no for whether they have a session. The row
shows a subset of it.

**Proof:**
- `tests/platform/testsAndExamsAssignedTestCycle.test.mjs`:
  - row selection;
  - the row's words;
  - no row when `hasSecureSession` is true or missing;
  - the student's own dates, and a missed student's enforced close;
  - delivery text (timed with extended time, and no count for a Retest);
  - the screen renders rows, has no Start, and shows "Nothing here yet" only when empty;
  - service and server carry `preview` and `hasSecureSession`, and the server guards both side effects;
  - App wiring and imports.
- Rewritten contracts:
  - `secureAccessWiring` pinned the dashboard's whole prop list. It now pins that `onPracticeSkill` is a prop.
  - `testCycleSkillNames` pinned the exact `inCorrections` expression. It now allows the `!preview` guard; mutation-checked.
- Emulator scenario **K**, run with the real callables:
  - Before sessions are opened: the session list has nothing for the cycle, and the preview has the window ("Opens … 12:00 AM", "taken in class"), delivery and question count, `hasSecureSession: false`, no `examSessionId` and no `privateGrading`. It **writes no record**.
  - With the window closed and sessions open: the preview shows `missedTest` and `hasSecureSession: true`, and **opens no Retest**. The card itself then still opens it, exactly as before.
- **Mutation checks**, all confirmed red:
  - the server's `!preview` guard (unit and K);
  - the empty state ignoring assigned rows;
  - the dashboard without `preview: true`;
  - selection ignoring listed sessions;
  - the row ignoring the student's dates;
  - the row ignoring `hasSecureSession`.

## Gate (head `874c230`, the reviewed fixes)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11441 / 11441 pass |
| `node --test tests/tools/*.test.mjs` | 1643 pass, 0 fail, 1 skipped. The skip is `provenance … merge-base history not available (shallow clone)`, the same on the base. |
| `npm run lint` | exit 0, 0 errors. 468 warnings, the same count as on the base. |
| `npm run build` | ok |
| `npm run build:firebase` | ok, and no tracked file was rewritten |
| `npm run test:rules` | 243 / 243 and 209 / 209 |
| `npm run test:test-cycle-certification` | **38 / 38** (adds J, K, L) |
| Emulator: `testCycleSecureWorkflow` | 15 / 15 |
| Emulator: `testCycleLifecycleSecurity` | 21 / 21 |
| Emulator: `testCycleReviewProgress` | 4 / 4 |
| Emulator: `secureExamNavigation` | 25 / 25 |
| Browser: `testCycleSecureWorkflowQa` (emulator, real functions, the card's windows) | 170 passed, 0 findings |
| Browser: `testCycleLifecycleQa` | 71 passed, 0 findings |
| Browser: `testCycleDevice` (card on Chromebook and phone) | all 12 device × stage combinations pass |
| Browser: `secureExamNavigation` (Tests & Exams) | 330 / 0. The first round's first run had 2 timing failures in the practice-SAT list, code this branch does not touch; every run since has been 330 / 0. |
| Browser: `appUrlJourneys` (includes `/tests` → Tests & Exams) | all checks pass, 1366x768 and 390x844 |
| Browser: `testCycleRichToolQa` | First round: 364 checks and 14 findings, **the same 14 on the base**. Not in any CI workflow; not re-run this round. |
| Browser: `secureResults` | First round: times out on its first scene, **the same on the base**. Not in any CI workflow; not re-run this round. |

The drivers were run one at a time.

## Deploy targets and order

`node scripts/release-firebase.mjs --since origin/claude/modest-pasteur-xzagn7` (plan only) gives:

1. **Functions, default codebase, all groups.** `functions/index.js` and `functions/shared/testCycleAvailability.mjs` changed. The callables whose behaviour changes are:
   - `updateTestCycleAvailability` (refusal, bulk keep)
   - `getStudentTestCycle` (`preview`, `hasSecureSession`)
   - `listTeacherTestCycleRecords` (offered days, labels, `needsNewDay`)
   - every entry path that resolves a Test Cycle window: `startSecureExamSession`, `issueSecureExamQuestion`, `issueTestCycleCorrectionQuestion`, `submitTestCycleCorrectionResponse`, `runTestCycleBulkAction`, `assignTestCycleSessions`, `teacherTestCycleAction` and others
2. `functions:path-admin`. The planner names it because the shared module changed.
3. **Hosting**, through `npm run deploy:hosting` only.

**The order is required for PR-20.** If Hosting ships first, the Tests & Exams list sends `preview: true` to an old `getStudentTestCycle`, which ignores it. For a student whose window had closed, merely viewing the list would then open a stand-in Retest. With no `hasSecureSession` in the answer, no row would show either. Functions must be live, and `platformBuildInfo` verified, before Hosting. The planner and release wrapper already order it this way. Do not deploy Hosting alone.

No rules or index changes.

**Before deploying, run the read-only count below** (owner decision 4).

## Decisions for the owner

1. **Retroactive A/B designation.** A day that was undesignated during its period and is designated *after* the period ended resolves to a real, closed window. The class is then marked as having missed it, and the first card each student opens creates a stand-in Retest. This is narrower than on the base, but not covered, because the stored data cannot tell "designated late" from "designated on time". Options: record when a day's designation was made, or have the teacher's day picker warn about it. Not built.
2. **The home window and individual extensions.** The Corrections/Retest close (`resolveFollowUpWindow`) uses the class late date plus a teacher's per-student close. It does **not** use the student's attendance extension or extra-time date. The card now agrees with what the server enforces: ahead of the Test it shows the student's own dates, and in Corrections and the Retest it shows the enforced close. Should the home window honour the student's own final close (`assignmentFinalCloseAt`)? That is a grading policy question. If yes, `resolveFollowUpWindow` takes the student's final close and `testCycleCardDueFacts` drops its stage split.
3. **"What to bring".** Neither the card nor the new row lists materials (calculator rules, paper, a charged device). If wanted, it should be authored once, perhaps from the blueprint's `calculatorMode`, and shown on both.
4. **Students the PR-21 bug moved to a stand-in Retest.** Nothing is deleted.
   - **Started it:** in progress, submitted or released. They stay on it (`retestUnderWay`). Their home window is no longer held by a stranded day, so they can finish it.
   - **Never started it:** if their class reads as stranded, they go back to "Waiting for a new Test day". Their record keeps `retest { assigned, withoutOriginal }`. Tests & Exams still lists that "— Retest" session with "Open in Assignments", which leads to the card saying the Test is waiting. The panel flags the class.
   - **When the teacher sets a new day:** if the student starts the original Test, the stand-in is retired, as before. If they miss the new day, they get that same Retest.
   - **Count them first.** Run the read-only script below from the repository root against production with read credentials. It only calls `.get()`. It was checked against a seeded emulator. It lists each class with an unresolved window, whether that class also has a real window, its new state, and its students: never started, stand-in Retest unstarted / started, in Corrections.
5. **`endedBeforeSet` on old data.** A day the class really sat, but which an older server re-saved after the meeting (rewriting `at`), reads as "set too late". Students who sat it are unaffected and go on to Corrections. Students who never started it wait for a new day instead of being marked missed, and the panel flags the class. I kept this because it can be undone (the teacher sets a day). Dropping it would mark the bug's real victims missed instead (a capped Retest). That is a one-line change in `resolveClassWindows`, if the owner prefers it.

```js
// READ-ONLY. Lists Test Cycles whose class windows the new rules read as
// stranded, and what that changes for their students. Only .get() is called.
// Run from the repo root:  node <this file> [projectId]   (ADC credentials)
import { createRequire } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const root = process.cwd();
const require = createRequire(path.join(root, 'functions/package.json'));
const admin = require('firebase-admin');
const av = await import(pathToFileURL(path.join(root, 'functions/shared/testCycleAvailability.mjs')).href);
admin.initializeApp({ projectId: process.argv[2] || process.env.GCLOUD_PROJECT || 'mathmaster-aleks' });
const db = admin.firestore();
const TZ = 'America/Chicago';
const now = Date.now();
const bell = (await db.collection('settings').doc('classSchedule').get()).data() || null;
const assignments = await db.collection('assignments').where('testAvailability.version', '==', 1).get();
const rows = [];
for (const doc of assignments.docs) {
  const availability = doc.data().testAvailability;
  const classWindows = av.normalizeTestAvailability(availability).classWindows;
  for (const classId of Object.keys(classWindows)) {
    const classPeriod = (await db.collection('classes').doc(classId).get()).data()?.period || null;
    const windows = av.resolveClassWindows({ availability, classId, classPeriod, schedule: bell, timeZone: TZ });
    const unresolved = windows.filter((window) => !window.resolved);
    if (!unresolved.length) continue;
    const status = av.resolveTestWindowStatus({ availability, classWindows: windows, now });
    const records = (await db.collection('testCycleRecords').where('assignmentId', '==', doc.id).get()).docs
      .map((entry) => entry.data()).filter((record) => record.classId === classId || record.audience?.withClassId === classId);
    const count = (test) => records.filter(test).length;
    rows.push({
      assignmentId: doc.id, classId, classPeriod,
      unresolved: unresolved.map((window) => `${window.dateKey}:${window.reason}`).join(' '),
      mixedWithARealWindow: windows.some((window) => window.resolved),
      newState: `${status.state}${status.stranded ? ' (stranded)' : ''}`,
      students: records.length,
      testNeverStarted: count((record) => ['none', 'assigned', undefined].includes(record.test?.state)),
      standInRetestUnstarted: count((record) => record.retest?.withoutOriginal === true && record.retest?.state === 'assigned'),
      standInRetestStarted: count((record) => record.retest?.withoutOriginal === true && ['inProgress', 'submitted', 'released'].includes(record.retest?.state)),
      inCorrections: count((record) => record.corrections?.required === true && record.corrections?.complete !== true && record.test?.state === 'released'),
    });
  }
}
console.table(rows);
console.log(`${assignments.size} assignment(s) with a Test window; ${rows.length} class(es) with an unresolved window.`);
```

## Not done

- `TestCycleCard` still has its own inline delivery sentence. `testCycleDeliveryText` in `assignedTestCyclesModel.js` is the same words as a helper. Switch the card to it once session C's card change lands, to avoid a conflict now.
- Tests & Exams makes one preview call per candidate cycle. Batching would need a new callable, which brings its own invoker grant (AGENTS.md); not worth it for the usual zero or one call.
- The secureResults and testCycleRichToolQa driver failures are pre-existing on the base. Not investigated.
- No production data query was run (decision 4).
