# Student Persistence V3 operations

Student Submit/Step remains local-first: MathMaster computes the local result,
waits only for the IndexedDB outbox write, updates the screen, and delivers to
`ingestStudentSubmissions` in the background. A 30-minute outage therefore
leaves work on the Chromebook, visibly marked **Waiting for connection**, and
retries it after reconnect without using the former browser grade transaction.

Known queued work, active checkpoints, a recoverable server-held workspace
draft, or a strong session/canonical gap marks an ordinary assignment **Sync
pending**. MathMaster may show non-final progress, but withholds a final
Classroom passback until the evidence clears. Secure Test Cycle continues to use
its own release authority.

## What the browser may and may not write

The browser saves **engagement and activity state** — `assignmentActivity`,
workspace drafts, response checkpoints.

The browser does **not** author grade or completion projections.
`classworkGradesByAssignment` is derived from canonical question records by the
server: at ingestion whenever an attempt lands, and by
`reconcileAssignmentActivityProjection` for the one case ingestion cannot see —
the completion rule's engagement-minutes term being satisfied by time after the
last response was already ingested. That callable sends an assignment id and
nothing else; the server re-reads the canonical tracker and the canonical
activity total and decides.

This matters because `classworkGradesByAssignment` opens the next assignment
through `prerequisiteAccess`. The browser's tracker is the local overlay and
contains attempts still queued on that device, so a completion computed there
could unlock work on evidence the gradebook has never seen.

## Diagnostics never delay a grade

`reportStudentDeviceQueue` is a diagnostic and `ingestStudentSubmissions`
delivers grades. Both share a 12-second callable timeout, so the reporting call
is **started** before a drain — the teacher still gets the pre-drain snapshot —
and awaited by nobody. A reporting outage while ingestion is healthy costs a
teacher some visibility and delays no canonical grade. Reports are coalesced:
at most one in flight and at most one queued behind it, so a burst of
submissions cannot fan out into a burst of report cycles. Hydration, reconnect,
`pageshow`, visibility return, newly queued work and the post-drain state all
still report immediately.

## The device report is a snapshot, not a merge

`studentDevicePersistenceReports/{student}__{device}` is written with a full
`set()`, never `{ merge: true }`. Firestore merges maps **recursively**: a
device that reported `queuedGradeBearingByAssignment.assignmentA = 1` and then
drained it sends a summary with no `assignmentA` key, and a recursive merge
leaves the stale `1` in place forever — which reads as permanent
`persistencePending`, a permanent Classroom `sync-pending`, and a teacher
recovery report showing queued work on an empty Chromebook. Only
`firstReportedAt` is carried forward, because it is history rather than state.

## Resolving an unrecoverable discrepancy

`session-summary-gap` withholds a final passback while a student's own session
says they worked more questions than the gradebook can account for. That can be
permanently true — a queued response proven invalid, a reimaged Chromebook,
presence counting something that was never going to become an attempt.

It is **not** timed out. The teacher of record for the class (or the root
administrator) resolves it explicitly from the Submission recovery panel, after
seeing the discrepancy, with a written reason and a confirmation. The action
means:

> I acknowledge the unrecoverable discrepancy and permit normal finalization
> using the canonical evidence that exists.

`resolveStudentPersistenceHold` writes a server-only record in
`studentPersistenceResolutions` — no client may write that collection, and the
flag deliberately does not live on `grades/{studentId}`, where a student can
write. It creates no grade, no attempt and no zero. It is refused when any
concrete recoverable reason (`device-queue`, `response-checkpoint`,
`workspace-draft`) is still outstanding, and refused when the numbers the panel
displayed no longer match the server's. If session evidence later grows past
what was acknowledged, or a Chromebook reconnects and reports queued
grade-bearing work, the hold is active again.

## Cloud Shell: targeted deploy and verification

PR #247 changes six production functions, a Firestore composite index and the
hosted client. The deploy names each function individually — it never runs
`firebase deploy --only functions`, which would put the entire fleet through a
new revision to ship six.

From the repository root:

```sh
npm ci && npm run deploy:persistence
```

That runs, in this order:

1. `npm run build` and `npm run build:firebase`
2. `firebase deploy --only firestore:indexes`
3. **the index gate** (see below)
4. `firebase deploy --only functions:ingestStudentSubmissions,functions:reportStudentDeviceQueue,functions:reconcileAssignmentActivityProjection,functions:syncGradeToClassroom,functions:getStudentPersistenceRecoveryReport,functions:resolveStudentPersistenceHold`
5. `npm run verify:persistence-production` — Cloud Run `allUsers →
   roles/run.invoker` on every client-facing callable
6. `npm run deploy:hosting`

The function list, the client-facing subset and the required indexes all come
from `scripts/persistence-deploy-surface.mjs`, and `tests/platform/persistenceV3.test.mjs`
fails if that file and `functions/index.js` disagree.

### The index gate, and why the script stops

This release adds a composite index on
`studentResponseCheckpoints(studentId, assignmentId, status)`. It backs the
final-grade safety check in `readPersistencePending`, which is what
`syncGradeToClassroom` and `resolveStudentPersistenceHold` query before a final
Classroom grade is allowed out.

`firebase deploy --only firestore:indexes` returns when the index build has been
**requested**, not when it is usable. On production volume the index can sit in
`CREATING` for minutes, and during that time the query fails exactly as though
the index had never been declared — so the safety check on the finalization path
throws.

Nothing in the script can reliably wait for readiness, so it does not pretend
to. Step 3 asks Firestore for the index state once:

- **ENABLED** → it continues to step 4.
- **anything else, including unreadable** → it **stops**, having deployed the
  build and the indexes and nothing else, and prints what to do. This is not a
  failed deploy; it exits 2 so it cannot be mistaken for a completed one.

Check the state on its own at any time:

```sh
npm run verify:persistence-indexes
```

When the index reads **Enabled** (in the console, or from that command), finish
the deploy. This rebuilds the client, skips the index deploy and the gate, and
picks up at the functions:

```sh
PERSISTENCE_INDEXES_READY=1 npm run deploy:persistence
```

`PERSISTENCE_INDEXES_READY=1` is an explicit human attestation, for when
`gcloud` is not available to the person running the deploy. It is never set by
default, because the alternative to an attestation is a script that guesses.

### Verifying production without deploying anything

```sh
npm run verify:persistence-production
npm run verify:persistence-indexes
```

Override the defaults only for another environment, for example:
`FIREBASE_PROJECT=my-project FUNCTION_REGION=us-central1 npm run verify:persistence-production`.
