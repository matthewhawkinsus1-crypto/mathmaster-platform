# Student pass 3, Batch 3 — the abandoned timed-test finalizer (2026-10-16)

Branch `claude/pass3-b3-abandoned-test-finalizer`, from
`claude/modest-pasteur-xzagn7` @ `37ec6ce` (Batches 1 and 2). Server side of
Batch 3 ("Never lose work") only; the client persistence half is another lane.

Closes the follow-up in `STUDENT_PUSH_B_TESTS.md`: "An expired-and-abandoned
session stays in progress until the student returns or a teacher
force-submits; a scheduled finalizer would need a stored deadline."

## What happens now

A secure Test, Retest or timed practice test the student walked away from
after its time ran out is finished by the server about two to seven minutes
after its deadline. It is finished exactly as the student's own time-up
finishes it (`finalizeSecureExam` with `timeExpired`):

- every saved draft is graded on the server as it was saved, a blank question
  is recorded unanswered (`finalizeSecureSessionInTransaction`, the one shared
  definition of how a test ends), status `time_expired`;
- the Test Cycle record is synced (`syncTestCycleSessionState`), so the
  student's card ("awaiting release"), the teacher's table (ready to release)
  and the class's answer hold (`courseAnswersRelease` reads the records) all
  see it submitted;
- a practice test with automatic release is released (`autoReleaseSecureSession`).
  A course Test still waits for the teacher's release, as before.

The student who comes back finds a finished test, and a released review where
one applies.

## Design

**Where the deadline is stored.** `examSessions/{id}.autoFinalizeAt` (ms since
the epoch, or null). It is a query hint, never the authority.

**How it is computed** (`secureExam.autoFinalizeAtFor`, `functions/lib/secureExam.js`):
`deadlineFor(session)` — the rule every save, issue and time-up check already
uses — plus a grace of 2 minutes (`AUTO_FINALIZE_GRACE_MS`). `deadlineFor` is
`startedAt` + (`timeLimitSeconds` + `addedTimeSeconds` + `pausedSeconds`). The
student's extended time is already in `timeLimitSeconds`: start multiplies it
once from the support profile. Null when nothing should finish on its own:
untimed, not started or already finished, a proctor's pause (`locked_proctor`:
the proctor can add time or submit), or a teacher's pause that stopped the
clock with time left. A pause that began after the deadline keeps the test
expired (as `deadlineFor` already does), so it keeps that deadline.

**Who writes it.** Start (`startSecureExamSession`). A resume of a session that
has none (started by the previous build). A proctor's lock, unlock and added
time (`proctorExamAction`). The assignment hold's pause and resume
(`holdCourseTestClocks`). Every way a test ends clears it
(`finalizeSecureSessionInTransaction`, so the student's submit, time-up and the
proctor's force-submit; the teacher's reset and the stand-in Retest's close,
which write `force_submitted` directly).

**The decision.** `secureExam.autoFinalizeDue(session, now)`, in the
finalizer's transaction: the session is in progress or integrity-locked, it is
expired by `isExpired` (pauses included), and the grace after the deadline has
passed. A stale hint (written before a change by a previous build) can only
make the finalizer look early, find the session not due and write the true
hint back, or look late. A course session the record no longer points at (a
reset replaced it) is left for the teacher, as the student's own Submit is
refused for it, and its hint is cleared.

**Schedule and batches.** `finalizeAbandonedSecureExams`: `onSchedule`, every
5 minutes, `invoker: "private"`, 300-second timeout. Each run:

1. `examSessions where autoFinalizeAt <= now orderBy autoFinalizeAt limit 50`,
   one transaction per session, in order;
2. one page (100) of the sweep below.

A session that throws is logged and pushed back 15 minutes (its hint only), so
a broken one cannot hold the batch's places. Overlapping runs are safe: the
transactions serialize and the follow-ups are idempotent.

**Idempotency and concurrency.** Each session is decided inside a Firestore
transaction that reads it first. A session finished meanwhile — the student's
Submit, the proctor's force-submit, a reset — is seen there and nothing is
written to it (the emulator case gates the finalizer's transaction, submits as
the student in between, and checks the stored document and its update time are
exactly what the submit left). Firestore re-runs the transaction if the session
is written after the read. The finalizer's own finish writes
`autoFinalizedAt` and keeps the hint until the record sync and the release have
run; then a last transaction clears the hint. If the function stops between the
two, the next run finds the finished session with its hint and runs the
follow-ups again (both are idempotent) without finishing it a second time. A
second run after a complete one writes nothing to the session or the record.

**Sessions written before this release: derived, not left.** A session started
before the hint existed has no `autoFinalizeAt`, and Firestore cannot query a
missing field. Deriving is provably safe: the derived deadline is
`deadlineFor` over the fields the session already holds, the same rule every
callable already applies to it today, and once that deadline has passed every
save is refused (`deadline-exceeded`). So the drafts the server grades are
exactly the ones the student's own time-up would grade on their return.
The sweep pages through every started, unfinished session by document id (100
a run). Each one without a hint is either finished (time up and grace passed)
or given its derived hint, which hands it to the ordinary query.
Its bookmark is `platformMigrations/secureExamAutoFinalizeDeadlines` (server
writes only; the collection's rule lets the root administrator read it). It
stops for good after a whole pass finds nothing, once that pass began at least
6 hours after the first run. The wait covers a release still rolling out,
when an instance on the previous build can start a session with no hint.
A student's resume also stores a missing hint.

**Not in a browser.** `publicSession` strips `autoFinalizeAt` and
`autoFinalizedAt` (the deadline the screen shows is still `expiresAt`, the same
rule). `examSessions` stays Admin-SDK only.

## Files

- `functions/lib/secureExam.js` — `AUTO_FINALIZE_GRACE_MS`, `autoFinalizeAtFor`,
  `autoFinalizeDue`; `publicSession` strips the two fields.
- `functions/lib/secureExamAutoFinalize.js` (new) — batch sizes, backoff, the
  sweep's pure state machine.
- `functions/index.js` — the scheduler and the per-session finalizer (after
  `finalizeSecureExam`); the hint written by start/resume, `proctorExamAction`,
  `holdCourseTestClocks`; cleared by `finalizeSecureSessionInTransaction`, the
  reset in `teacherTestCycleAction` and the stand-in close in
  `syncTestCycleSessionState`.
- `tests/integration/secureExamAutoFinalize/secureExamAutoFinalize.test.mjs`
  (new, 11 emulator cases), `npm run test:secure-exam-auto-finalize`, its own
  emulator project. It runs the real scheduler, which finishes every due
  session in its project, so it cannot share the parallel integration run. It
  is a step in `.github/workflows/full-platform-suite.yml`
  (`integrationSuiteCoverage` requires every integration file to be in CI).
- `tests/platform/secureExamAutoFinalize.test.mjs` (new, 10) — the pure rules,
  the sweep, the browser view and the wiring, which CI sees in `test:platform`.
- `tests/rules/securityRules.test.mjs` — no client (the root administrator
  included) can write the hint, query by it, or write or delete the sweep
  bookmark; only the root administrator reads the bookmark.
- `package.json` — the script.

No client change: the screens already read the status the finish writes.

## Tests and mutation checks

Emulator cases: time left and within the grace not touched (and the grace
held when the finalizer is made to look now); expired and abandoned finished
once, graded as saved, released, a second run writes nothing; extended time
left is time left (also when made to look); a stale hint written back; the
student's Submit racing the finalizer left as the submit wrote it; a proctor's
pause, before or after the deadline, left for the proctor, and the unlock gives
the hint back; a course Test finished this way is submitted on the card, the
teacher's table and the answer hold, with nothing written by a second run; a
record sync that fails after the finish (injected) is completed by a later run
without finishing twice; a teacher's pause with a minute left not finished
over two hours, then finished once the minute runs out after the resume; a
course session the record no longer points at left for the teacher; legacy
sessions derived (finished, hinted, hinted on resume), the sweep completing
and staying complete.

Each behaviour was broken on purpose and the suites rerun (23 mutations on the
code, 5 more aimed at the platform file). Every one of the 23 turns the emulator suite red, except one equivalent mutant: a
terminal session's already-null hint written null again changes nothing. The
platform file catches each one that can be seen without the emulator (the pure
rules, the wiring, the browser view, the private scheduler, the bounded
queries, the retry branch), and the two rules cases fail when the
`examSessions` or `platformMigrations` rule is opened.

## Deploy (owner's step, through `node scripts/release-firebase.mjs`)

**Functions only.** No rules change, no new index, no Hosting change.

- **Functions** (default codebase), the exports that reach changed code (the
  start, proctor, reset, hold and finish paths, `syncTestCycleSessionState`
  and `publicSession`), plus `platformBuildInfo` for the release's verify step:

  ```
  finalizeAbandonedSecureExams createSecureExamSession finalizeSecureExam
  issueSecureExamQuestion listProctorExamSessions listStudentSecureExamSessions
  manageAssignmentLifecycle proctorExamAction saveSecureExamDraft
  startSecureExamSession submitSecureExamResponse teacherTestCycleAction
  platformBuildInfo
  ```

  ```
  node scripts/release-firebase.mjs --only functions --functions finalizeAbandonedSecureExams,createSecureExamSession,finalizeSecureExam,issueSecureExamQuestion,listProctorExamSessions,listStudentSecureExamSessions,manageAssignmentLifecycle,proctorExamAction,saveSecureExamDraft,startSecureExamSession,submitSecureExamResponse,teacherTestCycleAction
  ```

  The default plan (`--since 37ec6ce`) proposes the whole fleet, because
  `functions/index.js` changed, and Hosting, because `package.json` changed
  (only a test script; no client change), which also works. `firebase deploy`
  creates the Cloud Scheduler job for the new scheduled function.
- **Rules**: `firestore.rules` is unchanged. The new hint lives on
  `examSessions`, which is already closed to every client, and the bookmark
  lives in `platformMigrations`, which is already server-written. Rules tests
  for both were added.
- **Indexes**: none. Both queries are single-field (`autoFinalizeAt` range with
  its own order; `status in` ordered by document id), which Firestore's
  automatic single-field indexes serve.

**Order inside the functions step.** Deploy `finalizeAbandonedSecureExams` in
the same release as the start, proctor and finish callables. Rolling out in any
order is safe. A new scheduler running beside old callables only acts on
`deadlineFor`, which those callables share. An old callable that misses the
hint leaves a session to the sweep (6-hour settle) or to the student's next
resume, at worst as today. **Do not pause or resume a live Test while
`manageAssignmentLifecycle` is rolling out** (same note as B2).

## Open decisions

- **Grace: 2 minutes; schedule: every 5 minutes.** So a finish lands 2–7
  minutes after the deadline. The student who is present finishes at the
  deadline themselves, as before.
- **A proctor-paused test is never finished by the server**, even one paused
  after its time ran out (the student's own time-up would finish it). The
  proctor holding it decides; it shows in the proctor monitor as paused.
- **Integrity-locked tests are finished** when their time runs out, because
  the clock runs through an integrity lock, as the student's own time-up does.
- **The sweep's bookmark is in `platformMigrations`**, whose rule lets the
  root administrator read it (it holds a session id and times). No new
  collection.
