# PR #537 student walkthrough: findings

Environment: PR head 5c5efa6b0. Lesson harness (docs/qa/2026-10-22-walkthroughs/harness): the teacher-import chain plus the real QuestionEngine with App.jsx's record, policy, Guided Notes and Exit Ticket mode. Run at 1366×768 and 390×844.

Priorities: **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or understanding. **P3** is polish.

## Platform

### F-SUPERSCRIPT-CARET (P1, display; platform, already live elsewhere)
Part labels and choice options written with Unicode superscripts render with a caret when MathLive draws them as ASCIIMath:

| Written | Shows |
|---|---|
| `(−3)⁴ =` | `(−3) ˆ4 =` |
| `⁶√(x¹⁸) =` | `ˆ6√(xˆ1ˆ8) =` |
| `⁶√(x¹²) =` | `ˆ6√(xˆ1²) =`, which reads as (x¹)² |
| `aⁿ` (a choice) | `aˆn` |

- **Cause:** `normalizeMathDisplayValue` in `src/MultiAnswerGrader.jsx:29` converts only `⁻¹`, `²` and `³` before MathLive. MathLive's ASCIIMath reader turns every other Unicode superscript (⁰ ¹ ⁴–⁹ ⁿ ⁻) into a caret. A leading index (`⁶√`) needs `root(6)(…)`.
- **Prose is not affected:** "Index of ⁵√32" stays text and reads fine. Only math-only labels and choices are drawn by MathLive.
- **Reach:**
  - L1 nth Roots: 12 of 35 questions (WU 1–2, CW 1, 3, 4, 5, 7, 8, 10–12, PR 12). The other lessons are counted in their sections below.
  - Across `teacher-import-jsons`: 222 labels and options, in 15 files, 130 of them in lessons that are already live (Algebra II Honors modules 1–2, Polynomials and Radicals).
- **Why P1 here:** in a radicals lesson the index and the power are the content. A student cannot tell what ˆ6√(xˆ1ˆ8) asks.
- **Fix:** convert every superscript run in that one function: `ⁿ` to `^n`, `⁻⁴` to `^(-4)`, multi-digit runs to `^(18)`, and a superscript index before `√` to `root(n)(…)`. Then add a guard test that renders every committed label through it with no Unicode superscript left. A content-only workaround (LaTeX labels) would leave the 130 live labels broken.
- **Fixed in #538.** The fix went one level down, into MathDisplay (`unicodeSuperscriptsToMathMarkup` in `src/mathDisplayFormat.js`), so every math surface gets it, not only labels and choices. MathLive's ASCIIMath reader has no `root(n)(…)`, so a written index becomes LaTeX `\sqrt[n]{…}` and the value is drawn as LaTeX. A superscript right after a letter, number or bracket stays a power (`x³√x` is x³ times √x). `tests/platform/unicodeSuperscriptDisplay.test.mjs` sweeps every lesson string MathDisplay draws.

### F-SORT-NO-REASON (P2, content vs platform; L1 CW 2, L2 CW 1)
Both tasks say "give a reason for each group", but the board never asks for one. A controlled sort (fixed categories) has its rationale switched off by the compiler: `requireRationale: controlled ? false : …` (`src/platform/contract/authoringIntentV5Core.js:2205`). The board itself already has the box ("Why do these belong together? For your teacher").
- **Fix (platform):** let a controlled sort keep `requireRationale` (one reason per fixed category).
- **Fix (content, until then):** drop "give a reason for each group" from both prompts.

### F-SORT-WHICH-CARD (P2, feedback; every controlled sort)
With one card misplaced (L1 CW 2: the square roots of −9 placed in "Two real roots"), the student sees "88% partial credit", "At least one card is in the wrong category… Focus on: Mathematical grouping." (printed twice), and nothing about which card is wrong. With 8 cards and 3 tries, moving cards at random until it passes is a working strategy.
- **Fix:** after a wrong try, mark the misplaced card (as the typed graders mark a wrong box), or name the category that holds it. "Focus on: Mathematical grouping" names nothing.

### F-LONGEST-IS-RIGHT (P2, content; all seven lessons)
In the reasoning choices, the correct option is almost always the single longest one, because it carries the qualifications ("x may be negative, but a fourth root is never negative; y² is never negative") while the distractors are short ("x is always negative").

| Lesson | Prose choices (options average 25+ characters) | Correct = the single longest |
|---|---|---|
| A2 L1 nth Roots | 8 | 6 (75%) |
| A2 L2 Radical Operations | 10 | 7 (70%) |
| A2 L3 Rational Exponents | 8 | 6 (75%) |
| A1 L4 Graphing Inequalities | 15 | 14 (93%) |
| A1 L4 Honors | 16 | 15 (94%) |
| A1 L5 Systems of Inequalities | 19 | 13 (68%) |
| A1 L5 Honors | 21 | 14 (67%) |
| **All** | **97** | **75 (77%)**; chance is about 25% |

- **Effect:** "pick the longest" passes most reasoning parts without reading them. These parts carry partial credit and 3 tries.
- **Fix (content):** give the distractors the same shape as the answer: a claim plus a reason, each wrong in one specific way (the reason is wrong, or the claim is right for the wrong reason). A builder check could flag any choice whose answer is the unique longest option by more than about 20%.
- **Better fix:** idea 4 in the ideas log (build the reason from slots).

## A2 L1 nth Roots

**Pacing.** The warm-up climbs well, from evaluating powers to naming roots to √(x²) = |x|.
- **Classwork is long:** 14 questions in 45 minutes. Most carry two problems ("Example A, then Check Your Progress A") and 4–5 boxes, so about 30 problems in all.
- **Order:** numeric simplification (CW 9: √63, 3√12; band 2) comes after the variable work it underlies (CW 3–8; band 2–3). It follows the slide deck, but a student meets "largest perfect-square factor" after already using perfect powers of variables.
- **Imaginary roots:** CW 6 introduces imaginary square roots ("2i") with no warm-up or Guided Notes step on i. Fine if complex numbers came earlier in the course; check the course order.
- **Practice:** climbs from band 2 to 3, with the Honors items (band 4) and two audited CCMR items at the end. Good.

### F-L1-EXIT-SPREAD (P2, difficulty; L1 DOL 1)
The exit ticket's index is drawn from {4, 6} and its base from 2–4. The radicand coefficient is therefore 16, 81 or 256 for a fourth root, and 64, 729 or 4096 for a sixth root. One student gets ⁴√(16x⁴y⁸); another gets ⁶√(4096x³⁰y²⁴) on their only try. The practice item it mirrors (PR 3) always uses index 4. Sixth roots of variable expressions appear only in CW 7 (⁶√(t⁶)) and the Honors extension PR 12.
- **Fix:** match the exit ticket's range to practice (index 4, or let PR 3 draw from {4, 6} too), and cap the coefficient at 3⁶ = 729.

### F-HINT-GIVES-STEP (P2, scaffolding; L1, and the same pattern in L2 and L3)
Hint 1 often completes the box it is meant to help with:
- CW 3: "16 = 4² and x⁸ = (x⁴)²" (the box asks for 4x⁴);
- CW 5: "243 = 3⁵… a¹⁰ = (a²)⁵ and b¹⁵ = (b³)⁵" (the box asks for 3a²b³);
- CW 7 hint 2: "16x⁴y⁸ = (2xy²)⁴";
- CW 10: "x⁴ = (x²)², y¹⁰ = (y⁵)², z⁴ = (z²)²".

A student who opens one hint has the first box done for them. See idea 3.

### F-CYP-AS-CHOICE (P2, scaffolding; L1 CW 3, 4, 7, 8; L2 CW 3, 6; L3 CW 2)
The "Check Your Progress" half of each example item, where the student repeats the example alone, is often a 4-option choice: ±√(9x⁸) = {±3x⁶, ±3x⁴, 3x⁴, ±3x²}. It can be eliminated or guessed, and with 3 tries guessed for sure. The simplification the example just modeled is never produced by the student. Make these typed, and keep choices for the decisions (bars or no bars).

### F-NO-MISCONCEPTION-FEEDBACK (P3, feedback; typed parts in all three radicals lessons)
A wrong box gets "Not quite… Focus on: ⁴√(16x⁴y⁸)". The predictable errors have predictable causes that the grader could recognize:
- **Missing bars:** 2xy² for 2|x|y² is right for x ≥ 0: "Your answer is right when x ≥ 0. Try x = −1."
- **Sign of an odd power:** (−6)³ = 216.
- **Even power of a negative:** (−3)⁴ = −81.

The item already has the matching `commonError`; it is shown only after the item closes.

### Notes
- **Keypad letters:** DOL 1's keypad offers the letters m, p, o and w on a problem that uses only x and y (P3).
- **Bars typed on a keyboard work:** `|x|` becomes `\left|x\right|`, and the second bar steps out. (An automated `type('|')` without Shift enters MathLive's LaTeX mode; that is a test artifact, not a student problem.)
- **What works well:** partial credit and "still to fix: …" name the exact boxes; generated practice; one-try exit tickets.

## A2 L2 Operations with Radical Expressions

**Pacing.**
- **CW 3 is the lesson's spike.** It is "Check Your Progress A and B" but much harder than the examples it follows. The examples (CW 2) use square and cube roots with every variable positive. CW 3 asks for ⁴√(625b²⁸k²³) with b any real number (bars), an odd leftover power of k (a radical left in the answer), and an unstated condition, k ≥ 0, which only the reason choice reveals. It is band 4 as the third classwork item.
  - **Fix:** a CYP that mirrors Example B (a cube root, positive variables), and move this item after CW 8 as an extension.
- **"Simplest form" comes after its use.** It is defined in CW 7, after CW 4–6 have asked the student to produce it (rationalize the denominator). Put the four rules first, or in the warm-up.
- **Practice starts at band 3** (PR 1–5) with no easier opener. PR 6 (band 2, the simplest rationalization) comes after the conjugate and binomial items. Swapping PR 1 and PR 6 gives a ramp.
- **Display:** F-SUPERSCRIPT-CARET garbles 4 of 32 questions (CW 2, 3, 4, 7), including "∛(125m³⁰p²⁰) =", which reads "m^3ˆ0".

### F-RADICAL-TYPING (P2, input; every typed radical in L1–L3)
How natural keyboard spellings land in the box:

| Typed | Box holds |
|---|---|
| `x^3 sqrt x` | x³√□ x: the space leaves the root empty, then x follows it |
| `y^4sqrt(x)/x^4` | y⁴√(x/x⁴): `)` does not close the root, so `/` builds the fraction inside it |
| `(y^4 sqrt(x))/(x^4)` | a garbled expression with mismatched brackets |
| `y^4 sqrtx →/x^4` | (y⁴√x)/x⁴, correct, but only with the arrow key |
| `√x` (typed or pasted) | `\surd x`, which the grader accepts as √x |

The box shows the structure it built, so a careful student can see the mistake. But "the fraction went under the root" costs a try on an answer that was right.
- **Fix (platform):** in a math box, `sqrt(` … `)` should close the root at the matching bracket, as `/` already builds the fraction the characters mean (typedFractionEntry.js). A space right after `sqrt` should not leave the root empty.

## A2 L3 Rational Exponents

### F-L3-PR8-KEY (P1, math content; L3 PR 8, Honors extension, DOK 4)
Ana writes (−8)^(2/6) = (−8)^(1/3) = −2. Ben writes (−8)^(2/6) = ⁶√((−8)²) = ⁶√64 = 2. The task says "decide who made the error".
- **The keyed verdict:** "reducing 2/6 to 1/3 changes the value when the base is negative". The worked solution adds that "reducing 2/6 to 1/3 for a negative base is not allowed".
- **The next part's key:** "for a negative base, a rational exponent must be written in… lowest terms". That rule *requires* reducing 2/6 to 1/3, which makes Ana right.
- **Where the error is:** Ben's step. Rewriting (−8)^(2/6) as ⁶√((−8)²) applies (bᵐ)^(1/n) = ⁿ√(bᵐ) with an even n to a negative base. In lowest terms, (−8)^(2/6) = (−8)^(1/3) = −2.
- **No option names it.** The person-based options are "Ben made an arithmetic error" and "Ana made an arithmetic error", and neither describes Ben's mistake. A student who reasons correctly has nothing right to choose, and the keyed answer teaches the opposite of the rule in the next box.
- **Fix:** key the verdict to "Ben: an even root of a negative base cannot be rewritten that way; written in lowest terms, (−8)^(2/6) = (−8)^(1/3) = −2". Add "Ana is right…" as the choice to decide, and rewrite the worked solution's second line.
- **Fixed on this branch** (`scripts/content/algebra2HonorsRadicals/l3RationalExponents.mjs`, rebuilt). The part asks "Who made the error?" with four options of similar length (the key is not the longest, see F-LONGEST-IS-RIGHT):
  - **Key:** "Ben: the law that turns it into ⁶√((−8)²) needs a base ≥ 0".
  - **Distractors:** "Ana: the exponent 2/6 may not be reduced when the base is negative" (the old key's idea), "Ben: ⁶√64 is −2, not 2…" and "Neither: (−8)^(2/6) has two values…".
  - **Worked solution:** Ben's first step is the error; for a negative base, the exponent is read in lowest terms, so (−8)^(2/6) = −2 and Ana is right.
  - **Hint 3** asks which first step uses a law with a condition on the base, instead of naming the step.

**Pacing.**
- **The warm-up climbs well:** exponent laws, then negative exponents, then "what could b^(1/n) mean?".
- **Classwork:** CW 8–9 (band 4: index reduction, conjugates with rational exponents) come as a pair at the end, with their CYP halves as choices (F-CYP-AS-CHOICE).
- **Practice ends below its peak:** the Honors items (PR 7–11, bands 4–5) and CCMR (PR 12–13, bands 4–5) sit in the middle, then PR 14–15 drop back to band 3. A student who stops early after the hardest items never reaches the band-3 index reduction (PR 14) that the classwork just taught. Move PR 14–15 before PR 7.
- **Exit Ticket 3** asks for radical form; the matching practice item (PR 4) asks for a rational exponent. The conversion is practiced separately (PR 3), so this is fair, but it combines two steps on one try.
- **Display:** F-SUPERSCRIPT-CARET garbles 9 of 31 questions, including CW 1–2. There, negative exponents are the content, and "(x⁻²y⁻³)(x⁻³y⁵)" shows as "(x⁻^2y⁻^3)(x⁻^3y⁵)".

## A1 M3 T2 L4 Graphing Inequalities in Two Variables (regular and Honors)

All 35 questions screen clean: no display flags, no overflow, no page errors.

### F-SW-CHECKS-OWN-MODEL (P2, tool feedback; every modeled Systems Workspace item: L4 CW 2, CW 15, PR 9; L5 CW 3, PR 8 and the Honors twins)
I worked CW 2 (Kai, "at least 20 points") with the most common slip, ≤ for "at least":
1. "Graph these constraints" accepted 2x + 3y ≤ 20 with a ✓.
2. Boundary ✓, solid ✓, shading below ✓, then "✓ Done. **Every constraint checks out.**"
3. The test point is asked against the student's own inequality ("Does (6, 4) satisfy 2x + 3y ≤ 20?"), so a consistent student answers No.
4. Only Submit says otherwise: "75%… still to fix: Modeled constraint 1… Not yet."

The student hears "correct" four times before "wrong", and is never told why ("at least" means ≥). The Combine card even says "Locked until every constraint above is **correct**", and the wrong constraint unlocked it.
- **Fix:** check the written constraint against the situation when the student presses "Graph these constraints", as every later step is checked. The tool has `sourceConstraints` and `expectedConstraints`. Add a specific message for the relation: "'At least 20' means 20 or more: ≥." If the design wants the student to see their own model's graph first, word the step checks as "Your graph matches your inequality", not "checks out".
- **The repair is good:** after "Edit constraints", the boundary and line style stay checked and only the shading reopens.

### F-GRAPH-IN-WORDS (P2, representation; L4 CW 7, CW 12, CW 13, PR 6, PR 10, PR 12; L5 CW 12, CW 13, PR 10)
"Write a linear inequality for graphs a, b and c" shows no graph. Each one is described in a sentence: "a DASHED boundary line through (0, 2) and (1, 6); the shaded half-plane contains (0, 0)". The skill is reading a graph, and these items test reading a description of one. Typed items can carry a `graph` figure (`QuestionVisual`). Draw the shaded half-planes.
- **Keypad tells:** the keypad shows a fraction key only when the answer has a fraction (Graph a has none; b and c do), so it reveals whether the slope is a fraction (P3).
- **Wrong example:** the placeholder "0 ≤ x ≤ 4" is a compound inequality in one variable, not the shape asked for (P3).

### F-SW-TEST-POINT-YESNO (P3; every test-point step in the tool)
"Does the point satisfy inequality 1?" is a Yes/No click, so a 50% guess passes it. WU 3 and PR 11 already ask for the computed value of the left side; the tool's test step could too: "2(6) + 3(4) = [ ]", then Yes/No.

### F-SW-SYSTEM-WORDS (P3, language; L4, a single-inequality lesson)
With one inequality, the tool still says "Find overlap / Combine regions", "The overlap of the shaded sides is hatched" and "Is the point a solution to the entire system?". Systems are tomorrow's lesson (L5). With one constraint: "Check your region" and "Is the point a solution?".

### F-SW-PLACEMENT-HOW (P3, discoverability; every Rewrite step)
After choosing Subtract and typing 2x, "Commit step" stays disabled, and the only instruction is "Place the balanced operation on both sides." (10.5 px). How to place it (click a term, then Before, Under or After) appears only in a hover tooltip. Say it on screen: "Click a term on each side, then choose where the operation goes."

**Pacing.**
- **Classwork is long:** 17 questions, recommended 70 minutes.
- **Context before skill:** the first five items (CW 1–5) are one context (Kai's points). The first tool use (CW 2) is a modeled word problem, and the first bare "Graph y > 4x − 6" comes at CW 6. A student meets the 3-step build and modeling at the same time. Consider moving CW 6 (Activity 4.2) to just after CW 1.
- **Practice and the exit ticket mirror the classwork well:** a bare graph, then a fraction slope, then a rewrite (PR 1–3, DOL 1–2).

**Strong (keep, and copy elsewhere):** the Rewrite step makes the student do the algebra. They choose the operation, type the operand, and place it on both sides. "Nothing was simplified automatically": the student picks the like terms and types 0. After dividing by a negative, "Update the relation symbol(s) yourself". The tool says it plainly: "You did the algebra; MathMaster only checked it."

## A1 M3 T2 L5 Systems of Linear Inequalities (regular and Honors)

All 32 (regular) and 37 (Honors) questions screen clean at 1366×768. The regular file is also clean at 390×844, with no overflow and Submit reachable.

### F-L5-HARDEST-FIRST (P2, pacing; L5 classwork)
The systems students build in classwork run from hardest to plainest:

| Item | System | Steps |
|---|---|---|
| CW 3 (first build) | Noah's raft: a word problem in standard form, 200x + 100y ≤ 800 and 75x + 50y ≥ 150 | 6 |
| CW 5 | x + y > 1, −x + y ≤ 3: rewrite both | 6 |
| CW 7 | parallel boundaries, no solution (a special case) | 4 |
| CW 8 | x ≥ −5, x ≥ 1: two vertical lines (a special case) | 4 |
| CW 14 | y > (3/5)x + 3, y > −(3/5)x + 3: the first plain slope-intercept system, with fraction slopes | 5 |

PR 1 and Exit Ticket 1 test the plain case: two slope-intercept boundaries with an overlap. In classwork it first appears as item 14 of 16. The warm-up only builds one inequality.
- **Fix:** add a plain integer-slope system right after WU 1, before Noah (e.g. y > x − 2 and y ≤ −x + 4), and move CW 3's modeling after CW 5.
- **Hint:** CW 3's hint 1 gives all four intercepts, which is the whole boundary step (F-HINT-GIVES-STEP).

### F-L5-LENGTH (P2, pacing; L4 and L5 classwork)
L5 classwork is 16 questions with a recommended 95 minutes, more than one class period. L4's is 17 questions and 70 minutes. If the deck runs it over two days, split the section (Day 1: CW 1–8; Day 2: CW 9–16), so that a student's "finished classwork" means the day's work.

**Good:**
- **Emma (CW 10–11):** the tool draws a system that has no whole-number points, and the marked point (10, 30) sits about 1.8 units below the calorie line. That is too close to judge by eye, so the algebraic check in CW 11 is genuinely needed.
- **"Choose a point of your own":** CW 8 and CW 10 are checked by the property, not one key.
- **Honors:** the extension (parameters, bounded regions, corners, an open sort of parallel systems) adds depth, not just length, and its exit tickets (band 4) are covered by practice first.

**Small:**
- L4 Honors practice starts at band 3 (it drops the regular PR 1, a band-2 graph), so there is no warm start (P3).
- On a 390 px phone the −10 to 10 grid is about 13 px per unit, under the 44 px touch target. Tapping the exact lattice point is error-prone without zooming in first (P3).
