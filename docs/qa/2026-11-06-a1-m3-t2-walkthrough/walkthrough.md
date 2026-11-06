# Algebra I M3 T2, Lessons 1 and 2 (systems by graphing, by substitution), regular and Honors: student walkthrough

Environment: branch `helper/walk-a1-m3-t2`, from `9feae163`. The 2026-10-22 lesson harness (docs/qa/2026-10-22-walkthroughs/harness), with the family context the 2026-10-23 walk added: each lesson goes through the teacher-import chain and mounts the real `QuestionEngine` with App.jsx's record, policy, Guided Notes, Exit Ticket mode, generation key and `buildStudentFamilyContext` (a class of 30, seated by `planSeatAdditions`). Headless Chromium at 1366×768 and 390×844 (touch).

| Lesson file (teacher-import-jsons/algebra1-module3/) | Questions |
|---|---|
| `T2_L1_Solving_Systems_by_Graphing.json` | 34: WU 3, CW 15, PR 14, DOL 2 |
| `T2_L1_Solving_Systems_by_Graphing_Honors.json` | 38: WU 3, CW 17, PR 16, DOL 2 |
| `T2_L2_Solving_Systems_by_Substitution.json` | 40: WU 3, CW 19, PR 16, DOL 2 |
| `T2_L2_Solving_Systems_by_Substitution_Honors.json` | 39: WU 3, CW 18, PR 16, DOL 2 |

None of the four is built by a script under scripts/content/; they were edited directly.

Priorities, as in the 2026-11-03 walkthrough: **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or understanding. **P3** is polish.

## What was done

- **Keys, checked by hand, every item.** Each fixed-number key in Classwork and Practice, regular and Honors, was worked out from the item's own numbers: the ticket, savings, candle, streaming, car-rental, trade, potato-salad, fair, seat-price and snack systems; the intercepts, slopes, domains and ranges; the parameter items (k, a, b, m, C); the error analyses; and the sort boards' categories. **All keys are right.**
- **Every generated version, checked the same way.** The 43 Warm-Up, Practice and DOL slots use 11 Question Families. Each slot's family was enumerated under the slot's own constraints, and again under the reduce-complexity support (61 lists). Every version was built as a student receives it, its equations were read back from the text the student sees, and every key was recomputed in exact fractions: the intersection or the case of each system, the slopes and intercepts, the substituted value, the multi-step solution, the context model's two equations, its solution and its follow-up number. **About 7.5 million versions, 0 disagreements.** The lists were walked whole, except four spaces too large to walk, which were sampled with 200,000 candidates per case: the distributive Warm-Up equation (L2 WU 2, regular and Honors) and the fractional-solution systems (L2 Honors PR 2, PR 4, DOL 1).
- **Worked steps and hints.** The authored steps, hints and back-up steps were read against each item, and the generic ones on templated slots against every case they can meet. The tools' own worked solutions were generated for 60 versions of every templated slot and for every static tool item. Every equation they state was checked at that version's own solution, and every "number = number" was evaluated: about 3,600 claims, all true, apart from the deliberately false statements of the no-solution systems ("0 = −21/2 is false whatever x and y are"). One wrong worked step and one set of hints in the wrong letters were found and fixed (below).
- **Screen pass, every question at both sizes** (302 views). The automated flags: page errors, unfilled templates, raw LaTeX, `undefined` or `NaN`, sideways scroll, controls off the screen and unnamed inputs. Then the screenshots were read by eye.
- **Read-aloud sweep.** 3,340 distinct texts (prompts, labels, options, hints, back-up steps, worked steps, scenario text, figure cards), static and 12 versions of each templated slot, went through `speechTextFor`.
- **Interactive pass.** A wrong try, then the right one, on each tool and mode (table below).
- **Right answers in other spellings.** Every static typed box was graded through the shared grader with the spellings a student is likely to use: Unicode minus, no spaces, pairs without brackets, fractions and mixed numbers for decimals, reordered terms, swapped sides, a product sign, prices with $.

## Fixed

### F-L1-CW14-STEP (P2, worked step; L1 CW 14 and L1 Honors CW 14)
**What a student met:** the sort's worked solution explained the no-solution cards as "Same slope, different y-intercepts (4 and 4; −1 and −1)". Those numbers are the two pairs' slopes. Placed after "different y-intercepts", they tell a student the intercepts are 4 and 4, which is the opposite of the point.
- **Fix:** "Same slope (4 and 4; −1 and −1), different y-intercepts (−1 and 5; 6 and 2): parallel, no solution — inconsistent."
- **Test:** `tests/platform/algebra1M3T2SystemsWalkthrough.test.mjs`. Every sort board of systems in the four files is checked: each card's graded category is the case its own two equations make, and every slope and y-intercept a worked step lists in brackets belongs to the cards that sentence explains. Mutation-checked: the old sentence back, and a parallel pair keyed as one line, each go red.
- **Commit:** `c42c1f65`.

### F-L1-CW7-LETTERS (P3, hints; L1 CW 7 and L1 Honors CW 6)
**What a student met:** the ticket system 5s + 10a = 3000 and s + a = 450 is graphed on s and a axes, with s and a boxes. Its hint 1 said "substitute two x-values into its equation. The y-intercept is often the easiest first point", and hint 3 "compare the y-intercepts". Neither equation has an x or a y.
- **Fix:** "substitute two values of s … The a-intercept …" and "compare the a-intercepts".
- **Test:** the same file. Every Systems Workspace item in other letters names no x-values, y-intercepts, x-terms or axes in its hints, back-up step and worked steps, and a graph's hints name its own letters. Mutation-checked.
- **Commit:** `910462ad`.
- **Left as it is:** the workspace's own worked solution for the same item still speaks in x and y (F-SW-REVIEW-LETTERS, below).

### F-L2H-PROMPT-LINES (P2, display; L2 Honors CW 11, PR 9, PR 11, PR 12)
**What a student met:** four Honors prompts are written as lists, one system or one step per line. The task card shows a prompt as one paragraph, so the lines ran together: "…System A: y = 3x − 2 and 6x − 2y = a System B: kx + 2y = 7 and y = −2x + 1", with the parameter a running into "System B". In PR 11, an error analysis whose task is to find the first wrong step, Ana's four steps read as one line ("…= 14 Step 3: 5x − 8 − 6x = 14 Step 4: −x = 22…").
- **Fix (content):** each listed line ends with a full stop, and the line breaks stay. The card now reads "…6x − 2y = a. System B: …" and "Step 1: y = (4 − 3x)/2. Step 2: … = 14. Step 3: …". Checked in the browser, and Read aloud now pauses between them.
- **Cause, logged for the platform:** F-PROMPT-LINES below.
- **Test:** the same file. Every line of a multi-line prompt in the four files ends a sentence. Mutation-checked: one full stop removed goes red.
- **Commit:** `773176a5`.

## Logged, not fixed

### F-READ-PRICES (P2 for a student who uses Read aloud; 12 items, two of them exit tickets)
Read aloud joins the words between two prices into one piece of mathematics, so the words are read as symbols and the prices lose "dollars":

| Item | Written | Said |
|---|---|---|
| L2 PR 5, DOL 2; Honors PR 6, DOL 2 (the seat-price versions of `systems.contextModel`) | "…and collected $4,890. A main-floor seat costs $5 more than a balcony seat." | "…and collected 4,890. A main minus floor seat costs 5 more than a balcony seat." |
| L1 CW 12 | "Diego still saves $10 a week: y = 10x + 40. Isabella deposits $4 on Tuesdays…" | "Diego still saves 10 a week: … Isabella deposits 4 on Tuesdays…" |
| L1 PR 8 | "…a $24 sign-up fee plus $8 per month…" | "…a 24 dollars sign-up fee plus 8 per month…" |
| L1 Honors PR 8 | "Company B charges $25 plus $0.40 per mile" | "Company B charges 25 plus 40 cents per mile" |

Also L1 CW 13 (an option and two worked steps), the Honors copies of L1 CW 12 and CW 13, L1 Honors CW 8 (two options, "450 × $5") and L1 Honors PR 10 (a worked step).
- **The screen is right.** The display's splitter (`splitMathSegments`) keeps each of these sentences as prose.
- **Cause:** Read aloud's own splitter, `segmentMathText(…, { speech: true })` in `src/platform/language/mathSafeText.js`, refuses a price-then-prose span only when the word after the price has two or more letters (`/^\$\d[\d,]*(?:\.\d+)?[,;:.]?\s+[A-Za-z]{2,}/`). "$4,890. A main-floor" and "$10 a week" start with the one-letter article. And any `=` in the span (`/[\\{}^=]/`) makes it mathematics anyway.
- **Fix I would make (not mine to edit: a read-aloud file another batch owns):**
  - read a price followed by a one-letter word and then a word ("$10 a week", "$4,890. A main") as prose;
  - apply the price-then-prose refusal before the `=` exception, as the display's `isCurrencyProseOpening` does (a word of three or more letters after the amount means currency);
  - a test with these sentences, said with "dollars" and "main-floor".

### F-PROMPT-LINES (P2, display; platform, four items here and more elsewhere)
The task card shows a prompt as one paragraph: `QuestionPrompt` has no line-break handling, so every `\n` becomes a space. Prompts written as lists run together. Fixed here in content (F-L2H-PROMPT-LINES above). Still affected elsewhere, for whoever owns those lessons:
- Algebra I M3 T1 L1 (6 prompts) and its Honors file (5), T1 L3 and its Honors file (4 each): the other Module 3 walkthrough's lessons;
- Algebra II Honors District DOL 2 review (1).
- **Fix I would make:** render a single line break in a task prompt as a line break (`white-space: pre-line` on the prose spans, or split at `\n`), with a browser check that bank items with stray newlines do not gain blank lines. Until then, the same content fix: each listed line ends a sentence.

### F-MEANING-EMPTY (P3, display; "Interpret a Point in Context": L1 CW 8, PR 13; L1 Honors CW 7, PR 9; L2 Honors PR 14)
**What a student meets:** before anything is typed, the graph already marks a point "(0, 0)" with the ring and dashed guides that show the student's entry. On L1 CW 8 (and Honors CW 7) that empty state also draws the a-axis from −400 to 500, so both ticket lines run on into negative numbers of adult tickets. Once a value is typed, the window is the authored 0 to 500 (observed: "x from 0 to about 784.4, y from 0 to 500" in the graph read-out after the right answer).
- **Cause of the point:** `buildInterpretationGraph` (`functions/shared/toolMath/scenario/contextInterpretationUtils.mjs`) reads an empty box as `Number('')`, which is 0, so `showPoint` is true with the label "(0, 0)".
- **Fix I would make:** read an empty value as no value (`String(value).trim() === '' ? NaN : Number(value)`), with a test that an empty builder draws no point. Shared tool code, so logged.

### F-PAIR-MIXED (P3, grading; shared grader)
A mixed number inside an ordered pair is refused, though a number box takes one (GR13):
- L1 Honors PR 7: "(1 1/3, 1 2/3)" for (4/3, 5/3), and "(1⅓, 1⅔)";
- L2 CW 13 and L2 Honors CW 13: "(−5 1/3, 2 1/3)" for (−16/3, 7/3);
- L2 Honors PR 9: "(1 2/5, 2/5)" for (7/5, 2/5).

The improper fractions, the exact decimal "(1.4, 0.4)", a Unicode minus and the pair without brackets are all accepted. Every other right spelling tried on every static typed box was accepted. The refusals were the boxes that ask for a form ("x + y = 5" where slope-intercept form is asked) and words in a number box ("15 dollars").
- **Fix I would make:** `parseOrderedPair` / `compareOrderedPair` (`functions/shared/answerUtils.mjs`) read each coordinate with the number box's mixed-number reader (`answerEquivalence.sameMixedNumber`), with cases in the grader's own tests. Not fixed: the shared grader is another batch's file, and a grading change goes through its tests.

### F-SW-REVIEW-LETTERS (P3, worked solution; L1 CW 7 and L1 Honors CW 6)
After the question closes, the Systems Workspace's own worked solution for the ticket system says "Equation 1 is y = −0.5x + 300 (slope −0.5, y-intercept 300)… substitute two x-values… Collect the x-terms: 0.5x = 150, so x = 300. Substitute x = 300 into Equation 1: y = …". Every value is right, but the student's Equation 1 is 5s + 10a = 3000, in s and a, as the axes and boxes are.
- **Cause:** `linearReview` in `src/tools/shared/reviews/systemsWorkspaceReview.js` writes x and y; the screen takes the item's letters from `systemAxisNames`.
- **Fix I would make:** take the letters from `systemAxisNames(question)` in `linearReview`, and name the authored equation first ("Equation 1, 5s + 10a = 3000, is a = −0.5s + 300"), with a case in `tests/tools/systemsWorkspaceSolutionReview.test.mjs`. Only these two items in any lesson have a lettered linear system. Not done here: a platform change in a shared builder, for a P3.

### F-READ-SYMBOLS (P3, Read aloud; speechText.js, another batch's file)
- **→** is passed raw in 34 texts here, mostly worked steps ("−2y = −6x − 4 → y = 3x + 2"); already listed in the November handoff, section 6.
- **½** is passed raw: L1 CW 14's card "y = ½x + 4 and x − 2y = −8" and its worked step ("y equals ½ x plus 4").
- **A minus before the letter a** is left raw when the article reading wins: L1 Honors CW 8's feedback "Substitute s = 450 − a into 5s + 10a = C" is said "s equals 450 − a into…".
- **Two letters side by side are read as a word:** L2 Honors PR 9 "3x + my = 5" is said "3x plus my equals 5", and Honors CW 11 "kx + 2y = 7" "kx plus…".

### F-L2-CW3-ESTIMATE (P3, tolerance; L2 CW 3)
"Estimate from the graph: about how many pounds of potatoes, to the nearest whole pound?" accepts only 25. The crossing is at 24.87. The item authors a graph from 0 to 32 labelled by 4s, which puts a gridline at 24; the display widens a window to keep every line in frame (y = 8x reaches 48), so the student sees 0 to 60 labelled by 10s, with faint lines between. A student who reads "about 24" from the graph is marked wrong on an estimate.
- **Suggested:** `lockViewport: true` on the graph, so the authored grid is the one read, and `numericTolerance: 1` on both estimate boxes (the grader reads it, GR35b). A pedagogy choice, so not changed. The same widening draws L1 CW 4 down to −50 and L2 CW 13 out to −12, where it does no harm.

### F-L2-CW12-HALF-AN-ADULT (P3, content; L2 CW 12 and L2 Honors CW 12)
"There are 449 people at the fair, and they pay $2,768 in admission fees" ($7 an adult, $5 a child). The system's solution is 261.5 adults and 187.5 children. No box asks for it, but the activity is "Writing and Solving Systems", and a class that goes on to solve it meets half a person.
- **Suggested:** $2,767 (261 adults, 188 children), or 450 people (259 and 191). Either changes a key ("fees" or "people"), so it waits for the author and a re-import.

### F-L1-CW4-DOMAIN (P3, precision; L1 CW 4 and L1 Honors CW 4)
The reasonable domain is keyed "Whole numbers of student tickets from 0 to 600". Since a = 300 − s/2, only an even number of student tickets gives a whole number of adult tickets, so s = 1 is not reasonable. The range key ("whole numbers of adult tickets from 0 to 300") is exact. It is the best of the four options, so it is not wrong as a choice; a precise option ("even numbers of student tickets from 0 to 600") changes the key, so it is logged.

### F-L1H-PR11-GIVEN (P3, pedagogy; L1 Honors PR 11)
"One through (0, 5) and (5, 0), and one through (0, −1) and (2, 3)": the second line's given point (2, 3) is the system's solution. A student who checks the given points in the first equation has the answer without solving.

### F-SORT-WORDS (P3, wording; every sort of systems: L1 CW 14 and PR 14, L1 Honors CW 14)
The board calls its cards figures ("Step 1. Match each figure to a category", "5 of 6 figures are in the right category") though each card is a system of equations. The words come from the figure-match tool. "Card" or "system" would match what the student sees.

### Pacing (P2/P3, logged with evidence, none changed)
- **Classwork is long:** L1 15 questions in 70 minutes (Honors 17), L2 19 questions in 90 minutes (Honors 18 in 75). As with L4 and L5 (handoff section 5, the two-day classwork), a student's "finished classwork" spans more than a period. The same three options apply.
- **L2's worked example comes before the tool:** CW 4 solves Sofia's decimal system by hand, rounded to hundredths (x ≈ 3.11), and the Systems Workspace's first use is CW 5 (y = 3x − 4). The hardest arithmetic of the lesson is its first substitution.
- **Generic hints on special cases:** hint 3 of every construct item ("Lines with the same slope never cross unless they are the same line…") also shows on the systems whose lines have different slopes (L1 CW 7, CW 11, PR 8).
- **Keys that give an answer away:** L2 CW 7 ("$10.50 behind") and CW 1 (6.25 and 5 chickens) are in the handoff's section 5 and were left as they are. No hint states a box's key (checked against every static key).

## Interactive pass

A wrong try, then the right one, in the real `QuestionEngine` at 1366×768 (and 390×844 by touch where noted), driven through the rendered controls.

| Item | Tool / mode | Wrong try | What the student was told | Result |
|---|---|---|---|---|
| L2 CW 1 (trades) | typed equations, numbers and choices | the pig as 4 chickens | "83% partial credit so far · 5 of 6 parts right — still to fix: One pig is worth how many chickens?…", the box marked "✗ Check this" | right on try 2: "Correct! This question is complete." |
| L1 CW 7 (tickets) | Systems Workspace, graph it yourself, in s and a | Equation 2 through (400, 0) | "75% … still to fix: Equation 2: two points on its line. The line for Equation 2 is not graphed right yet. Every point you plot must make its equation true: substitute its s-value into the equation and compare the a-value." | right on try 2: "Correct — your lines meet at exactly one point, (300, 150)." |
| L1 CW 14 (sort) | figure match, fixed categories | the one-line pair (card 3) filed as "no solution" | "83% … 5 of 6 figures are in the right category. Card 3 is not in the right category yet." | right on try 2 |
| L1 CW 8 (meaning of (300, 150)) | point-meaning builder | the two quantities swapped | "67% … still to fix: Independent quantity in the point, Dependent quantity in the point" | right on try 2 |
| L2 CW 5 (y = 3x − 4) | Systems Workspace, substitution | the isolated expression put back into Equation 1 | "That placement puts the expression back into the equation it came from. Ask which equation needs the isolated expression to leave only one variable." | as designed; placed in Equation 2, Step Algebra opens on 2x + 5(3x − 4) = 31, distribution left to the student |
| L1 DOL 2 (classify) | exit ticket, typed and chosen | every part answered, some wrong | "Response submitted · Feedback opens later · Your answer is saved. You will see whether it is right when this activity's results open." No Submit after it. | as designed: one try, no verdict |
| L1 DOL 1 (this seat: y = 2x + 7 and 2x − 2y = −8) | exit ticket, Systems Workspace graph | the second line one unit high | the same "Your answer is saved…"; recorded at 75%, not shown | as designed |
| L1 CW 3 (5s + 10a = 3000) | graph from intercepts, standard form | (300, 0) and (0, 400), the intercepts switched | 0%: "That construction does not match the target line yet. Start from the piece of information this form gives you directly." | right on try 2: "Correct — your construction determines exactly the target line." |
| L1 WU 2 (this seat: g(x) = −x − 3) | graph from slope-intercept form | (0, −3) and a second point one unit high | 50%: "Point P1 is on the line, but the other one is not. Keep the good point and move the other." | right on try 2 |

**At 390×844 by touch:** L2 CW 1, L1 CW 7, CW 14, CW 8, CW 3 (the plane tapped) and L1 DOL 2 were worked again the same way, with the same messages and the same results.

**Not driven here:** the representation bridge's process board (L1 Honors WU 1, PR 5), Step Algebra's own solve (L2 WU 2, and the one-variable equation the substitution workspace opens), and the workspace's reading of a statement with no variable (L2 CW 8, CW 10, PR 7–9). They rendered cleanly at both sizes, their keys and worked solutions were checked in node (above), and their mechanics are driven by CI's own browser drivers (`linearMultipleRepresentations*`, `algebraicSubstitutionHandoff`, `questionFamilyCases` and the Step Algebra driver they share).

## Screen pass

All 151 questions were opened at 1366×768 and at 390×844 by touch, 302 views. Pre-Flight in the browser is valid for all four files, with no warnings.

**No problems found by the automated flags:**
- no page errors;
- no unfilled `{{…}}` templates, raw LaTeX, `undefined` or `NaN`;
- no sideways scroll, and no control off the screen;
- every input, choice and button has a name.

**The final action:** 119 questions show their Submit from the start. The other 32 are Step Algebra (L2 WU 2, regular and Honors) and the substitution workspace, whose Check appears as the work proceeds, the trained interaction the 2026-10-23 walk also recorded. The interactive pass reached it.

**Read by eye:** every laptop screenshot and the phone screenshots of every tool. Found:
- the run-together list prompts (F-L2H-PROMPT-LINES, fixed);
- the empty "Interpret a Point in Context" graph (F-MEANING-EMPTY);
- L2 CW 3's widened graph (F-L2-CW3-ESTIMATE).

**Checked, not changed:**
- **The phone's task panel:** its Read aloud button is half hidden until the panel scrolls, the known panel scroll recorded on 2026-10-23.
- **The phone workspace:** on L1 CW 7, the Systems Workspace scrolls inside its own panel, and its Submit is reachable by a normal scroll.
- **L1 CW 3's graphing tool:** it labels its axes x and y for 5s + 10a = 3000. The prompt says so ("s (as x)"), and the line it reports back is "y = −1/2 x + 300".
- **The closed construct graph's read-out:** it says "crosses the y-axis at 300" on s and a axes (P3, for whoever owns the figure descriptions).

## What works well

- **Every key is right**, the static ones and about 7.5 million generated versions, and the tools' own worked solutions state only true equations.
- **Feedback names the part to fix** without giving it: the box ("still to fix: One pig is worth…"), the card ("Card 3 is not in the right category yet"), the line ("The line for Equation 2 is not graphed right yet… substitute its s-value"), the point ("Point P1 is on the line, but the other one is not").
- **The ticket system speaks its own letters** on the graph, in every box and in its check, after the 2026-10-23 fix; the hints now do too.
- **Substitution is the student's own work:** the workspace refuses to place an expression back into its own equation and says why, then opens Step Algebra with the distribution left to do.
- **Exit tickets** take one try and say only that the answer is saved, on the typed board and on the graph alike.
- **Typed answers are read generously:** reordered terms, swapped sides, a multiple of a standard form, fractions for decimals, mixed numbers in number boxes, Unicode minus and prices with $ are all accepted.
- **The Honors files add depth** (parameters that decide the case, lines that look parallel in the window but meet at (30, 17), solutions that only algebra can make exact, three lines through one point, a system with no coefficient of 1), not only more items.

## Files changed, and what a release needs

- `teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing.json`: CW 14's worked step, CW 7's hints.
- `teacher-import-jsons/algebra1-module3/T2_L1_Solving_Systems_by_Graphing_Honors.json`: the same two, in CW 14 and CW 6.
- `teacher-import-jsons/algebra1-module3/T2_L2_Solving_Systems_by_Substitution_Honors.json`: four prompts' punctuation.
- `tests/platform/algebra1M3T2SystemsWalkthrough.test.mjs` (new).

No key, field, option, id or weight changed, so the order of choices on screen is unchanged and no Recovery binding moves. Nothing here needs a Functions, rules or Hosting deploy. The three lesson files reach a class when its teacher imports them again, at any time.
