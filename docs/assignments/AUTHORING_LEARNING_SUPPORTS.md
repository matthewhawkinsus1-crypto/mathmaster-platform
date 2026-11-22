# Authoring learning supports for new assignments

This guide is for anyone writing a **new** MathMaster Assignment V5 file, or
importing one. It explains the fields that give a lesson its worked examples,
its reference cards, answer parts that build on earlier parts, and checked
steps done in a tool. The decisions behind them are in two specs:
- `docs/platform/WORKED_EXAMPLES.md` (worked examples and reference cards);
- `docs/platform/SHOWING_THE_PROCESS.md` (`followThrough` and `checkpoint`).

The rules are checked by `src/platform/contract/lessonSupportsV5.js`.

**What works today.** Every field is optional. The compiler carries each one
into the compiled assignment unchanged, and the validator refuses a malformed
one with a message that names the field.

The example player (WE-A) reads a question's `example` and
`lessonSupports.examples`, which are stored with the assignment:
- a **step card** (`steps`) plays for the question that names it, one step at
  a time with its `why`. On Classwork it opens by itself before the first
  question on a new skill; on Practice it plays when the student asks;
- it plays only if it passes the guard every built-in example passes: its
  problem, steps and whys may not state any answer of the question it covers.
  A short answer such as `3` counts wherever it stands alone as a number, so
  choose sibling numbers that share none of the question's answers. A card
  that fails is not shown, and the question falls back to its built-in
  example, if it has one;
- `{ "none": ... }` opens no example by itself, and neither does a question
  with no skill to name (no `familyId`, no `studentActions`);
- an example that opens by itself is recorded as shown, not as help the
  student asked for, so it does not make the attempt a supported one;
- a **Step Algebra replay** (`"tool": "stepAlgebra"`, `sibling.equation` and
  `moves`) plays on the tool's own engine (WE-C): each move is drawn as the
  board's lines, and the line is the engine's, never written in the lesson.
  - The moves are `add`, `subtract`, `multiply` and `divide`, each with an
    `operand`, then `{ "check": true }` as the last move.
  - **The moves must reach the answer.** A script that stops before the
    equation is solved, checks too early or names a move the board does not
    have is an error when the assignment is compiled and in Pre-Flight:

    > lessonSupports.examples[0] is a Step Algebra replay the tool cannot play: its moves end at 3x = -12, which is not solved for x. Add the moves that finish it.
  - A Step Algebra question with no example of its own gets a built-in replay
    of a sibling equation, where that equation is a plain one (`ax + b = cx + d`
    with whole numbers). It collects the variable terms first.
- **`fade`** is played on the second Classwork question on a skill: the
  example opens by itself with its first steps or moves only, shows no
  answer, and leaves the rest to the student. A question that names no
  example takes the one the first question on its skill named. A built-in
  replay fades after its first move. When the student asks for the example,
  the whole of it plays;
- **A radical equation replay** (`"tool": "radicalEquation"`, section 9) is
  played on the relation workspace's own engine, with the factoring slides. A
  radical equation item with no example of its own gets a built-in one;
- a replay for another tool (the plane, the inequality builder, division) is
  not played yet (WE-E). Until then such a question gets its built-in example.

A part's `followThrough` works (SP-3): its label shows the student's own
earlier value ("your slope …" before there is one), and every grader accepts
the answer keyed to that value as well as the part's own `answer`.

The other fields are read by the packages being built on them:
- reference cards (WE-H);
- checkpoints (SP-4).

**Scope.** These are rules for new and newly imported assignments. Existing
assignments (`teacher-import-jsons/`) are not rewritten or back-filled, and
compile exactly as before.

## 1. The rules

1. **Classwork** opens the full example by itself, before the first question
   on a new skill.
2. **Practice** plays an example only when the student asks. Opening one never
   lowers a Practice score; the attempt is recorded as `workedExampleUsed`.
3. **DOL, quiz and test never show an example or a reference card.** The
   section's role decides, and the validator refuses each of these there:
   - an `example`, or a `{ "none": ... }` exemption;
   - an example whose `roles` name one of those sections;
   - a reference card pinned on one.
4. **Every Classwork question is covered** by one of:
   - its own `example`;
   - an earlier Classwork question in the lesson, on the same skill, that has
     an example. The skill is the question's `familyId`, or failing that its
     `studentActions` with its primary standard;
   - a built-in example for its skill (a support family's similar problem, a
     sibling builder or a tool replay).

   A question that needs none says why: `{ "none": "setup" }` or
   `{ "none": "explain" }` (section 5). The coverage report (WE-B) will list
   the gaps, and Pre-Flight will warn on a new assignment's uncovered question.
5. **Tool first.** If a tool can produce the answer, the question uses the
   tool (section 8). Answer boxes are for reading and interpreting.
6. **A multi-part answer box with three or more parts** carries a `checkpoint`
   or a `followThrough` on at least one part (SP-5 adds the Pre-Flight warning).
7. **An example is a sibling problem:** the same method with different
   numbers. It is never the student's item, and never another item on the
   same assignment. The validator refuses an example whose `problem` or
   `sibling` text is a question's prompt or equation. A copy with the same
   numbers in other words is still wrong: changing the numbers is the
   author's job.
8. **No step is glossed over.** A step that uses an earlier skill opens that
   skill's own steps (section 9). Factoring x² + bx + c takes four slides, and
   ax² + bx + c takes six.

## 2. Where each field goes

| Field | Where | Shape |
|---|---|---|
| `lessonSupports` | the top level of the file, beside `sections` (not inside `assignment`) | `{ "referenceCards": [...], "examples": [...] }` |
| `example` | a question | an example's `id`, or `{ "none": "setup" }` or `{ "none": "explain" }` |
| `followThrough` | one entry of a question's `responses` | `{ "from": ["slope"], "answer": "y > {slope}x + 3" }` |
| `checkpoint` | one entry of a question's `responses` | `{ "kind": "pickPoints", "count": 2 }` |

## 3. Examples: `lessonSupports.examples`

Write an example only where the lesson wants its own. A built-in example needs
no JSON at all.

| Field | Required | What it is |
|---|---|---|
| `id` | yes | A short name, unique in the file. Questions point at it. |
| `source` | yes | `"builtIn"`, `"authored"` or `"generated"` (below). |
| `skill` | for `builtIn` and `generated`, unless `tool` is given | The skill the example teaches, for example `"solve.variablesOnBothSides"`. |
| `tool` | as `skill` | The tool it plays on, for example `"stepAlgebra"`. |
| `sibling` | for `authored`, unless `problem` is given | The sibling problem as data, for example `{ "equation": "5x + 3 = 2x - 9" }`. |
| `problem` | as `sibling` | The sibling problem as text. |
| `parameters` | no | An object of settings for a built-in or generated example. |
| `roles` | no | The sections it is for, for example `["classwork", "practice"]`. Leave it out for every section that shows examples. Never `dol`, `quiz` or `test`. |
| `steps` | for `authored`, unless `moves` is given | A step card: `[{ "show": "...", "why": "..." }]`. Each step has both. |
| `moves` | for `authored`, unless `steps` is given | A tool replay: the tool's own actions, `[{ "op", "operand", "why", "detail", "check" }]`. |
| `fade` | no | `{ "handOverAfter": 1 }` or `{ "fromStep": 3 }`: when the student takes over. |

The three sources:
- `"builtIn"`: one of the platform's own examples for the skill or tool, with
  optional `parameters`.
- `"authored"`: the lesson writes the sibling and its steps or moves.
- `"generated"`: the platform makes a fresh sibling from the skill or tool.

**Steps or moves.**
- **Steps** are for answer boxes, choices, tables and sorts. The player shows
  one step at a time, with its `why` under it.
- **Moves** are for a tool replay (Step Algebra, radical equations, the plane,
  the inequality builder, division). A move names the tool's action. The
  player runs each move through the tool's own engine to draw its slide, so
  the text of a line is never authored. Each move needs `op` or `check`:
  - `op` is the action, for example `"subtract"`, with its `operand`
    (`"2x"`, or a number);
  - `check` is `true`, or `"each"` to check every root;
  - `why` is the short reason shown under the move;
  - `detail` names the skill whose steps the move opens (section 9).

**Fading** is for the second Classwork question on a skill:
- `handOverAfter: 1` plays the first move and hands the tool to the student;
- `fromStep: 3` lets the student do step 3 onward.

Either number is at least 1 and no more than the example's steps or moves.

A faded Step Algebra replay stops before the solving move: the one whose line
reads `x = value`. A fade that would show it is an error, and the player
never shows that line on a faded slide:

> lessonSupports.examples[0].fade would show the solved equation: move 3 is the one that leaves the variable alone, and a faded example stops before it. Use handOverAfter of 2 or less.

A move that multiplies or divides by an expression with a letter in it (such
as `{ "op": "divide", "operand": "x" }`) is refused. It holds only where
that expression is not zero, and a slide cannot show that condition yet.
Multiply or divide by a number; add or subtract a variable term.

```json
{
  "id": "ex-both-sides",
  "skill": "solve.variablesOnBothSides",
  "tool": "stepAlgebra",
  "source": "authored",
  "sibling": { "equation": "5x + 3 = 2x - 9" },
  "moves": [
    { "op": "subtract", "operand": "2x", "why": "Collect the x-terms on one side." },
    { "op": "subtract", "operand": "3", "why": "Collect the numbers on the other side." },
    { "op": "divide", "operand": "3", "why": "Undo the multiplication by 3." },
    { "check": true, "why": "Put x = -4 back into both sides: each side is -17." }
  ],
  "fade": { "handOverAfter": 1 }
}
```

## 4. Reference cards: `lessonSupports.referenceCards`

A card shows a formula or pattern with its parts named (for example, the sum
and difference of cubes). It is pinned beside the questions.

| Field | Required | What it is |
|---|---|---|
| `id` | yes | A short name, unique among the cards. |
| `skill` | yes | The skill the card shows, for example `"factor.sumDifferenceOfCubes"`. |
| `sections` | no | The sections it is pinned on, by section `id` or `role`. Leave it out to pin it on every Classwork and Practice section. It may not name a DOL, quiz or test section. |

```json
{ "id": "cubes", "skill": "factor.sumDifferenceOfCubes", "sections": ["classwork", "practice"] }
```

## 5. A question's `example`

A question names the example that covers it by `id`:

```json
{ "questionId": "ls-cw-2", "studentActions": ["solveStepByStep"], "equation": "4x + 7 = x - 8", "example": "ex-both-sides" }
```

The id must be an entry of `lessonSupports.examples`. If the example has
`roles`, the question's section must be one of them.

A later question on the same skill needs no `example`: the earlier question's
example covers it (rule 4). A question that needs none says why:
- `{ "none": "setup" }`: a question that sets up the context;
- `{ "none": "explain" }`: an explain or describe question, which gets a model
  answer instead (WE-F).

Leave `example` off every DOL, quiz and test question, exemptions included.

## 6. Later parts use the student's answer: `followThrough`

A part names the earlier parts it builds on. The platform writes the
student's own values into its label, and the grader keys the part
to them, so an early slip is not marked wrong twice.

```jsonc
{ "id": "slope", "label": "Slope of the line", "answer": "3" },
{ "id": "intercept", "label": "The y-intercept", "answer": "-2" },
{
  "id": "equation",
  "label": "Using your slope of {slope} and y-intercept of {intercept}, write the equation of the line",
  "answer": "y = 3x - 2",
  "followThrough": { "from": ["slope", "intercept"], "answer": "y = {slope}x + {intercept}" }
}
```

The rules:
- **`from`** lists the `id`s of earlier parts of the same question: never the
  part itself, and never a later one. Give every part an `id`; a part with
  none is called `part-1`, `part-2` and so on. Each id in the question must be
  different.
- **`followThrough.answer`** is the answer written with those parts' names in
  braces.
- **Every `{name}`** in the part's `label` or `followThrough.answer` must be
  listed in `from`.
- **Braces that belong to mathematics are not names:**
  - `\sqrt{x}`, `\frac{a}{b}`, `x^{2}` and `x_{n}`;
  - a Question Family's `{{k}}`;
  - a set such as `{1, 2, 3}`.
- **Keep the part's own `answer`:** the key when the earlier parts are right.
  The grader still accepts it, and it is the key a teacher reads.

## 7. Show the step: `checkpoint`

A part can require one step that the student does in a tool, before the part's
answer is accepted. Once SP-4 ships, the step is recorded with the attempt, so
the teacher sees the student's own points, pair or moves.

| `kind` | Where | What is checked |
|---|---|---|
| `pickPoints` | the plane | `count` points that lie on the line or curve. Rise and run are read from the student's own points. |
| `factorPair` | factoring | the pair that multiplies to the constant (or to a·c) and adds to the middle coefficient |
| `stepMoves` | Step Algebra | the student's recorded moves reach the answer |
| `tableRow` | tables | `count` rows the student fills in that satisfy the relation |

`count` is a whole number of 1 or more. Only `pickPoints` and `tableRow` take
one.

```json
{ "id": "slope", "label": "Slope of the line", "answer": "3", "checkpoint": { "kind": "pickPoints", "count": 2 } }
```

`followThrough` and `checkpoint` go on a `responses` part of an answer-box
question (`"studentActions": ["multipleResponses"]`). A tool that keeps no
answer parts (Step Algebra, for one) would drop them, so the compiler refuses
them there. Unlike examples, both are allowed on DOL, quiz and test questions.

## 8. Tool first

When a new question asks for something a tool can produce, it uses the tool:
- **an equation to solve** uses Step Algebra (`"studentActions": ["solveStepByStep"]`);
- **a line, inequality or system to graph** uses the plane (`constructGraph`,
  `graphSystem`, `solveInequalitySystem`);
- **a polynomial to divide** uses synthetic or long division (`syntheticDivision`,
  `longDivision`).

Answer boxes are for reading and interpreting: what a number means, a
comparison, a value read off the work. Pre-Flight warns when a new answer-box
question asks for what a tool produces (SP-5).

## 9. Factoring opens its own steps

A step that uses an earlier skill is never one line. In a tool replay, the
move names the skill in `detail`, and the player opens that skill's slides:

```json
{
  "id": "ex-radical",
  "skill": "solve.radicalEquation",
  "tool": "radicalEquation",
  "source": "builtIn",
  "sibling": { "equation": "sqrt(x + 6) = 2x - 3" },
  "moves": [
    { "op": "square", "why": "Undo the root. Squaring can add a false root, so check every answer." },
    { "op": "collectToZero" },
    { "op": "factor", "detail": "factor.trinomialAC" },
    { "op": "zeroProduct" },
    { "check": "each" }
  ]
}
```

The factoring slides come from the platform (WE-D):
- **x² + bx + c**, four slides:
  1. what to look for;
  2. the factor pairs and their sums;
  3. the factors, checked by multiplying back;
  4. the zero product property.
- **ax² + bx + c**, six slides:
  1. a·c;
  2. the factor pairs;
  3. split the middle term;
  4. group;
  5. factor out the common binomial;
  6. the zero product property.

On Practice the step stays one line, with **Show how**.

What to know when you write one:
- The moves must be the tool's own path for that equation, in order: the
  moves that isolate the radical (`{ "op": "subtract", "operand": "2" }`),
  then `square` (or `raise` for a cube root or higher), `collectToZero`,
  `factor`, `zeroProduct`, and the check last. The platform adds the lines in
  between itself (multiplying out, each branch's own solve). A script in
  another order, or without the check, is an error:

  > lessonSupports.examples[2] is a radical equation replay the tool cannot play: its moves stop before the equation is solved. The next move is { "op": "zeroProduct" }.
- `detail` is `factor.trinomial` (x² + bx + c), `factor.trinomialAC`
  (ax² + bx + c) or `factor.commonFactor` (ax² + bx: three slides, the
  common factor x taken out). It must be the quadratic's own; you can leave
  it out.
- Write the radical on the left. Choose a sibling whose quadratic factors the
  way the question's does (rule 7): a trinomial for a trinomial, a common
  factor for a common factor. A perfect square, or a quadratic with a number
  as a common factor (4x² + 4x), is not played.
- Every candidate gets a check slide. One that fails is rejected there.
- A root equal to a number (`sqrt(2x + 8) = 4`) has no quadratic: its moves
  are `square`, then the moves that solve the linear equation, then the check.

In a step card, write the factoring as steps of their own, each with its
`why`, not as one step that jumps to the factors.

## A complete example lesson

A small lesson that uses every field. The same file is
`tests/platform/fixtures/learningSupportsLessonFragment.json`: the tests and
`npm run validate:authoring-v5` compile it and expect no errors.

How it follows the rules:
- **CW 1** sets up the context, so it is exempt (`"none": "setup"`).
- **CW 2** is the first equation, so it opens `ex-both-sides`. That is a
  Step Algebra replay of a sibling equation, faded after one move.
- **CW 3** is the same skill, so CW 2's example covers it with no field.
- **CW 4** has three parts:
  - the slope carries a `pickPoints` checkpoint;
  - the equation follows through from the slope and the intercept;
  - its example is a step card for a sibling line.
- **CW 5** explains a mistake, so it is exempt (`"none": "explain"`).
- **The reference card** is pinned on Classwork and Practice.
- **Practice 1** offers the same example on request.
- **The DOL** has none.

```json
{
  "schemaVersion": 5,
  "assignment": {
    "title": "Lines and Equations with Learning Supports (authoring example)",
    "courseId": "algebra1",
    "instructionalPurpose": "lesson",
    "gradingPurpose": "classwork"
  },
  "variantPolicy": { "mode": "shared" },
  "lessonSupports": {
    "referenceCards": [
      { "id": "slope-intercept", "skill": "lines.slopeInterceptForm", "sections": ["classwork", "practice"] }
    ],
    "examples": [
      {
        "id": "ex-both-sides",
        "skill": "solve.variablesOnBothSides",
        "tool": "stepAlgebra",
        "source": "authored",
        "sibling": { "equation": "5x + 3 = 2x - 9" },
        "roles": ["classwork", "practice"],
        "moves": [
          { "op": "subtract", "operand": "2x", "why": "Collect the x-terms on one side." },
          { "op": "subtract", "operand": "3", "why": "Collect the numbers on the other side." },
          { "op": "divide", "operand": "3", "why": "Undo the multiplication by 3." },
          { "check": true, "why": "Put x = -4 back into both sides: each side is -17." }
        ],
        "fade": { "handOverAfter": 1 }
      },
      {
        "id": "ex-line-two-points",
        "skill": "lines.equationFromTwoPoints",
        "source": "authored",
        "problem": "A line passes through (1, 2) and (3, 8). Find its slope, its y-intercept and its equation.",
        "steps": [
          { "show": "m = (8 - 2) / (3 - 1) = 6 / 2 = 3", "why": "Slope is the change in y over the change in x." },
          { "show": "2 = 3(1) + b, so b = -1", "why": "Put one point and the slope into y = mx + b to find b." },
          { "show": "y = 3x - 1", "why": "Write the slope and the y-intercept into y = mx + b." },
          { "show": "8 = 3(3) - 1", "why": "Check with the other point." }
        ],
        "fade": { "fromStep": 3 }
      }
    ]
  },
  "sections": [
    {
      "id": "classwork",
      "role": "classwork",
      "title": "Classwork",
      "questions": [
        {
          "questionId": "ls-cw-1",
          "standard": "A.2C",
          "dok": 2,
          "studentActions": ["multipleResponses"],
          "prompt": "A taxi ride costs $4 to start and $2 for every mile. The cost is y = 2x + 4, where x is the number of miles.",
          "responses": [
            {
              "id": "start",
              "label": "In this situation, the 4 is …",
              "type": "choice",
              "options": ["the cost to start the ride", "the cost of each mile", "the number of miles"],
              "answer": "the cost to start the ride"
            },
            { "id": "three-miles", "label": "The cost of a 3-mile ride, in dollars", "answer": "10" }
          ],
          "example": { "none": "setup" }
        },
        {
          "questionId": "ls-cw-2",
          "standard": "A.5A",
          "dok": 2,
          "studentActions": ["solveStepByStep"],
          "prompt": "Solve 4x + 7 = x - 8 step by step.",
          "equation": "4x + 7 = x - 8",
          "example": "ex-both-sides"
        },
        {
          "questionId": "ls-cw-3",
          "standard": "A.5A",
          "dok": 2,
          "studentActions": ["solveStepByStep"],
          "prompt": "Solve 6x - 5 = 2x + 11 step by step.",
          "equation": "6x - 5 = 2x + 11"
        },
        {
          "questionId": "ls-cw-4",
          "standard": "A.2B",
          "dok": 2,
          "studentActions": ["multipleResponses"],
          "prompt": "A line passes through (0, -2) and (2, 4).",
          "responses": [
            {
              "id": "slope",
              "label": "Slope of the line",
              "answer": "3",
              "checkpoint": { "kind": "pickPoints", "count": 2 }
            },
            {
              "id": "intercept",
              "label": "The y-intercept",
              "answer": "-2"
            },
            {
              "id": "equation",
              "label": "Using your slope of {slope} and y-intercept of {intercept}, write the equation of the line",
              "answer": "y = 3x - 2",
              "followThrough": { "from": ["slope", "intercept"], "answer": "y = {slope}x + {intercept}" }
            }
          ],
          "example": "ex-line-two-points"
        },
        {
          "questionId": "ls-cw-5",
          "standard": "A.2B",
          "dok": 2,
          "studentActions": ["multipleResponses"],
          "prompt": "Maya says the line through (0, -2) and (2, 4) has slope 1/3. Explain the mistake she made.",
          "responses": [
            {
              "id": "why",
              "label": "Maya's mistake",
              "type": "choice",
              "options": [
                "She divided the change in x by the change in y.",
                "She subtracted the points in different orders.",
                "She used the wrong y-intercept."
              ],
              "answer": "She divided the change in x by the change in y."
            }
          ],
          "example": { "none": "explain" }
        }
      ]
    },
    {
      "id": "practice",
      "role": "practice",
      "title": "Practice",
      "questions": [
        {
          "questionId": "ls-pr-1",
          "standard": "A.5A",
          "dok": 2,
          "studentActions": ["solveStepByStep"],
          "prompt": "Solve 3x + 10 = -2x - 5 step by step.",
          "equation": "3x + 10 = -2x - 5",
          "example": "ex-both-sides"
        }
      ]
    },
    {
      "id": "dol",
      "role": "dol",
      "title": "DOL",
      "questions": [
        {
          "questionId": "ls-dol-1",
          "standard": "A.5A",
          "dok": 2,
          "studentActions": ["solveStepByStep"],
          "prompt": "Solve 7x - 2 = 3x + 10 step by step.",
          "equation": "7x - 2 = 3x + 10"
        }
      ]
    }
  ]
}
```

## What the validator refuses

Each of these is refused when the file is compiled, and by Pre-Flight on a
stored assignment. The message leads with the question it is about.
- **An example on a DOL, quiz or test question.**

  ```json
  { "questionId": "ls-dol-1", "studentActions": ["solveStepByStep"], "equation": "7x - 2 = 3x + 10", "example": "ex-both-sides" }
  ```

  > Section 3 Question 1 example is on a DOL section. Examples are never shown on a DOL, quiz or test: remove the example field.
- **A reference card pinned on a DOL section.**

  ```json
  { "id": "slope-intercept", "skill": "lines.slopeInterceptForm", "sections": ["classwork", "dol"] }
  ```

  > lessonSupports.referenceCards[0].sections[1] "dol" is a DOL section. Reference cards are never shown on a DOL, quiz or test; pin the card on Classwork or Practice only.
- **An id that names no example.** `"example": "ex-two-sides"`, with no such
  entry:

  > Section 1 Question 3 example "ex-two-sides" names no lessonSupports.examples entry. Fix the id, or add { "id": "ex-two-sides", ... }.
- **An exemption that is neither `setup` nor `explain`.** `"example": { "none": "intro" }`:

  > Section 1 Question 1 example.none must be "setup" (a question that sets up the context) or "explain" (one that gets a model answer instead), not "intro".
- **An example that is an item on the assignment.**
  `"sibling": { "equation": "4x + 7 = x - 8" }`, which is CW 2's own equation:

  > lessonSupports.examples[0] is the same problem as Section 1 Question 2. An example is a sibling problem with different numbers, never an item on this assignment.
- **An authored example with nothing to play.**

  ```json
  { "id": "ex-line-two-points", "source": "authored", "problem": "A line passes through (1, 2) and (3, 8)." }
  ```

  > lessonSupports.examples[1] is authored but has nothing to play: give it steps ([{ "show", "why" }]) or moves (the tool's own actions).
- **A step with no `why`.** `{ "show": "2 = 3(1) + b, so b = -1" }`:

  > lessonSupports.examples[1].steps[1].why is required: every step says why it is done.
- **A follow-through from a later part.** On the intercept part:
  `"followThrough": { "from": ["equation"], "answer": "{equation}" }`:

  > Section 1 Question 4 responses[1].followThrough.from[0] "equation" is a later part. A part builds only on parts the student has already answered.
- **A `{name}` that `from` does not list.** The equation part with
  `"from": ["slope"]` and `"answer": "y = {slope}x + {intercept}"`:

  > Section 1 Question 4 responses[2].label uses {intercept}, which followThrough.from does not list. Every {name} must name an earlier part listed in from.
- **An unknown checkpoint kind.** `"checkpoint": { "kind": "plotPoints", "count": 2 }`:

  > Section 1 Question 4 responses[0].checkpoint.kind "plotPoints" is not a checkpoint. Use "pickPoints", "factorPair", "stepMoves" or "tableRow".
- **A checkpoint on a tool that keeps no answer parts.** A `responses` part
  with a `stepMoves` checkpoint on the Step Algebra question CW 2:

  > Section 1 Question 2 responses[0].checkpoint did not reach the compiled question: MathMaster compiled it as stepAlgebra with no answer part "x" to carry it. Put the part on an answer-box question (studentActions ["multipleResponses"]).

Misspelt fields are refused too: `step` for `steps`, an unknown `source`, or
`lessonSupports` inside `assignment`. Each message names the field and what it
should be.

## Checking a file

```
npm run validate:authoring-v5 -- path/to/your-lesson.json
```

This compiles the file as the Assignment Creator does. It judges the file
with the compiler, the question validator and Pre-Flight, and prints `PASS` or
`FAIL`:
- every error fails the run;
- warnings are listed under it.

Pasting the file into the Assignment Creator gives the same errors in
Pre-Flight, each on its question.
