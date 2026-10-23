# Algebra II Honors — Operations on Polynomials (claude/a2h-operations-on-polynomials-20261022 @ 2589df75, PR #514)

Environment: same harness, 1366×768 and 390×844. 32 questions: WU 3 · CW 11 · PR 15 · DOL 3.
Baseline: check-teacher-import valid, 0 errors, 2 informational warnings (PR 14 SAT-style item not from the audited CCMR bank; all items A2.7B across 3 question types); algebra2OperationsOnPolynomialsLesson.test.mjs 13/13.
Screen of all 32: no unresolved templates, raw LaTeX, undefined/NaN or page errors. F-WEIGHT-BANNER and F-FIRST-SCREEN (see the DOL #2 report) apply here too.
- Note: PR 14's task begins with a literal "[College-Readiness — SAT style]" tag.


## CW 3 — polynomialWorkshop/addSubtract ((2a³ + 5a − 7) − (a³ − 3a + 2))
- OK (strong): negating only the first term → "Check the sign of EVERY opposite, then combine each column." with the exact cells named; first column kept; the right result written as 8a + a³ − 9 (not descending) accepted as simplest form; "✓ Every step and the result are correct."
- F-CELLS-NOT-MARKED (P3): the wrong cells (Opposite of −3a, Opposite of 2, two Combined cells) are not marked on the board; every cell keeps its blue border, so the student maps names from the "Focus on" text.
- F-SPEECH-HYPHEN (P3): the spoken equation reads "plus 5a-7" (hyphen) instead of "5a minus 7".


## CW 5 / PR 1 — typed "simplest form" differences
- OK: an uncombined answer (3x² + 2x − 3 − 4x² − x + 5) → "Equal, but not simplified: multiply out every product and combine like terms."; the other part kept (50% partial credit shown). Term order does not matter: 3 − 6x − 2x², 6b + 3b² − 5 and (Workshop) 8a + a³ − 9 are all accepted.
- F-ONE-COEFF (P1, grading/feedback): −1x² + x + 2 is refused with "Equal, but not simplified: multiply out every product and combine like terms." The student did combine like terms; the only issue is the written coefficient 1. The reason is wrong, and it costs a try (here the second of three). Either accept a written 1, or say "Don't write a coefficient of 1: write −x²".
- Note: the "multiply out every product" part of that message appears on subtraction items with no products.

## CW 10 — polynomialWorkshop/multiplyArea ((a² + 3a − 4)(a + 2))
- OK (strong): cell labels speak the product ("Row 3, column 1: −4 times a"); a sign slip in one cell → "Focus on: Row 3 × column 1 (−4 · a), Product in simplest form" with the other five cells kept; fixed on try 2.
- F-CELLS-NOT-MARKED repeats: the wrong cell (4a) is not marked on the grid.
- F-CELL-MSG (P3): the cell message is "multiply the numbers, add the exponents of the same letter. Then combine like terms." — nothing about signs, which was the error.
- F-DUP-FEEDBACK (P3): the same message shows twice (red bullet box, then "Not quite… Focus on…").

## DOL 2 — area model exit ticket
- OK (strong): "One try on this question", no Hint, one Submit, then "THIS QUESTION IS CLOSED — KEEP GOING" / "Your answer is saved…"; no right/wrong colours; Undo/Reset disabled; record expired 71% (5 of 7).
- Cosmetic: after closing, the tool shows a disabled "Check area model" button.

## Phone 390×844 (all 32)
- F-ADDSUB-PHONE-OVERFLOW (P1, tool/layout): the Add & Subtract Workshop on PR 6 (436 px) and DOL 1 (480 px) is wider than a 390 px phone, and the page clips instead of scrolling (html/body overflow-x: clip). The right side of the task sentence, the expression being subtracted, the second column ("x² terms"), the banners and the work bar's Calculator are cut off with no way to reach them. DOL 1 is the one-try exit ticket. CW 3/CW 4 (three columns) fit; the four-column items do not. Input placeholders truncate ("opposit…", "term or…").
- Every other item: no overflow; Submit reachable.
- Note: DOL 1 shows both the Exit ticket banner and "Grade weight ×1.75".
