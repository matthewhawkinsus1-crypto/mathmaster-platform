# Algebra I — DOL #3 Review (claude/trusting-edison-g8e7m1 @ 51da4f81) — student walkthrough

Environment: harness tests/browser/lessonWalkthrough.html (teacher-import chain → real QuestionEngine, App's props incl. activityPolicy, record via recordQuestionAttempt). Chrome headless (new), 1366×768. Emoji show as boxes (no emoji font in this Linux) — artifact, not logged.
Baseline: check-teacher-import valid, 0 errors, 0 warnings; algebra1Dol3Review.test.mjs 20/20.

## PR 1 — functionCharacteristics (domain/range from a graph)
- OK: wrong range (0≤y≤80) marked wrong, domain kept; tries bar "2 of 3 tries left · 50% partial credit so far · still to fix: State the range"; right answer → "Correct! This question is complete", Next Question PR 2, Enter shortcut.
- F-HINT-2STEP (P3, platform): after a wrong try, "Show a hint" in the bottom card opens a chooser panel at the TOP of the question ("A hint points you at the next move… [Show a hint] [Try a similar one]") — a second click, away from where the student clicked. On a fresh question one click shows hint 1 directly (verified on a new run).
- F-GENERIC-FEEDBACK (P2, content/platform): the authored common error (range 0 ≤ y ≤ 80; solutionReview.commonError explains "battery never drops below 20%") gets only "Not quite. You have 2 tries left. The red steps above are the specific responses that need revision." No targeted message on the attempt.
- Note: typed "<=" stays "<=" in the field (shown as "< ="); accepted by the grader. Cosmetic.

## PR 2 — relationshipModel (popcorn: quantities → equation → table → classify → graph → domain → range)
- F-STEP-TABS-CLIP (P2, platform): at 1366×768 the step tab strip overflows with a scrollbar; the active tab is clipped ("5. Buil…", "5. Bu…") and the strip does not scroll the active tab into view.
- F-STEPCOUNT-JUMP (P2, platform): steps read "1 of 5 … 4 of 5", then after Classify the count becomes "5 of 7" (domain and range appear). The student thinks they are nearly done.
- F-CLASSIFY-NO-PROMPT (P3): Step 4 card shows only "Built from your answer to Complete the table" + [discrete] [continuous]; the question ("Should this relationship be represented as discrete points or as a continuous graph?") is only in the CURRENT QUESTION header, scrolled off-screen.
- F-KEYPAD-GENERIC (P3, platform): the equation step's keypad offers x y t n M V C ( ) f(x) g(x) π e logₐ √ ⁿ√ x² xⁿ |x| a/b — mostly noise for f(x) = 6x in Algebra I.
- F-GRAPH-5-OF-6 (P1, platform): the table has 6 rows (x = 0…5) but the graph step lists only P1–P5 (x = 0…4); (5, 30) cannot be placed. "All point placements are correct" is shown with 5 of 6, the graph part grades correct, and the later "Your checked graph" panel shows 6 points including (5, 30), which the student never placed.
- F-GRAPH-CONTINUOUS-CREDIT (P1, grading): with Classify = continuous, the student's connected line through 5 points graded graph:true (consistent-with-own-table rule) although the right graph is 6 separate points. After switching to discrete the graph keeps "✓ Checked correct" and the screen-reader text still says "Your curve is drawn through your points" (stale).
- F-CASCADE-SILENT (P2, platform): on the continuous attempt, continuity, domain and range were all graded wrong (domain/range are graded as the continuous variants, so the right range set {0,…,30} counted wrong), but the screen said "1 step needs attention: Step 4 Classify" only. Changing Classify clears the typed domain/range (new set-notation fields), so the student retypes them. Reasonable, but nothing says why.
- F-PLACE-NEEDS-SELECT (P3): "Place at this coordinate" does nothing until a point (P1…) is selected first; nothing says so. The x / y number boxes have no accessible names.
- F-A11Y-64-PATHS (P3): screen-reader summary of the connected graph reads "64 connected paths. 6 points."
- OK: Model-so-far panel; red/amber/green step states; domain/range fields switch to set notation (keypad { } , ∅) once Classify = discrete; domain without 0 marked wrong; final right → Correct (3 tries).

## PR 3 — linearTableWorkbench/deriveEquation (prove constant rate, write y = mx + b)
- F-DUP-CONTROLS (P2, platform): the tool has its own ↶ Undo / ↷ Redo / Start over / Submit row, and the page's work bar has ↶ Undo / ↺ Reset Question / Scratchpad / Calculator / Hint — two Undo buttons and two resets ("Start over" vs "Reset Question") on one screen.
- F-MISDIAGNOSIS (P1, feedback): the authored common error (rate = Δy, ignoring Δx = 4) got "Where to check: Check Row 1 → Row 2: rate of change. Recheck subtraction order and signs before changing anything else." The subtraction and signs were right; the mistake is not dividing by Δx. The lesson's own commonError/hint 2 say exactly this but are not used. Misleading advice.
- OK: intervals record without judgment until Submit; Edit/Remove/Restore work; 3/2, 1.5, "y = 1.5x - 1" all accepted; partial parts graded (evidenceCount, evidenceAccuracy, classification, slope, intercept, equation); "This is the same answer as your last try" warning.


## PR 4 — representationBridge/linearMultipleRepresentations (rideshare: facts → meanings → equation → graph)
- OK (strong): swapped rate/initial value got a targeted message on Check ("That is an amount, not a change. The rate of change is how much it changes for each step of x."); in-tool Checks do not use a try; verified facts unlock the equation and graph; meanings dropdowns checked per field; Submit checks consistency across representations; correct on the first submission, 9 parts.
- F-GRAPH-2-LABEL (P3): the only graph is titled "Graph 2 · Slope-intercept method" — there is no Graph 1.
- F-REPEATED-UNLOCK (P3): "Find the rate of change / Find the initial value" buttons appear three times (What I know, the locked equation, the locked graph).
- F-CONTEXT-WINDOW (P3, content): the rideshare graph is an unlabeled −8…8 four-quadrant grid; the line runs into negative miles and negative dollars. A context graph should label x (miles) and y (dollars) and show the meaningful quadrant.
- Note: the plotted point's coordinates show twice (bubble "(1, 5)" and label "(1, 5)").


## PR 5 — linearTableWorkbench/constantRate (kayak rental, uneven x-steps)
- F-MISDIAGNOSIS repeats (P1): rates 24, 12, 36 (Δy only) → "Not a constant rate": feedback again says "Recheck subtraction order and signs". Here the mistake flips the conclusion (linear → nonlinear), and the advice points away from the fix (divide by Δx; the hours jump 2, 1, 3).
- OK: axis meanings shown (x: Rental time (hours), y: Total cost (dollars)); fixed by Edit → correct on try 2.


## PR 6 — representationBridge (Jordan walking home; given a graph)
- OK (strong): rise +3 on Check → "Check the direction of the rise: moving up is positive, moving down is negative."; tap-two-points rise/run with labelled axes; y-intercept tapped on the graph; correct on the first submission.
- F-MEANING-NO-REASON (P3): a wrong meaning ("3 miles farther from home each hour") gets only "Take another look" — no pointer to the distance going down.
- F-GRID-2 (P3, content): y gridlines every 2 while the y-intercept is 9 and the points (0, 9), (2, 3) sit between gridlines; hint 1 tells students to use grid intersections, and only (1, 6) and (3, 0) are on them.
- Note: the slope field is labelled just "m"; an empty m gives "Enter just a number: a whole number, a fraction or a decimal." — fine, but it reads as if the typed rise/run were wrong.
- Note: "Other ways, once you know more: Use the slope and a point (needs a point on the line)" is shown although the student already verified the slope and the graph shows points.


## PR 7 — representationBridge (3x − 4y = 24: intercepts, slope, graph by intercepts)
- OK (strong): guided intercept method ("At the y-intercept, which variable is 0?" → embedded balanced solve → ordered pair); (−6, 0) for the y-intercept → "A y-intercept is on the y-axis, so its x-coordinate is 0."; slope formula fed by the verified intercepts; correct on the first submission.
- F-HEAVY-STEPS (P2, design): each intercept is ~10 actions (method → variable → divide → cancel → simplify → type ordered pair → Check). In a 13-item review where every item is a multi-part board, this is a lot of clicking for DOK 2 facts; consider letting a student type the intercept directly once the method is chosen, with the full solve as the fallback after a miss.
- Note: the embedded solver accepts ÷4 (valid algebra), so the authored error (y = 6) only shows at the ordered-pair step.
- F-CHECK-MSG (P3): pressing Check with an empty ordered-pair box says "Choose a point first." — the box is typed, not chosen.
- Note: the prompt mentions "the zero of the function"; the board never asks for it by that name.


## PR 8 — functionCharacteristics (tank: x-intercept, zero, y-intercept)
- F-SMALL-SIDE-GRAPH (P1, platform): on the yes/no and typed steps the graph sits in a ~280 px side panel ("Graph for this question") with ~6 px tick labels; the student must read 48 gallons from labels at 10, 20 … 50 and 4-gallon gridlines. (The marking steps show the graph full width, 1024 px.) Same tool in PR 1 showed the graph full width. The screen-reader description says "marked every 4 gallons"; the visible labels are every 10.
- F-STEP-NAMES (P3): tabs read "1. Classify", "2. Classify" (later "Locate the feature", "State the coordinates", "Write the values") — two identical "Classify" names for x- and y-intercept questions.
- F-STEPCOUNT-JUMP repeats: "1 of 2" → "… of 7" after the first Yes.
- F-GENERIC-FEEDBACK repeats: zero = 48 (the authored mix-up of zero and y-intercept) → only "1 step needs attention"; the authored explanation is not used.
- OK: marking intercepts on a full-width graph; ordered pairs; correct on try 2.


## PR 9 — representationBridge (two points → slope, point-slope, slope-intercept, standard)
- OK (strong): mismatched subtraction order → "Keep the order: y₂ and x₂ come from the same point, and y₁ and x₁ from the other."; −3x − 2y = −8 → "Standard form needs a positive leading coefficient … Multiply every term by −1."; y-intercept by slope-and-a-point; correct on the first submission with the cross-representation check.
- F-A11Y-POINT-CHIPS (P3): point chips have no accessible name of their own; the computed name is "(-2, 7)the point negative 2, 7" (visual and spoken text run together).


## PR 10 — openSortBoard (causation vs association)
- F-SORT-FEEDBACK (P2): ice cream/sunburns sorted as causation → "Your cards do not yet form one of the valid mathematical partitions for this set. Look for a characteristic that is true for every card…" — jargon ("valid mathematical partitions") for Algebra I, shown twice (panel and feedback), and silent on the actual idea (a lurking variable: hot weather). The authored commonError/hints 2–3 say exactly that.
- F-SORT-HIDDEN-TEXT (P2): once placed, a card shows only "Card A ↩" and the "Cards to sort" column is empty, so the student cannot see a card's text while checking their groups (must take it out to read it).
- F-RATIONALE-LENGTH (P3): "Name each group and explain how you decided" — names and explanations are checked for length only (≥ 12 characters) yet appear as correct parts; any 12 characters pass. Teacher reads them, but the student is told it is right.
- F-MULTI-SORT-BADGE (P3): header badge "Multiple valid sorts" on an item with exactly one valid sort.
- Cosmetic: the explanation boxes use a monospace font; the counter reads "12/12 characters needed before checking" after a full sentence.
- OK: correct on try 2 after moving Card B.


## PR 11 — dataModelingLab/lineFit (study hours vs quiz score)
- F-DML-KEY-LEAK (P1): after the FIRST wrong submission (2 tries left) the feedback shows "Reference after submit: linear regression y ≈ 6.13x + 54.9" — the model the item asks the student to produce. The prediction can then be computed without running regression.
- F-DML-QUADRATIC (P1, content/tool): the same line says "best candidate by RMSE: Quadratic." on an Algebra I linear-regression item (the lesson teaches the linear model).
- F-DML-PREFIT (P2): the "estimate a line of best fit by moving the slope and the intercept yourself" step starts at y = 5.3x + 51.4, already close to the fit; a student can skip estimating entirely.
- F-DML-FLOAT (P2): "Your estimate was y = 5.33333333333x + 51.4" (unrounded float; the stepper had shown 5.3).
- F-DML-OVERLAP (P2, layout 1366): the slope card's "+" button is cut off by the intercept card.
- F-DML-JARGON (P3): "Current MAE: 5.9 · RMSE: 6.38" shown to Algebra I students; the prediction input has no accessible name.
- Note: stepper shows slope 6.1 while the regression line reads 6.133; prediction tolerance ±2 absorbs it.
- OK: hand-fit prediction (70) graded wrong on fit and prediction ("Still to fix: the fitted function; the requested prediction"); after regression, 76 correct.


## PR 12 — openSortBoard (function or not: words, tables, graphs, equations)
- F-CIRCLE-HALVES (P2, tool): Card E (the circle x² + y² = 16) is drawn as a solid blue upper half and a dashed red lower half — reads as two different relations (or an excluded part), and gives away the two-outputs idea.
- F-SORT-FEEDBACK repeats: Card D (repeated outputs) placed with non-functions while the student's own rule ("Each input has exactly one output.") was right → same "valid mathematical partitions" message; the authored commonError ("a function may repeat outputs") is the exact help needed.
- F-SORT-HIDDEN-TEXT matters more here: placed table/graph cards collapse to "Card C ↩", hiding the table or graph being judged.
- F-PLACEHOLDER (P3): explanation boxes say "Describe the graph characteristic you used." though most cards are words, tables or equations.
- Cosmetic: small card graphs have tick labels colliding at the origin ("-2 -2", "0").
- OK: correct on try 2.


## PR 13 — sequenceExplorer/fullBridge (f(1) = −7, f(n) = f(n−1) + 4)
- F-SEQ-FEEDBACK (P2): terms −7, 6, 7, 8, 9, 10 (adding 4 to n) → "Keep every representation consistent: n is the table/graph input, the plotted points must match the table, and both rules must generate those same outputs." The student's points did match the table; the error is not applying the rule to the previous term. The message also mentions "both rules" though this item has no rule fields.
- F-SEQ-CLIP (P2, layout 1366): the sixth output box (a₆) is cut off at the right edge of the table panel.
- F-A11Y (P3): the "Common difference" input has no accessible name.
- OK: 50% partial credit shown with "still to fix: Table of (n, aₙ), Discrete graph"; Clear graph; correct on try 2.


## Across the assignment
- Read aloud (speech text captured): PR 13 reads f(n) = f(n − 1) + 4 as "f of the quantity n minus 1 plus 4" (ambiguous: f(n − 1 + 4)?) and passes "aₙ" to the speech engine as a raw subscript character; PR 3's table rows are not read. PR 1 fine.
- Reload mid-board (PR 4): verified facts (2 of 8) and chosen meanings survive a reload.
- Phone 390×844 (all 13): no sideways page scroll; Submit reachable on all 13; inner scrollers only for the step tabs (PR 2, PR 8) and the sequence table (PR 13).
- F-PHONE-CHROME (P2, platform): on a phone the sticky task card (7 lines here), the tries bar and the two-row work bar (Undo/Reset/Scratchpad, Calculator/Hint) take ~55% of the 844 px screen, leaving ~390 px for the work. "Minimize ▲" exists on the task card.
- Practice policy: 3 tries; hints never lower the grade; full credit when right on a later try (practice).
