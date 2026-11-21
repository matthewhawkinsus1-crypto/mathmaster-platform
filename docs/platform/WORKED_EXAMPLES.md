# Worked examples: the platform teaches each new skill

Status: **decided by the owner on 2026-11-20. Slice A (the player and the
section rules) and slice B (the coverage report) are built; C to H are not.**
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

What slice A plays: the question family's sibling, or the step card a lesson
wrote (`steps`), when it passes `similarExampleIsSafe`. Not yet: a tool replay
(`moves`, slices C to E; such a question gets its family's sibling meanwhile),
sub-skill slides (slice D), the faded second example (slice C), and a sibling
for a question no family claims (an authored step card, or the generators of
WE-I in the build plan). A built-in step is a full sentence that carries its own reason;
only a lesson's step card has a separate "why" line.

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
