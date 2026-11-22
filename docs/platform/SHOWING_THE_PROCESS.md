# Showing the process: answer boxes one screenshot cannot answer

Status: **decided by the owner on 2026-11-20. Slices P1 (part by part, Review all
parts, See every part at once) and P2 (teacher signals, as evidence) are built.
P3 to P5 are not built.** This page pairs with `docs/platform/WORKED_EXAMPLES.md`.

Where P1 lives: `src/MultiAnswerGrader.jsx` (`partByPart`), asked for by the
student's assignment (`assignmentWorkspaceView.jsx`, not a teacher preview),
Recovery (`SectionRecoveryRunner.jsx`) and a secure Test's tool item (`RichQuestionRuntime.jsx`, not Corrections or the
teacher's Test preview); every other host draws every part at once. The support
is `every-part-at-once` (`functions/shared/supportCatalog.mjs`). A secure Test's
*field* item (several `responseFields`, drawn by `RichQuestionRuntime`'s
`FieldItem`, not `MultiAnswerGrader`) goes part by part the same way for the
student, inside the item, with "Review all parts, then submit" before its
Record answer (or, in a test the student moves around in, before the test's
Next; SP-1b). Drivers
answer part by part through `tests/browser/support/partByPart.mjs`. Read aloud
(the work bar's Read and the tray's "Read a part") reads the prompt, the open
part and the answered lines, never a part not yet shown: `MultiAnswerGrader`
reports the parts on the screen (`onShownPartsChange`) and `QuestionEngine`
keeps only those (`readingPartsShown`, `questionReading.js`; SP-1c). Translate
translates the prompt, which every part shows.

Where P2 lives:
- **Recorded:** the facts and the stored record are
  `src/platform/signals/attemptSignalFacts.js`; the question engine raises them
  beside the attempt (`useAttemptSignals.js`), and the student's assignment
  (`assignmentWorkspaceView.jsx`, not a preview and not post-deadline practice)
  writes each once to `grades/{studentId}/attemptSignals` (`firestore.rules`).
- **Shown to the teacher,** always labelled not conclusive:
  - **Worth a conversation** (`src/components/teacher/WorthAConversation.jsx`)
    on a Live tile and in the student's drawer;
  - beside each question of the assignment's results
    (`QuestionSignalNotes.jsx`, in the gradebook's student view);
  - the case review's **Work-pattern signals**
    (`src/platform/caseReview/workPatternSignals.js`, `CaseSignalsTab.jsx`),
    on its timeline and in its export.

Section 7 has the details.

## 1. The problem

A multi-part answer-box question shows every box on one screen. One photo of
the screen, given to an AI, answers all of it.

Multi-part answer-box (`multipleResponses`) questions in the lessons today:

| Section | Questions | Average boxes |
|---|---|---|
| Classwork | 275 | 4.1 |
| Practice | 231 | 2.3 |
| Warm-Up | 49 | 1.9 |
| DOL | 37 | 1.7 |

No web page can stop a phone from photographing a screen. The aim is to:
- make each answer depend on work the student does;
- make one photo answer one part at most;
- let the teacher see how the work happened.

## 2. The owner's decisions (2026-11-20)

1. **Part by part.** Every multi-part answer-box question shows one part at a
   time, in every section, DOL and Test included. On a DOL or a Test, a
   **Review all parts** screen comes before submitting, where every part can
   be seen and changed.
2. **Later parts use the student's own earlier answer**, where the mathematics
   builds on it ("Using your slope of −2, …").
3. **Show the step.** A question can require one checked step done in a tool:
   - the two points the student picked on the plane;
   - the factor pair they chose;
   - their moves in Step Algebra.
4. **Tool first for new questions.** If a tool can produce the answer, the
   question uses the tool. Answer boxes are for reading and interpreting.
5. **Teacher signals.** The platform may record two events and show them to
   the teacher: leaving the page, and pasting into a math box. These signals
   are only "worth a conversation":
   - they never change a grade;
   - they are not raised for a student whose accommodations explain the pattern.
6. **Accommodation.** For a student with an IEP or a 504 plan, the teacher can
   turn on **See every part at once**.
7. **Scope.** This covers the platform and future assignments. Existing
   assignments are not rewritten. Parts 1, 5 and 6 are platform behaviour, so
   they reach every assignment by themselves. Parts 2, 3 and 4 are authoring
   rules for new assignments, which Pre-Flight checks.

## 3. Part by part

- **The unit is a part:** one entry of the question's `responses`. A
  single-part question is unchanged.
- **Only the current part is open.** The prompt, the graph or table, and the
  answered parts stay on screen. An answered part shrinks to one line, its
  label and the student's answer, and tapping it reopens it.
- **"Next part" commits a part on the device.** It uses no attempt, and nothing
  is graded yet. The last part's **Submit** sends the whole question, as today:
  - **grading, attempts and partial credit are unchanged;**
  - the draft is saved after every part, so a reload returns to the same part.
- **After a miss** (on Classwork, Practice and Warm-Up, where feedback is
  immediate), the parts the grader marked wrong reopen, and the right ones stay
  shrunk.
- **DOL and Test:** after the last part comes **Review all parts**, a list of
  every part and its answer, each one editable, then Submit. On a secure exam
  this stays inside the item, so the item boundary is unchanged.
- **Accessibility:**
  - focus moves to the new part's heading;
  - a polite live region says "Part 2 of 4";
  - Read aloud and Translate read the open part and the answered lines;
  - it works at phone width and at 200% text.
- **Accommodation:** **See every part at once** (decision 6) is a per-student
  support. It turns part by part off for that student.

## 4. Later parts use the student's answer (new assignments)

A part names the part it builds on, and the platform writes the student's value
into its prompt. The grader keys the later part to the student's earlier value
(follow-through), so an early slip is not marked wrong twice.

```jsonc
{ "id": "slope", "label": "Slope of the boundary line", "answer": "-2" },
{ "id": "inequality",
  "label": "Using your slope of {slope}, write the inequality",
  "followThrough": { "from": ["slope"], "answer": "y > {slope}x + 3" } }
```

Pre-Flight checks that every `{name}` in a label or answer names an earlier
part.

Built (SP-3): the label shows the student's value, and every grader (the
screen, the server, a secure Test, Corrections and Path) keys the part to it
from `functions/shared/followThrough.mjs`, still accepting the part's own answer.

How to write `followThrough` and `checkpoint`, with an example lesson: `docs/assignments/AUTHORING_LEARNING_SUPPORTS.md`.

## 5. Show the step (new assignments)

A part may carry one `checkpoint`, a step the student does in a tool before the
part's answer is accepted. The checkpoint is recorded with the attempt, so the
teacher sees the student's own points, pair or moves.

| `kind` | Where | What is checked |
|---|---|---|
| `pickPoints` | the plane | `count` points that lie on the line or curve. Rise and run are checked from the student's own points. |
| `factorPair` | factoring | the pair that multiplies to the constant (or to a·c) and adds to the middle coefficient |
| `stepMoves` | Step Algebra | the student's recorded moves reach the answer. The tool already records them. |
| `tableRow` | tables | a row the student fills in that satisfies the relation |

```jsonc
{ "id": "slope", "label": "Slope of the boundary line", "answer": "-2",
  "checkpoint": { "kind": "pickPoints", "count": 2 } }
```

## 6. Tool first (new assignments)

When a new question asks for something a tool can produce, it uses the tool:
- an equation to solve uses Step Algebra;
- a line, inequality or system to graph uses the plane;
- a polynomial to divide uses synthetic or long division.

Pre-Flight warns when a new answer-box question asks for one of these in a box.
It also warns when a new multi-part answer-box question with three or more
parts has neither a `checkpoint` nor a `followThrough`.

Both warnings are in Pre-Flight's Check step today (SP-5,
`newAssignmentRulesPreflight.js`): only for an assignment being imported or
authored now, never for an existing one (one re-assigned from the Library
included), and neither stops the assignment being created.

## 7. Teacher signals

Each signal is a fact about one attempt, never a verdict. It is shown to the
teacher only, in Live Classroom and in the student's results:

| Signal | Recorded |
|---|---|
| Fast and right (exists today: `rapidCorrectness.js`) | time on the question against its expected time |
| Left the page, then a burst of right parts | the page was hidden (`visibilitychange`), then two or more parts were committed within a short time of returning |
| Pasted into a math box | a paste into a math answer field. Only the fact and the part are recorded, never the pasted text. |
| Right first time on a hard question, with no tool work | every part right on the first attempt, difficulty band 3 or higher, and no checkpoint or tool moves |

The rules:
- No keystrokes, screenshots, camera or contents are recorded.
- A signal never changes a score, an attempt or mastery.
- Signals are not raised for a student whose support profile explains the
  pattern: for example, a read-aloud or translation tool that moves focus off
  the page, or See every part at once.
- The teacher sees "worth a conversation", with the facts, and can mark it reviewed.

### Signals as evidence (the owner, 2026-11-21)

A signal is not only a live alert. It is lasting evidence: never conclusive on
its own, but part of the bigger picture of a student's work.

- **Stored beside the attempt.** Each signal is a record of its own on the
  server, keyed by the student, assignment and question it belongs to. It is
  stored wherever the student worked, in class or at home. It is never a field
  of the attempt, the submission or the grade record, so no grade path can
  read it. Live Classroom is one view of it.
- **In the assignment's results.** The results show each signal beside the
  student's question: what happened, when, and in which part.
- **In the Student Case Review.** The Academic Evidence Deep Dive
  (`docs/STUDENT_CASE_REVIEW_DESIGN.md`) gains a "Work-pattern signals"
  section, which also appears on the case timeline and in the case review
  export. It shows patterns that one signal cannot:
  - how often a signal occurs over time, for example "pasted into a math box
    on 6 of 40 answers this month";
  - accuracy on flagged questions against unflagged ones;
  - where the signals occur, beside the existing comparison of DOL and
    instructional work.
- **Reviewed, never deleted.** "Dismiss" marks a signal reviewed: who, when,
  and an optional note. A reviewed signal leaves "needs attention" but stays
  in the record and in the case review.
- **Context recorded with each signal:**
  - whether the attempt was during the class's scheduled time or outside it,
    from the class schedule the platform already has. Nothing else about
    where the student was is inferred.
  - the accommodations and supports in effect for that attempt.
- **Wording.** Facts only, for example "left the page, then 3 parts right
  within 40 seconds". Every place a signal is shown labels it "not
  conclusive", and none says "cheating". The case review's narrative guard
  keeps signals out of any written conclusion.
- **Unchanged rules.** Signals are for teachers only. No grade, attempt or
  mastery path reads them.

As built (SP-2 and SP-2b):

- **When a fact is raised.**
  - *Left the page*: the page was hidden (another tab or app, or the screen
    turned off) for between 8 seconds (the Live view's own floor for a focus
    loss) and 5 minutes, and within 60 seconds of its return two or more parts
    were answered, and marked right when the attempt was submitted. A longer
    absence is a locked screen or a tab left open, and raises nothing. Nor
    does an absence that starts when the platform opens one of its own links
    in a new tab (a teacher's study sheet or reteach resource).
  - *Pasted*: a paste event in a part's math box, a table's cell, or the one
    math box of a single-answer question. The clipboard is not read. Not
    raised: a paste that follows a copy or cut on the page itself (the
    prompt's expression, an earlier part's answer; the page notes only that a
    copy happened), a paste into a box that takes words, and a paste into a
    tool's own boxes (a Step Algebra move is checked by the tool).
  - *Right first time*: the first submitted attempt, every part right, the
    question's `difficultyBand` 3 or higher, and no work to look at. That
    means the engine drew the question as answer boxes and nothing else (by
    the module drawn, so the legacy `algebra` type and a `literal` on the
    balance workspace never qualify), with no `checkpoint`, no tool response,
    no composed stages and no saved scratchpad. The scratchpad is asked of the
    host at submit, so one saved before a reload counts, and a read that fails
    counts as work. Band 3 is the most common band in today's lessons, so this
    is the most frequent of the three.
- **What is stored.** One document per fact, at
  `grades/{studentId}/attemptSignals/{assignment}__{question}__{kind}` (a paste
  adds the part). Its fields are a closed list, checked by `firestore.rules`:
  the student, the assignment, the question's position, the kind, the
  section, the attempt number, and for its kind a part position, a part
  count, seconds away or the difficulty band. The assignment must be one given
  to the student and the question one of its own, so made-up places cannot
  fill a record. "Given to the student" is the server-owned proof an
  assignment read uses: the roster class is one the assignment is assigned to,
  or the assignment is in the student's `gradesByAssignment` (work already
  held, as after a move to another class) or `testCycleGrades` (a Test they
  were added to on their own). The server stamps the time. The first record of
  a fact stands. A paste in a part past the fiftieth is not recorded, rather
  than filed under another part; a table's boxes are numbered among the boxes
  the student fills.
- **Where.** Only on the Warm-Up, Classwork, Practice and DOL questions of a
  classroom assignment. A fact on a Quiz, a Test, Review or Corrections is not
  recorded, and the create rule refuses one: these are the sections the case
  review counts signals out of, and the two lists are one.
- **Context stored with it.**
  - `duringClass`: whether the fact happened in the class's scheduled time
    (`classTimeFact.js`). It has three answers. True or false is stored only
    when the bell schedule answers, read on the school's clock
    (America/Chicago), never the device's. A weekend with no bell schedule of
    its own, a day the calendar marks closed, and a day outside the school
    year (the summer, pre-service days) are "outside". The field is
    left out, and every screen and export reads "Class time not known", when
    no schedule has been saved or loaded, when the day's A/B type has not been
    chosen (a Friday not yet set), when the student's period is missing or
    not switched on that day, or when no school calendar covers the date. Nothing else about where the student was is
    recorded.
  - `supports`: the catalog ids of the supports in effect that day for that
    kind of activity, by the support plan's own rules: a support limited to
    some activities is named only on those, and the supports inclusion brings
    are named for a student whose plan says inclusion. The list is never cut
    short (it may hold every id in the catalog).
  - The question is the one the engine was showing when the fact happened,
    even if the student has opened the next one before it is written.
- **Who reads it.** The teacher who teaches the student, and the root
  administrator. The student cannot read it back. The Live heartbeat carries
  only how many there are (`attemptSignalCount`), so a tile reads the facts
  only for a student who has some. Both reads are bounded (one assignment's
  facts, or the student's newest 200). The projector's tiles never show them,
  and a student's drawer opened over projected tiles withholds them.
- **Mark reviewed.** One review, by that teacher or the root administrator,
  stamps the fact with who, when and an optional note of up to 500
  characters (stored as `dismissedAt`, `dismissedByEmail`, `reviewNote`). It
  cannot be re-stamped, and the fact cannot be edited or deleted. A reviewed
  fact leaves what needs attention (the Live tile, the drawer's list, the case
  review's "not yet reviewed" count) and stays everywhere else: under
  "Reviewed" in the drawer, beside its question in the assignment's results,
  and in the case review.
- **In the assignment's results.** The gradebook's student view shows each
  question's signals in that question's card: what happened, when, in which
  part, class time and supports, with Mark reviewed.
- **In the Student Case Review.** A "Work-pattern signals" tab over the
  case's window: how often each kind occurs among the answered questions,
  first-attempt and final accuracy on questions with a signal beside those
  without, counts by section and by class time, and every signal with its
  review. The same entries are on the timeline (their own filter), in a
  Signals CSV, in the printed case review (section 13) and in the JSON. The
  narrative facts are not written from them, and the narrative guard refuses
  a template that states a conclusion about integrity.
- **Exemptions**, from the support profile in effect today:
  - no *left the page* for `text-to-speech`, `translation` (or a translation
    language other than English), `glossary-lookup` or `every-part-at-once`;
  - no *pasted* for `word-processor-response`.
- **Not a grade.** No grade, attempt or mastery path reads the collection, the
  facts or the count: `tests/platform/attemptSignalsNeverGrade.test.mjs` reads
  every source file of the app and both backends, and the grade paths by name.
- **Where it is recorded.** The student's classroom assignment, on credit
  work, in class or at home. Not in a teacher's preview, post-deadline
  practice, Recovery, My Math Path or Live Challenge. A secure Test keeps its
  own log (`examIntegrityLogger.js`).
- **Known gaps, for the follow-up:** a paste into a table cell is not seen; a
  paste into a Step Algebra move box reads as part 1; a plain text box inside
  a part counts as a math box; and a dictation tool that pastes has no
  exemption of its own.
- **Known gaps.**
  - A dictation tool that pastes its text has no exemption of its own: the
    support catalog has no entry for one.
  - The heartbeat's count is kept per browser tab, so the Live tile shows
    nothing after the student closes the tab until a new fact is raised.

## 8. Build slices

| Slice | What | Done when |
|---|---|---|
| P1 | Part by part, Review all parts (DOL, Test), See every part at once | Grading, attempt and draft tests are unchanged. The secure item boundary still holds. Focus and Read aloud work, at phone width and 200% text. |
| P2 | Teacher signals as evidence (section 7) | Stored beside the attempt as a record of its own, at school or at home, with no contents. Shown in Live Classroom, the assignment's results and the Student Case Review (patterns, timeline, export). Review keeps the record. In or outside class time, and the supports in effect, are recorded with each signal. Teachers only. Accommodations are exempt. No grade path reads them. |
| P3 | Follow-through parts | The grader keys a later part to the student's earlier value. Pre-Flight checks the names. |
| P4 | Show the step: `pickPoints` and `stepMoves`, then `factorPair` and `tableRow` | Each checkpoint is checked by the tool's own engine and recorded with the attempt. |
| P5 | The Pre-Flight authoring rules (sections 4 to 6) | Warnings on new assignments only. Existing assignments raise nothing new. |
