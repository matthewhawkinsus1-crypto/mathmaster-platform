# Student walkthroughs, 2026-10-23: the 20 lessons in #520

The lessons written since #518 were run as a student on the integration branch (#520), the code students get once it merges:

| Lessons | Questions |
| --- | --- |
| Algebra I **Module 3**: solving equations, inequalities, systems by graphing, systems by substitution (4 lessons + 4 Honors) | 290 |
| Algebra II **Polynomials and Radicals**: factoring, Remainder and Factor Theorems, radical expressions, rational exponents, radical equations (5 + 5 Honors) | 284 |
| Algebra I DOL #3 Review **Honors** | 16 |
| Algebra II Honors DOL #2 Review (Honors version) | 40 |

## How it was run
- **Harness:** the 2026-10-22 harness (#516, `docs/qa/2026-10-22-walkthroughs/harness/`), now passing a real family context (`buildStudentFamilyContext`) so family-backed Warm-Up, Practice and DOL slots render a student's own pinned instance.
  - Lessons go through the teacher-import chain, then the real `QuestionEngine` with App's props.
  - Headless Chrome, at 1366×768 and 390×844.
- **Screen pass, every question at both sizes.** Automated flags:
  - page errors;
  - unfilled templates, raw LaTeX, `undefined` / `NaN`;
  - page-level sideways scroll and controls off the screen;
  - no final action;
  - unnamed inputs.
  - Then contact sheets, reviewed by eye.
- **Read-aloud sweep:** every prompt and answer label (1,517 texts) through `speechTextFor`, flagging raw symbols a speech engine would mangle.
- **Interactive pass:** a wrong-then-right path on each new tool and mode. Results are below.

## Screen pass
Every question in all 20 lessons was rendered at 1366×768 and at 390×844, 1,312 screenshots in all.

**No problems found:**
- No page errors.
- No unfilled `{{…}}` templates, raw LaTeX, `undefined` or `NaN`.
- No page-level sideways scrolling on a phone.
- Every item that should have a final action has one. Step Algebra's appears once the variable is isolated, which is the trained interaction.

**Found:**
- **Prose rendered as a formula in "Information you need" (P1, display):** a statement with two prices ("a credit of $25 toward sales, and each box of popcorn sells for $3.75") rendered everything between them as one italic formula, "25towardsales,∧eachbox∘popcornsellsfor3.75". Its spoken label spelled the words out letter by letter.
  - Seven statements in Module 3 (T1 L3, T2 L1, T2 L2, and their Honors versions).
  - The card had its own `$…$` pattern instead of the prompt's currency-aware splitter.
  - A second pass flags any rendered math whose spoken label spells letters, so this class of bug is caught across all 20 lessons.
- **Factoring Polynomials WU 2 (P3, accessibility):** the area model's "Expanded polynomial" box had no accessible name.

**False positives, recorded so the next pass can drop them:**
- Prices ("$40 and deposits $4") rendered correctly as text.
- The harness's own heading on a phone.

## Read aloud
- **Found:**
  - `x^{2/3}` was read "x **squared** over 3": the squared rule took the "^(2" of ^(2/3). `x^{-1/2}` would have been "inverse".
  - Powers written as characters above 3 (x⁶, b⁴, x¹⁰) were passed raw.
  - √, ∛, ∜ and index roots (⁶√16) were split off as prose ("⁶ the square root of 16").
  - A blank power, 2^(…), kept its caret.
- **Fixed** in the fix PR (`speechText.js`):
  - Exponents are matched exactly.
  - Powers and roots are read in words, in the reader's language, with "times" after a coefficient. A root inside a root is read too.
  - A power after a bracket gets a pause.
  - The sweep is now clean.

## Interactive pass
A wrong try, then a right one, on each new tool and mode, in the real `QuestionEngine` (1366×768, plus 390×844 where noted).

| Item | Tool / mode | Wrong try | What the student was told | Result |
| --- | --- | --- | --- | --- |
| Radical Expressions CW 1 | answer boxes, `simplestRadicalForm` | 5a²√(b⁹), equal but not simplest | "Equal, but not in simplest form: take every perfect power out of the root…" (new code) | right on try 3 |
| Factoring Polynomials CW 1 | answer boxes, `factoredForm` | 3xy(4 + 8y − 10xy³); then the expansion | "Equal, but not fully factored…" both times (new code) | right on try 3 |
| Remainder and Factor Theorems CW 1 | Polynomial Workshop, synthetic (x − r) | −4 in the box for x − 4 | **Before:** "Check the coefficient row first (a 0 for each missing power)", but the row was right. **Now:** "Check the sign of the number in the box…" | **fixed** |
| Solving Radical Equations CW 1 | Sign & Solution, radical solve | √(y − 2) = 4 (step-1 slip) | **Before:** "Not yet — fix the steps marked below" over ✗ on steps 1, 2, 3 and 5. **Now:** "Start with step 1, isolating the radical… The steps after it follow from it." | **fixed** |
| Solving Radical Equations PR 7 | Sign & Solution, radical check | kept both candidates | "At least one value you kept fails the original equation…" | **fixed:** the equation read "√(3x + 4) = 1x + 0" |
| Factoring Polynomials CW 6 | Controlled Sort | x³ − 400 as cubes, a non-square trinomial as a perfect square | "Some cards need to move…" (count deliberately not given) | as designed |
| Modeling and Solving Linear Inequalities CW 5 | number line | open dot at 420 | **Before:** recheck every endpoint, open/closed and shading. **Now:** "Your endpoints are in the right places. Check whether each one is open or closed…" | **fixed;** ticks too, below |
| Solving Systems by Graphing CW 7 | Systems, graph it yourself | a flat line for 5s + 10a = 3000 | **Now:** "The line for Equation 1 is not graphed right yet…" | **fixed:** axes and boxes said x/y for s/a |
| Solving Systems by Substitution CW 5 | Systems, substitution | substituted back into Equation 1 | "That placement puts the expression back into the equation it came from…" | as designed |
| Solving Linear Equations CW 14 | figure match | — | — | **fixed:** Figure 5 cut off after "+ 2(2" |
| Solving Linear Equations CW 3 | Step Algebra | choose + 5x | pick up and place, as trained | as designed |
| Radical Expressions DOL 1 | answer box on a DOL | equal, not simplest | "Your answer is saved…" No verdict and no form message on an exit ticket. | as designed |
| Operations on Polynomials CW 3 (#516) | Add & Subtract, 390 px | sign slip on −3a | Red cells on the opposite, the a column and the result. No sideways scroll. | #516 fix holds |
| DOL #3 Review Q12 (#516) | Open Sort | — | — | one curve now; also **fixed:** the circle drew as an ellipse |
| Dividing Polynomials DOL 2 (#516) | long division on a DOL | — | No 0 placeholder, no "holds the place" sentence | #516 fix holds |

**One Undo.** The tools' own Undo/Redo were removed (owner decision, below). These browser journeys pass on the fix branch:
- `toolFocusAndUndo`: all 197 checks;
- `regressionCalculatorPhone` at 390 px and on a Chromebook;
- `linearMultipleRepresentations` journeys `undo`, `undo-phone`, `dol` and `complete`;
- `studentUxPlatform graphs`.

**Clipped math sweep.** MathLive clips a too-wide formula inside its own shadow root, so no overflow check saw Figure 5. A new pass measures each block formula's natural width against its box, on every question at both sizes. Results: none in any of the 20 lessons once the figure card breaks long equations. The pass's probe was first checked against Figure 5's equation: 363 px of formula in a 312 px box.

**Checked, not changed:**
- **Systems substitution.** "Simplify first (optional)" is offered for an expression that is already simplest (y = 3x − 4). Harmless: it is optional and credit-neutral.
- **Controlled Sort.** It says some cards need to move, not how many. A count would let a student find the misplaced cards by elimination.
- **Phone task panel.** Its Vocabulary and Read aloud buttons are clipped at the bottom edge until the panel is scrolled. That is the panel's scroll, not an overlap.

## Fixed in the fix PR
Beyond the #516 follow-ups (see the PR):

- **One Undo, the work bar's (owner decision, 2026-10-23).**
  - **Rule:** a tool keeps its own Clear / Start over.
  - **Removed:** the tools' own Undo/Redo in the Linear Table Workbench, the Representation Bridge, the Regression Calculator (whose CSS hid the work bar's Undo), Expression Meaning, the process workspace ("Undo step") and each graph on the representations board.
  - **Distribute:** "Undo placement" is now "Clear placements".
  - **Enlarged graph:** it covers the work bar, so it shows the same Undo.
  - **Guard:** `oneUniversalUndo.test.mjs`.
- **Read aloud:** radicals and powers in words; a fractional exponent is never "squared".
- **Right value, wrong form:** four new codes, for radicals and for factoring.
- **"Information you need":** two prices in one statement are prose.
- **Area model:** the expanded-polynomial box has a name.
- **Synthetic division (x − r) and radical solving** name the first step to fix. On a DOL, quiz or test they only point at it.
- **The radical check** writes √(3x + 4) = x, not "= 1x + 0".
- **Lists with numbers or bullets** inside a tool read from the left. The question area is centred.
- **Number lines tick where a click lands** (0 to 600 by 60 had ticks at 50s), and a wrong graph says whether the endpoints, the open/closed choice or the shading is off.
- **Systems graphs** use the item's letters (s and a) on the axes and in every box, and name the wrong line.
- **Figure cards** break a long equation at its equals sign.
- **Circle cards** are drawn with equal units.
