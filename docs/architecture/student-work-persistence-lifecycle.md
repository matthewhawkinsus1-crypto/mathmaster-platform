# Student work persistence — the lifecycle every tool joins

*Job 3 map, 2026-09-24. Supersedes nothing: it ties together the layers
described in `docs/handoffs/UNIVERSAL_IN_PROGRESS_WORK_PERSISTENCE_2026-09-15.md`
(drafts), `docs/handoffs/CANONICAL_STUDENT_PERSISTENCE_2026-09-14.md` and
`docs/handoffs/STUDENT_PERSISTENCE_V3_OPERATIONS.md` (submissions), and says
where a new tool plugs in.*

## The one rule

**Draft state is the student's unfinished work. Submission state is evidence.
Nothing that saves a draft may create evidence, and nothing that records
evidence may delete a draft until the evidence has committed.**

## Where each kind of state lives

| State | Written by | Stored at | Key / document | Survives |
| --- | --- | --- | --- | --- |
| Answer boxes, registry-tool state (graph points, lines, table cells, interval endpoints, elimination multipliers, substitution picks) | `usePersistentToolState(field)` inside `ToolDraftScopeProvider` (mounted by `QuestionEngine` with `draftKey`) | localStorage, envelope `{ version: 2, savedAt, value }` | `${draftKey}:work:${scope}` | navigation, reload, browser restart |
| Step Algebra equation, open structure tool (factoring / split / reduce / arrange) with its undo stack, described work steps | `StepByStepAlgebraCore` via `writeQuestionDraft`, versioned `DRAFT_VERSION`, restored by `rehydrateAlgebraDraft` | localStorage | `${draftKey}:step-algebra` family | same; a tool whose equation no longer matches is dropped |
| Relation (inequality / absolute value) state, pending symbol step, candidate checks | `MultiRelationAlgebraCore` via `writeQuestionDraft`; restored only through `readRelationDraft` → `restorableRelationState` | localStorage | `${draftKey}:multi-relation` | same; a malformed state resumes from the question |
| Intercept stages | `LinearInterceptsOrchestrator` | localStorage | `${draftKey}:linear-intercepts` | same |
| Composed-workflow stage answers | `WorkflowRunner` via `useLocalDraftState` | localStorage | per stage | same |
| **Server copy of every draft above** | `workspaceDraftSync` (subscribes to `writeQuestionDraft`), 2.5 s debounce, flush on `pagehide` and when the tab is hidden | Firestore `studentWorkspaceDrafts/{studentId}__{assignmentId}`, transactional **merge**, per-entry `savedAt`, server `updatedAt` | one document per student per assignment | device loss, device switch |
| Resume position ("where you left off") | `saveResumeAction` + draft sync `resume` | localStorage + the same Firestore document | per student | device switch |
| Submitted attempts (Submit / Step grade) | QuestionEngine → IndexedDB durable outbox → `ingestStudentSubmissions` | IndexedDB queue, then canonical question records (server-written) | action id; receipt document | network loss (queued, retried), tab close |
| Response checkpoints (answer state between submissions, for Response Inspector) | `onResponseCheckpoint`, debounced `CHECKPOINT_DEBOUNCE_MS` | server via `finalizeStudentResponseCheckpoints` | per question | — |
| Attempt counts, status, grades, completion | **server only** (ingestion, reconciliation) | canonical question records, projections | — | — |
| Work View open/closed, enlarged state | component state (intentionally transient) | — | — | not persisted; the work inside it is |

## Precedence on restore

```
newer canonical / submitted state  >  local draft  >  server workspace draft  >  blank
```

Both sides are platform timestamps: the draft's `savedAt` and the question
record's `lastAttemptAt`. A server entry is restored only where it is newer than
this device's copy **and** newer than the last canonical attempt
(`selectRestorableDraftEntries`). A submission re-stamps its own workspace
(`stampToolDraftSubmission`), so a draft older than the canonical attempt can
only be stale and is retired on the next mount. A stale client can never
overwrite newer server work: the server merge keeps the newer `savedAt` per key.

## Draft versus submission

* Restoring a draft puts values back in boxes: no attempt, no attempt count, no
  correctness, no evidence, no Classroom passback. The draft-persistence browser
  certification counts grades and fails if a restore produced one.
* Submitting writes the IndexedDB outbox **first**, updates the screen, and
  delivers in the background. The draft is kept; it is re-stamped, not deleted.
* Reset Question writes tombstones for the draft family (`resetQuestionDraftFamily`)
  so a background sync cannot bring the cleared work back.

## Recovery rules (every tool)

1. **Validate before restoring.** A draft read from localStorage or another
   device's Firestore copy can be truncated, old-shaped or wrong. A tool must
   never hand an unchecked draft to its state. Step Algebra: `rehydrateAlgebraDraft`
   plus `DRAFT_VERSION`. Relation workspace: `restorableRelationState` (added in
   this PR — before it, a malformed relation draft made the question show *"This
   question could not be displayed"*). Registry tools: `usePersistentToolState`
   reads each field by `hasOwnProperty` and falls back to the initial value.
2. **Fall back to the question, never to an error.** The question's own
   equation is always a valid place to resume.
3. **Drop, don't leak.** A saved tool whose equation no longer matches the
   current question is discarded, so a draft never lands on different mathematics.
4. **Migrate by version.** Bump the tool's draft version when its shape
   changes; keep the reader for the previous version, or drop only the part
   that changed (Step Algebra keeps history and drops the open tool).

## Competing mechanisms — what this map found

There are three *adapters* — `usePersistentToolState`, direct
`readQuestionDraft`/`writeQuestionDraft` in the two algebra engines, and
`useLocalDraftState` in WorkflowRunner — but **one store**: all three write the
same `{ version, savedAt, value }` envelope through `questionDraftStorage.js`,
so all three inherit the server sync, the precedence rule and the draft-family
lifecycle. They are not competing persistence systems. What differed was
validation on the way back in: the relation engine had none (fixed here).

## Auditability — what can be answered today

| Question | Where the answer is |
| --- | --- |
| When was the draft last saved? | each entry's `savedAt` (device clock) and the document's `updatedAt` (server time) in `studentWorkspaceDrafts` |
| Which revision is newer? | per-entry `savedAt`; the merge keeps the newer one |
| Was auto-submit invoked? did the server receive the final state? | the durable outbox queue and its server receipts (`reportStudentDeviceQueue`, ingestion receipts); Response Inspector |
| Was the assignment reopened afterwards? | the DOL reopen audit written by the recovery controls (#347) |
| From which device/session? | submissions carry the device identity (`deviceIdentity.js`); **workspace draft entries do not yet** — see follow-up |

**Follow-up (not in this PR):** stamp workspace draft entries with the durable
`deviceId` (`storableEntry` in `functions/shared/workspaceDraftSchema.mjs` plus
`workspaceDraftSync.record`), with a Firestore-emulator rules run, so a teacher
can see which Chromebook last touched unfinished work.

## Adding a tool — the checklist

1. Keep student-entered state in `usePersistentToolState(field, initial)`; do
   not use `useState` for anything the student made.
2. List every `useState` that may stay transient in
   `src/tools/toolStatePersistence.js` (`transientState`) — the contract test
   reads the tool's source against it.
3. If the tool keeps a structured model (an equation, a relation), write it
   through `writeQuestionDraft` under the question's `draftKey`, version it, and
   read it back through a validator that returns null for anything malformed.
4. Never put answer keys, expected values or grades in a draft
   (`FORBIDDEN_DRAFT_KEYS`) — the student can read their own draft document.
5. Add the tool's fixture to the draft-persistence browser certification
   (`npm run test:draft-persistence`) and, for algebra, a journey to
   `tests/browser/capabilityCertification.mjs`.

## Where each required scenario is certified

| Scenario | Certification |
| --- | --- |
| type an answer → switch question → return | `npm run test:draft-persistence` (every registry family) |
| Step Algebra work → refresh | capability journey `work-persistence` |
| inequality work → refresh | capability journey `relation-persistence` |
| malformed saved state | capability journey `draft-recovery`, `tests/platform/relationDraftRecovery.test.mjs` |
| graph work → refresh | `npm run test:draft-persistence` (graphing families) |
| network unavailable → continue → reconnect | `tests/browser/durableOutboxRecovery.mjs`, `npm run test:durable-outbox` |
| server / client revision conflict | `tests/platform/studentDraftDurability.test.mjs`, workspace draft merge tests |
| assignment auto-closes while working | lifecycle / outbox tests (`canonicalStudentPersistence`, `persistenceV3`) |
| teacher reopens / grants an attempt / student resumes | `tests/platform/assessmentRecoveryPolicy.test.mjs` (Job 6), `tests/platform/studentWorkRecovery.test.mjs`, `tests/platform/dolClassReuseTeacherControl.test.mjs` |
