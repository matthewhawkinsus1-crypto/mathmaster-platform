# Student pass 3, Batch 3 — the release (2026-10-17)

Batch 3 ("Never lose work") on its own, on top of `main` @ `56a5a5b`, so it can
ship without Batches 1, 2, 4 and 8. The detail is in the two handoffs:

- `STUDENT_PASS3_BATCH3_CLIENT.md` — the browser half. Answers on two
  Chromebooks merge answer by answer (multi-answer, Step Algebra, composed
  answers), a draft that cannot be saved says so, and a submission the device
  could not queue is not shown as submitted (RUN-3).
- `STUDENT_PASS3_B3_ABANDONED_TEST_FINALIZER.md` — the server half. A timed
  Test, Retest or practice test left after its time ran out is finished by the
  server two to seven minutes after the deadline, graded as it was saved.

## How it was put on main

The Batch 3 commits were cherry-picked (`-x`) onto `main` @ `56a5a5b`, in
their order. One conflict: the imports at the top of `QuestionEngine.jsx`
(main's imports kept, `isSubmissionNotQueued` added). Three test-only commits
adapt the batch to main, which has no Batch 1 closed card:

| Commit | What |
| --- | --- |
| `ef03c79` | `tests/platform/submitNotQueued.test.mjs`: the outcome box's condition is read with or without Batch 1's `!isExpired` clause. |
| `2eb9922` | The teacher-workflow harness page names the app's icon, so Chromium does not request `/favicon.ico` and log a 404 the journeys count (same fix as `8e51f65` on the pass-3 branch). |
| `f57a547` | `tests/browser/submitNotQueued.mjs` finds the engine's alert where main renders it, and still where Batch 1 does. |

No product code differs from the reviewed Batch 3 branches except that import
line.

## Gate on this commit

| Gate | Result |
| --- | --- |
| `npm run test:platform` | 11,377 of 11,377 |
| `node --test tests/tools/*.test.mjs` | 1,644 of 1,644 |
| `npm run lint` | pass (no errors) |
| `npm run build`, `npm run build:firebase` | pass; tree clean after |
| `test:rules`, `test:challenge-finish`, `test:canonical-persistence`, `test:secure-exam-auto-finalize` | pass (201, 441, 35 and 11 cases) |
| `test:draft-persistence` | every family passes navigate, reload, reopen and backup |
| Browser drivers: durableOutboxRecovery, draftEditTime, composedDraftRestore, duplicateTabs, staleTabRecord, toolDraftSyncSweep, warmupReopenDraft, familyPinContainment, submitNotQueued | all pass |

`npm run test:durable-outbox` skips here (its launcher looks for Playwright in
`node_modules`); the file it runs, `tests/browser/durableOutboxRecovery.mjs`,
ran as a driver above with Chromium and passed.
| Real App, one at a time: draftCrossDeviceJourneys, restoredDraftFocusRaceJourneys, recoveryDraftCrossDeviceJourneys | 42, 164 and 100 checks, all pass |

`recoveryDraftCrossDeviceJourneys` reports one pre-existing console note (the
draft sync declining to store an oversized Recovery entry); the same note is
in the pass-3 branch's gate.

## Releasing (owner, from Cloud Shell)

Release outside class time. Then ask teachers to have students reload: until
every open tab has the new build, a save from an old tab drops the per-answer
edit times, and those answers merge by the old rule (client handoff, note 1).
Do not pause or resume a live Test while `manageAssignmentLifecycle` is
deploying.

Run it from `main` once this is merged (`git checkout main && git pull
--ff-only origin main`), then `npm ci && npm --prefix functions ci`.

1. Check what is live:

   ```
   node scripts/release-firebase.mjs --whats-live
   ```

   Hosting and the Functions should both report `56a5a5b`.
   - An older commit that is on `main`: `main` has changes that are not live
     yet. Use the default plan (`node scripts/release-firebase.mjs`, which
     diffs against the live build) instead of step 2, and read it before
     adding `--execute`.
   - A commit that is not on `main` (`git merge-base --is-ancestor <commit>
     origin/main` fails), for example one from the pass-3 branch: stop.
     Releasing this would take that work off the site.

2. The narrowed plan, then the release:

   ```
   node scripts/release-firebase.mjs --since 56a5a5b --only hosting --functions finalizeAbandonedSecureExams,createSecureExamSession,finalizeSecureExam,issueSecureExamQuestion,listProctorExamSessions,listStudentSecureExamSessions,manageAssignmentLifecycle,proctorExamAction,saveSecureExamDraft,startSecureExamSession,submitSecureExamResponse,teacherTestCycleAction
   ```

   The same command with `--execute` added deploys it: two function groups
   (the twelve, plus `platformBuildInfo`), the check that the functions now
   report this commit, the browser-access check on the callables, then
   Hosting through `npm run deploy:hosting`. About five minutes of functions.

   Why these twelve: they are every export in `functions/index.js` that
   reaches the changed server code (start and resume, the proctor's actions,
   the hold's pause and resume, the reset, the finish, the Test Cycle record
   sync, and `publicSession`, which now strips the two new fields). The
   default plan would redeploy the whole fleet because `functions/index.js`
   changed. The other server changes are the shared draft schema: the live
   decoders (`readWorkspaceDraftEntries`, used by `workspaceDraftRecovery`,
   `responseInspector` and the path-admin copy) read the fields they know and
   ignore the new ones, and `workspaceDraftDocumentId` is unchanged, so
   path-admin and the rest of the fleet do not need it.

   No rules change and no index change: both new queries on `examSessions`
   are single-field, which Firestore's automatic indexes serve, and
   `firestore.indexes.json` has no exemption for that collection.
   `firebase deploy` creates the Cloud Scheduler job for
   `finalizeAbandonedSecureExams`.

3. After it lands: `--whats-live` shows Hosting and `platformBuildInfo` at this
   commit, and the twelve functions with its `mm-git-sha`. In the Firebase
   console's Functions logs, `finalizeAbandonedSecureExams` runs every five
   minutes. The release tool's report says how to roll back.
