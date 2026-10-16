# Student pass 3 — Batch 8: help that answers back (HELP-5, LIVE-9, decision D6)

Branch `claude/pass3-b8-ask-my-teacher`, on `claude/modest-pasteur-xzagn7` at `37ec6ce` (Batches 1 and 2).
Nothing here deploys, writes to a production project or re-grades.

## What a student saw, and what changed

"Ask my teacher" was a flag on the live heartbeat: offered at any hour, carrying no message, lowered by a reload, and
answered by nothing. The teacher's monitor said "Hand raised" and had no way to reply.

D6, as built:

| Where | Student | Teacher |
| --- | --- | --- |
| **In class** (their class is meeting now) | ✋ Ask my teacher raises the hand, as before. A reload keeps it raised. Beside it: "Your teacher has seen your hand." or "Your teacher is on the way." | Each tile with "Hand raised" (Room view and Walkthrough) has **Seen** and **On my way**. Never on the projector's Large room tiles. |
| **Out of class** | ✉ Leave a question for my teacher: a short box (500 characters), sent with the assignment and the question's place ("Classwork · Question 3"). While unanswered it can be reworded; once answered the answer shows on that question, in a folded "Your teacher answered your question" at the top of the assignment, and in Review My Work. | Teacher Home: a folded **Questions from students (N)** panel. Opened, each question shows the student, the assignment and question (the prompt one click away), the student's words, an answer box and Open student. |

**The in-class test** (`studentClassInSession`, `src/platform/supports/askTeacher.js`): the student's own class period
has a window now in the bell schedule — today's A/B day or a date-specific modified schedule, with that period switched
on (`getPeriodWindow`, the same resolver the Warm-Up and DOL windows use) — and the district calendar
(`schoolYear2026-2027.js`) does not close the day. A modified schedule for that exact date outranks the calendar (a
make-up day), as it already outranks the A/B rotation. No period on file, a weekend, a holiday or any hour outside the
period is "out of class". Re-evaluated once a minute. Outside class a hand is never published, so a hand raised at the
end of the period goes quiet when the bell rings.

**Why Teacher Home for the questions** (the least new UI): it is the page a teacher lands on and already watches for
help (the live monitor sits on it), so a question needs no new screen, tab or route — one folded panel that hides
itself when nothing is waiting. The Action Center was the alternative; its rows only link out to other workflows and
its count updates only once that tab is opened, so a question would sit unseen. The live monitor alone is class- and
period-scoped, and these questions arrive when no class is meeting.

**Kept:** the hand still comes down when its question closes or locks (PR #462 review M4) and on leaving the
assignment; nothing is offered inside secure Tests / Test Cycle or under server grading (`feedbackThatTeaches`
pins it, unchanged); presence still carries only a time and a question position.

## Data and rules

`askTeacherQuestions/{studentId}__{assignmentId}__{questionIndex}` — one per student per question of an assignment:

```
schemaVersion 1, studentId, classId, teacherEmail, assignmentId, assignmentTitle (≤200), questionIndex,
questionLabel (≤120), text (1–500), status 'open' | 'answered', createdAt, updatedAt,
answer (1–1000), answeredBy, answeredAt            ← written only by the teacher
```

`helpAcknowledgements/{studentId}` — `{ studentId, assignmentId, helpRequestedAt, status: 'seen' | 'onMyWay',
teacherEmail, acknowledgedAt }`, naming the hand by its presence `helpRequestedAt` (a hand raised again later is a new
request the old acknowledgement does not answer).

`firestore.rules`:

- **Questions.** Create: only the signed-in student, for themselves, to the `assignedTeacherEmail` and `classId` on
  their own roster row (a student with no teacher cannot send one), about an assignment that exists and lists that
  class in `assignedClassIds` (added at integration, below), with the deterministic id, exactly the fields above,
  `status: 'open'`, server timestamps. Read: that student; the teacher it was sent to (the Teacher Home query
  `teacherEmail == me && status == 'open'` is provable); the student's current teacher of record by id (after a class
  changes hands); the root administrator. Update: the student rewords `text` only while open; the teacher (sent-to or
  current) writes only `status: 'answered'`, `answer`, `answeredBy == their email`, `answeredAt`, `updatedAt`.
  Delete: never from a browser.
- **Acknowledgements.** Written only by a teacher who teaches the student (`teachesPresenceStudent`), only for the hand
  the student's presence is raising now (same `helpRequestedAt` and `assignmentId`), with one of two statuses and no
  other field. Read by the student and their teacher. Never deleted from a browser.
- No index is needed: every query is equality-only.
- Account deletion (`permanentlyDeleteStudent`) removes both with the student's footprint
  (`functions/lib/admin.js`), and the pre-production reset clears both collections.

**Student text stays private:** nothing on either path logs, reports or sends it to analytics (asserted over every new
file), it never rides in presence, and the reload memory (`sessionStorage`, this tab) holds only an assignment id, a
question position and a time.

## Files

New: `src/platform/supports/askTeacher.js` (model, in-class test), `askTeacherStore.js` (queries and writes),
`useAskMyTeacher.js` (the student's hook), `AskTeacherControl.jsx` (the Ask button and status line);
`src/components/student/TeacherAnswersList.jsx`, `TeacherAnswers.jsx`; `src/components/teacher/HelpAcknowledgeControls.jsx`,
`StudentQuestionsPanel.jsx`.

Changed: `helpRequest.js` (reload memory), `App.jsx` (the hook replaces the hand's `useState` and its reset on every
assignment change; the engine gets `askTeacherContext`; the answers notice; Review My Work gets the answers),
`QuestionEngine.jsx` (one pass-through prop, spread *before* `requested`/`onToggle` and under the same
`!locked && !serverGrading` gate), `HintPanel.jsx` (only the Ask button and its status line, now rendered by
`AskTeacherControl`), `ReviewMyWork.jsx` (one `teacherAnswers` slot under the heading; the solution view is
untouched), `LiveClassMonitor.jsx`, `TeacherHome.jsx`, `firestore.rules`, `functions/lib/admin.js`.

## Tests

| Test | What it proves |
| --- | --- |
| `tests/platform/askMyTeacherAnswersBack.test.mjs` (11) | the in-class test (period window, B day, weekend, holiday, make-up day, no period); question/answer/acknowledgement documents match the rules' field lists; reload memory; the hook restores during render, forgets on leaving, publishes only in class; the engine gate; the panel rendered through Vite SSR in every state; the answers list; no logging; teacher wiring; deletion lists |
| `tests/rules/askTeacherRules.test.mjs` (8, emulator) | the rules above, through the app's own queries and writes |
| `tests/browser/teacherWorkflow/askMyTeacherJourneys.mjs` (not in CI; 58 checks, 1366×768 and 390×844) | Q1–Q3: a Period 5 student leaves a question, the teacher answers on Teacher Home, the student reads it; H1–H3: a Period 3 student raises a hand, a reload keeps it, the teacher sends "On my way" (not shown on Large room tiles), the student reads it, lowering clears it |

Rewritten contracts (behaviour intact, text moved — SOURCE_CONTRACT_PLAYBOOK): `feedbackThatTeaches` (the raised-hand
sentence now lives in `AskTeacherControl`, asserted inside the hand's status line; HintPanel asserted to render the
control's button and status), `studentTodayAppWiring` (Review My Work's mount asserted by its props, plus the new
`teacherAnswers`). `assessmentRecoveryPolicy` counts one exact call-site spelling; the hook's argument was renamed
(`askingStudentId`) rather than the count changed.

Mutation checks: 29 code mutations against the platform tests, 16 rule mutations against the emulator suite, 2 against
the browser journey (plus the real defect it caught, below) — every one failed its test.

**Found by the harness:** the first version stored the hand from an effect, and React re-ran that effect (StrictMode,
a reconnect) before the restore had landed, erasing the hand on reload. The restore now happens during render.

## Gate

`npm run test:platform` 11,372/11,372 · `node --test tests/tools/*.test.mjs` 1,643 pass, 0 fail · `npm run
test:authoring-v5` 686/686 · `npm run test:rules` 243/243 + 208/208 · lint 0 errors · `npm run build` and `npm run
build:firebase` pass. `tests/browser/assessmentLeakGates.mjs` passes; `tests/browser/feedbackTeaches.mjs` passes every
Ask check and fails one phone check ("the worked solution can be reached"), which fails identically at `37ec6ce`.

## Deploying (not done)

Rules, two Cloud Functions and Hosting all change. Through the release script only:

```bash
node scripts/release-firebase.mjs            # the plan
node scripts/release-firebase.mjs --execute  # asks for the project id
```

It must include `firestore:rules` (two new collections: until the rules ship, every question and acknowledgement is
refused and the student sees "Your question could not be sent"), `permanentlyDeleteStudent` and
`resetPreproductionTestData` (they read the changed collection lists), and Hosting. Ship rules before Hosting.

## Security review at integration

An independent review of the rules and the client reads and writes (with ~30 adversarial probes in the emulator)
found no blocker. Fixed when the branch was merged into `claude/modest-pasteur-xzagn7`:

- **A student could fill their teacher's list.** `assignmentId` was only a 1–200 character string, so 40 questions
  about assignments that do not exist were accepted, and Teacher Home loaded every open question. The create rule now
  requires a real assignment whose `assignedClassIds` holds the class on the student's roster row (one `exists` and one
  `get`), and the Teacher Home query loads at most `TEACHER_QUESTIONS_SHOWN` (100); the count reads "100+" and the
  panel says to answer these to see the rest. No index: still equality filters only.
- **The dangerous cases were not pinned.** `tests/rules/askTeacherRules.test.mjs` now also refuses: a question about
  an assignment that does not exist or another class's; the list queries no screen runs (a teacher by another
  teacher's student, a teacher or student listing everything, a student by assignment alone, a classmate by teacher);
  a student moving their question's assignment, position, class, title, label or owner; a teacher rewriting whose,
  to whom or where while answering, and reopening; re-creating over an answered question; an acknowledgement for a
  student with no presence document; the previous teacher's acknowledgement after a handover. Each new rule was
  broken once and the suite went red (4/4).
- **The title and label on Teacher Home were the student's device's words.** Teacher Home now shows its own copy of
  the assignment's title, and the label only in the shape the app builds ("Classwork · Question 3", a section the
  platform names); anything else reads "Question <n>" (`teacherQuestionPlace`, askTeacher.js). Mutation-checked 5/5
  with the cap above.

Left for the owner (notes, not fixed here):

- **The id separator.** Ids join student, assignment and position with `__`, which a student id may contain
  (`STUDENT_ID_PATTERN`), so two students whose ids share a `__` prefix could in principle collide. With the
  assignment check above the collision needs a real assignment whose id contains `__`; district ids are numeric.
  A separator outside the student-id alphabet would close it, at the cost of a migration of any questions sent.
- **Rewording after a handover.** The student may reword an open question, and the words still go to the teacher it
  was sent to, not the new teacher of record (see the second point below).
- **A projected Teacher Home.** The panel is folded and shows only the count, but one click shows students' names and
  words; it is not hidden while a class is in session or the room view is on.

## Open

- One question per question of an assignment: once answered it cannot be followed up in the app (asking again in class
  still works). A follow-up thread would need a list per document or a subcollection — a product call.
- A question sent to a teacher who then loses the class stays on that teacher's list until answered. The rules let the
  new teacher of record read and answer it, but no screen lists it for them yet.
- No notification outside the app: a teacher sees questions when they open Teacher Home; a student sees the answer when
  they open the assignment or its Review My Work.
- Questions are kept until the account is deleted; no retention window is set.
