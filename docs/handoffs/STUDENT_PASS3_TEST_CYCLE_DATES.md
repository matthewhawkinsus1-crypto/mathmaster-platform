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
- **Students already in progress.** Starting is gated, finishing is not, so an attempt under way is untouched. A stand-in Retest that is in progress, submitted or released stays missed, as before (`retestUnderWay`). A stand-in Retest that was assigned but **not started** under the old behaviour now goes back to waiting for a Test day. The existing reopen path already behaves this way: it retires the stand-in.

**Proof:**
- `tests/platform/testCycleAvailability.test.mjs`. A new test covers: an ended meeting is not offered; one that is in progress is; `endedBeforeSet`; set before the bell still closes; set mid-period is open; re-setting; extension. The old assertion "an undesignated day ends at its midnight, and then it is over" pinned the defect. It now asserts the day waits, weeks later too, with the words for the student, the teacher and the refusal, and that the follow-up window does not open.
- `tests/platform/testCycleScheduledStages.test.mjs`. A new test: neither case puts a student on the missed-Test path, and neither opens the Test early.
- `tests/integration/testCycleCertification.test.mjs` scenario **J**, run against the emulator with the real callables:
  - `setClassTestDay` for today after the class met is refused with when it next meets, and nothing is stored.
  - `setTestDayForClasses` from today picks tomorrow, and the teacher is offered tomorrow first.
  - A day stored after its meeting ended, and an undesignated day two days ago, both leave the card at `test` / not enterable / not missed, with no Retest and the teacher row not `missedTest`. Start is refused with the new words.
- **Mutation checks**, each confirmed red: drop the `now` filter, drop `endedBeforeSet`, drop the stranded fallback (unit tests); drop the callable refusal, and drop `now` from `setTestDayForClasses` (J).

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

**Proof:**
- `tests/platform/secureTestStudentScreen.test.mjs`. The contract that pinned the class-level read is rewritten per the playbook. It now asserts: the lifecycle call is bound to the Test Cycle screen region; both props are passed; the class-level field is not; and `getAssignmentLifecycle` is imported next to its use.
- A behaviour test: an extended student, after the class's late date, gets "late work still open" until their own date. The old input gives none. A classmate keeps the class's date.
- **Mutation checks**, both confirmed red: App back to the class field; the card ignoring `dueAt`.

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

**Nothing withheld is revealed.** The preview is the same payload the student's
own card already gets, and the row shows a subset of it.

**Proof:**
- `tests/platform/testsAndExamsAssignedTestCycle.test.mjs`, 7 tests: row selection; the row's words; the student's own dates; delivery text (timed with extended time, and no count for a Retest); the screen renders rows, has no Start, and "Nothing here yet" only when empty; service and server carry `preview` and the server guards both side effects; App wiring and imports.
- Rewritten contracts:
  - `secureAccessWiring` pinned the dashboard's whole prop list. It now pins that `onPracticeSkill` is a prop.
  - `testCycleSkillNames` pinned the exact `inCorrections` expression. It now allows the `!preview` guard; mutation-checked.
- Emulator scenario **K**, run with the real callables:
  - Before sessions are opened, the session list has nothing for the cycle, and the preview has the window ("Opens … 12:00 AM", "taken in class"), delivery and question count, no `examSessionId`, no `privateGrading`, and **writes no record**.
  - With the window closed and sessions open, the preview shows `missedTest` and **opens no Retest**. The card itself then still opens it, exactly as before.
- **Mutation checks**, all confirmed red: remove the server's `!preview` guard (unit and K); empty state ignoring assigned rows; dashboard without `preview: true`; selection ignoring listed sessions; row ignoring the student's dates.

## Gate (head `2a1b211`)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11436 / 11436 pass |
| `node --test tests/tools/*.test.mjs` | 1643 pass, 0 fail, 1 skipped. The skip is `provenance … merge-base history not available (shallow clone)`, and it is the same on the base. |
| `npm run lint` | exit 0, 0 errors. 468 warnings, the same count as on the base. |
| `npm run build` | ok |
| `npm run build:firebase` | ok, and no tracked file was rewritten |
| `npm run test:rules` | 243 / 243 and 209 / 209 |
| `npm run test:test-cycle-certification` | 37 / 37 (adds J and K) |
| Emulator: `testCycleSecureWorkflow` | 15 / 15 |
| Emulator: `testCycleLifecycleSecurity` | 21 / 21 |
| Emulator: `testCycleReviewProgress` | 4 / 4 |
| Emulator: `secureExamNavigation` | 25 / 25 |
| Browser: `testCycleSecureWorkflowQa` (emulator, real functions, the card's windows) | 170 passed, 0 findings |
| Browser: `testCycleLifecycleQa` | 71 passed, 0 findings |
| Browser: `testCycleDevice` (card on Chromebook and phone) | all 12 device × stage combinations pass |
| Browser: `secureExamNavigation` (Tests & Exams) | Run 1: 305 passed, 2 failed, both in the practice (SAT) test's question list: "Escape inside the list closes it" and a 30 s timeout in the same journey on Chromebook. That code is untouched. Run 2: **330 / 0**. |
| Browser: `appUrlJourneys` (includes `/tests` → Tests & Exams) | all checks pass, 1366x768 and 390x844 |
| Browser: `testCycleRichToolQa` | 364 checks, 14 findings ("Cannot read properties of null (reading 'questionInstanceId')"). **The same 14 on the base.** Not in any CI workflow. |
| Browser: `secureResults` | Times out on its first scene (`[data-results-score]`). **Same on the base.** Not in any CI workflow. |

The drivers were run one at a time.

## Deploy targets and order

`node scripts/release-firebase.mjs --since origin/claude/modest-pasteur-xzagn7` (plan only) gives:

1. **Functions, default codebase, all groups.** `functions/index.js` and `functions/shared/testCycleAvailability.mjs` changed. The callables whose behaviour changes are:
   - `updateTestCycleAvailability`
   - `getStudentTestCycle` (`preview`)
   - `listTeacherTestCycleRecords` (offered days, labels)
   - every entry path that resolves a Test Cycle window: `startSecureExamSession`, `issueSecureExamQuestion`, `runTestCycleBulkAction`, `assignTestCycleSessions`, `teacherTestCycleAction` and others
2. `functions:path-admin`. The planner names it because the shared module changed.
3. **Hosting**, through `npm run deploy:hosting` only.

**The order is required for PR-20.** If Hosting ships first, the Tests & Exams list sends `preview: true` to an old `getStudentTestCycle`, which ignores it. For a student whose window had closed, merely viewing the list would then open a stand-in Retest. Functions must be live, and `platformBuildInfo` verified, before Hosting. The planner and release wrapper already order it this way. Do not deploy Hosting alone.

No rules or index changes.

## Decisions for the owner

1. **Retroactive A/B designation.** A day that was undesignated during its period and is designated *after* the period ended resolves to a real, closed window. That marks the class as having missed a window nobody could enter. This change does not cover it, because the stored data cannot tell "designated late" from "designated on time". Options: record when a day's designation was made, or have the teacher's day picker warn about it. Not built.
2. **The home window and attendance extensions.** The Corrections/Retest close (`resolveFollowUpWindow`) uses the class late date plus a teacher's per-student close. It does **not** use the student's attendance extension or extra-time date. So an extended student's card now says "Late work is still open … until \<their date\>" (PR-19). The schedule block above it, from the server, says Corrections and the Retest close at the class's final date, and the server enforces that. Should the Retest home window honour the student's own final close (`assignmentFinalCloseAt`)? That is a grading policy question, so I did not change it.
3. **"What to bring".** Neither the card nor the new row lists materials (calculator rules, paper, a charged device). If wanted, it should be authored once, perhaps from the blueprint's `calculatorMode`, and shown on both.
4. **Existing stand-in Retests.** Students who were given a Retest because of the PR-21 bug and have **not started** it will see the Test waiting for a new day once Functions deploy. Those who started it stay on it. A teacher should set a new Test day for any affected class. A read-only query for `retest.withoutOriginal == true` records whose class window has `at >= closesAt` would find them. It was not run, because that would mean production access.

## Not done

- `TestCycleCard` still has its own inline delivery sentence. `testCycleDeliveryText` in `assignedTestCyclesModel.js` is the same words as a helper. Switch the card to it once session C's card change lands, to avoid a conflict now.
- The secureResults and testCycleRichToolQa driver failures are pre-existing on the base. Not investigated.
- No production data query (decision 4).
