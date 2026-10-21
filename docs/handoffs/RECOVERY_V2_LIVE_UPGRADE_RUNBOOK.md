# Recovery V2 — deploying it, and upgrading the live Algebra I lesson

For whoever deploys MathMaster and helps a teacher approve the upgrade. The
teacher-facing explanation is `docs/RECOVERY_V2_TEACHER_GUIDE.md`; the design
is in `docs/architecture/question-families-and-practice-recovery.md` §6a.

**Nothing in this branch changes production data by being deployed.** The live
lesson gains Recovery only when its teacher approves the dry run (in the app),
or when an operator applies an approved dry run with the script below.

## 1. Deploy, in this order (AGENTS.md "Deploy")

```bash
npm run build
npm run build:firebase

# Server-side targets, with exact function names (never Hosting here).
firebase deploy --project mathmaster-aleks --only firestore:rules,functions:previewRecoveryContentUpgrade,functions:commitRecoveryContentUpgrade,functions:advanceSectionRecovery,functions:resolveHeldSectionRecovery,functions:previewAssignmentContentUpgrade,functions:commitAssignmentContentUpgrade

# Every functions release: confirm each callable is invokable from the browser.
node scripts/verify-callable-access.mjs --fix

# Hosting: ALWAYS separate, ALWAYS through the resilient wrapper.
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

(`node scripts/release-firebase.mjs` prints the same plan from what changed
since the live build, and `--execute` runs it.)

| Target | Why |
| --- | --- |
| `firestore:rules` | `recoveryContent` becomes a server-owned assignment field: a teacher's browser may create an assignment with it, never change it afterwards |
| `previewRecoveryContentUpgrade` | new: the dry run behind "Prepare Recovery" |
| `commitRecoveryContentUpgrade` | new: the approval; writes `recoveryContent` and one audit event |
| `advanceSectionRecovery` | reads `recoveryContent`; counts trustworthy assignment Practice; the five new families |
| `resolveHeldSectionRecovery` | the same context (bound slots, assignment Practice) for a held Recovery |
| `previewAssignmentContentUpgrade` / `commitAssignmentContentUpgrade` | Content V2's new "Adds Recovery (question unchanged)" classification |
| Hosting | Pre-Flight's Recovery panel and "Fix for Recovery", creation storing Recovery, the assignment details' Recovery section and Prepare Recovery, the student wording |

Every other function that grades a Question Family loads the shared registry,
which now has five more families. They change nothing for an existing question
(an unpinned reference still means version 1 of its own family), so
redeploying them is not required for this change.

Deploy the rules and functions before Hosting: the new teacher screens call the
new callables.

## 2. Upgrade the live lesson — the teacher's way (preferred)

The teacher of record (or an administrator) opens **Assignments → the lesson →
assignment details → Warm-Up & DOL Recovery → Prepare Recovery…**, reads the
preview and presses **Approve and Add Recovery** — once for the Standard copy
and once for the Honors copy. The server re-plans inside a transaction and
refuses if anything changed since the preview; approving again does nothing.

## 3. Upgrade the live lesson — the operator's way (on the teacher's approval)

`scripts/recovery-v2-upgrade.mjs` does the same operation against Firestore
with the Admin SDK. It finds the live copies by title, verifies each (Assignment
V5, Algebra I, assigned to active classes — a Library copy, an archived class or
another course's lesson is skipped and reported), and plans each copy from its
own questions.

1. **Offline rehearsal** (no Firestore; the lesson file compiled as a teacher's
   import compiles it, as a Standard and an Honors copy):

   ```
   node scripts/recovery-v2-upgrade.mjs
   ```

2. **Dry run against production** (read-only):

   ```
   node scripts/recovery-v2-upgrade.mjs --project <firebase-project-id>
   ```

   It prints, per copy, WILL CHANGE (six Recovery bindings), WILL NOT CHANGE
   (every question, the student-record counts, dates, classes, Classroom) and
   WRITES (the `recoveryContent` field and one audit event), and ends with one
   `--expect <assignmentId>=<planHash>` line per copy. The JSON report is saved
   under `recovery-reports/` (gitignored; counts only, no student names or ids).

3. **Show the teacher the report.** Their approval is for those plan hashes.

4. **Apply** (asks you to type the project id):

   ```
   node scripts/recovery-v2-upgrade.mjs --project <firebase-project-id> --execute \
     --actor <your email> --approved-by <teacher email> \
     --expect <standard-copy-id>=<planHash> --expect <honors-copy-id>=<planHash>
   ```

   A copy whose plan changed since the dry run (a teacher edited a question) is
   refused and nothing is written for it. Each applied copy gets one
   `assignmentVersionEvents` row (`eventType: recoveryUpgrade`, the approver,
   the plan hash, `questionsChanged: 0`, `studentRecordsWritten: 0`,
   `classroomSyncRequested: false`).

5. **Verify**: run the dry run again. Every copy should say NOTHING TO CHANGE
   and both sections `ready → ready`.

If a copy's title was edited and the script does not find it, use the
teacher's in-app path (it does not depend on the title), or plan an exported
copy with `--snapshot <file>`.

## 4. What the upgrade can and cannot touch

- It writes **one field**, `assignments/<id>.recoveryContent`, and one audit
  event. It never edits, adds, removes, reorders or retires a question, never
  writes a `grades/` document, and never raises a Classroom sync.
- Original answers keep being graded exactly as before; only a Recovery (after
  the original closes) uses the new versions.
- A binding is tied to the exact question it was certified for (a content
  signature). If a question is later edited, its binding stops being used and
  the section reads "not ready" until it is prepared again.

## 5. Undoing it

Do not remove `recoveryContent` once any student has started a Recovery: their
pinned questions are rebuilt from it to be graded. To stop offering Recovery,
turn Recovery off in the assignment's grading policy instead (Recoveries
already started can still be finished and graded). Before any student has
started, an administrator can restore the previous `recoveryContent` (absent,
for the first upgrade) with the Admin SDK; the audit event records what was
added.
