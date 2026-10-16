# Algebra II M1 T2 L3, Solving Systems with Matrices: student walkthrough

The 28-question assignment from `claude/zen-gates-x91hg8`, done as an Algebra II Honors student in a real browser, following
[`ALGEBRA2_MATRICES_STUDENT_WALKTHROUGH_BRIEF.md`](ALGEBRA2_MATRICES_STUDENT_WALKTHROUGH_BRIEF.md).

**Headline:**
- **P0 — a right number graded wrong:** WU 1 refuses `8,050` for 8050 (and `44,900`). The multi-answer grader has no thousands separator, while the Matrix Lab accepts `2,086.25`. Not fixed here: it is shared server grading.
- **P1 — the row × column line showed the wrong arithmetic:** CW 5's "6(3/2) + −1(1/6)" reached the student as 63/2 + −11/6, and CW 5's first hint as "2/33/2". Any prompt with a number touching a bracketed fraction was affected ("Evaluate 4(1/2)" showed 41/2). **Fixed here.**
- **P1 — Read aloud and screen readers, all fixed here:**
  - PR 10's prices were read without "dollars".
  - CW 3's "1st" was read as "1 st".
  - "A⁻¹" was passed to the speech engine as a raw symbol.
  - The choice "$20 grocery cards" was named "20 grocery cards".
- **P1 — a correct model refused:** in PR 10, substituting z = 2x into the count (3x + y = 80) is a correct model, but it is refused with no reason (hypothesis 6).
- **P1 — the lab's exit tickets** still show "How to do this", and the one submission is labelled "Check …". This is still open from the M2T2 report (P1-9 / R-10).

Every other answer I tried was graded correctly. That covers fractions, decimals, `\frac`, the Unicode minus, `+7`, rows reordered, rows multiplied through, combinations in PR 9, and early rounding refused.

## 1. Environment

| | |
| --- | --- |
| Branch | `claude/algebra2-matrices-walkthrough`, on `claude/zen-gates-x91hg8` at `317da94d` (the branch that adds the Matrix Lab, the assignment and the harness; no PR yet) |
| What ran | The harness `tests/browser/algebra2MatricesLesson.html` (Vite on :5197, own `npm ci`). The assignment is compiled through the teacher import chain and mounted in the real `QuestionEngine`. **A harness, not a signed-in session.** |
| Browser | Google Chrome (full), driven with Playwright. Every answer went through rendered controls: clicks or touch taps on matrix cells, Yes/No, solution types and calculator keys; typing in cells and MathLive fields; ▸Frac/▸Dec; Check/Submit; Hint; Read aloud; Undo; Reset (with its confirmation); Enlarge; Scratchpad; Calculator; Learning goal; Vocabulary; a page reload. `window.__matrices` was used only to change question and to read drafts, records and verdicts. |
| Viewports | 1366×768 (every question); 820×1180 touch (WU + PR); 390×844 touch (WU + PR); 1920×1080 (spot check: WU 1, CW 3, CW 5, PR 5, PR 10, DOL 2) |
| Baseline | `check-teacher-import`: valid, 0 errors, 1 intended warning (PR 12 is not from the CCMR bank). The lesson's tests 42/42. `algebra2MatricesLesson.mjs`: 56 question views, 0 findings (before and after this PR's changes). |
| Harness changes | The harness now keeps each question's record with the same `recordQuestionAttempt` the server and the in-app demo use, with the app's per-question maximum (`resolveQuestionMaximumAttempts`). Tries count down, hints 2–3 open after a miss, a choice-only item gets one try, and a DOL takes one submission. It also passes the app's default Guided Notes setting (Classwork on, Practice off). Without these, attempts, hints 2–3, DOL single submission and Guided Notes could not be tested (the M2T2 report's R-12). |

## 2. Journeys

| Journey | Viewport | What the student did | Result |
| --- | --- | --- | --- |
| Whole lesson | 1366×768 | WU 1 → DOL 3 in order. At least one classic mistake per Matrix Lab view (list below). Hints 1–2 on CW 2 (hint 3 was offered after the second miss, not opened); Read aloud on WU 1, CW 3, CW 9 and PR 10; reloads mid-CW 2 and mid-CW 9; Undo ×4 and Reset on CW 9; switched away and back; worked CW 9 to completion inside Enlarge. | Every right answer graded right except WU 1's `8,050` (P0-1). Every wrong answer graded wrong. Findings below. |
| Warm-Up + Practice | 820×1180 touch | Every item tapped and typed to a correct Check (15 items). | All graded right. No sideways scroll, no page errors. Cells 64×44 px. |
| Warm-Up + Practice | 390×844 touch | The same 15 items. | All graded right; no sideways scroll; no page errors. Check is reachable on every item. After the last value, Check sits under the work bar (P2-7). |
| Spot check | 1920×1080 | WU 1, PR 5, PR 10 worked; CW 3, CW 5, DOL 2 layout only | No overflow; same findings as at 1366. |
| Exit tickets | 1366×768 | DOL 1 (one cell wrong), DOL 2 (right, Enter pressed in a cell first), DOL 3 (singular read as "many") | No verdict, no Hint, no Read aloud. Enter never submitted. One submission each, and the lab locked afterwards, also after a reload. The calculator is there on DOL 2–3. P1-5. |

The literal order:
1. **Laptop:** WU 1, WU 2 (slip → right), WU 3, then CW 1–10 in order (each wrong first), PR 1–12 in order, DOL 1–3.
2. **Supports on a fresh run:** CW 9 (Undo/Reset/reload/Enlarge), CW 3 (Guided Notes, Learning goal, Vocabulary, Scratchpad, Calculator).
3. **Touch:** phone pass, then iPad pass.
4. **1920 spot check.**

Classic mistakes tried, and what the lab said:

| Mistake | Where | What happened |
| --- | --- | --- |
| Dimensions as columns × rows | CW 1, CW 2 | Refused: "Reconsider: Dimensions of matrix A" |
| Transposed element (tapped a₄₃ for a₃₄; typed b₁₃, b₂₄, b₄₂) | CW 1, CW 2 | Refused, graded by position: a₁₂ has the same value 5 as a₂₁ and is still refused. The tap names what was chosen ("row 4 (EE), column 3 (11)"). |
| Element-wise / row × row product | CW 3, PR 1, CW 5 (Jackson's all-1s product) | Refused cell by cell |
| Wrong predicted size (4 × 5 for the sprinters, 4 × 4 for PR 1) | CW 3, PR 1 | The fill grid follows the prediction. "Reconsider: Dimensions of A · B" plus each key cell. |
| "(3 × 2)·(3 × 2) is defined because the sizes match" | CW 4 | Refused (75%); the step turns red without naming the figures (P2-4) |
| Jackson: "yes, inverses" | CW 5 | Refused: "Reconsider: Are R and S inverses?" |
| Nicky: copy as printed | CW 8 (untouched prefill), PR 4 | **Named exactly:** "Row 1 copies equation 1 as it is printed. Write that equation in standard form … first" |
| Missing variable blank / written as 1 | CW 9 | Blank → calculator `ERR: A CELL IS EMPTY OR NOT A NUMBER`. Written as 1 → 6/7, −39/14, −43/14 and five "Reconsider" lines (P2-3). |
| Sign error moving z across = | PR 4 | Refused as "copies equation 3 as it is printed" |
| ERR: SINGULAR read as the wrong one | CW 10 (none), PR 8 (many), DOL 3 (many) | Refused; a second guess passes (P2-2) |
| Rounding early (3.3, −1.3, 1.7; 14.8) | PR 5, PR 7 | Refused; PR 5's message names only "The inverse matrix A⁻¹" (P2-5) |
| x = 2z; y + z = 0 | PR 10, PR 11 | The calculator gives −345/22 baskets and −416/7 tickets: an honest cue that the model is wrong |
| The answer as the model (A = I) | PR 10 | Rows refused; x, y, z still score (4 of 7 parts) |
| Independent third equation; 0 = 0 | PR 9 | Both refused; 0x + 0y + 0z = 0 with no reason (P2-9) |

## 3. Findings

### P0

**P0-1 — WU 1 grades `8,050` wrong.**
- *Symptom:* "Total money collected selling $25 grocery cards" answered `8,050`, and "$50 gas cards" answered `44,900`.
  - Both were refused with "Not quite … Focus on: Total money collected …".
  - It cost a try, and the score was 50%.
  - No format message appeared before or after submitting.
  - `8050` is accepted.
  - Screenshot: `laptop-wu1-thousands-separator-refused.png`.
- *Where:* `gradeMultiAnswerResponse` (`functions/shared/ordinaryResponseGrading.mjs:229`) and the shared answer comparison have no thousands-separator rule. The Matrix Lab's `parseCell` already has one (`functions/shared/toolMath/matrixLab/matrixMath.mjs:70`, `stripThousands`), so in this one lesson `2,086.25` is accepted in PR 10 and `8,050` is refused in WU 1.
- *Why it matters:* A right answer, written the way money is written, is graded wrong. The student is told to "focus on" a value they computed correctly.
- *Suggested fix:* Accept a strict US grouping (`^-?\d{1,3}(,\d{3})+(\.\d+)?$`) only in a field that expects one number, not a pair, list or set. Use the same rule as `stripThousands`, in the shared comparison so the server re-grade agrees. At minimum, show a format message ("write 8050 without the comma") before the try is spent.
- *Not fixed here:* the change is to shared server grading for every multi-answer field, and a comma also separates list and pair answers. It needs its own PR and its own tests.

### P1

**P1-1 — The row × column line and a hint showed the wrong arithmetic. Fixed in this PR.**
- *Symptom:*
  - The CW 5 expansion is built as "6(3/2) + −1(1/6)". It rendered as **63/2 + −11/6**, and the hidden screen-reader text said "63 over 2".
  - Row 1 rendered as "2/33 /2 + 11/6".
  - CW 5's first hint, "(2/3)(3/2) + 1(1/6)", rendered as "2/33/2 + …".
  - Integers were fine (CW 3's "0(10) + 2(8) + …"). Any prose with a number or a ")" touching a bracketed fraction was affected platform-wide: "Evaluate 4(1/2)." showed 41/2, and "(3/2)6" showed 3/26.
  - Screenshots: `laptop-cw5-expansion-63-over-2-before-fix.png`, `laptop-cw5-expansion-after-fix.png`.
- *Where:* `src/components/common/mathSegments.js:175`, `SIMPLE_GROUPED_SLASH_FRACTION`. It strips "redundant" brackets around a simple fraction before stacking, so "6(3/2)" became "63/2". It is used by `MathText`, `QuestionPrompt`, `ReferenceInfoCard` and the worksheet PDF.
- *Why it matters:* The scaffold that is meant to teach row × column showed a sum that is not the product's entry. A student who trusts it computes 63/2 − 11/6.
- *Fix:* the brackets stay when a digit, a decimal point or a ")" touches them (lookbehind and lookahead). "(2/3)x" and "−(3/4)(x − 14)" still lose theirs, as the existing tests require. Test: `tests/platform/mathSegments.test.mjs` "a bracketed fraction a number touches keeps its brackets". It fails without the fix.

**P1-2 — Read aloud dropped "dollars", split ordinals and passed raw "⁻¹" to speech. Fixed in this PR.**
- *Symptom* (the text handed to `speechSynthesis`, captured in the browser):
  - PR 10: "small baskets for 15.75, medium baskets for 25, and large baskets for 32.50. They took in 2,086.25" — no dollars anywhere in a money equation.
  - WU 1: "sold 20, 25, and 50 dollars gas cards".
  - CW 3: "10 points for 1 st, 8 for 2 nd, …" (speech engines read "1 st" as "one street").
  - CW 9: "find X equals A⁻¹ times B", with the "⁻¹" passed to the engine as a raw symbol.
  - Read aloud reads only the prompt, never the matrices themselves (R-6).
- *Where:*
  - `src/platform/language/mathSafeText.js:129`. "$15.75, medium baskets for $" was taken for a LaTeX span, because the rule that keeps "$4 and $5" as prices did not allow a comma or full stop after the amount.
  - `src/platform/language/speechText.js` `speechTextFor`: a number split from its ordinal suffix, and "⁻¹" in prose untouched.
- *Fix:*
  - Prices with list punctuation, and a price closed by the next price, are prose. Real mathematics between dollar signs is unchanged.
  - A number keeps its ordinal suffix.
  - "⁻¹" is spoken "inverse" ("inversa" in Spanish), in prose and in mathematics.
  - Translation masking uses the same splitter, so "medium baskets for" is no longer masked as mathematics.
  - Tests: three new cases in `tests/platform/accessibleMathSpeech.test.mjs`; all three fail without the fix.

**P1-3 — A screen reader named "$20 grocery cards" as "20 grocery cards". Fixed in this PR.**
- *Symptom:* WU 1's "fewest cards" choices had the accessible names "20 grocery cards", "25 grocery cards" and so on: twenty cards, not the $20 card.
- *Where:* `src/MultiAnswerGrader.jsx:29` (`choiceLabel`) stripped any leading or trailing `$` as if it were a TeX delimiter.
- *Fix:* `choiceAccessibleLabel` (`src/platform/interaction/choiceOptions.js`) strips delimiters only when they wrap the whole label ("$\frac{1}{2}$", "\(y \le 4\)"). `MultiAnswerGrader` uses it for both the button and the typeset choice. Test: `tests/platform/choiceAccessibleLabel.test.mjs`, which fails without the fix. Other choice renderers (`FigureMatchStage.jsx`, `PathResponseFields.jsx`, `LiveChallengeFieldQuestion.jsx`) were not audited.

**P1-4 — PR 10 refuses an equivalent model with no reason (hypothesis 6).**
- *Symptom:*
  - Rows 3x + y + 0z = 80 (z = 2x substituted into the count), 63x + 100y + 130z = 8345 (money ×4) and 2x − z = 0.
  - The calculator gives 15, 35, 30; the solution was reported correctly.
  - Row 1 was refused, the score was 86%, and the feedback was "Reconsider: Row 1 of the matrix equation".
  - Screenshot: `laptop-pr10-substitution-model-refused.png`.
- *Where:* `matchEquationRows` (`functions/shared/toolMath/matrixLab/matrixLabModel.mjs:282`) accepts a row only when it is a nonzero multiple of one key equation. That is by design (brief, hypothesis 6).
- *Why it matters:* On a modeling item, where the system is hidden and the student chooses the equations, a system equivalent to the situation is a correct model. A strong student who simplifies first loses credit and is told only to "reconsider", with nothing to fix.
- *How common:* uncommon in a matrix lesson, perhaps one strong student in a class. "Same number" items (PR 11) invite the same move (y = z gives 2y + x = 82 in the count).
- *Suggested fix (R-4):* on `solve` items whose system is hidden (PR 10, PR 11), accept rows whose augmented system has the key's solution set: rank of [key | student] equals rank of key, and the student's A is full rank. Keep the "one multiple of one equation" rule where the system is given (CW 7, CW 8, PR 4), because there the task is to write *that* system. If a refusal stays, say why: "Each row should be one of the situation's three facts, not a combination of them."

**P1-5 — The lab's exit tickets keep their method and call the submission "Check" (M2T2 P1-9, still open).**
- *Symptom:*
  - DOL 1–3 hide Hint and Read aloud.
  - They still offer "How to do this (3 steps)". On DOL 3, whose whole point is reading a singular matrix, step 3 says "If the calculator reports ERR: SINGULAR MATRIX … the system has no solution or infinitely many. Compare the rows to decide which."
  - The single, final submission is labelled "Check the product" / "Check the solution", the same word Classwork and Practice use for a try. There is no confirmation.
  - Screenshots: `laptop-dol1-closed-after-one-submission.png`, `laptop-dol3-no-verdict.png`.
- *Where:* the `TaskCard` in each Matrix Lab view (`src/tools/matrixLab/MatrixLab.jsx:117, 240, 363, 422, 507`), and the `CheckRow` labels (`:186, 302, 370, 485, 532`).
- *Suggested fix:* the M2T2 report's R-10. In `dolMode`, hide the method card and label the action "Submit (one try)".

### P2

- **P2-1 — The work bar covers the feedback.** At 1366×768, right after Check, the floating work bar covers the lower "Reconsider" lines (CW 2). The student must scroll to read why. Screenshot: `laptop-cw2-feedback-under-work-bar.png`.
- **P2-2 — Singular items can be guessed (hypothesis 7).**
  - Three solution types and three tries: after "Reconsider: Number of solutions" a second guess passes. This happened on CW 10 and PR 8.
  - On DOL 3, reading the singular matrix wrongly still scores 75%, because writing A · X = B is 3 of the 4 parts. The A2.3B decision is worth a quarter of the item.
- **P2-3 — One mistake, five "Reconsider" lines.**
  - CW 9 with the missing variable written as 1 gets "Reconsider: Row 1, Row 2, x, y, z".
  - The student's x, y, z are exactly right for the A they wrote. The feedback could say so ("your X follows from your A and B — fix the rows and run it again").
  - Screenshot: `laptop-cw9-missing-variable-as-1.png`.
- **P2-4 — CW 4 doesn't say which figures are wrong.** The whole sorting step turns red ("The red steps above are the specific responses that need revision"). The 75% implies 2 of 8 figures are wrong, but not which two. Screenshot: `laptop-cw4-step-red-no-figure-named.png`.
- **P2-5 — A⁻¹ is graded as one part.**
  - PR 5 with 3.3 / −1.3 / 1.7 gets "Reconsider: The inverse matrix A⁻¹": no cell is named and rounding is not mentioned.
  - The panel asks for "decimals to 4 places", while the grader accepts 3 (3.333 passed).
- **P2-6 — Hints often state the answer.**
  - CW 2 hint 2: "Size 10E: width E is row 3, size 10 is column 1".
  - CW 8 hints 2–3 and PR 4 hints 1–2 give the standard-form equations, which are the rows themselves.
  - PR 10 hint 2: "2x − z = 0".
  - After three tries, the hints have done the item. Screenshot: `laptop-cw2-hint2-gives-a-part.png`.
- **P2-7 — Phone: Check sits under the work bar.**
  - At 390×844 the task card, the tries pill and a four-line "Grade weight ×1.75 · this question counts …" banner take the top 375 px.
  - The workspace scrolls in the remaining 346 px. After typing PR 6's last value, Check is under the work bar (`elementFromPoint` → "↶ Undo").
  - Measured from the task card, Check is 0.9–2.3 phone heights down (PR 5: about 1,940 px). Through a 346 px window, that is five or six swipes.
  - This is the M2T2 report's R-2. Screenshot: `phone-pr6-check-under-work-bar.png`.
- **P2-8 — The calculator sits below the grid it feeds.** In CW 6 and PR 3 the calculator is about 400 px below the fill grid. The student scrolls down to press [G]·[H], then up to copy nine numbers, and a copy slip costs a try (CW 6). This bears on hypothesis 4. Screenshot: `laptop-cw6-calculator-below-grid.png`.
- **P2-9 — 0x + 0y + 0z = 0 is refused with no reason.** In PR 9 the system with that third equation *does* have infinitely many solutions. The refusal is right for the book's task, but "Reconsider" leaves a student who knows that confused.
- **P2-10 — A bare sign costs a try.** A coefficient typed as `-` or `+` alone (a student's "−y") enables Check, is graded wrong and costs a try. The only feedback is "Reconsider: Row 1" (CW 7, `MatrixLab.jsx:359` checks only that a cell is non-empty). Screenshot: `laptop-cw7-sign-only-cells-cost-a-try.png`.
- **P2-11 — A matrix with stacked fractions gets a scrollbar.** Matrix S in CW 5 has two stacked fractions in one column and shows a vertical scrollbar 5 px deep. `MatrixGrid.jsx:107` sets `overflowX: auto`, which makes `overflow-y` compute to auto as well. A likely fix is `overflowY: 'clip'` with a little block padding.
- **P2-12 — The lab's calculator isn't recorded.** It never sets `calculatorUsed`: DOL 2's record says "calculator not used" after `[A]⁻¹·[B]`.
- **P2-13 — Hints push the lab off screen.** At 1366×768 the Hint panel opens above the lab and pushes it below the fold.

### P3

- **Triple-listed feedback.** After a miss, the same parts are listed three times: the tries banner ("still to fix: …"), "Focus on: …" and "Reconsider: …".
- **Awkward negatives in the expansion.** The line reads "+ −1(1/6)"; "+ (−1)(1/6)" reads better.
- **Choices uncheck.** CW 4's `role="radio"` choices uncheck on a second click.
- **Untouched prefill costs a try.** Submitting CW 8's untouched prefill counts as an attempt.
- **Calculator display.** The work-bar calculator's empty display shows "()". The matrix calculator's result is not kept across a reload, although the cells, Yes/No and the solution type are.
- **The bar can hide Check.** When Check is scrolled just into view at the bottom edge, it sits under the sticky work bar (iPad PR 6, 7, 10 and 11; 1920 PR 10). There is no `scroll-padding-bottom`. Keyboard Tab is handled: focus scrolls Check clear.
- **Error read twice.** `ERR: SINGULAR MATRIX` appears in two live regions, so it can be announced twice.
- **Notes repeat the method.** CW 3's Guided Notes repeat the "How to do this" card almost word for word.
- **Grade weight outshines the task.** At 1920 the "Grade weight" banner is set larger and bolder than the task.
- **A doubled "=".** WU 3's details string reads "(−2/3) · (its inverse) ==+1", from the label ending in "=".

## 4. Answer acceptance

| Typed | Expected | Where | Accepted? |
| --- | --- | --- | --- |
| `8,050`, `44,900` | 8050, 44900 | WU 1 | **no** (P0-1) |
| `0.2`, `−1.5` (Unicode minus), `+1` | 1/5, −3/2, 1 | WU 3 | yes (MathLive turns − into -) |
| `7/6`, `−1/3` (Unicode minus), `8.8333`, `+7` | 7/6, −1/3, 53/6, 7 | CW 5 | yes |
| `17.000`, `−23` | 17, −23 | PR 1 | yes |
| Rows reordered, one multiplied by 2, `−1`, `+1` | CW 7's A and B | CW 7 | yes |
| `-` or `+` alone | −1, 1 | CW 7 | no (P2-10) |
| `0` for a missing variable | 0 | CW 9 | yes; blank → calculator error; `1` → wrong |
| `3.3`, `-1.3`, `1.7` | 10/3, −4/3, 5/3 | PR 5 A⁻¹ | no (rounded too early, correct) |
| `3.333`, `-1.333`, `1.667` | same | PR 5 A⁻¹ | yes (the panel asks for 4 places) |
| `10/3`, `-4/3`, `5/3`, `5/2` | same | PR 5 A⁻¹ (touch) | yes |
| `3.5`, `1.5`, `-3/2` | 7/2, 3/2, −3/2 | PR 6 | yes |
| `14.8` | 59/4 | PR 7 | no (correct) |
| `\frac{59}{4}` in a plain cell, `17/2` | 59/4, 17/2 | PR 7 | yes |
| `2,086.25`, `32.50`, `15.75` in A and B | 8345/4 … | PR 10 | yes. `parseCell` reads `2,086.25` as 8345/4, and the calculator and the grader both use it. |
| Money row ×4 `[63, 100, 130 \| 8345]` | multiple of row 2 | PR 10 | yes |
| `3x + y = 80` (substituted) | not a multiple of one fact | PR 10 | **no** (P1-4) |
| `7/2`, `17/2` in A | 3.5, 8.5 | PR 11 | yes |
| Third equation = sum of the given two (6x − y − 2z = −4 / = 5) | many / none | PR 9 | yes (the system's solution type is judged) |
| `0, 0, 0 \| 0` | many | PR 9 | no (P2-9) |
| Choice "3 × 4" read as "3 times 4" | | PR 12 | yes |

## 5. The student experience

Timings are estimates from the number of entries, not stopwatch times: the walk was scripted.

- **Warm-Up (10 min).**
  - Reading the two arrays and adding Nov + Dec is quick. The labelled rows and columns ("$25 cards", "Gas") make the matrix *mean* something before it is notation.
  - The one trap is P0-1: a student who writes money with a comma is told they are wrong.
  - Estimate: 8–10 minutes.
- **Classwork (32 min).**
  - The locate view is the best paper-to-screen gain. Tapping a₃₄ and reading "You chose row 4 (EE), column 3 (11)" turns the transposition mistake into something the student *sees* (hypothesis 5).
  - Lighting the row of A and the column of B for the focused product cell is excellent.
  - CW 3 (20 products) and CW 5 (fraction products) are the slow items.
  - CW 8's "copies equation 1 as it is printed" is the best feedback in the lesson.
  - CW 6's copy of a 3 × 3 product is busywork (P2-8).
  - Estimate: 34–38 minutes, a little over.
- **Practice (36 min).**
  - Most items are quick once the equation view is familiar.
  - PR 5 is the longest: 21 cells, and A⁻¹ copied by hand.
  - PR 10 and PR 11 take the most thought, as they should. The calculator's −345/22 baskets is a good honest cue.
  - PR 12 has one try (choice-only).
  - Estimate: 40–45 minutes, over by about 5–10. PR 5's A⁻¹ copy is the item to trim.
- **DOL (12 min).**
  - Clean: no verdict, one submission, Enter never submits.
  - The method card on DOL 3 tells the student how to decide none or many (P1-5).
  - Estimate: 9–12 minutes.

**Hypotheses, as observed:**
1. **The calculator may do too much — mostly yes.**
   - Once A and B are right, `[A]⁻¹·[B]` prints X in one press. `[A]⁻¹` is optional except on PR 5.
   - The calculator shows only its latest result, so A⁻¹ and X are never on screen together.
   - The thinking that remains is writing A · X = B (well tested, with good diagnoses) and interpreting the singular case.
   - Recording A⁻¹ on every first solve item, or showing the chain "[A]⁻¹ · [B] = X" with A⁻¹ visible, would teach X = A⁻¹B better (R-5).
2. **The fill grid follows the predicted size — a good consequence.**
   - A 4 × 5 grid for a 4 × 1 product is visibly wrong once the student starts filling it: B has no column 3 to light up.
   - The feedback ("Reconsider: Dimensions of A · B" plus the key cells) is enough. It would be better to say "B has 1 column, so A · B does too", once.
3. **The row × column expansion is the right scaffold**, now that its arithmetic is shown correctly (P1-1).
   - It names the products and leaves the adding to the student.
   - Practice has no expansion and no fading. PR 1's hint 2 writes one entry out instead. A faded version (first cell only, or on request) would fit Practice (R-7).
4. **Copying a 3 × 3 product is busywork — yes.**
   - Nine copied numbers, with a scroll between grid and calculator, and a slip costs a try.
   - "Run [G]·[H], then judge" plus one probing cell ("what is row 3, column 2 of GH?") would be better evidence (R-8).
5. **Naming the tapped cell does not give CW 1 away.** It narrates the student's own tap ("row 4 (EE), column 3"), which is exactly the reading the lesson wants. Note that each cell's accessible name ("Row 3, column 4: 7") tells a screen-reader user the indices before any tap.
6. **Modeling rows:** any order and any nonzero multiple are accepted; decimals, fractions and the thousands separator too. The substitution model is refused (P1-4).
7. **Singular systems need a reason, not a button — yes.** Both singular items, and DOL 3, can be passed by a second guess (P2-2). A "compare two rows" helper is worth building: pick two rows, see the multiplier, see whether the constant follows it (R-3).
8. **Phone layout.**
   - Matrix cells are 64×44 px (not 56): comfortable to tap.
   - No sideways scroll on any WU or PR item.
   - Check is 0.9–2.3 phone heights below the task, seen through a 346 px window (P2-7).
   - Cells are `type="text"`, `inputmode="text"`: the full keyboard has minus and slash, which this lesson needs. That is right. The decimal pad would block −3/2.
9. **Read aloud** says the prompt only.
   - WU 1: "…sold 20, 25, and 50 dollars gas cards… recorded them as the two arrays below…"; after this PR, "20 dollars, 25 dollars, and 50 dollars".
   - CW 3: "1 st, 2 nd" (fixed).
   - The matrices are not read aloud at all, though a screen reader gets the hidden table ("Matrix A, 4 by 5", headed rows and columns). Read aloud should offer it (R-6).
10. **The work bar overlays content:**
    - the feedback lines just after Check (P2-1);
    - on a phone, Check after the last value (P2-7);
    - and Check scrolled exactly to the bottom edge (P3).
    
    Focus moves never left the focused control covered: Tab to Check scrolls it clear.

## 6. Platform upgrades, ranked

| # | Concept | What a student would see | Files | Size | Answers |
| --- | --- | --- | --- | --- | --- |
| **R-1** | Every numeric answer | `8,050` is accepted where one number is expected, and a format message appears before a try is spent for anything unreadable (`-` alone, `8 050`). | shared answer comparison, `ordinaryResponseGrading.mjs`, `answerShapeGuard.js`, `MatrixLab.jsx` completeness | S–M | P0-1, P2-10 |
| **R-2** | Every phone tool | A compact phone header (the grade-weight banner folds into the tries pill), and the action row sticks above the work bar. | `MathToolMobileLayout.css`, task-context presentation | S–M | P2-7, hyp. 8, hyp. 10 |
| **R-3** | Singular systems | A "compare two rows" helper: pick two rows, see the multiplier, see whether the constant follows it. "None" or "many" is chosen from that evidence, and the decision part carries real weight. | `MatrixLab.jsx` solve view, `matrixLabModel.mjs` parts and weights | M | P2-2, hyp. 7 |
| **R-4** | Modeling | Hidden-system items accept any system with the situation's solution set; a refused row says why. | `matrixLabModel.mjs` `matchEquationRows`, the solve grader | S–M | P1-4, hyp. 6 |
| **R-5** | Inverses / matrix equations | The calculator keeps a short history, so "[A]⁻¹ =" and "[A]⁻¹·[B] =" stay side by side; first solve items record A⁻¹. | `MatrixCalculator.jsx`, item authoring | S | hyp. 1 |
| **R-6** | Read aloud, every lesson with matrices | "Read the matrices too": Read aloud speaks the hidden table ("Matrix A, 4 by 5. Row Lauren: 3, 1, 0, 0, 0 …"). | `speechText.js`, `MatrixGrid.jsx`, `QuestionPrompt` | S–M | hyp. 9 |
| **R-7** | Multiplication | A fading expansion in Practice: shown for the first focused cell, then on request. | `MatrixLab.jsx` `showExpansion` | S | hyp. 3 |
| **R-8** | Inverses | "Judge only" mode for technology inverse checks: run [G]·[H], answer "inverses?" and one probing cell. | `MatrixLab.jsx` operate view, item schema | S | hyp. 4, P2-8 |
| **R-9** | Every tool exit ticket | DOL hides the method card and labels the action "Submit (one try)" (the M2T2 report's R-10). | `MatrixLab.jsx` `TaskCard` / `CheckRow` in `dolMode` | S | P1-5 |
| **R-10** | Feedback, every tool | One list of what to fix, not three; carried-error recognition ("your X follows from your A"); figure-level marks in figure sorts; cell-level marks in A⁻¹ with "rounded too early". | `QuestionEngine.jsx` feedback, `FigureMatchStage.jsx`, `matrixLabModel.mjs` | M | P2-3, P2-4, P2-5, P3 |
| **R-11** | Hints | A hint lint in Pre-Flight that flags a hint stating a key value or a key row. | Pre-Flight semantic validation | S–M | P2-6 |
| **R-12** | Evidence | Matrix-calculator presses recorded as `calculatorUsed` and listed in the teacher's evidence, which matters on DOL 2–3. | `MatrixCalculator.jsx`, `QuestionEngine.jsx` support usage | S | P2-12 |
| **R-13** | Layout | Matrices with stacked fractions never get a scrollbar; the lab calculator sits beside the grid it feeds on wide screens. | `MatrixGrid.jsx:107`, `MatrixLab.jsx` | S | P2-8, P2-11 |

## 7. Evidence

Screenshots in `docs/qa/screenshots/matrices/`:
- `laptop-wu1-thousands-separator-refused.png`
- `laptop-wu2-slip-names-the-cell.png`
- `laptop-cw1-transposed-taps-feedback.png`
- `laptop-cw2-feedback-under-work-bar.png`
- `laptop-cw2-hint2-gives-a-part.png`
- `laptop-cw3-predicted-4x5-grid.png`
- `laptop-cw3-row-column-expansion.png`
- `laptop-cw3-guided-notes.png`
- `laptop-cw4-step-red-no-figure-named.png`
- `laptop-cw5-expansion-63-over-2-before-fix.png`
- `laptop-cw5-expansion-after-fix.png`
- `laptop-cw6-calculator-below-grid.png`
- `laptop-cw7-sign-only-cells-cost-a-try.png`
- `laptop-cw9-missing-variable-as-1.png`
- `laptop-cw9-enlarged.png`
- `laptop-cw10-singular-read-as-none.png`
- `laptop-pr10-answer-as-model-refused.png`
- `laptop-pr10-substitution-model-refused.png`
- `laptop-pr12-one-try-closed.png`
- `laptop-dol1-closed-after-one-submission.png`
- `laptop-dol3-no-verdict.png`
- `ipad-wu2-after-check.png`
- `ipad-pr5-after-check.png`
- `phone-pr5-after-check.png`
- `phone-pr6-check-under-work-bar.png`
- `phone-pr9-top.png`
- `desktop1920-pr10-top.png`

## 8. Not verified

- **No real session:** no signed-in student and no Firebase. Drafts and verdicts went to the harness, and attempt records to the harness's copy of `recordQuestionAttempt`, not the server. The server re-grade of the Matrix Lab's `toolResponse` was not exercised.
- **Devices:** no physical iPad or phone. Touch was Chrome's emulation, so the on-screen keyboard (and how much of the 346 px window it leaves) was not seen.
- **Not exercised:** Classroom posting, the teacher's view of the evidence, the printed worksheet and the answer-key PDF (the P1-1 fix also reaches the worksheet's prose fractions, through `assignmentWorksheetPdf.js`), and translation.
- **Timing:** estimates only.
- **Other choice renderers:** these may have the same accessible-name problem as P1-3 and were not audited.

## Ride-along changes in this PR

1. **Bracketed fractions** keep their brackets when a number or ")" touches them: `src/components/common/mathSegments.js`, with a test (P1-1).
2. **Read aloud:** price lists, ordinals and "⁻¹": `src/platform/language/mathSafeText.js`, `src/platform/language/speechText.js`, with tests (P1-2).
3. **Choice accessible names** keep a price's "$": `choiceAccessibleLabel` in `src/platform/interaction/choiceOptions.js`, used by `src/MultiAnswerGrader.jsx`, with a test (P1-3).
4. **Harness:** simulated question records and the default Guided Notes setting, in `tests/browser/algebra2MatricesLessonMain.jsx`.
