# Algebra II Honors — District DOL #2 Review (claude/funny-hawking-713zyn @ d6a4a8dd) — student walkthrough

Environment: same harness (teacher-import chain → QuestionEngine with App's props), 1366×768. 40 questions: WU 4 · CW 11 · PR 18 · DOL 7. Per-student template values (e.g. this run: g(x) = −3|x − 3| − 3).
Baseline: check-teacher-import valid, 0 errors, 0 warnings; algebra2HonorsDol2Review.test.mjs 11/11.
Screen of all 40 (1366, first screen + contact sheets): no unresolved {{templates}}, no raw LaTeX, no undefined/NaN, no page errors. Dollar amounts ("$10 … $8") render as text, not math.

## Across the assignment (screen)
- F-WEIGHT-BANNER (P2, platform/content): almost every item shows a two-line blue banner "Grade weight ×1.75 · this question counts 1.75 times a standard-weight question in this section's grade and in the assignment grade." Weights ×1.5, ×1.75, ×2, ×2.25, ×2.5, ×2.75, ×3.5. Decimal weights mean little to a student, and the banner sits above the work on every item.
- F-FIRST-SCREEN (P2, platform): at 1366×768 the first screen is header — task card, Learning goal, tries bar, weight banner, Guided Notes bar — and the tool begins ~580 px down, just above the floating work bar. Nearly every item needs a scroll before any work is visible.
- F-TASK-NO-EQUATION (P3, content): WU 3, PR 7, PR 8, DOL 4 say only "Solve the equation." / "Solve the inequality…" in the task card; the equation appears only inside the solver (CW 6–8 state it). Read aloud of the task reads no equation.
- F-MATH-PERIOD (P3, rendering): a sentence-ending period after inline math renders as a raised dot ("= d·", "graph of g·", "− 4·") — reads like multiplication.
- OK: DOL section shows "One try on this question", "Exit ticket · this question counts toward today's exit ticket grade", Submit "your only try", no Hint button.

## WU 1 — multiAnswer (key attributes of g(x) = a|x − h| + k)
- OK: vertex sign slip and an inequality for the range → both marked wrong, axis and y-intercept kept ("2 of 4 parts right — still to fix: Vertex, Range"); right on try 2.
- F-FORMAT-FEEDBACK (P3): "y ≤ −3" where interval notation is asked gets only "Focus on: Range (interval notation)" — nothing says the value is right but the form is not.
- F-KEYPAD-GENERIC repeats: axis-of-symmetry and range keypads include π, e, logₐ, √, ⁿ√, x², xⁿ, |x|.

## WU 2 — transformationsLab/pointMap (image of (−2, 2) under g(x) = 2|x − 2| − 4)
- OK (strong): (−4, 0) → "The y-coordinate is right. The x-coordinate is not: only h moves a point horizontally."; right on try 2.
- F-BRIDGE-OPEN (P2, content/tool): the "Transformation bridge" panel is open on a Warm-Up retrieval item and states the answer rule: "A parent point (x, y) maps to (x/b + h, ay + k)." (plus the slogan "X's lie; Y's tell the truth.").
- F-SPEECH-ABS (P2, a11y): the task's spoken text reads g(x) = 2|x − 2| − 4 as "g of x equals 2 the absolute value of x minus 2 minus 4" — no "times", and no end of the absolute value. Every |…| prompt is affected.
- F-A11Y: the Transformed x / Transformed y inputs have no accessible names.


## WU 3 — stepAlgebra (|x − 2| + 4 = 13; another student got |x − 7| + 2 = 7)
- OK: splitting before isolating (Other operations → Reverse absolute value → Two branches) is refused: "An isolated absolute-value expression is required."
- F-PLACEMENT-HIDDEN (not an issue: students are taught to drag the value onto each side — owner, 2026-10-22; was P1, platform — this solver is used by WU 3, CW 6–8, PR 7–10, PR 18, DOL 4–5): after choosing Subtract and typing the value, "Commit step" stays disabled. The solver needs the operation placed on a term of each side (click a term → placement menu), but the only guidance is "Place the balanced operation on both sides."; the terms show no target cue, and nothing says why Commit is disabled. Tab/Enter do not help. I could not commit the first step from the visible guidance alone.
- F-REVERSE-WORDING (P3): the split prompt reads "Choose the equivalent structure yourself. Then enter the split bounds and relation symbols MathMaster should check." — dense for a Warm-Up; options "Two branches (OR)" / "Three-part compound (AND)".


## DOL 1 — multiAnswer exit ticket (one try)
- OK (strong): one submission; afterwards "THIS QUESTION IS CLOSED — KEEP GOING" / "Response submitted · Feedback opens later" / "Your answer is saved. You will see whether it is right when this activity's results open."; no right/wrong colours; Undo and Reset disabled; fields refuse typing; Submit stays gone after a reload; record expired with 67% (2 of 3 parts) for the teacher.


## CW 4 — transformationsLab/describe (g(x) = |½(x − 4)| − 1)
- OK (strong): the equivalent description "vertical compression ½, horizontal unchanged" (since |½(x − 4)| = ½|x − 4|) is accepted, all 10 parts — a correct alternative is not refused.
- F-BRIDGE-OPEN repeats (the mapping rule is open beside the item).


## CW 5 — multiAnswer (formulate |c − 69| = 1 and |x + 2| = 5)
- OK (strong): equivalent forms not in the key are accepted: "1 = |c − 69|" and the literal "|x − (−2)| = 5".


## Phone 390×844 (all 40)
- No sideways page scroll on any item; Submit reachable on every item that shows one. Step Algebra (WU 3, CW 6–8, PR 7–10, PR 18, DOL 4–5) and Systems Workspace (CW 10, PR 16) show no Submit until the work is done — by design.
- F-PHONE-WEIGHT (P2): the Grade weight banner wraps to 4 lines (~150 px) above the work on a phone.
- F-PHONE-NESTED-SCROLL (P3): the task card scrolls inside its own box (with Learning goal and Support tools inside it), under the page scroll — two scrollbars on one screen.
- F-MATRIX-6PX (P3): the Matrix Lab panel is 6 px wider than its container at 390 px (254/260), so it shows a horizontal scrollbar for 6 px (CW 9, CW 11, PR 14, PR 17, DOL 7).


## CW 11 — matrixLab/solve (error analysis: Marcus's prefilled matrix equation)
- OK (strong): A and B arrive prefilled with Marcus's two wrong rows, as the task says. Submitting them unchanged does not use a try: "This is the matrix equation as it was given. Change what needs fixing, or press Submit again if it is right as it is." Submit stays disabled until x, y and z are all filled.

## Not walked in depth here (covered by their own walkthroughs/gates)
- Matrix Lab solve items (CW 9, PR 14, PR 17, DOL 7) — the Matrix Lab had a full walkthrough (docs/qa/algebra2-matrices-student-walkthrough.md).
- Systems Workspace (CW 10, PR 16) — Day 1/Day 2 3×3 journeys cover it (tests/browser/day1SystemsJourney.mjs, day2NonuniqueJourneys.mjs).
- Remaining Step Algebra items share the WU 3 solver (F-PLACEMENT-HIDDEN).
- Function Characteristics CW 1 / PR 1 (9 steps; three tabs named "Classify") — same tool as DOL #3 PR 8 (F-STEP-NAMES, F-SMALL-SIDE-GRAPH apply).

