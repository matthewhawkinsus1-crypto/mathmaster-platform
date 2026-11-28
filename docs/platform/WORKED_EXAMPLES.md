# Worked examples: the platform teaches each new skill

Status: **decided by the owner on 2026-11-20. Slice A (the player and the
section rules), slice B (the coverage report), slice C (the Step Algebra
replay), slice D (the radical replay with its factoring slides), slice E (the
plane and inequality replay) and slice G (the teacher's view) are built, and
so are the division replay and the Algebra II answer-box generators of WE-I
(build plan). Of
slice F, Spot the mistake and Why this step? are built; the model answer is
not, because no field holds one yet (below). H is not built.**
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
wrote (`steps`), when it passes `similarExampleIsSafe`. A question no family
claims has none until a lesson writes one, or a WE-I generator claims it:
WE-I's Algebra I batch (below) and its Algebra II batch (further on).

Where WE-I's Algebra I batch lives, and what it plays:
- **The family:** `src/platform/supports/families/linearReasoning.js`, last in
  the index, so it takes only an Algebra I (`A.`) multi-part answer box that no
  other family reads. It works one sibling per skill, as a step card: a sales
  or savings model and a goal, an inequality solved by dividing by a negative,
  how many solutions an equation has, a solution checked by substituting, a
  system written from a situation, solved by substitution, or sorted into
  parallel, the same line and crossing lines, the intercepts and slope of a
  linear model, a two-variable inequality from a situation or from a graph, a
  system of inequalities tested at points or sorted by region, and a linear
  function shifted or stretched. Each step says the move and why.
- **The perpendicular-lines sibling:** `perpendicularLines.js` now works one
  for a multi-part item (the slope perpendicular to a line, the line through a
  point; or horizontal and vertical lines). Never for the proof that a quarter
  turn makes slopes negative reciprocals, a sort or a choice: their answers are
  the facts a sibling would show.
- **The guard both use:** `siblingGuard.js`. A sibling is generated, never
  copied, and offered only when its prompt, steps and answer state none of the
  item's answers in any spelling a step could write (≤ for <=, − for -,
  spaces, (1/2)x for 1/2x), and its prompt states no equation the item states.
  The platform's `similarExampleIsSafe` runs after it.
- **What a student sees while the item is open** is otherwise unchanged: these
  families give no hint, back-up step or extra answer spelling, so the item's
  own hints and scaffold are kept.
- **What it leaves uncovered, and why.** A field that asks for the name of a
  property of equality (the sibling would name the same properties), and an
  item whose answers are the general rules a sibling would show (an equation
  with no solution or infinitely many, the slope of every horizontal line):
  the guard refuses every sibling for those, so they still need an example the
  lesson writes. A sibling that decides a case works every case side by side,
  so it never says which case the item is.
- **Never on a DOL, quiz or test:** the section rule shows none there, and
  `linearReasoning` does not even claim a question whose role is one of those.
- **Tests:** `tests/platform/weI_algebra1Siblings.test.mjs` walks every
  lesson in `teacher-import-jsons/` and holds each of these for every real
  question it claims.

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

Where the division replay lives (WE-I), and what it plays:
- **The replay:** `src/platform/supports/workedExample/divisionReplay.js`. A
  question answered in the Polynomial Workshop's division views had no
  example. It now gets a sibling played as the view's own work, one move per
  slide:
  - `syntheticDivision` (a divisor ax + b written as text): divide the dividend
    and the divisor by a first where a ≠ 1; r in the box and the coefficient
    row, a 0 for every missing power; bring down; one slide per column
    (multiply by r, add); read the bottom row; the remainder over the divisor
    as written where a ≠ 1; the answer as quotient + remainder ÷ divisor;
  - `synthetic` (the Remainder and Factor Theorems table): the same table, then
    what the item asks of it: P(r) read off the remainder, the depressed
    polynomial, whether x − r is a factor;
  - `longDivision`: per round, divide the leading terms, multiply back,
    subtract and bring down; then the quotient, the remainder and the answer.
- **Every line comes from the view's own engine.** The numbers are the view's
  key (`syntheticDivisionKey`, `longDivisionKey`, the synthetic table in
  `polynomialMath.mjs`), written with its own writers, and the work the example
  stands for is handed to the workshop's grader
  (`serverGrading/tools/polynomialWorkshop.mjs`). Work it does not mark right is
  not played.
- **The table** (`board.synthetic`) is drawn as a table: a caption naming r,
  its rows named (coefficients, products, the bottom row whose last number is
  the remainder), its columns named by power, a cell not yet filled said as
  "not yet", the remainder boxed. At 200% text on a phone it scrolls inside a
  frame the keyboard can focus, never the page.
- **The sibling** (`divisionSiblingFor`) keeps the letter, the degree, which
  powers are missing (so the 0 placeholder is where the item needs one),
  whether the divisor's leading coefficient is 1, −1 or another number (so the
  "divide by a first" slide is where the item's is), the sign of r and what a
  theorems item asks. It never keeps the item's remainder: whether a division
  comes out even is part of its answer. A division answered with a quotient
  and a remainder always has a remainder that is not 0; an item asking whether
  x − r is a factor gets a sibling where it is, and the slide says what a
  remainder that is not 0 would have meant. None of its lines holds the item's
  quotient, remainder or P(r).
- **The example guard knows the item's answers** through the family's
  `exampleAnswers` (no workshop item has answer fields), read by
  `similarExampleIsSafe` only: the hint guard is unchanged, so no hint a
  lesson shows today is dropped. (One is worth a look by the lesson's owner:
  Remainder and Factor Theorems, Classwork 1, hint 2 works the table through
  to P(4) = 42, the item's own answer.)
- **No item on the assignment:** besides its prompt, a sibling names its
  problems (`problems`: here the dividend), and the player refuses one written
  in any question on the assignment (`mentionsAssignmentItem`).
- **Faded:** the first move only (the set-up, or the first divide); a faded
  example never reads the quotient or the remainder (`fadeLimit`).
- **Coverage:** the family `polynomialDivision` claims these questions, so the
  coverage report counts them; its only other contract answers are empty (no
  hints, no back-up step).
- **Not played:** long division by a divisor whose leading coefficient is not
  ±1, or of degree 2 or more; a theorems table with a fractional r.
- **Tests:** `tests/platform/divisionReplay.test.mjs` and
  `tests/browser/divisionReplay.mjs`.

Where the Algebra II answer-box generators live (WE-I), and what they claim:
- **The family:** `src/platform/supports/families/algebra2AnswerBoxes.js`, an
  example family: it claims an answer-box (`multiAnswer`) or sort question on
  an Algebra II standard (`A2.`; never `A.`) that one of its generators reads
  whole, and adds a worked sibling and nothing else (no hints, no back-up
  step, no answers for the hint guard).
- **A generator claims a question only when it reads every answer field** as a
  part it can work; its sibling works each kind of part with other numbers,
  each step `{ show, why }` (the player shows the why; `similarProblem.js`
  keeps a family's reasons apart as `parts`). A field whose answer is a reason
  in words (why a step works, which student erred) is not a part any generator
  reads: a worked example of the same method would give that reason away.
- **The generators** (`./algebra2/`):
  - `rationalExponents` (A2.7G): b^(p/q) evaluated, ⁿ√b, radical and
    exponential form, and whether a negative base to a power is real (the
    sibling's case drawn from the seed, never from the item's);
  - `monomialRules` (A2.7G, A2.7C): products, quotients and powers of
    monomials with whole or rational exponents, positive exponents only, on
    a small monomial engine (`monomials.js`);
  - `rootVocabulary` (A2.7G): index, radicand, and both real even roots;
  - `polynomialOverMonomial` (A2.7C): a polynomial divided by a monomial,
    term by term;
  - `rationalZeroChain` (A2.7D): possible rational zeros, a zero tested, the
    division, the quotient factored, the factorization and the zeros, of a
    cubic built from its zeros;
  - `quadraticForm` (A2.7D, A2.7E): x⁴ − bx² + c with u = x²;
  - `groupFourTerms` (A2.7E): four terms grouped in pairs;
  - `realRoots` and `likeRadicals` (A2.7G sorts): how many real nth roots, and
    which radicals combine with √n.
- **Never the item's answer.** The answer guard reads a number as a token, so a
  sibling may not even mention a number the item answers with; each part is
  drawn until its own text passes (`firstFitting`), and the whole sibling
  passes `similarExampleIsSafe`. Mathematics is written in plain text with
  superscripts, as the items' labels are, and the reasons are written in words
  with no letter standing alone.
- **What a sibling assumes about its variables.** An even root, or a rational
  power with an even denominator, follows the exponent rules only for
  positive values ((x⁴)^(1/4) is |x|). A sibling that uses one says "Assume
  all variables are positive." and its answer is the one that holds then, with
  no absolute values, as the lessons write it; any other says no variable is
  zero where it divides by one. An item whose own prompt lets its variables be
  negative gets no such sibling (`itemAllowsNegative`, `shared.js`).
- **Every sibling states something true.** Each names the identities it states
  (`identities`: its starting expression, its answer, the assumption), and
  `tests/platform/workedExampleSiblingIdentities.test.mjs` evaluates both sides
  with mathjs, from the plain text alone, at random values that satisfy the
  assumption, over every real item each WE-I family claims and seeds 0 to 20:
  they must agree to 1e-9. It covers the division replay too.
- **Each answer line is in parts** ("Quotient = …; remainder = …"), so
  "Practise one like this" can check the student's answer part by part.
- **Every sentence translates.** Its mathematics is set in `$…$` (`math`,
  `shared.js`), so each sentence has one shape whatever its numbers, and each
  shape has its Spanish in `src/platform/language/packs/esSupport.js`
  (`platformFamilySentences`, the WE-I block); `readAloudAndTranslate.test.mjs`
  holds every family's sentences to that.
- **Coverage, from `node scripts/report-classwork-example-coverage.mjs`**
  (2026-11-27): covered 371 → 443 of 687 Classwork questions, uncovered 316 →
  244, built in 165 → 200. Every change is on an `A2.` standard: 34 questions
  are built in directly (14 by the division replay, 18 answer boxes and 2
  sorts by the generators) and 38 more are covered by an earlier question on
  the same skill. With the Algebra I batch merged too (2026-11-28): covered
  562, uncovered 125 (78 a generator could cover, 47 that need an example
  the lesson writes).
- **Not claimed:** a radical equation in answer boxes (A2.4G, A2.7H). Each such
  item's own answers include small numbers (2, 4) that any worked squaring
  writes, so no sibling would pass the guard; those items keep needing an
  example the lesson writes.
- **Tests:** `tests/platform/algebra2AnswerBoxExamples.test.mjs` (every claim
  over the real lessons), `workedExampleSiblingIdentities.test.mjs` (every
  sibling's mathematics, numerically) and the answer-box scenario of
  `tests/browser/divisionReplay.mjs`.

Where slice F lives, and what it does:
- **The section rules:** `exampleSectionRule` (`examplePlayer.js`) says
  `spotTheMistake` wherever an example is offered (Classwork and Practice) and
  `whyThisStep` on Classwork running as Classwork only. On a DOL, quiz or test,
  and wherever `hintsAllowed` is false, both are false: nothing is built and
  nothing is drawn.
- **Spot the mistake:** `spotTheMistake.js` (built in `QuestionEngine.jsx`,
  drawn by the player on the last slide of a whole example; a faded example
  has none).
  - The step is the first part of the question's own
    `solutionReview.commonError`, the part that says what was done; the right
    choice is the rest, the part that says what is wrong with it (the turn is
    the first `: `, ` — `, `; `, `, which`, `, so`, `, because` or `. `
    outside `$…$`). A common error that says only what was done is not used:
    the step and its reason would be the same words.
  - The two wrong choices are the "what is wrong" parts of OTHER questions'
    common errors on the same assignment (the questions QuestionEngine already
    hands the example context, `lessonQuestions`), in the assignment's order.
    One is used only when it is another question's (by id and by words),
    splits cleanly, makes a different mistake from this step, is not this
    reason and does not contain it or sit inside it, is not on a DOL, quiz or
    test question, and passes `similarExampleIsSafe` against this question and
    against its own (so it never hands over another item's answer). And, so
    that it cannot be a reason for this step's mistake too:
    - its question is on a **different skill** (`exampleSkillOf`): questions on
      one skill share their misconceptions. Where either skill is unknown it
      may still lend, under the next rule;
    - it shares **no word stem** with this question's whole common error
      (`contentStems`: the first four letters of each word of five letters or
      more, without a short stoplist: because, which, there, where, these,
      those, should, would, could, value, answer, number). Four letters, not
      five, so that "shading" and "shades" meet ("shad"), as "slope" and
      "slopes" do. Five would leave the case below to the skill rule alone;
    - it is **words only** (`wordsOnly`): no digit; none of = < > ≤ ≥ ± × ÷ ·
      √ ∛ ∜ (nor + − ^); no superscript or subscript character; no `$` or
      backslash; and no letter standing alone other than "a" and "I" (so no
      x², xᵏ, x + m, or "x-coordinate"). Another item's mathematics can be its
      worked result ("Rationalizing gives 6√2/2, and the 2 divides out,
      leaving 3√2.", which the answer guard let through and which was lent to
      another radical question on the same lesson), and no comparison of
      answer forms is sure to see it. So none is lent.
    Only a slot left empty takes a fixed choice (`SPOT_THE_MISTAKE_GENERIC`:
    both say the step is correct, which a step holding a known mistake never
    is). The right one's place is fixed by the common error and the seed, so
    a redraw does not reshuffle it. Over the 450 shown below, 264 get two
    borrowed wrong choices, 74 get one and 112 get none (before words only:
    350, 61 and 39).
  - The case that set the skill and stem rules: in Graphing Inequalities in Two
    Variables, cw-6 ("Shading below because the slope is positive") had
    borrowed "That shades the wrong half-plane." from cw-11, which explains
    cw-6's mistake too. cw-11 is on the same skill, and "shades" shares a stem
    with "Shading". Either rule now refuses it.
  - A borrowed reason is wrong for this step's mistake, not false in general.
    The rules make it unlikely to explain this step's mistake as well, but
    nothing in the words can prove it does not, so the wording never calls it
    false. Chosen, it says "That describes a different mistake, one made on
    another question. Here is the mistake in this step." and this step's own
    reason, and the button reads "Your choice: not this step's mistake",
    never "wrong". Only a fixed choice, which really is false of any step
    holding a mistake, keeps "Not this one. This is what went wrong." with the
    whole common error. Both new sentences are in the Spanish pack and in the
    leak gate's words.
  - A reason keeps the case its common error wrote it in where it starts
    with a letter of the mathematics ("x² · x⁵ is x⁷", not "X² · x⁵"); a word,
    the article "a" included, takes a capital.
  - This question's other fields were measured as a source (below) and are not
    used.
  - Nothing else is written: no mathematics of its own. Every word it would
    show (the step, the choices, the whole common error shown after a choice)
    goes through `similarExampleIsSafe`; one that states an answer of the
    question, or whose step is the question's prompt, is not shown at all, nor
    is one still holding a Question Family slot (`{{m}}`).
  - Over the Classwork and Practice questions in `teacher-import-jsons` with a
    common error (824 on 2026-11-22), 561 say both parts, and 450 of those pass
    the guard and are shown; the guard holds back the other 111.
  - **Recorded as a fact, not a grade:** answering it sets
    `supportUsage.spotTheMistakeUsed: true` (absent otherwise, so a record
    without it keeps its shape), kept by `attemptPolicy.mjs` and
    `supportUseMemory.js` like `workedExampleShown`. Whether the choice was
    right is never recorded. It changes no score, uses no attempt and leaves
    independence to the example's own flags. The teacher's attempt analysis
    names it "Spot the mistake answered".
- **Why the wrong choices are not this question's own text.** The only fields
  that read like a reason are the wrong-answer messages
  (`misconceptions[].message`). Most state a true fact ("Exactly 800 pounds is
  allowed."), which is no wrong answer; the rest name a mistake on the same
  question, and can be the common error in other words ("Using ≥." beside "The
  symbol points the wrong way."). A choice offered as wrong has to be wrong.
- **Why this step?:** `whyThisStepFor` (`exampleSlides.js`), drawn by the
  player. The slide before the example's first step with a why names that
  step's move (a replayed move's name, or a step card's line) and asks for its
  reason: that step's own `why` and the first two other `why` lines of the same
  example, nothing written for it. An example with fewer than three different
  whys asks nothing (a family's text steps have none). Skip, or Next, goes on
  without a choice; the step then plays with its reason like every step; the
  example never asks again (Back, or opened again). Not scored, not recorded.
- **Accessibility**, as WE-A and WE-E do it: every choice is a button of 44px or
  more with its own edge (the chosen Spot the mistake choice a heavier edge and
  "Your choice" in words, the others dashed and `aria-disabled`); each answer
  is said in a polite region that is in the page, empty, before a choice; the
  Why this step? choices sit outside the slide's live region, and focus goes
  to Next once they go; Read aloud and Translate read the question and its
  choices with the slide, and Spot the mistake has its own (its fixed
  sentences are in the Spanish pack, `esSupport.js`; a teacher's common error
  stays English until translated).
- **The leak gate:** their sentences, the two fixed choices and their controls
  (`[data-spot-the-mistake]`, `[data-why-this-step]` and their choices) are in
  `tests/browser/support/assessmentLadderWords.mjs`, and the gate's DOL and
  test page carries a common error.
- **Tests:** `tests/platform/workedExampleChecks.test.mjs`, the WE-F sections
  of `tests/browser/workedExamplePlayer.mjs`, and the practice Spot the mistake
  scenario in `tests/browser/assessmentLeakGates.mjs`.

**The model answer is not built.** AG-1 defines `"example": { "none":
"explain" }` and nothing else: the validator refuses any other key in it, and
no question field holds a model answer and its checklist. (`sampleAnswer`
exists only on a `contextInterpretation` item and is answer-key material in
`functions/shared/assignmentKeySplit.mjs`.) The contract it needs is an owner
or lead decision. What was proposed (2026-11-22, not decided):
- a question field `modelAnswer: { "text": "...", "checklist": ["...", ...] }`,
  beside `"example": { "none": "explain" }`, on Classwork and Practice only;
- `text` a short strong answer in full sentences; `checklist` two to five short
  lines, each one thing the answer includes;
- the validator refusing: a `modelAnswer` that is not that shape or has other
  keys; an empty `text`; a checklist outside two to five lines; one on a DOL,
  quiz or test question; one on a question that is not `"none": "explain"`.
  Pre-Flight warning on a new assignment's `"none": "explain"` with none;
- `modelAnswer` matches the key split's `[a-z]Answers?$` family, so it is
  answer-key material (shown after the item closes, as Solution Review is). A
  checklist shown before the student answers would need a field of its own,
  outside that family;
- `translations.es.modelAnswer` for the teacher's Spanish, as for
  `solutionReview`.

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
| Support families | `src/platform/supports/families/` (12 families) | Each has `similarProblem`. Nine also write `workedSolution`. |
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

**Reference cards today (WE-H).** A lesson names a card's skill, and the
platform supplies the card from its built-in library. The cards and their skills
are listed in `docs/assignments/AUTHORING_LEARNING_SUPPORTS.md` section 4. A card
shows only where a lesson declares one in `lessonSupports.referenceCards`.
Existing lessons are not back-filled. Of today's lessons, only the Algebra II
Honors Thanksgiving packet declares one: the sum and difference of cubes, on its
Unit 8 Classwork section. Everywhere else a card appears only once an author adds
one to a new assignment, and in the test fixtures.

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
| Have a built-in example today | 137 of 496 (274 since WE-I) |
| Have none | 359 |
| Lessons with no built-in example on any classwork question | 14 of 41 |

Since WE-I's Algebra I batch the same 496 questions measure 240 with a
built-in example and 256 without (144 of them answer boxes), and 9 of the 41
lessons have none. Of the uncovered Algebra I answer boxes, 140 became 14.
With its Algebra II batch as well they measure 274 and 222 (126 answer
boxes, and no synthetic or long division), and 3 lessons have none.

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
