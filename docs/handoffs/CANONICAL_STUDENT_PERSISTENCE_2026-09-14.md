# Canonical student persistence — the September 14 incident

Teachers saw students working through Warm-Up and Classwork while
`grades/{studentId}.gradesByAssignment` held little or no corresponding attempt
history. Students got local feedback and moved between questions; the teacher
view later showed many of those questions unattempted, most Warm-Up grades
missing, and very few Classwork attempts. It happened after PR #243 shipped, so
#243 did not solve canonical persistence — this document is what actually went
wrong, what was changed, and what of that day can still be recovered.

---

## Root cause

Before PR #226, an ordinary Submit wrote canonical grade state straight to
Firestore. PR #226 moved it behind a durable local queue:

```
student interaction → local React update → IndexedDB outbox
                    → background reconcileDurableStudentAction
                    → Firestore transaction → grades/{studentId}
```

The interaction got much faster. Canonical persistence became dependent on a
background client reconciliation, and that reconciliation had two defects that
compound into exactly the observed symptom.

### 1. One serial queue that stops at the first failure

`drainDurableActions` ran every queued action through a single `for` loop over a
single list, and `break`s on the first throw or non-final status. Anything ahead
of a Submit could hold it back indefinitely, because the 10-second retry
restarted at the same stuck head.

Response checkpoints are written on a debounce as a student types, so in
practice the queue looks like `[checkpoint(q5), submission(q5), …]` — the
checkpoint is always in front. Any condition that made a checkpoint write fail
stalled every grade submission behind it for the rest of the period.

Worse, a Firestore **client transaction does not fail fast when the network is
gone**: `runTransaction` waits for connectivity rather than rejecting. One
offline Submit could hold the single global `drainChain` promise indefinitely,
and every later drain call — from every later Submit — queued behind it. A
classroom of Chromebooks on intermittent Wi-Fi is the worst case for this, and
that is the classroom this happened in.

### 2. One verdict for every failure, and that verdict deleted the work

Reconciliation answered every failure with `{ status: 'rejected' }`, and the
outbox **removed rejected actions from IndexedDB**. So all of these destroyed a
student's academic work identically:

| Condition | What it actually means |
| --- | --- |
| `grades/{studentId}` does not exist | the roster row has not been written yet |
| `assignmentIsForStudent` false | the roster read has not caught up, or the student moved class |
| section `isOpen` false | the teacher closed Classwork — possibly *after* the student answered |
| `previousTotalAttempts` mismatch | an earlier attempt for this question has not landed yet |
| assignment lifecycle closed | genuinely past the cutoff |

Only the last is proof that the submission was never eligible.

The attempt-count row is where one loss became total loss. `previousTotalAttempts`
is checked against the canonical record, so **deleting one attempt makes every
later attempt on that question mismatch** — and each of those was then "rejected"
and deleted too. One dropped Warm-Up attempt took the whole question with it.

The section-close row is the one that best explains the Classwork numbers.
`getSectionAccessState` reads the override's *current* state; the only escape
was `override.changedAt > capturedAt`, and an override with no `changedAt`
produced `NaN`, which compares false. A teacher closing Classwork at the end of
the period could therefore erase every queued Classwork submission from that
period.

### 3. A checkpoint hole that lost valid work on its own

`finalizeStudentResponseCheckpoints` selects `candidateFinalizeAt <= now`. The
Firestore rules deliberately allow `candidateFinalizeAt: null` so that a
deadline a teacher has not set yet keeps the student's work instead of failing
their write — but a null never satisfies `<= now`. Those checkpoints left the
scheduler's sight entirely, so a complete, gradeable, pre-cutoff response that
should have produced a canonical attempt silently never did.

---

## What changed

### The queue

`src/platform/performance/durableActionOutbox.js`

- Work is split into an **ordered stream per question**. Two attempts at the
  same question stay in order; unrelated questions do not block each other.
- **Grade-bearing streams drain first**, always — a checkpoint or a progress
  save cannot get in front of a Submit even by being older.
- Independent streams run through a **bounded worker pool** (4 grade, 2
  background). Draining them one after another still made question 2 wait out
  question 1's whole reconcile timeout — fifteen seconds in production — which
  is not what "one question cannot hold another's delivery" means. The pool is
  bounded rather than a `Promise.all`, because firing a recovered Chromebook's
  whole queue at once is the same failure pointed the other way.
- A stalled stream stalls **only itself**, and no longer even delays its
  neighbours.
- Every reconcile is **bounded** (`RECONCILE_TIMEOUT_MS`), so a transaction that
  waits for the network cannot own the queue. The write may still commit
  afterwards, which is harmless: every path is idempotent on the action id.
- IndexedDB moves to **version 2 additively**. The upgrade adds a `retired`
  store and leaves every existing row untouched.

### The verdict

`functions/shared/studentSubmissionDisposition.mjs`

Every outcome is classified into exactly one of:

| Disposition | Queue row | Meaning |
| --- | --- | --- |
| `accepted` | removed | the canonical write succeeded |
| `duplicate` | retired | this exact submission is already canonical |
| `superseded` | retired | a newer canonical attempt exists; writing this would duplicate or reorder |
| `permanently-invalid` | retired | proven, from capture-time evidence, never eligible for credit |
| `needs-review` | **kept** | cannot be proven either way, and retrying will not change that |
| `retryable` | **kept** | might still succeed |

A retirement is a **move, not a delete**: the envelope goes to the `retired`
store with its reason, in one transaction across both stores. A bare
`{ status: 'rejected' }` from any older caller maps to `retryable`, never to a
retirement, because a generic rejection proves nothing.

`previousTotalAttempts` behind the canonical count is now `retryable` — a
queue-order problem, not an invalid submission — which is what stops the
cascade.

### Server ingestion

`functions/shared/submissionIngestion.mjs`, `ingestStudentSubmissions`

Canonical delivery for grade-bearing work moves to a callable that re-reads the
authoritative assignment, roster and attempt history, and answers with a durable
**receipt** the device retires its queue row against. The direct client
transaction remains as the fallback for a device that can reach Firestore but
not Cloud Functions; both are idempotent on the same action id, so using either
— or both — cannot produce two attempts.

**The trust model does not move.** `grades/{studentId}` is student-writable
today; that is how ordinary assignment work has always been saved. Where the
server can do better it does:

- for a question the shared ordinary grading contract can mark, the student's
  **raw response is re-graded on the server** and the browser's verdict is
  discarded entirely;
- for everything else the client record is accepted but **sanitized**: attempts
  advance by at most one from the count the server read, a terminal `correct`
  cannot be un-terminalled, partial credit is clamped and can never fall below
  what is already recorded, and `lastSubmissionId` is stamped server-side;
- Secure Test Cycle, My Math Path and server-graded tools never enter this path.

### Academic time is not ingestion time

The first version of this work stamped every recovered attempt with the moment
the server processed it. A submission captured on September 14 and delivered on
September 15 was therefore recorded as September 15 work, and a September 14
DOL was filed under the 15th — where the class that sat it cannot see it.

Those are two different facts and they are now kept apart:

| Fact | Where it goes |
| --- | --- |
| academic occurrence time | `lastAttemptAt`, evidence `occurredAt`, every projection's `recordedAt`, the DOL date key |
| server ingestion time | the receipt's `issuedAt`, and `ingestedAt` / `finalizedAtRunTime` beside the record |

`recordQuestionAttempt` and `recordQuestionStep` take an optional `occurredAt`.
Omit it — as every live student interaction does — and the behaviour is exactly
what it was. Each recovery path supplies the best time it can *prove*:

- **queued submissions** — the captured time, bounded by the server's own clock
  and by the assignment's release, so a wrong device clock cannot backdate work
  before the assignment existed or postdate it into the future;
- **response checkpoints** — the authoritative close the finalization is acting
  on, bounded below by `serverAcknowledgedAt` (stamped by Firestore's own
  `request.time` under the rules, so a browser cannot move it);
- **workspace drafts** — the server-stamped `updatedAt` on the draft document,
  which is the only save time a Chromebook clock cannot touch.

A record recovered late carries `recoveredLate: true` and both timestamps, so
the delay is visible in the audit trail instead of in the grade.

### Capture-time authority

Submissions now carry the section state the browser observed **at capture**.
That is the one witness a later teacher edit cannot rewrite, and it makes three
cases distinguishable that used to be one:

| Evidence | Outcome |
| --- | --- |
| section was open at capture | accepted |
| close is stamped before the capture | `permanently-invalid` |
| closed now, nothing says when | `needs-review` — kept, and reported |

---

## September 14 recovery

### A. IndexedDB durable actions — highest priority, and the best hope

Queued rows are still on the Chromebooks in `mathmaster-student-actions`.

**Recoverable.** The new release reads PR #226 and PR #243 rows exactly as
stored — schemaVersion 1, no `delivery` annotation, and for the oldest of them
no `createdOrder` — without rewriting them. On the next login, open, reconnect,
focus or assignment reopen, grade-bearing work drains **first**, each question
independently, with no stuck head able to hold it. Nothing requires clearing
browser data, and nothing should be cleared.

Because the ingestion path judges eligibility at **capture time**, a submission
captured at 10:10 and delivered days later still becomes a canonical attempt.

**Not recoverable.** A device that is reimaged, has its profile wiped, or whose
site data is cleared before it reconnects. A student who never signs back in on
that same browser profile. This is why the deployment plan below asks for the
Chromebooks back in the same hands, signed into the same profiles, before any
device refresh.

### B. `studentResponseCheckpoints`

**Recoverable.** Checkpoints whose authoritative close has passed and whose
`serverAcknowledgedAt` precedes it are finalized by the existing deadline
finalizer, through the existing server grading rules, for the supported
server-gradeable question types. The **null-hint hole is repaired**, so
checkpoints that never entered the due query are examined now. A teacher can
also run the sweep on demand for one assignment and class.

The sweep **pages through every matching checkpoint**, ordered by document id
so one pass walks each exactly once and never revisits a `held` or
`rescheduled` one — both of which are still `active`, and both of which a
cursor without an order would hand back forever. Thirty students and a dozen
Classwork questions is well past a single 200-document batch, and a recovery
command that stopped there while reporting success would leave the rest of the
class's work lost. A call that reaches its own bound returns
`complete: false` with a `nextCursor` and a remaining count; the teacher button
follows the cursor, and says plainly when the assignment is **not** fully
swept.

Attempts already written are never duplicated: the finalizer skips a question
whose canonical attempt count has moved, and an explicit Submit retires its own
checkpoint in the same transaction.

**Not recoverable as a grade.** A checkpoint MathMaster only heard about *after*
the close stays `recovered-after-close` and changes no grade. That is the
correct rule for a draft nobody submitted, and it is reported rather than
silently dropped. Likewise `unsupported-question`, `invalid-context`,
`incomplete-at-close` and `skipped-newer-submission`.

Diagnostics for every one of those statuses are in the recovery report and in
the sweep's return value.

### C. `studentWorkspaceDrafts`

These are drafts, not grades, and the classifier mostly says no — with a reason.
A draft is proposed as a recoverable attempt only when **all five** hold:

1. the response grades as complete;
2. the **server's** `updatedAt` on the draft document precedes the section's
   authoritative close (the per-entry `savedAt` is a Chromebook clock and is
   never used for this);
3. the stored question at that index exists and matches the variant the draft
   was written against;
4. the shared ordinary grading contract supports that question;
5. no canonical attempt exists for it yet.

Applying is a teacher action, **dry run by default**, and runs through the
ordinary ingestion path carrying no record and no verdict — so correctness is
derived on the server, never taken from the draft.

**Not recoverable.** Tool workspaces that are not a whole response (graph
constructions, step algebra, workflow stages), post-deadline Practice Mode
drafts, drafts whose variant moved, and anything saved after the close. All of
it is preserved and listed as teacher-reviewable evidence.

### D. Presence and session archives

**Never evidence of correctness**, and never a grade. What they do supply is the
headline the incident needs: `studentSessionSummaries.answered` is how many
questions a student's own live session said they answered, next to how many the
gradebook can prove. That difference is what turns a missing record from an
absence into a discrepancy a teacher can act on, and it is the `unaccounted for`
column in the report.

### E. Canonical grades

Attempts already in `gradesByAssignment` are untouched by all of the above. No
recovery path overwrites a newer canonical attempt; a stale envelope reads as
`superseded` and retires without writing.

---

## Teacher recovery tooling

`getStudentPersistenceRecoveryReport({ assignmentId, classId })` — scoped to the
teacher of record for that class, refuses a class the assignment was never
assigned to, and carries no student's raw responses. Per student:

- canonical attempted count, by activity role, and the latest attempt time
- checkpoint counts by status, and the latest server acknowledgement
- whether a server workspace draft exists, when it was saved, and its recovery
  assessment counts
- device queue depth for **this assignment**, as reported by that student's own
  devices
- recovered attempts, from issued receipts
- every blocked item with its reason

A Chromebook can only report its own queue after it reconnects and the student
signs in. The report says so in the UI: `not reported` means no device has said
anything yet, never that nothing is waiting.

The device summary breaks its counts down **by assignment**. An aggregate
cannot be shown inside one assignment's report: a Chromebook holding three
pending submissions for a different assignment would read as three outstanding
here, which tells a teacher the opposite of the truth in both directions. A
device still on the older release reports `assignment queue unknown ·  N queued
device-wide`, and the class total counts only devices that can answer per
assignment, with the rest counted separately.

---

## Performance

The intent of PR #226 is preserved. Measured in real Chromium against real
IndexedDB (60 submissions):

| Measure | Value |
| --- | --- |
| local acknowledgement p50 | 1.7 ms |
| local acknowledgement p95 | 2.3 ms |
| local acknowledgement max | 4.3 ms |
| queue drain overhead | 0.6 ms per action |

The only additions to the student's critical path are two pure function calls
before the enqueue: the capture-time section proof and the normalized response.
Canonical persistence happens entirely in the background.

The student-facing status now distinguishes *Saving…*, *Saved on this device*,
*Saved to MathMaster*, *Submitted to MathMaster*, and a needs-retry state. A
student is never told "submitted" while anything is still owed a delivery.

---

## Tests

| Suite | What it can fail on | Result |
| --- | --- | --- |
| `npm run test:platform` | the queue, the classifier and the timestamp contract as functions | 4982 pass |
| `npm run test:authoring-v5` | the authoring gate this change must not disturb | 670 pass |
| `npm run test:durable-outbox` | real IndexedDB, real reload, real version-1 upgrade, real concurrency timing | PASS (not skipped) |
| `npm run test:canonical-persistence` | the real callable against real Firestore, including a >200 checkpoint sweep | 21 pass |
| `npm run test:rules` | the two new server-owned collections | 39 pass |

The in-memory outbox suite was green on September 14. The bottom three exist
because of that.

Safety assertions are mutation-tested. Each of these turns the relevant tests
red: restoring the serial break; retiring on a bare rejection; trusting the
client verdict; dropping attempt clamping; dropping the receipt idempotency
check; ignoring the capture-time witness; stamping the ingestion time as the
academic time; making `recordQuestionAttempt` ignore `occurredAt`; finalizing a
checkpoint at the scheduler's clock; draining grade streams sequentially;
removing the concurrency bound; starting background work alongside the grade
lane; reinterpreting a legacy device aggregate as assignment-specific; dropping
the per-assignment breakdown; stopping the sweep after one page; and paging the
sweep without a document order.

---

## Deployment scope

Order matters. Functions first, so the hosting release has an ingestion endpoint
to talk to; the client falls back to the direct write if it does not, but the
fallback is the path being moved away from.

```
npm run build && npm run build:firebase
firebase deploy --only functions,firestore:rules,firestore:indexes
firebase deploy --only hosting
```

- **functions** — `ingestStudentSubmissions`, `reportStudentDeviceQueue`,
  `sweepStudentResponseCheckpoints`, `getStudentPersistenceRecoveryReport`,
  `applyWorkspaceDraftRecovery`, and the repaired
  `finalizeStudentResponseCheckpoints`.
- **firestore:rules** — `studentSubmissionReceipts` and
  `studentDevicePersistenceReports`, both read-only from every client.
- **firestore:indexes** — four composite indexes. Deploy and let them build
  **before** the first report run, or the report will error.
- **hosting** — the outbox, the capture-time proof, the status copy, and the
  teacher panel.

Nothing here deletes or invalidates existing student IndexedDB rows,
checkpoints, workspace drafts or grade records.

## Migration plan for devices already in the field

1. Deploy functions and rules; wait for the indexes to finish building.
2. Deploy hosting.
3. Have students sign in on **the same Chromebook and browser profile** they
   used on September 14. The queue drains on login, on reconnect, on focus, on
   assignment reopen and on a periodic retry; grade-bearing work goes first.
4. Do **not** clear browser data, reimage, or reset profiles until the recovery
   report shows those devices reporting an empty grade-bearing queue.
5. Run the checkpoint sweep per assignment and class.
6. Preview workspace-draft recovery, review the proposals, and commit the ones
   the teacher accepts.
7. Re-read the report. Anything left in `needs review` has its reason next to
   it and is still on disk.
