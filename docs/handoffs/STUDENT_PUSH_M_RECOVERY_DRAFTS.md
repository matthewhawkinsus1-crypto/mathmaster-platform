# Student push, Job M: saved Recovery answers follow the student (2026-10-10)

Branch `claude/student-push-m-recovery-drafts`, from `main` @ `990faff6`.

## The bug

A DOL Recovery's assessment saved each answer only to the browser's
localStorage (`SectionRecoveryRunner.jsx` `readSaved`/`writeSaved`, which its
own comment called "a convenience only"). The screen said "Answer saved". If
the student opened the same Recovery on another Chromebook, or after site data
was cleared, the button read "(0/3 saved)", Submit sent `responses: {}`, and
the real `advanceSectionRecovery` handler stored each item as
`{status: 'unanswered', credit: 0, reason: 'no-answer'}`.

The server backup at `studentWorkspaceDrafts/…` stayed empty for two reasons:

- The assignment-draft sync only syncs the active assignment's own keys. The
  Recovery's per-tool drafts use the `<id>~recovery…` namespace, so they were
  never candidates.
- The tool drafts that could have been candidates carry the two-step family's
  answer field, whose id is `solution`. As a draft *key*, `solution` is
  refused by the guard ("forbidden-key at `solution`").

Nothing in the browser ever sent the saved *answers* themselves.

## What changed

| File | What |
| --- | --- |
| `src/platform/recovery/recoveryAnswerDrafts.js` (new) | The pure rules. Each answer is rebuilt from an allowlist: kind, type, typed value, field ids and values, or a registry tool's bounded work. It is refused if any key in it, or in the tool work it carries, names answer-key, solution or grading data. Per question the newest answer wins: on the same page the higher `revision` always wins, so an older save from that page can never land over a newer one; across pages the later edit wins *by each device's own clock*. An edit is always stamped after any server copy the page has already seen, so an edit made after reading another device's answer always wins. Limit: two devices editing the same question without seeing each other's copy (one offline) are ordered by their clocks, so a fast clock can win. Tries used up on a question instance are final: that copy beats any answer to the same instance. Entries up to 60,000 bytes are stored (a tool's 24,000-character work, JSON-escaped). Anything the server did not keep reads "saved on this device only", never "account". Saves go one at a time (`createRecoveryAnswerSync`), with backoff retry. |
| `src/platform/recovery/recoveryAnswerDraftStore.js` (new) | A Firestore read, and a transactional merge-write to `studentWorkspaceDrafts/{studentId}__{assignmentId}-recovery`. The collection and document shape are the existing working-draft ones: `secure: false`, `schemaVersion: 1`, server `updatedAt`, no grade-bearing field. The assignment id ends in `-recovery`, so no teacher report, auto-submit or assignment draft reader sees it. |
| `src/components/student/useRecoveryAnswerDrafts.js` (new) | The hook. It keeps this device's copy (localStorage, the offline fallback only, merged by the same rule) and reads the server on open, on `online`, on return to the tab, and again just before Submit. Answers an older build kept only on this device (the old `recovery-responses` key) are backed up once, dated oldest so any server answer wins over them. |
| `src/components/student/SectionRecoveryRunner.jsx` | Answers save through the hook. Submit first lands the pending save, reads the server, and sends the merged answers. If the server copy could not be read (filtered network, still offline, over 8 s), Submit stops and says "We couldn't check your account for answers saved on another device", with **Try again** / **Submit anyway**. Status copy: **"Answer saved to your MathMaster account — you can change it until you submit."** appears only once the server has the answer; before that, "Saving your answer to your MathMaster account…". Offline it reads **"Answer saved on this device only — it will sync to your MathMaster account when you are back online."** The nav button state and accessible name say the same. An answer typed on another Chromebook is shown as the student's own answer, with no verdict. "Tries used up" travels as a bare flag, so no device offers fresh tries. |
| `src/platform/persistence/workspaceDraftStore.js` | `readLatestWorkspaceResume` now reads the newest 4 draft documents instead of 1, so a newer `-recovery` draft (which has no resume) cannot hide "resume where you left off". |

Recovery gates, holds and grading are unchanged. Submit still calls
`submitSectionRecovery` with `responses` and `unavailableItems`, and the server
grades exactly as before. Nothing about correctness is shown before Submit.

### Assessment safety

The draft stores only what the student entered. Proven by
`tests/platform/recoveryAnswerDrafts.test.mjs`:

- A rendered question carrying `answerFields`, `acceptedAnswers`, `solution`,
  `gradingContract` and a family seed yields a stored document with none of
  those keys at any depth (entry JSON and tool work included). None of the
  answer-key values appear either.
- Tool work that names a worked solution is refused outright.
- The field id `solution` survives only as a *value*, so the family's answers
  back up.

### Found by the browser journey

The hook first shared its in-flight server read across runs of its effect.
Under React StrictMode's double effect (or any re-run while a read was in
flight), that read resolved into the cancelled sync, so the live one showed
"(0/3 saved)" until an online or visibility event. Each run now tracks its own
read.

## Proof

| Test | Runs in CI as |
| --- | --- |
| `tests/platform/recoveryAnswerDrafts.test.mjs`: payload safety, ordering (same-page revision, cross-device edit time, slow clock), serial saves, offline then sync, legacy backup, hydrate persistence, closed flag, runner wiring | `npm run test:platform` |
| `tests/integration/recoveryAnswerDraftsCrossDevice.test.mjs`: on the Firestore emulator with the **real `advanceSectionRecovery`**. Device 1 saves Q1 and Q2; a fresh device 2 restores them, answers Q3 and submits; all three are graded correct (raw 100, recorded 90, original DOL untouched). A control student shows the old outcome (`unanswered`, 0, `no-answer`) | `npm run test:challenge-finish` (full-platform-suite) |
| `tests/rules/recoveryAnswerDraftRules.test.mjs`: the browser's exact transaction under the real `firestore.rules`. The owner can create and update (both saves survive); another student and a teacher on the client cannot read or write it; grade fields, `secure: true` and a client clock are refused | `npm run test:rules` |
| `tests/browser/teacherWorkflow/recoveryDraftCrossDeviceJourneys.mjs`: the real App at 1366×768 and 390×844, saved on context 1, submitted from a fresh context 2, plus offline then online | student-teacher-journeys.yml |

Each new assertion was mutation-checked. With the code broken, it goes red:
same-page revision rule, allowlist projection, serial saves, stamp-after-server,
"saved" before the server has it, tool-work guard, hydrate persistence, Submit
sending the merged answers, and the restore on device 2 (emulator).

## Files touched outside this job's lane

- `src/platform/persistence/workspaceDraftStore.js`: one default value,
  `maxAssignments` 1 → 4.
- `tests/browser/teacherWorkflow/recoveryFixture.js`: one added synthetic
  lesson (`a-recovery-c`, never edited) and student (910975), built with the
  real `startedRecord`. A separate lesson keeps the existing students'
  seats, pins and records byte-identical (diffed against main).
- `.github/workflows/student-teacher-journeys.yml`: one added step.
- `firestore.rules` (Job I's lane, one condition, from the independent
  review): `studentWorkspaceDrafts` create now requires
  `draftId.split('__')[0] == request.resource.data.studentId`. Before, a
  student could create a draft under another student's id, which locked that
  student's own backups out. It applies to every working draft; the read
  rule already assumed it. Covered by `tests/rules/recoveryAnswerDraftRules.test.mjs`
  (mutation-checked).

Not touched: `src/App.jsx` (Job G), `functions/**` (Job I), and the Recovery
service files (Job J). No App.jsx wiring is needed,
because the runner is self-contained.

## Deploy targets

- **Functions:** none.
- **Rules:** yes, `firebase deploy --project mathmaster-aleks --only firestore:rules` (the one create condition above). Deploy rules before Hosting.
- **Hosting:** yes, via `FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting`.
