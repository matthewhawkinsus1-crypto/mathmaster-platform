# Re-walk of the changed lessons, 2026-11-06: findings

The lessons changed since the 2026-11-03 walkthrough (`docs/qa/2026-11-03-pr537-walkthrough/findings.md`), walked again as a student on `helper/rewalk-changed-lessons` from 20b0427f. That is 241 questions in all:
- Algebra I Module 3 Topic 2 L4, Graphing Inequalities in Two Variables, and L5, Systems of Linear Inequalities, each regular and Honors.
- Algebra II Honors Radicals L1 nth Roots, L2 Operations with Radical Expressions and L3 Rational Exponents.

Priorities as on 11-03: **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or understanding. **P3** is polish.

## How it was run

- **Harness:** the 2026-10-22 lesson harness (`docs/qa/2026-10-22-walkthroughs/harness/`): the teacher-import chain, then the real `QuestionEngine`. A copy for this walk could also build version *v* of any family through the family engine. Headless Chrome with the CI fonts, at 1366×768 and at 390×844 with touch.
- **Screen pass:** every question at both sizes, 488 screens. It flags page errors, unfilled templates, raw LaTeX, carets, `undefined` / `NaN`, sideways scroll, controls off the screen or unnamed, plain text boxes, math wider than its box, and a Submit that cannot be reached. The changed items were then checked by eye.
- **Read-aloud sweep:** 6,569 strings through the reader: prompts, labels, options, hints, back-up steps and worked solutions.
- **Keys:** every key recomputed on its own, for every generated version. All versions were read, except L5 PR 4 and Exit Ticket 3 (the first 4,000 versions, in class order). Systems Workspace regions (empty, bounded, unbounded) and corners were checked against each lesson's text.
- **Hints and slips, every version:** hint 1 asks; no hint before the last states a box's answer; no named slip fires on a right answer; each slip's sentence is true of the answer it names.
- **Typed spellings:** each typed box was tried with the spellings a student would use: term order, spaces, `×` and `·`, radicals or exponents, brackets.
- **Wrong-then-right:** the changed items, and each tool and mode, at both sizes (results at the end).

## Fixed on this branch (Classwork and Practice)

### R-L1-PR7-ROOT-ORDER (P1, grading; Radicals L1 PR 7)
"Its two imaginary square roots are [ ] and [ ]". Each box held one root, in an order the item did not state. A student who typed −7i and then 7i was marked wrong in both boxes.
- **Fix:** the boxes are named as Example D's are (CW 6). "√(−49) =" holds the principal root, and "The other square root of −49 is" holds its opposite. Keys unchanged. b1f547aa.

### R-L1-PR10-ROUNDING (P1, grading; Radicals L1 PR 10)
The item asks for a cube root to the nearest thousandth, then k to the nearest tenth. Its key cubes the exact root. Cubing the rounded root lands one tenth away in two versions (d = 2.3: 18.9 for 19.0; d = 3.2: 48.1 for 48.2). A tolerance of exactly 0.1 refused that in floating point, so the method the item asks for was marked wrong.
- **Fix:** tolerance 0.15: one tenth either way, never two. f4db3114.

### R-NOTATION-LABEL (P2, feedback; Radicals L2 CW 7, L3 CW 8 (two boxes), L3 CW 10)
The last hint ends in exponents (x^(1/3), (2x²)^(2/6), x^(4/8)), and each box takes a radical only. A student who stopped where the hint did was told "Equal, but in the other notation: write it with radicals or with rational exponents, the way the question asks". The label named no notation.
- **Fix:** the labels say "as a radical". 698e1052.

### R-L3-RADICAL-FORM (P1, grading message; Radicals L3 PR 3, PR 7, PR 9, PR 15)
CW 5 teaches b^(x/y) = ʸ√(bˣ) = (ʸ√b)ˣ, but the simplest-form grader takes only the root with the power under it. (∛V)² for V^(2/3) (PR 7), (⁵√y)³ (PR 3) and (⁶√x)⁵ (PR 9) were refused with "Equal, but not in simplest form: take every perfect power out of the root…", though none of them has a perfect power to take out. PR 15 refused ⁴√(2³), the form its own back-up step shows.
- **Fix:** the four labels say "with the power under the root" (PR 15: "… worked out"). Keys and grading unchanged. 0d31235d.
- **Owner:** whether a "radical form" box should take (ⁿ√b)ᵐ as well is a grading decision (see below).

### R-L2-CW4-TWO-RIGHT (P1, grading; Radicals L2 CW 4)
"To clear the radical from x³√x, multiply the top and bottom by" offered √x and √(x⁷), and both clear it (x³√x · √(x⁷) = x⁷). Multiplying by the denominator's own radical, a sound method, was marked wrong.
- **Fix:** the label asks for "the smallest radical". Options and key unchanged. 039813f4.

### R-L2-MULTIPLIER-SMALLEST (P1, grading; Radicals L2 CW 5, CW 6, PR 12)
The same thing in typed boxes, and each of these was refused:
- "Multiply 9x by ? to get a perfect cube" keyed 3x², but 81x² makes (9x)³ too. That is the denominator squared, the way many books clear a cube root.
- CW 6's 3y² is made a cube by 9y⁴ too.
- PR 12's ∛4 is cleared by ∛16 too.
- **Fix:** the labels ask for the smallest monomial or cube root. Keys and grading unchanged. 39474a41.

### R-L3-CW9-NUMERATOR (P2, grading message; Radicals L3 CW 9)
After the conjugate, (y^(1/2) + 1)²/(y − 1) breaks none of the four rules CW 10 gives for a simplified expression. The box refused it with "Equal, but not in simplest form… combine like terms…". The key multiplies the numerator out, as the last hint does, but the item never said so.
- **Fix:** the prompt and its direction step ask for the numerator multiplied out. Keys and grading unchanged. 87110eae.

### R-L2-CW3-K54 (P2, display; Radicals L2 CW 3 worked solution)
5|b⁷|k⁵⁴√(k³) drew the superscript run ⁵⁴ after k as one exponent: k to the 54th.
- **Fix:** 5|b⁷|k⁵ · ⁴√(k³). 3838c008.

### R-L5-PR7-PROMPT (P1, grading; A1 L5 PR 7, regular and Honors; made worse since 11-03)
"Change only the second symbol so that its boundary is included and (3, 2) becomes a solution." y ≥ 2x − 4 does both, but the key is y ≤ 2x − 4. The slip added since 11-03 (185a494e) then told the student that y ≥ 2x − 4 was turned the wrong way round.
- **Fix:** the prompt and its direction step keep the side the inequality shades. 87471676.

### R-L5-CW3-HINT2 (P2, hints; A1 L5 CW 3, regular and Honors)
Hint 2 was "Both symbols include equality." Before the last hint, it gave away the model's two symbols and both boundaries' line style, which are build steps the student is asked to do.
- **Fix:** it asks: "Can the raft carry exactly 800 pounds? Does exactly $150 meet Noah's goal? So is each boundary solid or dashed?" The last hint gives the answer. 167bf233.

### R-READ-POWER-ROOT (P2, read-aloud; Radicals L2 CW 4 and worked solutions in L1–L2; L3 Warm-Up 1)
The reader took a superscript right after a letter, number or bracket for a root's index:
- "x³√x" was read "x times the cube root of x", while the screen draws x³ times √x.
- "5a²b⁴√b" and "y⁴√x/x⁴" were read the same way.
- A blank power "x^?" was read with its caret.
- **Fix:** read as drawn ("x cubed times the square root of x"), and "x^?" is "x to the power …". The walk's own patch was written against the reader as it was on 20b0427f, and the math read aloud batch has rewritten that reader since, so the fix moved to the math speech follow-up batch, which ports the walk's cases and tests onto the new reader (speech only, nothing graded reads it).

### R-POWER-OF-ONE (P3, text; Radicals L1 PR 2, PR 3; L2 PR 1, PR 2; L3 PR 3, PR 14, PR 15)
Where an exponent drew 1, worked solutions wrote (−3a^1b^4)³ and 6a²b¹, in up to 280 of 640 versions. Where an index drew 2 or 3, they wrote "the 2th root" or "the 3th root".
- **Fix:** the `pow` filter the keys already use, and the index named without an ordinal. f16d577d.

### R-TEXT-BOXES (P2, input; Radicals L1 CW 12, PR 6, PR 7, PR 13; L2 PR 4)
The box chooser reads a key with no math sign (27x, 7i, 2T, 48a) as words, so these were plain text boxes among math boxes. That meant no math keypad, the phone's letter keyboard, and a tell that the answer has no radical.
- **Fix:** math boxes (`type: 'math'`), as the Check Your Progress boxes became. Grading unchanged. 73dcc73f.

## Stopped for the owner

### O-L1-PR14-CCMR (P1, key; Radicals L1 PR 14, audited item `mathmaster:sat:A2.7G:variable-radical-square-factor` v2)
"For x > 0, which expression is equivalent to √(radCoef · x²)?"
- The option x√(radCoef) is equivalent in all 49 versions, so this one-try choice has two right answers.
- Its rationale ("This takes only x out of the root…") answers a question about simplest form that the stem does not ask.
- In the 7 versions with m = 8, the key k·x√8 is not simplified either.
- **Why stopped:** the item belongs to the audited CCMR bank, which Path shares. Its content is pinned in `tests/platform/fixtures/ccmrContentFixPins.json`.
- **Decision:** either ask for the equivalent expression "in simplest form", or replace that distractor with one that is not equivalent. In both cases, drop m = 8 from the generator.

### O-RADICAL-FORM-POLICY (grading; every "radical form" box)
- Should a "radical form" box take (ⁿ√b)ᵐ, which CW 5 teaches as equal? The labels now say which form the box takes (R-L3-RADICAL-FORM).
- Taking both is a change to `simplestRadicalFormEquivalence.mjs` (server grading, so a Functions deploy).
- That module also sends (ⁿ√b)ᵐ the "not in simplest form" message. "The other notation", or a message about where the power goes, would be true.

### O-SIMPLIFIED-POLICY (grading; L2 CW 11, L3 CW 3, CW 7, CW 8)
- **L2 CW 11:** ½(√3 − 1) is refused for (√3 − 1)/2, with "not in simplest form", though it breaks none of CW 7's rules. Pre-Flight refuses an accepted answer that the grader calls not simplest, so content cannot add it.
- **L3 CW 7 and CW 8:** the boxes refuse the other notation where only the label's own notation implies the form: ∛x/x for "x^(−2/3) in simplest form", and 2^(1/3) for "⁶√16 / ∛2 =". The message names "the other notation", so a student can recover. Saying the form in the label, as R-NOTATION-LABEL does, is cheap if wanted.
- **L3 CW 3:** w^0.5 is refused for w^(1/2) (the decimal policy).
- **Brackets around a single letter:** ∛((V)²) is refused as "not in simplest form" (P3).

## Warm-Up and Exit Ticket: logged, not edited (Recovery binds these)

| Where | What a student meets | Severity | Fix I would make |
| --- | --- | --- | --- |
| L1 Exit Ticket 3, L = 49 (1 of 54 versions) | T worked from the rounded root, as the item's steps say (2π · 1.237 = 7.77), is refused against 7.78. The tolerance of 0.01 sits at the floating-point edge. One try. | P2 | `numericTolerance: 0.015` on `period` |
| L3 Exit Ticket 3 | "In radical form" refuses (ⁿ√x)ˢ with "not in simplest form". One try. | P2 | Label "In radical form, with the power under the root" |
| L1 Warm-Up 2 | "Write px^(2h) as the square of a monomial": −b·xʰ, whose square is the same, is refused. | P2 | `acceptedAnswers: ['-{{b}}x^{{h}}']` on `squareBase` |
| L2 Warm-Up 2 | `terms` ({{t}}x) is a plain text box among math boxes. | P3 | `type: 'math'` |
| L4 and L4 Honors Warm-Up 1 | The number line's "Exact endpoint value" is a plain text box. | P3 | The tool's own box (platform) |
| L3 Warm-Up 3 | "the 2th power" or "the 3th power" in the worked solution, in 10 of 18 versions. | P3 | Name the index without an ordinal |
| L1 Exit Tickets 1 (12 of 36) and 2 (36 of 72); L2 Warm-Up 1 (20 of 50) and Exit Ticket 1 (280 of 640) | Worked solutions write a power of 1: (5x^1y^4)^4, 4x^1y^3√(5y). | P3 | The `pow` filter |
| L3 Warm-Up 1 | "x^?" was read with its caret. | P3 | The reader fix (R-READ-POWER-ROOT) |

## Logged: pacing, difficulty, pedagogy, platform (not changed)

- **L5 classwork length (P2, owner):** 17 questions with a recommended 100 minutes, one more than on 11-03 because the plain-case system was added (F-L5-HARDEST-FIRST). The two-day split is the owner's decision, already open, and is not reopened here.
- **L3 prose labels and choices show "^(…)" (P3, display):** 11 questions on version 0, at both sizes (WU 3, CW 3, 5, 6, 7, 9, 10, PR 6, 7, 8, 15). One example is "x^(−2/3) in simplest form". A label with words in it is drawn as text, so the caret shows. Fix: draw a rational exponent in prose as math (platform), or rewrite these labels as math only.
- **Read-aloud "($)" (P3):** "Money raised by 39 muffins and 25 smoothies ($)" is spoken as written. It appears in L4 PR 4, L5 CW 2, PR 4, PR 9 and Warm-Up 3, regular and Honors. Fix in the reader: read a bare "($)" unit as "in dollars".
- **Read-aloud ⁿ (P3):** "ⁿ√b" was read "ⁿ the square root of b" (L1 CW 1, 7, 8 back-up steps and PR 12; L2 CW 2; L3 CW 3 hint 1). The math read aloud batch has since fixed it: "the nth root of b".
- **L4 Honors PR 14 (P3, longest is right):** the key "on the dashed boundary, so it is not a solution" (47 characters) sits among "a solution", "below the line" and "above the line". The F-LONGEST-IS-RIGHT ratchet does not count options this short. Across the seven lessons, 10 of 100 prose choices key the single longest option (75 of 97 on 11-03).
- **The fixed format example equals the key (P3, platform):** the number box's example "-4" is the answer in some versions (L4 WU 3, PR 5; L4 Honors WU 3, PR 17; Radicals L1 WU 1, PR 7; L2 WU 3). The example is chosen without reading the key, so this is chance, but a student cannot know that. Fix: choose the example from a set that skips the key.
- **L1 CW 4 (P3):** −(q⁶ + 10q³ + 25) is refused for −(q³ + 5)². The factored form is the natural one for a root item, but the label does not say so.
- **L1 imaginary roots (P3, from 11-03):** CW 6 still meets "2i" with no warm-up or Guided Notes step on i.
- **L4 Honors practice still starts at band 3 (P3, from 11-03).**
- **L3 PR 13, a CCMR item (P3):** its worked solution has the spacing "(x^( p/q ))^( r )". The item is in the audited bank.

## Compared with 2026-11-03

| 11-03 finding | Now | Evidence |
| --- | --- | --- |
| F-SUPERSCRIPT-CARET (P1) | Fixed (#538) | No ˆ on any of the 488 screens |
| F-SORT-NO-REASON (P2) | Fixed (6497afc8) | L1 CW 2 has a reason box for each category that holds cards |
| F-SORT-WHICH-CARD (P2) | Fixed (6476314b) | One misplaced card is marked, and only it |
| F-LONGEST-IS-RIGHT (P2) | Fixed | 10 of 100 prose choices key the single longest (75 of 97); one short item logged |
| F-L1-EXIT-SPREAD (P2) | Fixed (2b9a9f89) | |
| F-HINT-GIVES-STEP (P2) | Fixed (c97597b6, 965f3e75) | One more found and fixed: R-L5-CW3-HINT2 |
| F-CYP-AS-CHOICE (P2) | Fixed (24b2fac1) | |
| F-NO-MISCONCEPTION-FEEDBACK (P3) | Fixed (6f60d429, 185a494e) | L1 CW 7 names the missing bars; one new slip made L5 PR 7 worse (R-L5-PR7-PROMPT, now fixed) |
| L1 keypad letters; numerics after variable work | Fixed | |
| L1 classwork length; imaginary roots with no step on i | Left | Pacing, logged |
| L2 CW 3 spike; simplest form defined after its use; practice opener | Fixed | |
| F-RADICAL-TYPING (P2) | Fixed (22f59b9e) | |
| F-L3-PR8-KEY (P1); L3 practice order | Fixed | |
| L3 Exit Ticket 3 combines two steps | Left | Fair, as 11-03 said |
| F-SW-CHECKS-OWN-MODEL (P2) | Fixed (c3eec8d1) | systemsWorkspaceStudio passes |
| F-GRAPH-IN-WORDS (P2) and its placeholder example | Fixed | |
| F-SW-TEST-POINT-YESNO, F-SW-SYSTEM-WORDS, F-SW-PLACEMENT-HOW (P3) | Fixed (571cd29f, 30b1af7c, 53e27452, 3bfa09e0) | |
| L4 context before skill; F-L5-HARDEST-FIRST (P2) | Fixed (5968750e) | |
| F-L5-LENGTH (P2) | Left, one item longer | The owner's two-day decision |
| L4 Honors practice starts at band 3 (P3) | Left | |
| Keypad fraction tell; phone grid 13 px per unit (P3) | Not rechecked | |

## Walk results

- **Screen pass:** 488 screens, 28 flagged, and all 28 are logged above: L3's "^(…)" in prose (22), the number line's text box (4) and L2 Warm-Up 2's text box (2). L2 and L3 were re-run after the last two commits, with no new flags. Nothing else was flagged, on any screen: no unfilled template, raw LaTeX, `undefined` or `NaN`, no sideways scroll, no control off the screen or unnamed, no page error, and Submit was reachable everywhere.
- **Read-aloud:** 6,569 strings, 31 flagged before R-READ-POWER-ROOT. What is left is "($)", logged.
- **Keys:** every key matched in every version read.
- **Wrong-then-right:** 16 of 16 checks pass at 1366×768, and 16 of 16 at 390×844 with touch, with no page errors:
  - L1 PR 7: roots in the wrong boxes are refused, both labels are shown, and the item is right on the second try.
  - L1 CW 7: 2xy² is refused with the bars slip; 2|x|y² is right.
  - L2 CW 4: √(x⁷) is refused under the "smallest" label; √x is right.
  - L3 PR 7: (∛V)² is refused under the label; ∛(V²) is right.
  - L3 CW 10: x^(1/2) is told "the other notation" under a label that names a radical; √x is right.
  - L5 PR 7: y ≥ 2x − 4 gets its slip, the prompt keeps the side, and y ≤ 2x − 4 is right.
  - L1 CW 2 sort: one reason box per category that holds cards; one misplaced card is marked, and only it (88%).
  - L4 Exit Ticket 3: a wrong try shows no verdict and no slip.
- **CI drivers, local:** mathEntryContract, systemsWorkspaceStudio and readAloudTranslate pass.

## Files changed (re-import these)

- `teacher-import-jsons/algebra2-honors-radicals/L1_nth_Roots.json`, `L2_Operations_with_Radical_Expressions.json` and `L3_Rational_Exponents.json`. Builders are in `scripts/content/algebra2HonorsRadicals/`.
- `teacher-import-jsons/algebra1-module3/T2_L5_Systems_of_Linear_Inequalities.json` and `…_Honors.json`. The builder is `scripts/content/algebra1M3Inequalities/l5SystemsOfInequalities.mjs`. The L4 files are unchanged.
