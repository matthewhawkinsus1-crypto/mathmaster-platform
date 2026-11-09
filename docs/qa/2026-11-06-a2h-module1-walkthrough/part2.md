# Algebra II Honors module 1, Lessons 2 to 4: student walkthrough, part 2

Part 1 (Lesson 1 and the DOL 1 review) is a separate note.

**Environment.** Branch `helper/walk-a2h-m1-l2`, from `0e38234b`. The lesson harness
(`docs/qa/2026-10-22-walkthroughs/harness`) runs each lesson through the teacher-import chain, then the real
QuestionEngine with App.jsx's record, policy, Guided Notes and Exit Ticket mode. Headless Chrome at 1366×768 and
390×844 (the phone with touch), drawn with CI's fonts (`tests/browser/support/ciFonts.conf`).

| Lesson | File | Questions |
|---|---|---|
| L2 Day 1, Parent Functions and Key Attributes | `L2_Day1_Parent_Functions_Key_Attributes.json` | 19 |
| L2 Day 2, Transformations of Parent Functions | `L2_Day2_Transformations.json` | 20 |
| L3, Inverse Linear Functions | `L3_Inverse_Linear_Functions.json` | 19 |
| L4, Operations on Functions and Composition | `L4_Operations_on_Functions_Composition.json` | 20 |

All four files are in `teacher-import-jsons/algebra2-honors-module1/`.

**Priorities.** **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or
understanding. **P3** is polish.

## What was done

- **Keys, by hand, for all 78 questions.** No number in these lessons is templated: every item is fixed. Every
  key, choice and number was computed again by hand. Every distractor was checked to be wrong.
- **What a student reads around each key:**
  - the hints after the leak guard, the "Let's back up" step and the worked steps of the closed review;
  - the tools' own steps, and each choice's reason;
  - the "Practise one like this" siblings (the first two of every Classwork and Practice item, by hand).

  These were all checked by hand. The keys, hints, steps and siblings are right. One reason was wrong (F3).
- **Grading, outside the browser:**
  - the interval and point parts of the graph items (open and closed brackets, "and", commas);
  - equivalent Transformations Lab answers (a different a and h that draw the same graph);
  - money and unit spellings in number boxes ("25,000", "$25,000", "3 half-hours").

  The production graders were used.
- **Screen pass.** Every question at both sizes, 156 renders. Automated flags:
  - page errors;
  - unfilled templates, raw LaTeX, `undefined` / `NaN`, a caret in text;
  - sideways scroll and controls off the screen;
  - no Submit;
  - axe-core's WCAG A/AA rules on the question, unnamed inputs among them;
  - spoken math labels that spell letters.

  Then the screenshots, reviewed by eye.
- **Read-aloud sweep.** 1,893 texts went through `speechTextFor`: prompts, labels, options, option reasons, hints,
  back-up steps and worked steps.
- **Interactive pass.** A wrong try, then a right one, on every tool and mode in the four lessons (table at the
  end). The graph-analysis item was also worked on a phone, with its point placed by a tap.

## Fixed

### F1 (P1, gives the answer away; L4 CW 3): the area model's empty box showed the answer
L4 CW 3 multiplies f(x) = 2x + 3 by g(x) = x − 4 in Polynomial Workshop's area model. The "Expanded polynomial" box
asks for the coefficients "highest degree to constant, separated by commas". Before anything is typed it shows the
example **2, -5, -12**, which is this item's answer: (2x + 3)(x − 4) = 2x² − 5x − 12.
- **Why:** the example is fixed in the tool (`MultiplyArea` in `src/tools/polynomialWorkshop/PolynomialWorkshop.jsx`).
  It is the answer to the tool's default problem, and L4 CW 3 uses the default pair.
- **Reach:** the three lesson items that use this view: L4 CW 3, L4 PR 2 and Factoring Polynomials WU 2. The example
  is the answer only in L4 CW 3. The bank family for area models uses the typed-factor view, which has no such box.
- **Fixed:** the example is now `a, b, c`, the format with letters. No key changed. The inequality box's example
  was changed for the same reason: it became `y ≥ mx + b` because the old one could be a key (`75c7bc4a`).
- **Test:** `tests/tools/polynomialWorkshopAreaExample.test.mjs`. It reads the example from the view and asserts it
  holds no number. The tool's own grader must mark it wrong as the answer, on the default problem and on every lesson
  item in this view. The old example fails both tests.
- **Commit:** `5553042d`. **Reaches students** with Hosting; no re-import is needed.

### F2 (P2, display; L2 Day 1 CW 1, CW 2, CW 6, CW 7): point parts were named by program ids
These four graph-analysis items ask for points on the graph: the vertex and the minimum point of |x|, the
intercepts of √x, 2ˣ and log₂(x). Each point part's heading was a program id: **vertex**, **localMinimum**,
**xIntercepts**, **yIntercept**. A student read the id in three places:
- in the heading;
- in "Active part: yIntercept. Select 1 location(s), or choose "Does not exist."" and "Selected (0, 1) for yIntercept.";
- after a miss, in "still to fix: Domain in interval notation, Range in interval notation, yIntercept".

- **Why:** the import gives these parts no name, and the graph workspace falls back to the feature's id
  (`functions/shared/toolMath/graphWorkspace/graphWorkspaceModel.mjs`: `label: request.label || feature`). Other
  lessons that ask for intercepts add `readGraph` and compile to a different item type. So among the teacher-import
  lessons only these four items show an id.
- **Fixed in the lesson:** each part is named in the prompt's words: "Vertex", "Minimum point", "x-intercept",
  "y-intercept". The import already merges a named `analysisRequests` entry with the one it builds from the
  student actions. Each part keeps the id it always had, because a student's selections are stored under it.
  Pre-Flight is unchanged (valid, no new warning).
- **Test:** `tests/platform/graphAnalysisPointPartNames.test.mjs`. It compiles every teacher-import lesson and reads
  each graph-analysis item with the model the screen and the grader use. No point part may be named by its feature
  id or in camelCase, and the four items keep their part ids. Against the old file it lists the four items.
- **Commit:** `9d2ea11b`. **Reaches students** when L2 Day 1 is imported again.

### F3 (P2, wrong feedback; L4 PR 5): a choice's reason named the wrong slip
L4 PR 5 asks for (f∘g)(x) with f(x) = x² + 2x + 3 and g(x) = x + 5, as a choice with one try. After the try, the
student reads the reason for the option they chose. For **x² + 10x + 28** the reason said "This replaces the x in x²
but not the x in 2x". That slip gives (x + 5)² + 2x + 3 = x² + 12x + 28. The option is (x + 5)² + 3: the 2x term
left out.
- **Fixed:** "This leaves out the 2x term of f; every term of f stays, and each x in it becomes x + 5." The options
  and the key are unchanged.
- **Test:** `tests/platform/a2hCompositionOptionReasons.test.mjs`. It pairs each option it covers with the work that
  gives it, checks they are equal at several values of x, and checks the reason the device shows names that work.
- **Commit:** `9d2f5d6d`. **Reaches students** when L4 is imported again.

## Logged: Warm-Up and exit-ticket items (not edited)
Another batch is building Recovery for these sections, so their wording and numbers stay as they are. The fix
I would make is given for each.

| Where | What a student meets | Severity | The fix I would make |
|---|---|---|---|
| L2 Day 1 DOL 1 (1/x, decreasing) | Only the union **(−∞, 0) ∪ (0, ∞)** is accepted. **(−∞, 0) and (0, ∞)** and **(−∞, 0), (0, ∞)** are marked wrong, on a one-try exit ticket. The worked step says "decreasing on (−∞, 0) ∪ (0, ∞)", which is not true of the union: f(−1) = −1 < f(1) = 1. | P2 | Grader: accept the pieces joined by "and" or a comma for increasing, decreasing, positive and negative. Family step: "decreasing on (−∞, 0) and on (0, ∞)". Both are platform changes (see P-6). |
| L2 Day 1 WU 2 (x², increasing) | **[0, ∞)** is marked wrong; only (0, ∞) is accepted. x² is increasing on [0, ∞) too. Hint 3 says "The turning x-value itself belongs to neither open interval", so the convention is taught, but not on the box. | P3 | Accept a closed bracket at a turning point, or say "use ( ) at a turning point" under the box (P-6). For −√x (PR 3) both [0, ∞) and (0, ∞) are already accepted. |
| L4 DOL 1, (f∘g)(x) option **x² + 2x + 4** | Its reason says "This keeps x² as it is; every x in f … becomes 2x + 1". That slip gives x² − 4x + 1. The reason is shown only after the ticket closes. | P3 | Make the option x² − 4x + 1, or say what it is not ("its x-term and constant are not from f(2x + 1)"). |
| L2 Day 1 DOL 3, L2 Day 2 WU 3 | Read aloud: "f of x equals 2 ˣ"; "g of x equals log sub 2 times the quantity x" (P-1). | P2 | Platform (P-1). |
| L2 Day 2 DOL 3 | The prompt `$y=-3*2^(x-2)+1$` draws correctly as y = −3·2^(x−2) + 1. Read aloud it is "negative 3 times 2 to the power x minus 2 plus 1": the exponent's end is not said. | P3 | Platform: end a bracketed exponent ("… to the power x minus 2, end power, plus 1"). |

**Not changed, by the owner's list (handoff section 5):**
- The fixed-answer questions without Recovery: L2 Day 2 Warm-Up Q1–Q3, L2 Day 1's three Warm-Up and three
  exit-ticket questions, L3 Warm-Up Q2 and Q3, and L4 exit ticket Q3.
- The dashed transformed graph in L2 Day 2's point maps (CW 3, PR 3, DOL 3), the open question "The g(x) line in
  point maps".

## Logged: platform

### P-1 (P2, accessibility): Read aloud misreads the Unicode mathematics these lessons are written in
The speech module already has the right words for each case ("to the power", "log base", "composed with"). The
Unicode spellings never reach them.

| Written | Read aloud now | Texts | Where |
|---|---|---|---|
| `2ˣ`, `(1/2)ˣ` | "2 ˣ", "the quantity 1 over 2 ˣ" (ˣ is a letter superscript, left raw) | 22 | L2 Day 1 CW 6, CW 8, PR 2, PR 4, DOL 3; L2 Day 2 WU 3 |
| `log₂(x)` | "log sub 2 times the quantity x" | 17 | L2 Day 1 CW 7, CW 8, DOL 3 |
| `log₁⁄₂(x)` (PR 5's prompt) | "log sub 1 ⁄₂ the quantity x" | 1 | L2 Day 1 PR 5 |
| graph of log base 0.5 | "y equals log base 0 of .5 times the quantity x": the base is cut at its decimal point | the graph's label | L2 Day 1 PR 5 |
| `log_0.5(x)` (family hints and steps) | "log_ 0.5 times the quantity x"; on screen the hint and steps also show `log_0.5(x)` with the underscore | 3 | L2 Day 1 PR 5 |
| `(−∞, ∞)`, `(0, ∞)` | "the point negative infinity, infinity": an interval read as a point | 86 | 18 items: 16 in L2 Day 1, L2 Day 2 WU 2, L3 WU 3 |
| `[0, ∞)`, `(−∞, 0]` | "0, infinity", "the quantity negative infinity, 0": the brackets, which are the answer, are not said | 30 | 9 items, L2 Day 1, L2 Day 2 WU 2 and L3 WU 3 |
| `∪` | left raw | 28 | 14 items, L2 Day 1 |
| `(f∘g)(x)`, `t∘r` | "( f ∘ g ) the quantity x": `∘` left raw | 81 | 9 items, L4 |
| `{(−3, 26), (2, 11)}` | "{ the point negative 3, 26, … }": braces left raw | 24 | L3 CW 1, PR 1, DOL 1 |
| `5 → g → 1 → f → 5` | arrows left raw | 2 | L4 CW 5 and PR 4, the closed review |

- **Cause:** `src/platform/language/speechText.js` handles `\log_2`, `\circ`, `^x` and the superscript digits, but
  not ˣ, a Unicode subscript base, a base with a decimal point, plain `∘`, an interval or a set.
- **Suggested fix:** route ˣ (and ⁿ) to the power wording, a subscript base to "log base 2 of x", and `∘` to
  "composed with". Read an interval as an interval: "the interval from 0, included, to infinity". The interval
  wording is new in English and Spanish, so it goes through the Spanish review in section 5.
- **Not fixed here:** the module is shared by every Read aloud and is likely to be touched by the accessibility
  batches.
- **The family's own spelling:** `functionFeatures.js` writes a log base other than 2 or 10 as `log_` and the base
  (`renderRhs`), so the hint panel and the closed review show "log_0.5(x)" as typed text. A base written in
  words or as a typeset subscript would fix the screen; the speech needs the fix above as well.

### P-2 (P2, display): interval answers are cut off in the graph-analysis boxes
At 1366×768 the Analysis Parts column is about 220 px wide, and each interval box about 120 px beside its keypad
button. A typed (−∞, ∞) shows as "−∞, ∞" with both brackets cut off. In an interval answer the brackets are the
content. (−∞, 0) ∪ (0, ∞) (L2 Day 1 CW 5 and DOL 1) scrolls inside its box. MathLive draws with its own fonts,
so this does not depend on the system font.
- **Suggested fix:** let an interval box grow to fit what is typed, or give the column more width at laptop sizes.
- **Where:** `src/InteractiveGraphWorkspace.jsx`.

### P-3 (P3): a point part with no name is still named by its feature id
F2 names the four affected items in their lesson. Any other surface that builds a graph-analysis point part
without a label still shows the id (`graphWorkspaceModel.mjs`: `label: request.label || feature`).
- **Suggested fix:** fall back to words: "Vertex", "x-intercept(s)", "y-intercept", "Minimum", "Maximum", "Center".

### P-4 (P3, feedback): Transformations Lab names a b that is not on screen
After a miss on identify or match (L2 Day 2 CW 1, CW 4 and PR 1), the lab says "Compare one parameter at a time.
Change only a, then b, then h, then k". These views show only a, h and k ("the lab keeps b = 1").
- **Where:** `src/tools/transformations/transformationsGuidance.js`.

### P-5 (P3, display): the area model's header
- L4 CW 3 reads "(2x +3)(1x -4)" with a "1x" column; L4 PR 2 reads "(1x +5)(2x -3)". The prompts say x − 4 and
  x + 5.
- On a 390 px phone the cell boxes cut their "coefficient" example to "coefficie".
- **Where:** `MultiplyArea` in `PolynomialWorkshop.jsx`.

### P-6 (P2/P3, grading): interval conventions
The two Warm-Up and exit-ticket rows above come from the graph-analysis grader:
- a closed bracket at a turning point is refused;
- monotonic pieces must be joined by ∪.

The convention is taught in a hint, but neither rule is stated on the box. Whether to accept the other spellings is
a decision for every lesson that uses the tool.

## Logged: Classwork and Practice content, not changed
**Reasons that are true but name only part of a slip (P3).** Each reason below names a slip that really is in its
option, but the rest of the option comes from no single slip. A student who chose it learns one thing to fix, not
what they did.

| Item | Option | Reason (start) | The named slip alone gives |
|---|---|---|---|
| L4 CW 2 | 3x³ − 14x² − 9x + 4 | "This flips the signs of the last two products; check −2x·(−4) and 1·(−4)" | 3x³ − 14x² − 7x + 4 |
| L4 CW 6 | 3x² + 3x + 4 | "This keeps 3x² unchanged…" | 3x² − 2x + 5 |
| L4 CW 6 | 3x² + x + 7 | "This leaves 3x² as it is…" | 3x² − 2x + 7 |
| L4 PR 5 | x² + 7x + 8 | "This keeps x² as it is…" | x² + 2x + 13 |
| L4 PR 6 | 0.5x − 4 | "This loses the factor of 2 from g…" | 0.5x |

**Suggested fix:** make each distractor the exact result of its named slip (the last column), so the reason
describes the student's own work. Not done: each reason is true of its option, and a new option changes the choices
a class sees (and their order, which is seeded by the option text).

## Pacing, scaffolding and pedagogy (log only)
- **Half the Classwork and Practice is one-try choice.** 27 of the 54 Classwork and Practice items have only choices.
  Pre-Flight warns on each:
  - L2 Day 1 CW 8, PR 1, PR 2;
  - L2 Day 2 CW 5–8, PR 4–6;
  - L3 CW 1, 3, 4, 6, PR 1–3, 6;
  - L4 CW 1, 2, 4, 6, 8, PR 1, 3, 5, 6.

  In L3 and L4 the student picks f⁻¹(x), (f + g)(x), (f·g)(x) or (f∘g)(x) from four rules and never writes one.
  The graders already accept an equivalent typed rule, so a typed box would let the student write the inverse or
  the composition.
- **The last hint names the move on a four-way choice.** For example, L3 CW 3's hints run "Write y = 3x − 7, then
  swap x and y…", then "add 7 to both sides, then divide both sides by 3". After two hints the choice is
  (x + 7)/3 by reading. This is the confirmed default ("the last hint names the move", OT02). With a typed answer
  it would cost less.
- **Tools that do half the step:**
  - L4 CW 5 and PR 4: the composition machines show f(5) = 13 and g(5) = 1 and fill the first stage (5 → g → 1)
    before the student starts. Only the outer evaluation is left.
  - L3 CW 5 and PR 4: the inverse workspace draws and marks the swapped point (11, 4) on f⁻¹ while the student is
    asked for f⁻¹(11).

  This is close to the owner's open question about point maps (section 5).
- **No "Practise one like this":**
  - L2 Day 2 CW 2 (describe the √x graph), CW 6 and CW 7;
  - L2 Day 2 CW 8, PR 2, PR 5 and PR 6.

  The transformations family has no sibling for these shapes.
- **An easier sibling:** L4 CW 2 multiplies a quadratic by a linear function (degree 3). Its "Practise one like
  this" multiplies two linear functions (degree 2).
- **Order in L4:** CW 2 asks for (3x² − 2x + 1)(x − 4) as a choice (band 3) before CW 3's area model (band 2) teaches
  the product. Swapping them gives the scaffold first.

## What works well
- **Every key is right**, in all 78 questions. So are the family steps and the tools' steps; each "=" checked holds.
- **Equivalent answers are accepted.** CW 4's target 0.5·2^(x + 1) + 2 is the same graph as 2ˣ + 2, and a = 1,
  h = 0, k = 2 is marked right. A describe answer with a different a and h for the same exponential is also right.
- **Partial credit names the part:**
  - "still to fix: h";
  - "The y-coordinate is right. The x-coordinate is not: only h moves a point horizontally.";
  - "Neither composition is right yet. Work the inside function first…".
- **One-try choices:** after the try, the student reads the reason for the option they chose, then the worked
  solution and "Practise one like this".
- **Exit tickets give no verdict:** "Your answer is saved. You will see whether it is right when this activity's
  results open."
- **Money is read as money,** in prompts and in boxes ("25,000", "$1340" accepted). The screen pass had no page
  error, no sideways scroll and no axe violation at either size.

## Releasing this work

- **Hosting** for F1. No Functions, rules or index change.
- **Re-import** L2 Day 1 (F2) and L4 (F3). Nothing else in their compiled questions changes: same ids, weights and
  options, so the on-screen order of every choice stays as it is.

## Checks run

**Screen pass (156 renders).** No page error, unfilled template, `undefined`, `NaN`, sideways scroll, control off
screen, missing Submit or axe violation. Three flags were dollar amounts in prose (L3 CW 7, L3 PR 5, L4 CW 7); they
render as text, a known false positive. The review by eye found F1, F2, P-2 and P-5.

**Read aloud (1,893 texts).** 164 flagged by symbol; five of them only say "undefined" in prose ("dividing by 0 is
undefined"). The rest, and the readings no symbol shows (a log's base read as a product, an interval read as a
point), are P-1.

**Verification of the fixes.**
- The three new tests, each broken once to see it fail.
- Every existing test file that reads the changed files: 1,113 tests, none failing.
- `npm run lint` and `npm run audit:theme-colors` exit 0.
- In the harness at both sizes, L2 Day 1's point parts read "Vertex", "Minimum point", "x-intercept" and
  "y-intercept", and both area-model items show "a, b, c".
- CI's drivers for Polynomial Workshop: `captureRegistryToolResponses.mjs` (fixture unchanged, captures re-graded)
  and `toolFocusAndUndo.mjs` (all checks pass). CI's large-text job does not carry this tool, and the new example
  is shorter than the old one.

**Interactive pass** (1366×768; the graph item also on a 390×844 phone with touch):

| Item | Tool / mode | Wrong try | What the student was told | Then |
|---|---|---|---|---|
| L2 Day 1 CW 6 | graph analysis, intervals and a point | domain [0, ∞), range [0, ∞), y-intercept (0, 2) | 25% partial credit, "still to fix: Domain in interval notation, Range in interval notation, yIntercept" (F2) | right on try 2, with the steps |
| L2 Day 1 CW 6, phone | the same, the point placed by a tap | range [0, ∞) | 75%, "still to fix: Range in interval notation"; the tapped (0, 1) counted | right; no sideways scroll |
| L2 Day 2 CW 1 | Transformations Lab, identify | h = −3 | 75%, "still to fix: h", "Change only a, then b, then h, then k" (P-4) | right |
| L2 Day 2 CW 2 | describe | no reflection, right 2 | 80%, "still to fix: Reflection across the x-axis, Horizontal translation" | right |
| L2 Day 2 CW 3 | point map | (0, 1) | 50%, "The y-coordinate is right. The x-coordinate is not…" | right |
| L2 Day 2 CW 4 | match | h = 1 | 13%, "Focus on: Graph lies on the target" | a = 1, h = 0 (the same graph) is right |
| L2 Day 2 DOL 3 | point map on an exit ticket | (−2, −2) | "Your answer is saved…", no verdict | as designed |
| L3 CW 5 | inverse workspace | f⁻¹(11) = 25 | "The inverse value is off. f⁻¹ undoes f…" | 4 is right |
| L3 CW 3 | one-try choice | 3x + 7 | closed at 50%; the reason for 3x + 7; the worked solution; "Practise one like this": "Find the inverse of f(x) = 3x − 13." | as designed |
| L3 CW 7 | choice and number | rule 20x + 44000 | 50%, "still to fix: Inverse rule s=E⁻¹(x)" | right, with "25,000" typed |
| L3 DOL 2 | exit-ticket choice | (x − 9)/4 | "Your answer is saved…", no verdict, no reason | as designed |
| L4 CW 3 | Polynomial Workshop, area model | −8x − 3x | 80%, "still to fix: Expanded coefficients" | right (F1: the empty box showed this answer) |
| L4 CW 5 | composition machines | the two orders swapped | "Neither composition is right yet…" | right |
| L4 CW 7 | numbers and choice | the two results swapped | "Check this" on each part | right, with "1,344" and "$1340" typed |
