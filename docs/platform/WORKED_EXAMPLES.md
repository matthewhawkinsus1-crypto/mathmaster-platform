# Worked examples: the platform teaches each new skill

Status: **decided by the owner on 2026-11-20. Slice A (the player and the
section rules), slice B (the coverage report), slice C (the Step Algebra
replay), slice D (the radical replay with its factoring slides), slice E (the
plane and inequality replay) and slice G (the teacher's view) are built; F and
H are not.**
This page is the spec. The build is split into slices that can ship in any
order (section 9). Its companion, `docs/platform/SHOWING_THE_PROCESS.md`,
covers answer boxes that one screenshot cannot answer.

Where slice A lives:
- **The rules and the slides:** `src/platform/supports/workedExample/examplePlayer.js`
  (which sections show an example, which example a question gets, when it
  opens by itself, what each slide says).
- **The player:** `WorkedExamplePlayer.jsx`, loaded on demand by the Hint panel
  (`HintPanel.jsx`), so a page that shows no example never fetches it.
- **Opening and recording:** `QuestionEngine.jsx`. The student's assignment
  (`assignmentWorkspaceView.jsx`) hands it the section's own role and the
  lesson around the question (`workedExampleLesson`); every other host gets
  the example on request only.
- **A lesson's own examples:** `lessonSupports` is stored with the assignment
  (`storedAssignmentV5.js`), so a question's `example` finds its entry.
- **Tests:** `tests/platform/workedExamplePlayer.test.mjs`,
  `tests/browser/workedExamplePlayer.mjs`, and the assessment leak gate
  (`tests/browser/assessmentLeakGates.mjs`).

How slice A records an example (the lead's rule, until the owner decides
otherwise):
- one the student **asks for**, or opens again, is `workedExampleUsed`, as it
  always was: the teacher sees it and mastery counts the attempt as supported;
- one Classwork **opened by itself** is recorded apart, as
  `workedExampleShown: 'auto'`. Nobody asked for it, so the attempt stays
  independent and mastery is unchanged. The teacher's attempt analysis names
  it "Example shown by Classwork (not asked for)".

Neither changes a score.

Where slice G lives:
- **The counts:** `src/platform/teacher/workedExampleView.js`. Per skill (the
  player's own, `exampleSkill.js`): which students have an example on their
  record, on which question, whether they asked for it or Classwork showed it,
  how that question was marked, and how the next question on the same skill
  was marked (right on the first try, right after another try, not right, not
  answered). It reads only what each answer already carries (`supportUsage`,
  status, tries); it stores nothing and reads no server.
- **The panel:** `WorkedExamplesBySkill.jsx`, loaded on demand in the
  gradebook: under the class's scores for an assignment, and in one student's
  results above the question cards, where each question's "worth a
  conversation" notes are. In the class view a name opens that student's
  results.
- **What it does not say:** why. The record holds that an example was opened,
  not when, so "next" is the order the student meets the questions in (a
  replacement stands where the question it replaced stood, and a question not
  required for a student is passed over); a next question the times
  show was answered first is marked "answered earlier" and is not counted. A
  question with no family and no student action is listed on its own, as a
  question with no skill named. A student whose support record has not loaded
  is said to be not loaded, not to have opened none, and "none opened" is
  said only once every student's record is loaded.
- **Tests:** `tests/platform/workedExampleTeacherView.test.mjs`, and step T6
  of `tests/browser/teacherWorkflow/teacherSignalsJourneys.mjs`.

What slice A plays: the question family's sibling, or the step card a lesson
wrote (`steps`), when it passes `similarExampleIsSafe`. Not yet: a sibling for
a question no family claims (an authored step card, or the generators of WE-I
in the build plan).

Where slice C lives, and what it plays:
- **The replay:** `src/platform/supports/workedExample/stepAlgebraReplay.js`.
  It runs a script of moves through the functions the Step Algebra board
  itself calls (`applyBalancedOperation`, `resolveEquationAfterMove`,
  `simplifyStudentExpression`, `isSolvedEquation`) and returns each move as
  the board's lines: the equation it starts with, the operation on both
  sides, the equation once the cancelling terms are gone, and the simplified
  line. A `check` move puts the value back into the first equation. No line
  of mathematics is written anywhere else.
- **A script that does not reach its answer is refused.** The replay returns
  no slides for it, so it is never played, and the compiler and Pre-Flight
  raise it as an error (`stepAlgebraReplayErrors`).
- **Two sources of moves:** a lesson's own (`lessonSupports.examples[]` with
  `tool: "stepAlgebra"`, `sibling.equation` and `moves`), and the built-in
  moves for a Step Algebra question with no example of its own
  (`stepAlgebraMovesFor`: the variable terms to one side first, then the
  numbers, then the coefficient, then the check). The built-in moves cover an
  equation whose sides are plain (`ax + b`, whole numbers, one solution); any
  other keeps its family's text example.
- **Where it is drawn:** in the example player, above the student's own
  board, one move per slide, each line named in words
  (`WorkedExamplePlayer.jsx`). It is not drawn on the student's live board:
  that board keeps the student's own equation throughout.
- **The faded example:** on the second Classwork question on a skill the
  example opens by itself with its first steps only (`fade.handOverAfter`, or
  the steps before `fade.fromStep`; a built-in replay fades after one move)
  and no answer. A question that names no example takes the one the first
  question on its skill named. Asked for, the whole example plays. Like any
  example that opens by itself it is recorded as `workedExampleShown: 'auto'`.
  A faded replay stops before its solving move (`fadeLimit`), whatever the
  lesson's `fade` says, and the validator refuses a `fade` that reaches it.
- **Conditional moves:** multiplying or dividing by an expression with a
  letter in it carries the engine's `assumption` (for example `x ≠ 0`). The
  live board shows it; a slide cannot yet, so such a move is refused.
- **Tests:** `tests/platform/stepAlgebraReplay.test.mjs` and
  `tests/browser/stepAlgebraReplay.mjs`.

Where slice D lives, and what it plays:
- **The replay:** `src/platform/supports/workedExample/radicalReplay.js`. A
  radical equation solved on the relation workspace (a `solveStepByStep`
  item that opens there) had no example at all. It now gets a sibling
  equation, played as the workspace's own path: isolate the radical, raise
  both sides, multiply out, collect to zero, factor, the zero product
  property, each branch, then every candidate checked in the first equation.
- **Every line is one the workspace's commit accepts**
  (`validateRelationTransition`, which the board and the server's step
  replay both run). The line with an operation on both sides is
  `applyBalancedOperationToRelation`'s, the raised line is
  `raiseRadicalRelation`'s, and a check's two values are `radicalSidesAt`'s.
  A path with a line the engine refuses is not played.
- **Extraneous roots:** each candidate has a check slide of its own. One that
  does not make the first equation true is rejected there (its two sides are
  shown unequal) and is not in the answer.
- **The factoring slides** (decision 3), with the numbers the lesson's own
  factoring method finds (`factorQuadraticByMethod`, `factoringVariant.js`):
  four for x² + bx + c, six for ax² + bx + c. A quadratic with no number
  term (ax² + bx) is factored by its common factor instead, in three slides:
  what to look for, the common factor taken out and multiplied back, the
  zero product property. The split and group lines are
  rewrites the workspace accepts, and the factored line is one its Factor
  tool accepts. Classwork plays them in the sequence. On Practice the factor
  step is one line with **Show how**, which opens them
  (`exampleSlides(example, { shownHow })`); the zero product slide always plays.
- **The sibling** (`radicalSiblingEquation`): the same kind of equation with
  other numbers. It keeps the root's index, whether a number stands outside
  the radical, whether the leading coefficient is 1 or more, and how many
  candidates are rejected. It is the same **method** as the item (the
  authoring guide's rule 7): an item whose quadratic factors by a common
  factor (√(x + 4) + 2 = x gives x² − 5x) gets a sibling that does too, and an
  item whose quadratic is a trinomial gets a trinomial with two different
  non-zero roots. A root equal to a number has no quadratic and no factoring
  slides.
- **A lesson's own** (`tool: "radicalEquation"`, `sibling.equation`,
  `moves`): the moves must be the tool's own path for that equation, in
  order; each supplies its `why`, and a factor move's `detail` must be the
  quadratic's own factoring. Anything else is an error in the compiler and
  Pre-Flight (`radicalReplayErrors`).
- **Faded:** a faded radical example stops before the zero product property,
  so no candidate is shown.
- **Not played:** an equation the tool does not verify, one with the radical
  on the right, and one whose quadratic the slides do not factor (a perfect
  square, or a number as a common factor: 4x² + 4x). Such an authored example
  is refused; a built-in sibling is never one.
- **Tests:** `tests/platform/radicalReplay.test.mjs` and
  `tests/browser/radicalReplay.mjs`.

Where slice E lives, and what it plays:
- **The replay:** `src/platform/supports/workedExample/planeReplay.js`. A
  question answered on the plane gets a sibling played as what its own tool
  records, one move per slide:
  - `constructLine` (Graphing, y = mx + b): the y-intercept, rise and run to a
    second point, the line, a check;
  - `graphSystem` (Systems Workspace, two lines the student draws): each line
    the same way, where they cross, the check in both equations;
  - `solveInequalitySystem` (the inequality builder, one or two inequalities):
    the y-intercept, rise and run, the boundary line **solid or dashed**, a
    test point, the shading; for two, the overlap; then the marked point
    checked. An inequality given in standard form is solved for y first, on a
    slide of its own, the sign turning around where the y-term is negative.
  These inequality questions had no example at all before.
- **The example draws what the student's tool records.** Each replay builds
  the record the tool itself holds (the plotted points, the style, the shading
  point, the classification, the marked point's answers) and hands it to that
  tool's own grader, the one the browser, the question and the server run
  (`serverGrading/tools/graphing2.mjs`, `systemsWorkspace.mjs`). A record the
  grader does not mark correct is not played. What a slide draws is the
  engine's too: the line through two plotted points, the crossing point
  (`solveTwoLines`), a test point's verdict (`satisfiesBoundary`) and the
  shaded region (`feasibleRegionPolygon`).
- **Every move is a picture and words.** The player draws the plane so far
  (`board.plane`: points, the rise and the run, each line solid or dashed, the
  shading) and, under it, the same move as named lines. The picture has a name
  in words (`planeSummary`); nothing rests on it alone.
- **The sibling** (`planeSiblingFor`), on a plain −10 to 10 plane: a line
  keeps its slope's sign and whether it is whole or a fraction; an inequality
  keeps its sign (so solid or dashed, above or below), whether it is in
  standard form and the sign of its y-term, and whether a point is marked to
  check. **A system's example always crosses once:** how many solutions the
  student's own system has is part of its answer, so the example never says
  (the family's own text example does the same).
- **Faded:** the first move only (the y-intercept); a faded example stops
  before the line is drawn.
- **Not played** (such a question keeps what it had): a line in point-slope,
  standard or vertical and horizontal form; a system the student does not
  draw; an inequality with a vertical or horizontal boundary, three or more
  inequalities, a model to write first, or no boundary to build. The example
  does not classify the region or list its vertices, where the item asks that.
- **Tests:** `tests/platform/planeReplay.test.mjs` and
  `tests/browser/planeReplay.mjs`.

A built-in step is a full sentence that carries its own reason; only a
lesson's step card has a separate "why" line.

## 1. The goal

A student working alone, with no teacher in the room, should be shown how to do
each new kind of question before being asked to do it, on the same screen and
with the same tool they will use. The example has to teach, not just show an
answer: every move is explained, and a step that uses an earlier skill (most
often factoring) is opened up rather than skipped.

## 2. What the platform already has

Build on these; do not write a second version of any of them.

| Piece | Where | What it does today |
|---|---|---|
| "See a similar problem worked" | `src/platform/supports/workedExample/similarProblem.js`, `examplePlayer.js`, `QuestionEngine.jsx` | The question's support family works a sibling problem with different numbers. Since slice A it plays one slide at a time, and on Classwork it opens by itself before the first question on a new skill; before that it was a list of text steps, shown only on request. `similarExampleIsSafe` refuses a sibling that shares the question's prompt or answer, or whose steps state that answer. Opening one is recorded as `workedExampleUsed`. It is withheld wherever hints are, and on every DOL, quiz and test section. |
| "Practise one like this" | `practiceLikeThis.js`, `PracticeLikeThis.jsx` | After a miss on Classwork or Practice, an unscored sibling the student answers. Nothing is recorded. |
| Sibling builders | `numericVariant.js`, `factoringVariant.js`, `radicalVariant.js`, `polynomialVariant.js`, `matrixSystemVariant.js` | New numbers for an item whose method does not change. |
| Support families | `src/platform/supports/families/` (11 families) | Each has `similarProblem`. Nine also write `workedSolution`. |
| Guided notes | `guidedNotes.js`, `GuidedClassworkCoach.jsx` | Authored `guidedNotes.steps`. Pre-Flight's `guidedNotesBySection` is automatic on Classwork and off on Practice. |
| Solution Review | `closedQuestionReview.js` | `solutionReview.reasoning` (or `steps`), `answerSummary` and `commonError`, shown after the item closes. |
| Hints and scaffolds | `questionHints.js` | `hintRelease` gives nothing where `hintsAllowed` is false (DOL, quiz, test). |

The gaps when this was written (slice A has since closed the second, and
slice B the fourth):
- Examples are text only. None plays on the tool the student uses.
- Nothing opens before a new skill: every example waits to be asked for.
- A question with no support family has no example.
- Nothing checks that each classwork question is covered.

## 3. The owner's decisions (2026-11-20)

1. **Where examples appear.**
   - **Classwork:** the full example.
   - **Practice:** a lighter one, only when the student asks.
   - **DOL, quiz and test:** none.

   The section's role decides this. An assignment cannot turn examples on for a DOL, quiz or test.
2. **Practice is never scored lower because a student opened an example.** As
   with a hint, the attempt is recorded as `workedExampleUsed`: the teacher
   sees it, and mastery counts that attempt as supported, not independent. No
   point is taken off.
3. **No step is glossed over.** A step that uses another skill opens that
   skill's own slides. Factoring x² + bx + c takes four slides:
   1. what to look for;
   2. the factor pairs and their sums;
   3. the factors, checked by multiplying back;
   4. the zero product property.

   Factoring ax² + bx + c takes six:
   1. a·c;
   2. the factor pairs;
   3. split the middle term;
   4. group;
   5. factor out the common binomial;
   6. the zero product property.
4. **Every classwork question is covered by an example** (section 6). One
   example can cover several questions on the same skill.
5. **Examples are interactive.** They play on the student's own tool, with an explanation for each move.
6. **Build order:** any.

## 4. The formats

All of them share one player: one slide at a time, with Next and Back, a short
"why" under each move, and a final **Your turn** that hands the live tool to the
student on their own item. The example is always a sibling problem, never the
student's item and never another item on the same assignment.

| Format | For | What the student sees |
|---|---|---|
| **Tool replay** | Step Algebra (`solveStepByStep`), radical equations (`solveRadicalEquation`), the plane (`graphSystem`, `constructLine`, `constructGraph`), the inequality builder (`solveInequalitySystem`, `solveInequality`), synthetic and long division | The example plays on the same tool, one recorded move per slide. In Step Algebra the operation tile lands on both sides and terms cancel. On the plane: plot the intercept, show the rise and run, draw the line, pick solid or dashed, test a point, shade. The tool's own engine produces every line, so a slide cannot show a wrong line. |
| **Step card** | Answer boxes and choices (`multipleResponses`, 277 of 483 classwork questions), tables, sorts | The sibling's steps are revealed one at a time, in the shape Solution Review already uses. |
| **Sub-skill slides** | Any step that uses an earlier skill | The step expands into that skill's own example (decision 3). Classwork shows these slides in the main sequence. On Practice the step stays one line, with a **Show how** button. |
| **Spot the mistake** | Any question with a `solutionReview.commonError` | After the example, a worked line with the question's common error in it, and three choices for what went wrong. |
| **Faded example** | Classwork, the second question on a skill | The example does the first moves, and the student does the rest on the same tool. |
| **Model answer** | "Explain" and "describe" questions | A short strong answer, and a checklist of what it includes. |
| **Why this step?** | Classwork examples, once per example | One tap: pick the reason for a step before it plays. |
| **Reference card** | Lesson level, pinned on Classwork and Practice | The formula or pattern with its parts named (for example, sum and difference of cubes). |

## 5. Behaviour by section

| | Classwork | Practice | DOL, quiz, test |
|---|---|---|---|
| Example opens by itself | Yes, before the first question on a new skill | No | Never |
| Example on request | Yes, on every question | Yes ("Show me a similar one") | Never |
| Sub-skill slides | In the sequence | One tap away | n/a |
| Faded second example | Yes | No | n/a |
| Spot the mistake, why this step? | Yes | Spot the mistake only | n/a |
| Reference card | Pinned | Pinned | Never |
| Score | Unchanged | Unchanged (decision 2) | n/a |
| Recorded | `workedExampleUsed` | `workedExampleUsed` | n/a |

These rules follow the rules hints already use. Anywhere `hintsAllowed` is false,
no example, card or explorer is rendered, and the DOL, quiz and test leak guards
cover the new controls.

## 6. Coverage: every classwork question has an example

A classwork question is **covered** when one of these holds:
1. it names its own `example`;
2. an earlier classwork question in the same lesson, on the same skill, has an
   example. The skill is the question's `familyId`, or failing that its
   `studentActions` with its primary standard;
3. the platform has a built-in example for its skill: a support family's
   `similarProblem`, a sibling builder, or a tool replay generator.

A question that needs no example says why: `"example": { "none": "setup" }` for
a context-setting question, or `"explain"` for one that gets a model answer
instead.

**Scope (owner, 2026-11-20).** Coverage is a rule for new and newly imported
assignments. Existing assignments are not back-filled. The coverage report
(slice B) lists their gaps for information only.

Pre-Flight checks:
- **Warning:** a classwork question that is not covered. The coverage report
  lists these per lesson, so the gaps can be filled.
- **Error:** an `example` on a DOL, quiz or test question.
- **Error:** an authored tool replay whose moves, run through the tool's own
  engine, do not reach the sibling's stated answer.
- **Error:** a sibling that fails `similarExampleIsSafe`, in which the sibling
  shares the question's answer, prompt or a step that states its answer.

## 7. The assignment JSON

Built-in examples need nothing in the JSON. An assignment adds fields only where
it wants its own example, an exemption or a reference card.

How to write each field, with an example lesson: `docs/assignments/AUTHORING_LEARNING_SUPPORTS.md`.

```jsonc
{
  "lessonSupports": {
    "referenceCards": [
      { "id": "cubes", "skill": "factor.sumDifferenceOfCubes" }
    ],
    "examples": [
      {
        "id": "ex-both-sides",
        "tool": "stepAlgebra",
        "source": "authored",                 // or "builtIn" with "parameters"
        "sibling": { "equation": "5x + 3 = 2x - 9" },
        "moves": [
          { "op": "subtract", "operand": "2x", "why": "x-terms on one side" },
          { "op": "subtract", "operand": "3" },
          { "op": "divide", "operand": "3" },
          { "check": true }
        ],
        "fade": { "handOverAfter": 1 }
      },
      {
        "id": "ex-radical",
        "tool": "radicalEquation",
        "source": "builtIn",
        "sibling": { "equation": "sqrt(x + 6) = 2x - 3" },
        "moves": [
          { "op": "square", "why": "undo the root; check every answer" },
          { "op": "collectToZero" },
          { "op": "factor", "detail": "factor.trinomialAC" },
          { "op": "zeroProduct" },
          { "check": "each" }
        ]
      }
    ]
  },
  "sections": [
    { "id": "classwork", "questions": [
      { "questionId": "m3t2l1-cw-1", "example": { "none": "setup" } },
      { "questionId": "a2-rad-cw-4", "example": "ex-radical" }
    ] }
  ]
}
```

- `moves` are the tool's own recorded actions. The player runs them through the
  tool's engine to draw each slide; the text of a line is never authored.
- `"detail"` names the skill whose slides a step opens (decision 3).
- A step card needs no new fields. It reads the sibling's steps from the family,
  or from the sibling question's `solutionReview`.
- "Spot the mistake" reads the question's own `solutionReview.commonError`.

## 8. Where the lessons stand (main at the time of writing)

| | Count |
|---|---|
| Lessons with a Classwork section | 40 |
| Classwork questions | 483 |
| Classwork answer boxes and choices (`multipleResponses`) | 277 |
| Classwork questions with Solution Review steps | 387 |
| Classwork questions with guided notes | 144 |
| Distinct `studentActions` on classwork | about 50 |

The commonest rich tools on classwork:
- `solveInequalitySystem` 30;
- `solveStepByStep` 19;
- `analyzeTransformations` 17;
- `solveSystem` 14;
- `syntheticDivision` 10;
- `solveRadicalEquation` 10;
- `graphSystem` 8.

**Built-in examples today.** Each real classwork question was built the way
`QuestionEngine` receives it (496 questions once compiled; the table above
counts the 483 authored ones). Then it was checked for a sibling from
`buildSimilarWorkedExample` or `buildNumericVariant`:

| | Count |
|---|---|
| Have a built-in example today | 137 of 496 |
| Have none | 359 |
| Lessons with no built-in example on any classwork question | 14 of 41 |

The 359 without one, by kind:
- `multipleResponses` 247;
- `solveInequalitySystem` 30;
- `matchFigures`, `syntheticDivision`, `sortIntoCategories` and `solveRadicalEquation` 10 each;
- `analyzeTransformations` 9;
- 33 more across 12 other kinds.

No classwork question carries a variant. So for an answer-box question, the
sibling must come from either:
- a new support-family generator (platform work), or
- an example the lesson writes (`"source": "authored"`, lesson content).

The coverage report (slice B) lists which question needs which.

## 9. Build slices

Each slice ships on its own, in any order.

| Slice | What | Done when |
|---|---|---|
| A | **The player and the section rules.** Today's "See a similar problem worked" becomes a step-through. On Classwork it opens by itself before the first question on a skill. Practice keeps it on request. Score is unchanged; `workedExampleUsed` is recorded. | Leak guards pass on DOL, quiz and test. A test shows the Practice score unchanged after an example is opened. It is keyboard-operable, read aloud, translated and phone-width. |
| B | **The coverage report** in Pre-Flight, read-only at first. | It lists every uncovered classwork question across the 40 lessons. |
| C | **Step Algebra replay** (variables on both sides, then the rest of the tool). | Each move is checked by the tool's engine. |
| D | **Radical replay** with the factoring sub-slides, from `factoringVariant`. | Extraneous roots are rejected on a slide of their own. |
| E | **Plane and inequality replay** (`graphSystem`, `constructLine`, `solveInequalitySystem`). | The example draws what the student's tool records. |
| F | **Spot the mistake, model answers, and why this step?** | Each reads only fields the lessons already have, except the model answers. |
| G | **The teacher's view**: which examples each student opened, and whether the next question went right. | It is shown per skill in the teacher's results. |
| H | **Reference cards.** | Pinned on Classwork and Practice, absent from DOL, quiz and test. |

## 10. Accessibility and languages

Every slide:
- is reached with Next and Back from the keyboard;
- announces its move and its "why" in a polite live region;
- is read aloud and translated through the same text pipeline as Solution Review;
- respects reduced motion (slides change without animation);
- never uses colour alone, so the a and b roles are also named in words;
- fits a phone at 200% text.
