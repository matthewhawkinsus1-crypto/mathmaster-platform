# Algebra II Honors module 2, the matrices lesson and the District DOL 2 review: student walkthrough

**Environment.** Branch `helper/walk-a2h-m2-matrices`, from `8fbf9bbf`. The lesson harness
(`docs/qa/2026-10-22-walkthroughs/harness`) with the family context the 2026-10-23 walk added: each lesson goes through
the teacher-import chain and mounts the real QuestionEngine with App.jsx's record, policy, Guided Notes, Exit Ticket
mode, generation key and `buildStudentFamilyContext`. Headless Chromium at 1366×768 and 390×844 (the phone with touch).

| Lesson | File | Questions |
|---|---|---|
| Operations on Polynomials | `algebra2-honors-module2/L1_Operations_on_Polynomials.json` | 32: WU 3, CW 11, PR 15, DOL 3 |
| Dividing Polynomials (**log only**: open PR #540 changes this file) | `algebra2-honors-module2/L2_Dividing_Polynomials.json` | 33: WU 3, CW 11, PR 16, DOL 3 |
| Solving Systems with Matrices | `algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json` | 28: WU 3, CW 10, PR 12, DOL 3 |
| District DOL 2 review | `algebra2-honors-dol2/District_DOL2_Absolute_Value_and_3x3_Systems_Review.json`, built by `scripts/content/build_algebra2_honors_dol2_review.py` | 40: WU 4, CW 11, PR 18, DOL 7 |

**Priorities**, as in the earlier walkthroughs: **P1** blocks or misleads a student, or grades wrongly. **P2** costs a
student time or understanding. **P3** is polish.

## What was done

- **Keys, by hand, for every static item** (the four lessons' fixed numbers): each key, choice, worked step, hint and
  back-up step was worked out again from the item's own numbers. The keys the tools compute were read from the tools'
  own key builders and compared with the same hand work: all 24 Polynomial Workshop items (the add/subtract columns,
  the area-model cells and product, every long-division round and synthetic-division row, quotient and remainder) and
  all 26 Matrix Lab items (dimensions, element positions, products, inverse decisions, A and B, A⁻¹, the solutions and
  the singular decisions). **Every key is right.**
- **Every generated version of the review.** The review's 29 Question Families were walked through every valid tuple
  of their parameters, 443,378 versions in all (`matrices.solveSystem3x3` v2 over its whole 400 × 400 seed grid). For
  each version the key was computed here from what the student reads (the function in the prompt, the equations, the
  story's numbers), not from the template, and graded by the production graders (field matcher, Transformations Lab,
  Matrix Lab). **0 keys wrong.** The same pass read every version's text for unfilled templates, stacked signs, a
  coefficient 1 or 0 written out and arithmetic that does not hold (below), and found 0 problems; reading each family's
  prose by hand found F1 and F2.
- **The matrices Warm-Up 1's Recovery** (version 2 of `matrices.arrayRecordTotals`, from Recovery's identity-only
  source): 400 versions, keys recomputed from the arrays: right in all of them, with the rewritten choices.
- **Every "=" a student reads.** A checker splits each text into "a = b = c" chains of pure arithmetic and evaluates
  them (2,067 static texts and every version above). It was first shown to catch planted errors (`|−3| − 3 = 1`,
  `6 + 40 + 24 = 71`, a wrong remainder in a synthetic row). No arithmetic error in any lesson.
- **Right answers in other spellings.** All 90 typed boxes of the static items, through the field grader a student's
  answer goes through (`gradeMultiAnswerResponse`), with the grader-spellings library's spellings plus money
  (`$3,500`, `$27.10`), fractions as decimals or mixed numbers (`-1.5`, `-1 1/2`), reversed sums (`165 + x`,
  `-y + 180`) and swapped sides of an equation (`1 = |c - 69|`). None refused, except a whole answer in brackets on a
  box that asks for simplest form, which the lesson defines as having no parentheses. The Matrix Lab's solve items take
  their solutions as fractions or decimals (`59/4` or `14.75`).
- **"Practise one like this".** Only the review offers one (CW 1, CW 6, CW 10, PR 1). The first two siblings of each
  were worked by hand: keys and steps right.
- **Screen pass**, every question at both sizes (266 renders), and **Read aloud** over 2,697 texts: below.
- **Interactive pass:** a wrong try, then a right one, on every tool and mode of the four lessons except the review's
  multi-step workspaces (table below).

## Fixed

### F1 (P2, wrong worked step; review PR 16): "z has coefficient ±1 in every equation"
PR 16 (Systems Workspace, the student's choice of method) shows, after it closes, a worked solution whose first step
said "z has coefficient ±1 in every equation, so eliminating z is efficient: add equations 1 and 3, and add equation 1
to equation 2 after scaling". Equation 2 is `a2·x − y + c2·z = d2` with c2 = −2, 2 or 3, so the claim is false in
every one of the 214,528 versions: a student comparing it with "−3x − y − 2z = 18" in front of them reads a step that
contradicts the system.
- **Now:** "z has coefficient −1 in equation 1 and 1 in equation 3, so adding those two equations eliminates z.
  Adding c2 times equation 1 to equation 2 eliminates it again", with the version's own c2 ("Adding -2 times
  equation 1 to equation 2…"). Built from `scripts/content/build_algebra2_honors_dol2_review.py`.
- **Test:** `algebra2HonorsDol2Review.test.mjs`, "Practice 16: what the worked step says about eliminating z is true of
  every version's equations". Every coefficient or combination the step names is checked against each sampled
  version's equations, and the step must name one. Mutation-checked: the old sentence fails in all 120 versions read;
  a wrong multiple ("Adding 2 times…") fails in the 101 where c2 ≠ 2.
- **Commit:** `933b6567`. **Reaches students** when the review is imported again.

### F2 (P3, typo; review PR 1): "each 1 units from the axis"
PR 1's worked solution said the x-intercepts were "each {d} units from the axis", which reads "each 1 units" in the 22
of its 93 versions with d = 1.
- **Now:** "are each a distance of {d} from the axis".
- **Test:** the same file, "versions: no text a student reads puts a count of one before a plural noun", over every
  sampled version of every item. Its one exception is the exit ticket's DOL 2 (below, logged), and the test fails
  once that exception is no longer needed. Mutation-checked: the old sentence fails in exactly the 22 versions.
- **Commit:** `933b6567` (the same builder and the same kind of check as F1).

### F3 (P2, misleading feedback; review PR 3): every miss was told "Check the sign of a"
PR 3 (Transformations Lab, identify a, h and k from a graph) has no slip the lab names, so on a miss the student reads
the item's authored feedback, then "Focus on" the box. It said "Check the sign of a: a V that opens downward has a
negative a." on every miss. In the walk, with a right and h's sign wrong (version 0: y = −2|x − 2| + 4, h typed −2), it
read **"Check the sign of a: a V that opens downward has a negative a. Focus on: h."**, on an item whose own common
error is h's sign, and in the half of the versions where the V opens upward it speaks of a downward V.
- **Now:** "Check each value against the graph: the vertex is (h, k), and a is how far the graph rises or falls one
  unit right of the vertex, negative when the V opens downward."
- **Test:** the same file, "Practice 3: a miss on a, h or k alone is told about the value missed". For each sampled
  version it misses one value at a time, grades with the Transformations Lab and reads the message through the
  screen's `missFeedback`. Mutation-checked: the old sentence fails for 240 single misses (h and k in all 120).
- **Commit:** `0d712151`. In the browser the same miss now reads the new sentence, then "Focus on: h."

## Logged: Warm-Up and exit-ticket items (not edited)

| Where | What a student meets | Severity | The fix I would make |
|---|---|---|---|
| Review DOL 2 (transformations, one try) | In the 30 of 90 versions where h or K is 1, the four choices say "shifted 1 units right" or "1 units down". | P3 | "1 unit" for a count of one. One of the choices is the key, and a re-import that renames a key can mark saved right answers wrong (handoff section 5): an exit ticket's key is the owner's to change. |
| Dividing Polynomials WU 1 (log only, #540) | The common error ends "— the textbook's choice A on Exercise 49". The student has no textbook choice A, and meets Exercise 49 later, in PR 7. | P3 | Drop the reference: "Dividing the exponents instead of subtracting them: x⁵ ÷ x² is x³." |

## Logged: Dividing Polynomials (open PR #540 changes this file; nothing edited)

Every key in the 33 questions is right, the tool keys included (each long-division round and synthetic row checked).
The choices rewritten on this branch are each wrong in one way, as intended.

| Where | What a student meets | Severity | The fix I would make |
|---|---|---|---|
| CW 2, common error | "Dropping the 1: 2x³y − 3x⁵y² (the slide's choice A) forgets…" A student never saw the slide's choices. | P3 | Drop "(the slide's choice A)". |
| PR 7, common error | "49 A divides the exponents; 49 D subtracts the coefficients; 51 F makes a sign error subtracting −5m from −3m." Choices are shuffled and carry no letters, so "A", "D" and "F" point at nothing. And 51's "m − 8 + 47/(m − 5)" comes from dividing by m + 5 (r = −5); one sign slip at −3m − 5m gives m − 8 − 33/(m − 5). | P3 | Name each choice by its text: "4m²n³ + 9m⁴n² + 2m³n⁴ divides the exponents; 12m²n⁶ + … subtracts the coefficients; m − 8 + 47/(m − 5) divides by m + 5 instead of m − 5." |
| PR 10, back-up step | "Let's back up. 7x + (x + 40) is… 8x + 40": the back-up step's answer is the first box's key. | P3 | Ask about the step instead: "7x + (x + 40) has how many x's?" (8). |
| PR 13, back-up step | "5/x² can be written as… 5x⁻²": the second box asks for that exponent (n = −2). | P3 | "5/x² = 5 ÷ x². Is a variable in a denominator allowed in a polynomial?" |
| CW 8, Guided Notes | The five steps are titled "Step 1" to "Step 5", so the collapsed bar reads "Step 1 of 5 · Step 1". | P3 | Title them by their move: "Coefficients", "r and the first number", "Multiply and add", … |
| PR 13, Read aloud | The second box's label "5/x² = 5xⁿ. n =" is read "5x ⁿ" (the superscript n is left raw). | P3 | Platform, speech (below). |

## Logged: Classwork and Practice, not changed

| Where | What a student meets | Severity | Why not fixed, and the fix I would make |
|---|---|---|---|
| Review PR 8 (two, one or no solution) | The worked solution never states this version's answer. After "Subtract −6 and divide by 2: \|x + 8\| = −5" it gives both cases ("a negative right side means no solution", "a positive right side means two solutions…") and sums up "the sign of −5 decides the number of solutions". A student with d > 0 never sees x = h − d or h + d. | P3 | Nothing in it is false. Fix: two families (d < 0 and d > 0), or a derived sentence per case, so the step ends "so there is no solution" or "so x = −9 or x = −7". |
| Review PR 17 (and DOL 7, exit ticket) | The worked solution is the method only: "The ordered triple (x, y, z) read from A⁻¹ · B." Each version's solution is never shown. | P3 | The steps come from the review's text, the system from the platform family `matrices.solveSystem3x3`, which has no steps of its own. Fix: give the family a worked solution (its A, B and solution are known), as `functionFeatures` does. |

## Logged: platform

### P-1 (P2, Read aloud): where a bracket closes is never said
`speechText.js` says "the quantity" where a bracket opens and nothing where it closes. In a lesson about subtracting
a whole polynomial, the brackets are the content:

| Written | Read aloud |
|---|---|
| `(0.002x² + 4x + 350) − 12x` (exit ticket 3's choice; CW 9's twin) | "the quantity 0.002x squared plus 4x plus 350 minus 12x": the same words as (0.002x² + 4x + 350 − 12x) |
| `(5y² − 2y²) + (−2y + 6y) + (4 − 1)` (CW 6's worked step) | "the quantity 5y squared minus 2y squared plus the quantity negative 2y plus 6y plus the quantity 4 minus 1" |

**Suggested fix:** say "end quantity" (or a pause) at a closing bracket that more of the expression follows, as the
module 1 walk asked for a bracketed exponent ("end power").

### P-2 (P2/P3, Read aloud): symbols and readings left raw in these lessons
From 2,697 texts (prompts, labels, choices, reasons, hints, back-up steps, worked steps; three versions of each family):

| Written | Read aloud | Where |
|---|---|---|
| `(−∞, −5] ∪ [1, ∞)`, `(-∞, -6) ∪ (-4, ∞)` | "the quantity negative infinity, negative 5 ∪ 1, infinity"; "the point negative infinity, negative 6 ∪ the point negative 4, infinity" | review CW 8, PR 10, DOL 5 (worked steps) — the module 1 walk's F-READ-INTERVALS, here too |
| `\|bx\| = \|b\|·\|x\|` | "\| bx the absolute value of equals b times the absolute value of times x\|" | review CW 4, Guided Notes |
| `\|½(x − 4)\|`, `\|ax + b\| = c`, `\|w − center\|` | the bars left raw ("\| ½ the quantity x minus 4 \|") | review CW 4, PR 12 back-up step, PR 5 hint |
| `[3, −2, −4 \| −4]` (a row of [A \| B]) | "3, negative 2, negative 4 \| minus 4" | review CW 11, worked steps |
| `revenue − cost`, `men − women`, `+ or −`, `2 × equation 1 − equation 3` | the minus between words left raw | Operations CW 1, CW 9, PR 10; review CW 10 |
| `−½·y`, `(x, y) → (x − 2, …)` | "− ½ times y"; the arrow left raw | review CW 3 |
| `x³ − √2x²` | "x cubed − the square root of 2x squared" (the minus left raw, and √2x² heard as √(2x²)) | Dividing PR 16 |
| "230 gas cards for $20, 110 … for $25, and 550 … for $50" | "230 gas cards for 20, 110 gas cards for 25, and 550 gas cards for 50 dollars" | matrices WU 1 |

**Not fixed:** `src/platform/language/speechText.js` is another batch's file, and new words need the Spanish review
(handoff section 5).

### P-3 (P2, display; phones): the exam-practice chip's text is invisible
On a 390×844 phone the chip that says an item is exam practice ("Digital SAT practice ›", "ACT practice ›") draws
its words in #174ea6 on its own #5b21b6 purple: a contrast of 1.14:1 (axe). At 1366×768 the same chip is white on
purple (8.98:1). It is on every exam-practice item: Operations on Polynomials PR 14, the matrices lesson's PR 12 and
the review's PR 11–13 here, and every other lesson's.
- **Seen in the App's phone shell too:** the matrices lesson's PR 12 ("ACT practice"), 1.14:1.
- **Cause:** `src/index.css:311`, `.question-prompt-heading button { color: var(--mm-primary-text) !important; }`.
  On a phone the alignment row moves into the task panel's heading (PH03), and the rule recolours the chip's text
  but not its background (`ACTIVE_CHIP` in `src/components/common/StandardBadge.jsx`).
- **Suggested fix:** keep the rule off the chip (`.question-prompt-heading button:not([data-chip])`, with the chip
  marked), or give the chip a palette the rule cannot override. **Not fixed:** a global stylesheet the
  accessibility and theme batches touch.

### P-4 (P3, keyboard): a matrix wider than a phone scrolls only by touch
In the App's phone shell (390×844) the matrices lesson's 4×5 matrices are wider than their boxes, which scroll
sideways (`div[data-matrix-scroll]`), and a keyboard cannot always bring the last column into view (axe
scrollable-region-focusable):
- CW 3's matrix A (the sprinters' finishes, shown, not answered) overflows by 27 px and holds nothing focusable;
- CW 1's matrix overflows by 67 px, and its cells take focus only after a "Find a₃₄" button is pressed.

In the harness the same rule also caught CW 2's 5×4 matrix; in the App its cells can take focus.
- **Suggested fix:** `tabIndex={0}` and a name ("Matrix A, scrolls sideways") on the scroller while it overflows.
  **Not fixed:** Matrix Lab markup, accessibility work for the batch that owns it.

### P-5 (P3, the closed review)
- A choice's review keeps the ✓ selection mark on the option the student picked, beside "✗ Check this" when the
  pick was wrong (Operations on Polynomials exit ticket 3, once released).
- "Correct:" shows a typed box's key as stored: `-0.002x²+8x-350`, not typeset as −0.002x² + 8x − 350.

## Pacing, scaffolding and pedagogy (log only)

- **Hints that hand over a step (Operations on Polynomials).** The lesson's hints often write the step they are meant
  to prompt. CW 11 hint 2 lists all six products ("x³, 4x², 3x², 12x, −2x, −8"), so only combining is left. PR 2 hint
  2 and PR 4 hint 2 give the first distribution (−3(2a³ + 4a − 5) = −6a³ − 12a + 15; 5c(2c² − 3c + 4) = 10c³ − 15c² +
  20c). PR 10 hint 3 gives the difference's x term (−0.876x − 9.694x = −10.57x). CW 5 hint 2 gives the opposite both
  parts subtract. The radicals lessons were changed to "hint 1 is a question, only the last hint shows the step" on
  this branch; this lesson was not.
- **A miss names no slip in Operations on Polynomials.** WU 1 typed as −12x¹⁰ (the exponents multiplied) is told
  "50% partial credit… still to fix: Multiply (3x²)(−4x⁵)" and "Focus on: Multiply (3x²)(−4x⁵)". The radicals and
  Algebra I M3 lessons now name predictable slips on a miss (handoff section 2); this lesson's common errors (the
  exponents multiplied, one sign changed) would be the first to name.
- **No "Practise one like this" in Operations on Polynomials or the matrices lesson.** None of their 48 Classwork and
  Practice items has a family sibling or a numeric variant, so a student who misses an item's last try gets the
  worked solution and nothing to try again. In the review, 4 of 29 have one (CW 1, CW 6, CW 10, PR 1).
- **The review's siblings are a different shape.** CW 1 and PR 1 analyse a V on the whole real line; their siblings
  are restricted to a closed interval (domain [−2, 7], range [−4, 6]), so the student practises a harder reading.
- **The point map draws g (review WU 2).** The dashed graph of g is on the plane while the student finds the image of
  (1, 1). This is the owner's open question "The g(x) line in point maps" (handoff section 5), which names this item.

## What works well

- **Every key is right**, in all 133 questions and every generated version: hand work for the fixed numbers, the
  tools' own keys compared with it, and the review's 443,378 versions computed independently.
- **The worked steps hold.** Every "=" in every text is true. The two exit-ticket steps added on this branch (Operations
  on Polynomials DOL 3, Dividing Polynomials DOL 1) say each stage and land on the key.
- **The choices rewritten on this branch** (Operations on Polynomials CW 6, the matrices Warm-Up 1, Dividing
  Polynomials PR 10, PR 11 and PR 13) are each a claim with a reason that is wrong in one way, and the key no longer
  stands out by length. The matrices Warm-Up 1's Recovery, version 2, writes the same choices with each version's
  own numbers.
- **The review's versions are clean.** No version carries a stacked sign, a coefficient 1 or 0, an unfilled template
  or a degenerate case (tied endpoints, an x-intercept at the origin, a singular system).

## Releasing this work

- **Re-import the District DOL 2 review** for F1, F2 and F3 (Practice text only: no id, key, weight, option or
  number changed, so the order of every choice stays as it is). A template's version is fingerprinted with its whole
  text, so PR 1, PR 3 and PR 16 are a content upgrade: a student who has already started one of them keeps the
  version they started, with its old text, and everyone else gets the new text (owner decision RT03). No Functions,
  rules, index or Hosting change.

## Screen pass

Every question of the four lessons at 1366×768 and at 390×844 with touch: 266 renders. Automated flags: page errors;
unfilled templates, raw LaTeX, `undefined` / `NaN`; sideways scroll and controls past the screen's edge; no final
action; axe-core's WCAG A/AA rules on the question (unnamed inputs among them); spoken math labels that spell
letters. Then the screenshots, by eye (the items this branch changed, every tool's first screen, and each flag).

- **1366×768: clean** apart from the expected flag: the 13 Step Algebra and Systems Workspace items show no Submit
  until the work is done, by design (the 2026-10-22 log).
- **390×844:**
  - the same 13, by design;
  - the harness's box is wider than the phone on Operations CW 4, PR 6 and DOL 1 (Add & Subtract) and matrices CW 1
    and CW 3 (4×5 matrices), cutting its own navigator, "Minimize" and the prompt's end. That is the harness, whose
    box takes its content's width (the 2026-11-06 note in the 10-22 log). In the App's phone shell Operations CW 3,
    PR 6 and DOL 1 fit (checked there on 2026-11-06), and the matrices lesson's CW 1, CW 2 and CW 3 (checked here)
    have no sideways page scroll and nothing past the screen's edge: a matrix wider than the phone scrolls inside its
    own box (P-4);
  - P-3 (the exam-practice chip, 1.14:1) on Operations PR 14, matrices PR 12 and review PR 11–13;
  - P-4 (a scroller a keyboard cannot reach) on matrices CW 2 in the harness, and on CW 1 and CW 3 in the App;
  - "ResizeObserver loop completed with undelivered notifications" once each on review DOL 6 and DOL 7: a browser
    notice, not a page error.

## Interactive pass

A wrong try, then a right one, through the rendered controls with real keystrokes (1366×768; the phone where noted).
The review's templated items were dealt a known version (`v=0`), so the right answer could be computed for it.

| Item | Tool / mode | Wrong try | What the student was told | Then |
|---|---|---|---|---|
| Operations WU 1 | typed products, simplest form | −12x¹⁰ (exponents multiplied) | "50% partial credit… still to fix: Multiply (3x²)(−4x⁵)"; "Focus on: …" | right on try 2 |
| Operations CW 1 | vocabulary sort, 11 cards | 5xy as a binomial | 90%, the card marked, "The red steps above are the specific responses that need revision…" | right |
| Operations CW 3 | Add & Subtract, subtracting | the opposite of −3a left as −3a | 57%, "Check the sign of EVERY opposite, then combine each column.", the three boxes named | right: "✓ Every step and the result are correct." |
| Operations CW 6 | rewritten reason choice + typed | "He added the two polynomials…" | 50%, "still to fix: What did Jordan do wrong?" | right |
| Operations CW 10 | area model | a cell −4a typed 4a | 71%, "Check each red cell: multiply the signs and the numbers…" | right: "✓ Every cell and the product are correct." |
| Operations DOL 3 | exit ticket, one try | a slip in each part | "Your answer is saved. You will see whether it is right when this activity's results open."; record closed after 1 try | released: the worked solution, "You wrote / Correct" per part, the new steps and "Watch out:" |
| Operations DOL 1, phone | Add & Subtract, four columns | — | nine boxes, all named; no page error | the App's phone shell fits it (2026-11-06, the 10-22 log) |
| Dividing CW 3 | long division | round 1: −7x − 15 | 88%, "The boxes marked in red are not right yet. Start with the first one…" | right |
| Dividing CW 9 | synthetic division | r = 1 for x + 1 | 40%, "Check the sign of r: … a divisor x + c puts −c in the box." | right |
| Matrices WU 1 | rewritten choice + totals | "No — the arrays lose the card values…", totals typed 8050 and 44,900 | 75%, "still to fix: Mr. Lopez wrote…" | right |
| Matrices, Matrix Lab | every mode the lesson uses | CI driver `matrixLabFeedback.mjs`: a bare "−", an untouched prefill, a missing variable as 1, a rounded A⁻¹, a no-variable equation, "none or many" without its reason, the figure sort, the exit tickets | as designed | 70 checks pass, both sizes |
| Matrices WU 2 | Matrix Lab, Nov + Dec | row 3, column 2 typed 413 | 88%, "In the sum, row 3, column 2 is not right yet." | right |
| Review WU 1 (v 0) | typed vertex, axis, range, intercept | vertex (2, 1) for (−2, 1); range y ≤ 1 | 50%, "Your inequality describes the right numbers, but this asks for interval notation." | right |
| Review WU 2 (v 0) | Transformations Lab, point map | x moved the wrong way | 50%, "still to fix: Transformed x" | right: "Correct — every transformation feature matches." |
| Review CW 5 | two equations typed | \|x − 2\| = 5 for a center of −2 | 83%, "still to fix: (B) …" | right (the first try's \|c − 69\| = 1 was marked right) |
| Review PR 2 (v 0) | max/min on an interval | the minimum at the wrong endpoint | 80%, "still to fix: x-value where the minimum occurs" | right |
| Review PR 12 (v 0) | audited SAT choice, one try | the center, −8 | closed: "You chose "-8": -8 is the center the two solutions sit around, not the sum of the solutions."; the worked solution | as designed |
| Review PR 3 (v 0) | Transformations Lab, identify | h = −2 for y = −2\|x − 2\| + 4 | before F3: "Check the sign of a: a V that opens downward has a negative a. Focus on: h."; after: "Check each value against the graph: the vertex is (h, k), and a is… Focus on: h." | right: "Correct — every transformation feature matches." |
| Review PR 4 (v 0) | Transformations Lab, match | b = 1, so the V is too shallow | "Line up the vertex first; then compare how steep each side of your V is with the dashed V." | a = −3, b = 1 for −\|3(x + 1)\| + 1 is right: the same V |

**Not driven in this walk:** the review's Step Algebra items (WU 3, CW 6–8, PR 7–10, PR 18, DOL 4–5), Systems
Workspace (CW 10, PR 16), the function stepper (CW 1, PR 1), Transformations Lab's plot and describe modes (CW 3,
CW 4), and the Matrix Lab's modelling and error-analysis items (CW 9, CW 11, PR 14, PR 17, DOL 7). Their screens are
clean at both sizes and their keys hold in every version; CW 6's practice sibling and CW 10's numeric variant are
driven wrong then right by `afterLastMiss.mjs`, CW 11's grading by `algebra2HonorsDol2Review.test.mjs`, and the
2026-10-22 walk of this review drove the rest.

## Checks run

- **Keys:** hand work for every static item; the tools' own keys for the 24 Polynomial Workshop and 26 Matrix Lab
  items; the review's 29 families over every valid tuple (443,378 versions); the matrices Warm-Up 1's Recovery
  version 2 (400 versions).
- **Text:** the arithmetic checker over 2,067 static texts and every version; a lint for templates, stacked signs and
  coefficients of 1 or 0 over every version; a scan of every version for a count of one before a plural noun.
- **Spellings:** 90 typed boxes through the field grader.
- **Read aloud:** 2,697 texts through `speechTextFor`.
- **Screen pass:** 266 renders (above). **Interactive pass:** the table above.
- **Tests for F1–F3:** three new tests in `tests/platform/algebra2HonorsDol2Review.test.mjs`, each broken once to
  see it fail (the old sentences, a wrong multiple, and the exception no longer needed), then restored. The file passes
  16 of 16; every test file that reads the review (8 files, 74 tests) passes.
- `npm run lint` and `npm run audit:theme-colors` exit 0.
- **CI drivers** for what changed (the review's file) and for the lessons walked:
  - `tests/browser/afterLastMiss.mjs` (imports the review): 150 checks pass. A first run, on a machine at load 16,
    failed twice on the phone's inverse-function practice (another lesson's sibling, typed too fast for the field); the
    second run passed every check.
  - `tests/browser/matrixLabFeedback.mjs` (the matrices lesson): 70 checks pass, both sizes.
  - `tests/browser/teacherWorkflow/dol2ReviewHonorsJourneys.mjs` (the review imported and created for a Standard and
    an Honors class through the real App): passes on desktop, Chromebook and phone.
- **The App's phone shell** (`tests/browser/teacherWorkflow`, `?questions=matrices`, student 910002, 390×844 touch):
  the matrices lesson's CW 1, CW 2, CW 3 and PR 12, for the phone flags above.
