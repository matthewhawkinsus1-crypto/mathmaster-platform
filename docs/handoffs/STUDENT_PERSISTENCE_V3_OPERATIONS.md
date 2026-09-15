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

## Device identity, and which report is newer

**Identity lives with the queue.** The device id is stored in the durable
outbox's own IndexedDB database (`mathmaster-student-actions`, store
`deviceIdentity`), not in `localStorage` alone. A device report is a claim about
what that queue holds, so the identity making the claim survives exactly as long
as the queue it describes. It is per browser installation, so two Chromebooks
are never one row and one Chromebook is never two.

The earlier fallback minted a fresh `dev_session_<random>` on *every call* when
`localStorage` threw, so the pre-drain report ("2 queued") was filed under one
device and the post-drain report ("0 queued") under another. Nothing cleared the
first, every retry added more, and the student's final grade was withheld
permanently. An id an earlier release left in `localStorage` is now **adopted**
rather than replaced, so a device already reporting keeps its existing server
row.

**Order is explicit.** A client timeout stops the browser waiting; it does not
cancel a callable already on the wire, so a slow "2 queued" report can arrive
after the "0 queued" report that superseded it. Every report is stamped at
capture with a monotonically increasing `reportGeneration` scoped to the device
id, and `reportStudentDeviceQueue` applies it **in a transaction**, accepting
only a strictly newer generation. An equal or older one returns
`{ success: true, ignored: true, reason: 'superseded-by-newer-report' }` and
changes nothing — the client did nothing wrong and must not retry an obsolete
report. `firstReportedAt` survives either way.

The generation is floored at the wall clock, not a plain counter. A counter that
restarts at 1 when durable storage is wiped would be permanently older than the
generation the server already holds, silencing that device for good while it
holds a student's grade.

## Every device is read, not the first ten

`readPersistencePending` and the teacher recovery report page through **all** of
a student's device reports, ordered by document id. The read used to be
`.limit(10)` with no ordering, so a student with eleven rows could have the one
device still holding an unsynced answer omitted — the total came back zero and
the final grade went out over the top of real work.

There is no replacement cap, silent or otherwise. `MAX_DEVICE_REPORT_PAGES` is a
runaway guard that **throws** rather than returning a short list, because on this
path a short list is indistinguishable from good news: a throw withholds the
final passback and surfaces in the teacher report, while a quiet under-count
publishes a grade that should not exist.

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

PR #247 changes six production functions, the Firestore rules, a Firestore
composite index and the hosted client. The deploy names each function
individually — it never runs `firebase deploy --only functions`, which would put
the entire fleet through a new revision to ship six.

From the repository root:

```sh
npm ci && npm run deploy:persistence
```

That runs, in this order:

1. `npm run build` and `npm run build:firebase`
2. `firebase deploy --only firestore:rules,firestore:indexes`
3. **the index gate** (see below)
4. `firebase deploy --only functions:ingestStudentSubmissions,functions:reportStudentDeviceQueue,functions:reconcileAssignmentActivityProjection,functions:syncGradeToClassroom,functions:getStudentPersistenceRecoveryReport,functions:resolveStudentPersistenceHold`
5. `npm run verify:persistence-production` — Cloud Run `allUsers →
   roles/run.invoker` on every **browser-called** callable
6. `npm run deploy:hosting`

**Rules ship with the indexes, before any function.** This release adds the
`studentPersistenceResolutions` match block, and that collection holds the flag
that *releases* a final Classroom grade; deploying the function that reads it
without the rules that protect it is the wrong half to ship first.

**IAM covers teacher callables too.** Cloud Run's transport requirement is about
the browser, not about whose browser it is: `getStudentPersistenceRecoveryReport`
and `resolveStudentPersistenceHold` need `allUsers → roles/run.invoker` exactly
as `ingestStudentSubmissions` does. The surface metadata calls this
`browserCallable` rather than the older, vaguer `clientFacing`, which is how the
teacher callables came to be left out. `syncGradeToClassroom` is deliberately
excluded — Firestore invokes it, no browser does.

The function list, the browser-callable subset, the Firestore targets and the
required indexes all come from `scripts/persistence-deploy-surface.mjs`, and
`tests/platform/persistenceV3.test.mjs` fails if that file disagrees with
`functions/index.js`, with `firestore.rules`, or with which callables `src/`
actually invokes through `httpsCallable`.

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
