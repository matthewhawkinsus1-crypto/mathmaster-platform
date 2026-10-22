# Algebra II Honors — Dividing Polynomials (claude/determined-hawking-m81z7h @ 0ef8b7f0)

Environment: same harness, 1366×768 and 390×844. 33 questions: WU 3 · CW 11 · PR 16 · DOL 3. Branch sits on top of Operations on Polynomials.
Baseline: check-teacher-import valid, 0 errors, 0 warnings; algebra2DividingPolynomialsLesson.test.mjs 15/15. Screen of all 33: clean (no unresolved templates, raw LaTeX, bad values or page errors). F-WEIGHT-BANNER / F-FIRST-SCREEN apply.

## CW 3 — polynomialWorkshop/longDivision ((x² − 2x − 15) ÷ (x − 5))
- OK (strong): the division bracket fills in vertically as the student types (quotient on top, product under the dividend, difference below) — the paper layout, built from the Round cards. A Round 1 subtraction slip → wrong boxes marked red + "The boxes marked in red are not right yet. Start with the first one: every later step depends on it."; fixed on try 2 ("✓ Every round, the quotient and the remainder are right.").
- F-PLACEHOLDER-CLIP (P3): "next quotient ter…" — placeholders cut off in the round boxes.
- F-SPEECH-HYPHEN repeats: "Your answer: x-7 minus the fraction 50 over x minus 5".

## CW 5 / DOL 2 — missing terms
- F-PLACEHOLDER-GIVEN (P2, assessment): the bracket inserts the 0-coefficient placeholder automatically ("A 0 holds the place of each missing power, as on paper.") — CW 5 shows "+0x²", and the DOL 2 exit ticket shows "+0x" for (2x³ − 5x² + 7) ÷ (x − 3). Fine as Classwork support, but the exit ticket then cannot show whether a student knows to hold the place of a missing power (a classic A2.7C error). CW 5's task text also tells the student to write it.

## CW 9 — polynomialWorkshop/syntheticDivision ((x² + 8x + 7) ÷ (x + 1))
- OK: r = 1 (sign error) → r box flagged first, later columns red, "Start with the first one: every later column depends on it."; the r box is labelled "r: the divisor is x minus r"; correct on try 2.
- F-R-SIGN-MSG (P3): nothing says "x + 1 = x − (−1), so r = −1" — the most common synthetic-division error gets only the generic red-boxes message.

## CW 10 — synthetic division with divisor 2y − 1
- F-ALT-METHOD (P2, grading): the item accepts only "divide numerator and divisor by 2 first". The common textbook alternative — synthetic division with the original coefficients and r = ½, then divide the bottom row by 2 — reaches the right quotient (2y² − 2y + 1) but scores 29% with "Not quite" and a red grid. The task text does prescribe dividing first, but the feedback never says so; the student loses tries without being told the method is the issue.

## Phone 390×844 (all 33)
- No page-level overflow on any item; Submit reachable on all.
- F-SYNTH-PHONE-SCROLL (P2): the synthetic-division grid with five coefficients (DOL 3, the one-try exit ticket; also PR 4, PR 15) is wider than the phone and scrolls sideways inside its own box; the last column — including the boxed remainder — and the end of the expression ("÷ (x +") are off-screen until the student finds that inner scroll.
- F-BRACKET-PHONE-GARBLED (P2): PR 14 (Honors, divisor y² + y − 5): on a phone the divisor overlaps the dividend inside the bracket ("y² ⟌ + y −y⁴5 −3y³…"); at 1366 it renders correctly.
- Placeholders cut ("next quotier…") as at 1366.
