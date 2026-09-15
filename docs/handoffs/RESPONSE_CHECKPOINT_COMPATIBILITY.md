# Response checkpoints and recoverable student work

Two capabilities live here. They are related and they are **not the same
thing**, and a question can support either, both or neither:

| | What it does | Where it lives |
|---|---|---|
| **Deadline auto-submit** | A response the student finished before a deadline is submitted when that deadline closes, with no browser open | `studentResponseCheckpoints` + `finalizeStudentResponseCheckpoints` |
| **Cross-session draft restore** | Unfinished work survives a Chromebook restart and reappears on a different device | `studentWorkspaceDrafts` + the draft sync in `questionDraftStorage` |

The reason they differ: restoring a workspace only needs the student's own
state written back where they can read it. Auto-submitting needs the **server**
to mark that state, which it can only do when the stored question is the
question the student actually saw.

---

## 1. Deadline auto-submit

### What a checkpoint contains

`functions/shared/responseCheckpointSchema.mjs` builds it, and **throws** if
anything below the line tries to enter.

| May contain | May NOT contain |
|---|---|
| student identity | `isCorrect` |
| assignment / question / variant / generation identity | official score |
| the normalized raw student response | official partial-credit verdict |
| completeness state (`isComplete`, including `false`) | the canonical question record |
| support-use information needed for grading | any evidence event |
| expected previous canonical attempt count | any mastery result |
| activity role | the attempt count AFTER this response |
| checkpoint revision | an answer key, seed or accepted answers |
| server acknowledgement timestamp (`request.time`) | |
| candidate query time (**a hint only**) | |
| finalization context, non-authoritative metadata | |

The Firestore rules reject a write carrying any forbidden field, and the
finalizer refuses a document carrying one even if it reached Firestore by
another route.

### What the server does at finalization

1. Re-reads the authoritative assignment.
2. Verifies the student, their class, and that the assignment is assigned to it.
3. Resolves the authoritative question at that index and its exact variant.
4. Confirms the question id, activity role and variant all match.
5. **Grades the checkpointed response on the server**, through
   `functions/shared/ordinaryResponseGrading.mjs` — the same contract the
   browser grader screens call.
6. Applies the normal attempt policy (`functions/shared/attemptPolicy.mjs`).
7. Produces the canonical question record.
8. Produces evidence from the server-derived result
   (`functions/shared/attemptEvidenceEvent.mjs`).
9. Atomically updates `grades/{studentId}` and the checkpoint receipt —
   including every projection an ordinary Submit maintains, not just the
   question record: `supportUsageByAssignment` (merged),
   `classworkGradesByAssignment` (the same completion rule, run against the
   tracker that now carries this attempt) and `dolGradesByAssignment`.
   `prerequisiteAccess` reads the classwork projection, so skipping it would
   record a student's last answer and still leave them locked out of the
   dependent assignment.

There is no second grading system and no second Classroom system. The canonical
grade write is what wakes the existing `syncGradeToClassroom` trigger.

### Which questions can be auto-submitted

A deadline finalizer has the **stored** question, not the question the student
was delivered. Those are the same document only while delivery is an identity
transform. Anything that instantiates per student is excluded rather than
guessed at — marking a template against an instance answer is worse than not
marking at all.

| Question type | Auto-submit | Why |
|---|---|---|
| `literal` | **Supported** | authored `acceptedAnswers` |
| `multiAnswer` | **Supported** | authored `answerFields` |
| `table` | **Supported** | authored `table.answers` |
| `orderedPair` | **Supported** | authored `answer` / `solution` |
| `system` | **Supported** | authored `solution` |
| `fraction` | Excluded | always generated per student |
| `numberLine` | Excluded | always generated per student |
| `algebra`, `stepAlgebra` | Excluded | see Step Algebra below |
| `graphing`, `functionGraph`, `functionInvestigation`, `graphAnalysis` | Excluded | tool-owned completion; no server grading contract yet |
| `relationshipModel`, `graphScenarioMatch`, `graphComparison`, `graphStory`, `contextInterpretation` | Excluded | no server grading contract yet |
| Workflow / composed multi-part | Excluded | stage completion is workflow-owned |
| Registry Work View tools (22) | Excluded | server-graded contracts not yet defined |
| `modelingLab` | Excluded | server-owned canonical action, not a Submit response |
| Secure Test Cycle | **Excluded** | dedicated server-owned state machine |
| My Math Path | **Excluded** | dedicated server-owned state machine |

A supported type is **still excluded per question** when the stored question
carries a `generator`, a `variants` list, or `differentiation.mode: "auto"` —
all three mean the delivered question can differ from the stored one. The
reason is recorded on the checkpoint (`unsupported-question:<reason>`) rather
than being silent.

**Step Algebra.** Committed steps already use the normal durable step path and
are unaffected. Nothing here synthesizes an uncommitted algebraic action: an
unfinished current operation is left incomplete, and the committed work stands.
Step Algebra will become auto-submittable when the tool exposes an explicitly
completed, server-validatable current response.

### Checkpoint lifecycle

`active` is the only status in the scheduler's due query. Every other status
clears `candidateFinalizeAt`, so a decided checkpoint leaves the query and
history is never re-scanned.

| Status | Meaning |
|---|---|
| `active` | latest state; eligible for finalization |
| `superseded` | a newer revision replaced it |
| `explicitly-submitted` | the student pressed Submit; retired in the same transaction as the attempt |
| `incomplete-at-close` | latest state was incomplete or cleared — **no attempt, no evidence, no grade change** |
| `auto-submitted` | the server graded it and wrote one canonical attempt |
| `recovered-after-close` | MathMaster only heard about it after the close; kept as history, changes no grade |
| `invalid-context` | authorization failed; the reason is recorded |
| `skipped-newer-submission` | canonical work moved on since the checkpoint was captured |
| `unsupported-question` | the server cannot mark this question type |

### Deadline authority

`candidateFinalizeAt` decides **when the scheduler looks**, never whether the
work was on time. The real close comes from
`functions/shared/sectionDeadline.mjs`, which the browser timer uses too, from:
the assignment, the student's authoritative class, the class schedule, the
instructional date, Warm-Up configuration, `autoCloseByClassId`,
`closedByClassId`, DOL timing, section access overrides, `dueAt`, `lateDueAt`
and the current teacher reopen/extension state. A later hint earns a later
look; an earlier one reschedules instead of closing valid work.

Warm-Up and DOL windows are school wall-clock time, so the shared rules take an
explicit timezone (`America/Chicago` on the server, the device's own in the
browser). A section's window only governs on **its** instructional day;
otherwise the assignment's own cutoff is the only close MathMaster can prove.

### Manual close

`expediteCheckpointsOnSectionClose` watches `assignments/{assignmentId}`. When a
teacher closes a Warm-Up, Classwork or Practice section, outstanding **active**
checkpoints for exactly that assignment + class + activity role become due now,
through a bounded indexed query. Nothing scans the collection. Only the query
time moves — whether the work counts is still the finalizer's decision, made by
re-reading the same assignment. A teacher extension or reopen before
finalization reschedules instead; a reopen after an auto-submit leaves that
attempt as history and lets later authorized work become a normal next attempt.

### Trust and offline boundary

Firestore stamps `serverAcknowledgedAt` with `request.time`, so a browser cannot
backdate offline work across a cutoff. A response MathMaster heard about before
the close finalizes with no browser open; one that only arrives afterwards is
kept as `recovered-after-close` and changes no grade. It remains in IndexedDB and
can be submitted normally after a teacher reopen.

---

## 2. Cross-session and cross-device draft restore

A **working draft** is recoverable student work. It is not an attempt, a grade,
evidence, mastery or a Classroom passback, and it is deliberately stored outside
`grades/{studentId}` — the only document the Classroom trigger watches.

### How it works

Every tool's workspace state already flows through `writeQuestionDraft`, so one
subscriber there reaches all of them. Writes are local-first: the keystroke
updates the workspace, writes the local draft, and returns. The sync layer
coalesces everything inside a debounce window into a single
`studentWorkspaceDrafts/{studentId}__{assignmentId}` write in the background.
Nothing in the interaction path is awaited.

### Restore order on assignment open

1. canonical grades (hydrated at sign-in)
2. durable outbox reconciliation / overlay — an action's IndexedDB row is
   removed only while it is still the revision that was reconciled, checked
   inside the same readwrite transaction, so a revision written during an
   in-flight drain is never thrown away
3. the server draft — applied **only** where it is newer than both this device's
   copy and the question's last canonical attempt
4. Practice Mode state, in its own structure
5. the resume position

An old draft can therefore never overwrite newer submitted work, and the first
render never waits: a restore that brings something new remounts the workspace.

### Which Work Views restore

| Work View | Cross-session restore |
|---|---|
| `literal`, `fraction`, `orderedPair`, `system` | **Yes** — typed response |
| `multiAnswer` | **Yes** — every field |
| `table` | **Yes** — every editable cell |
| `numberLine` | **Yes** — selected point |
| `graphing` (GraphLine) | **Yes** — slope/intercept state |
| `functionGraph`, `functionInvestigation`, `graphAnalysis` | **Yes** — construction, analysis and stage state |
| `relationshipModel`, `graphScenarioMatch`, `graphComparison`, `graphStory`, `contextInterpretation` | **Yes** |
| `stepAlgebra`, `algebra`, multi-relation algebra | **Yes** — workspace draft state (committed steps are canonical anyway) |
| Workflow / composed multi-part | **Yes** — stage responses |
| Guided Classwork coach state | **Yes** |
| Registry Work View tools (21) | **Yes, since PR #249** — every student-editable value. They adopt the seam through `usePersistentToolState`, which the `ToolDraftScopeProvider` in QuestionEngine feeds with `draftKey`; the tool names a field and knows nothing about Firestore. `solutionReview2` is the one exception and has nothing to restore: it renders an attempt that has already been graded. Declared per tool in `src/tools/toolStatePersistence.js` and enforced against the tools' source by `tests/platform/toolDraftPersistenceContract.test.mjs`. |
| `modelingLab` | **No** — server-owned canonical action |
| Secure Test Cycle | **Excluded by design** |
| My Math Path | **Excluded by design** |

### Merging, not replacing

A background save sends a PATCH — only what this device changed — and the store
applies it inside a Firestore transaction that reads the current document and
merges by stable draft key. A whole-document write was a data-loss bug: a device
that restored ten questions and then edited one would send a document containing
one entry and erase the other nine, for every device.

Unrelated draft keys can therefore never conflict: Device A editing question 1
and Device B editing question 2 both survive, in either order. For the SAME key
the newer `savedAt` wins, which also stops an obviously stale device from wiping
newer work. Resume and Practice Mode each carry their own timestamp and their
own "changed" flag, so updating one never erases the other or any draft entry.

A per-device `revision` is deliberately NOT used for ordering, and the rules
deliberately do not enforce one: device A's revision 15 and device B's revision 2
say nothing about which is newer, and a monotonic rule built on one would lock a
fresh Chromebook out of saving entirely.

An edit made while a flush is in flight stays pending and goes out on the next
one — the same conditional-cleanup rule the durable outbox uses, so a newer draft
is never dropped because an older write for the same key succeeded.

### DOL close convergence

The browser may still show an immediate DOL-close result, but it is not newer
authority than the deadline finalizer. A valid response acknowledged before the
authoritative DOL cutoff is included even when the browser closed first or no
assignment page is mounted. The server recomputes the section score from the
updated canonical tracker and writes a final `section-finalized` projection.

If the browser already finalized a lower score before the checkpoint scheduler
ran, the server corrects that finalized score without reopening the DOL and
records `recalculatedAt` / `recalculationReason: "deadline-auto-submit"`. The
browser close path uses a transaction and refuses to overwrite an already-final
server result.

Each draft value is stored as serialized text. A tool's workspace is its own
shape — plotted strokes are arrays of arrays of points, which Firestore refuses
to store directly — so serializing it sidesteps every shape rule, makes the size
cap exact, and states the true thing about the field: the server keeps it and
never interprets it.

### What a draft may never contain

Answer keys, accepted answers, expected values, grading definitions, solutions,
generated seeds, or anything from a secure Test Cycle or private Path session.
`sanitizeWorkspaceDraftValue` fails closed on those keys and on oversized
values, and preview buckets never sync at all. This matters because the draft is
a document the student can read.

### Practice Mode

Post-deadline Practice Mode is persisted in the same document under its own
`practice` key and its own draft bucket. It can never alter the canonical
assignment grade, the Classroom grade, the original attempt history or deadline
evidence — and practising after the deadline cannot overwrite the graded
workspace the student left behind.

### Save health

The student sees four states: `Saving…`, `Saved on this device`, `Saved to
MathMaster`, `Submitted`. In a timed section they also see that their latest
completed response will be submitted automatically when time ends, and after the
close they see what actually happened — never "submitted" for a response that
was not complete.

---

## Deployment

Rules, indexes and functions all changed:

```
npm run build && npm run build:firebase
firebase deploy --only hosting,firestore:rules,firestore:indexes,functions
```
