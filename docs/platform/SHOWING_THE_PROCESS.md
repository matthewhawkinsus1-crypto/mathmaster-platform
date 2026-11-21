# Showing the process: answer boxes one screenshot cannot answer

Status: **decided by the owner on 2026-11-20. Slice P1 (part by part, Review all
parts, See every part at once) is built; P2 to P5 are not.** This page pairs with
`docs/platform/WORKED_EXAMPLES.md`.

Where P1 lives: `src/MultiAnswerGrader.jsx` (`partByPart`), asked for by the
student's assignment (`assignmentWorkspaceView.jsx`, not a teacher preview),
Recovery (`SectionRecoveryRunner.jsx`) and a secure Test's tool item (`RichQuestionRuntime.jsx`, not Corrections or the
teacher's Test preview); every other host draws every part at once. The support
is `every-part-at-once` (`functions/shared/supportCatalog.mjs`). A secure Test's
*field* item (several `responseFields`, drawn by `RichQuestionRuntime`'s
`FieldItem`, not `MultiAnswerGrader`) still shows every field at once. Drivers
answer part by part through `tests/browser/support/partByPart.mjs`.

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

## 8. Build slices

| Slice | What | Done when |
|---|---|---|
| P1 | Part by part, Review all parts (DOL, Test), See every part at once | Grading, attempt and draft tests are unchanged. The secure item boundary still holds. Focus and Read aloud work, at phone width and 200% text. |
| P2 | Teacher signals as evidence (section 7) | Stored beside the attempt as a record of its own, at school or at home, with no contents. Shown in Live Classroom, the assignment's results and the Student Case Review (patterns, timeline, export). Review keeps the record. In or outside class time, and the supports in effect, are recorded with each signal. Teachers only. Accommodations are exempt. No grade path reads them. |
| P3 | Follow-through parts | The grader keys a later part to the student's earlier value. Pre-Flight checks the names. |
| P4 | Show the step: `pickPoints` and `stepMoves`, then `factorPair` and `tableRow` | Each checkpoint is checked by the tool's own engine and recorded with the attempt. |
| P5 | The Pre-Flight authoring rules (sections 4 to 6) | Warnings on new assignments only. Existing assignments raise nothing new. |
