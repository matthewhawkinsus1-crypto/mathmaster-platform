# Question Review & Repair Workspace

Turns Assignment V5 Preflight from a pass/fail gate into a place a teacher can
actually work. An assignment that fails Preflight used to be a dead end: the
teacher saw a list of errors, had nowhere to put the assignment, and no way to
fix one question without re-pasting the whole thing. Now a parseable-but-broken
assignment gets saved as an Incomplete draft, repaired question by question, and
promoted to the Library only when both the machine and a person say it is ready.

## What a teacher does with it

1. **Paste an assignment that does not fully pass.** If it parses as V5 it is
   saved as an Incomplete draft and its Repair Center opens straight away. The
   screen says *Saved for repair*, keeps the blocking-error list, and states
   that nothing was discarded — this is neither the rejection panel nor the
   success path, because the assignment was kept but is not publishable. It does
   *not* appear in the normal Library: a half-repaired assignment must never be
   assignable by accident.
2. **Open the Repair Center.** Findings are grouped by what the teacher can do
   about each one, not by severity alone:
   - **Technical blockers** — the assignment cannot be stored or delivered as
     authored (Firestore-illegal shapes, missing interaction contract, broken
     worksheet print). Many of these have a deterministic fix, offered as
     *Repair All Safe Technical Issues*.
   - **Quality blockers** — the content is wrong or incomplete. These go to an
     AI as a repair packet, or get edited by hand.
   - **Warnings** — worth a look, never blocking.
   - **Platform issues** — the finding is a defect in MathMaster, not in the
     assignment. These get a reproduction fixture to hand off, and are never
     sent to an AI: asking a model to rewrite valid content so it stops tripping
     a platform bug corrupts good questions and hides the bug.
3. **Repair.** Copy one question's JSON, or a batch packet for several. Paste
   the repaired JSON back. The import diffs it, revalidates the whole
   assignment, and refuses anything that does not match the recorded revision.
4. **Override a false positive** where the finding is genuinely wrong. Overrides
   are recorded with a reason and persisted; they are only honoured for findings
   that are eligible for override in the first place.
5. **Flag what an AI must not change**, at whichever scope the concern actually
   has: this question, every question in this section, or the whole assignment.
   The note becomes a hard constraint on any repair packet for the questions it
   governs, and only a teacher can close it.
6. **Finish review.** *Complete final review* promotes the draft to Ready once
   nothing is blocking and no teacher flag is still open; it refuses and says
   why otherwise. Ready is not Published — publishing goes through the normal
   Library flow, and doing so closes the Incomplete draft so the repaired
   assignment is the only copy.

## Boundaries that are not negotiable

**Delivered work never goes through this path.** If a draft shows any sign of
having reached students — assigned class ids or periods, live protection, or any
recorded student evidence — the repair commit refuses outright and names Safe
Live Repair instead. Safe Live Repair already exists and preserves student
attempts and scoring history; the authoring draft path does not, because it
rewrites question JSON wholesale.

**Overrides cannot manufacture publishability.** An override is honoured only if
the finding is independently eligible for override. Overrides live in a
Firestore document, and no row in a document may make an unstorable question
storable.

**Teacher flags close only when the teacher closes them.** A repair import may
record that a revision *might* have addressed a concern. Final review refuses to
promote while any flag is still open — otherwise an import approves its own work,
which is the failure this workspace exists to prevent.

**Every commit advances the revision.** Packets record the revision they were
built from and the parser refuses a mismatch, so a stale paste cannot silently
overwrite newer repairs.

**Validation is never incremental.** Preflight judges the assignment as a whole
— duplicate question numbers, duplicate choice ids, section coverage, alignment
spread — so caching per question would serve stale cross-question findings.
Measured cost of full revalidation is about 11ms for an assignment four times
larger than any real one; see `tests/platform/assignmentPreflightRevalidationCost.test.mjs`
for the measurement and the two contracts that keep the decision from rotting.

## Where the code lives

| Concern | File |
| --- | --- |
| Structured diagnostics | `src/platform/preflight/preflightDiagnostics.js` |
| Authoring state machine | `src/platform/preflight/assignmentAuthoringState.js` |
| Preflight model | `src/platform/preflight/assignmentV5PreflightModel.js` |
| Teacher flags, notes, overrides | `src/platform/preflight/teacherReviewContext.js` |
| Incomplete draft record + finalisation | `src/platform/preflight/incompleteAssignmentDraft.js` |
| Draft persistence | `src/platform/preflight/incompleteAssignmentDraftStore.js` |
| Repair Center view model | `src/platform/preflight/assignmentRepairCenterModel.js` |
| Triage, safe auto-repair, bug fixtures | `src/platform/preflight/assignmentRepairTriage.js` |
| Revision history and restore | `src/platform/preflight/assignmentRepairHistory.js` |
| Repair import and diff | `src/platform/preflight/questionRepairImport.js` |
| Single-question clipboard | `src/platform/contract/questionRepairClipboard.js` |
| Batch packet / request / response | `src/platform/contract/questionBatchRepairPacket.js` |
| Repair Center UI | `src/components/teacher/IncompleteAssignmentRepairCenter.jsx` |
| Review panel in teacher preview | `src/components/teacher/TeacherQuestionReviewPanel.jsx` |
| Library review-note persistence | `src/platform/preflight/assignmentQuestionReviewStore.js` |
| Intake wiring | `src/AssignmentIntake.jsx`, `src/AssignmentIntakeBase.jsx` |

## Data and security

Drafts live in the `assignmentAuthoringDrafts` collection, never in
`assignments`. Rules scope every operation to the owning teacher (or the root
administrator) and pin `authoringReview.ownerUid` on both create and update, so
a teacher cannot read another teacher's broken draft and cannot transfer one by
editing its UID.

Review notes on **published** assignments live in `assignmentQuestionReviews`,
and they live there for one reason: `assignments` is student-readable, and these
notes can name a student and describe what they got wrong. Rules restrict every
operation to the owning teacher, refuse a forged `ownerUid` on create, and pin
both `ownerUid` and `assignmentId` on update.

The emulator cases for both collections are in `tests/firestore-rules.test.mjs`,
and they are the security boundary — the teacher review panel that mounts inside
the student question runtime is kept off a student's screen by a preview check,
but it is these rules that mean a student could not read the notes even if it
mounted. Treat a change to either as a change to student data privacy.

## Verifying a change here

```
node --test tests/platform/*.test.mjs      # full platform suite
npm run test:authoring-v5                  # the authoring gate; Step 7 safety tests are in it
npm run test:rules                         # Firestore rules, needs the emulator
npm run lint
npm run build
npm run build:firebase
```

CI covers these through `full-platform-suite.yml` and
`assignment-v5-foundation.yml`.

## Deploying

The workspace is client-side and rules-side only — there are no Cloud Functions
changes in it — so a deploy is hosting plus rules:

```
npm run build
npm run build:firebase
firebase deploy --only hosting,firestore:rules
```

Deploy the rules together with the hosting build, not after it. The Repair
Center writes to `assignmentAuthoringDrafts` as soon as a teacher pastes a
failing assignment, and without the rules in place every one of those writes is
denied — the teacher sees the salvage path fail for a reason that has nothing to
do with their assignment. Rules-first is also safe on its own: the collection is
unused until the new client ships.

No backfill or migration is needed. Existing assignments are untouched; the new
collection starts empty.
