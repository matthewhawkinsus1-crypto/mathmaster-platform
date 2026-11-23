# Thanksgiving Break Packets: every question on a screen

Date: 2026-11-21. Files checked: `teacher-import-jsons/thanksgiving-packet/Algebra1_Thanksgiving_Packet.json` (54 questions), `Algebra1_Thanksgiving_Packet_Honors.json` (65) and `Algebra2_Honors_Thanksgiving_Packet.json` (78).

Before this check, the packets had passed their own tests but nobody had seen a question on a screen. This is the record of looking at all of them in a real browser, answering them as a student, and what was changed.

## The short version

- All 197 questions open on a desktop and on a phone with no error, and nothing runs off the side of the phone.
- Every question that names a worked example shows it. It opens by itself on the first question of a skill and from the Hint button on the others, and "Your turn" returns to the question.
- The answering below was done on 2026-11-21, before the platform's own example player was merged. The packets were then fitted to that player and every screen was opened again on 2026-11-23; see "Re-checked against the platform's example player".
- One question of every tool in each file was answered right and wrong through the screen. Every right answer was accepted. Every wrong one was refused with a message, the answer and the worked solution stayed hidden, and another try was offered.
- Five things were fixed: three in the packets and two small ones in the platform. They are listed below.
- Nothing found stops a student from finishing a question. The most important thing left alone is a grading slip: `[−1, ∞]` is marked correct.
- Not everything was answered to the end. The list is under "What was not checked".

## Re-checked against the platform's example player (2026-11-23)

The first check ran against an example player that was built alongside the packets. The platform's own player reached main first, with more in it (tool replays, "Why this step?", "Spot the mistake", graded follow-through parts and checked steps). The packets were moved onto it and that earlier player was dropped. What changed:

**The player's guard is stricter.** An authored example is not played on a question when its problem, a step or a "why" contains one of that question's answers, and a short answer such as 3 counts wherever it stands alone as a number. A hidden example is replaced by the platform's own similar problem, or by nothing. Pre-Flight does not warn about it. Under this rule 28 examples were hidden (13 in Algebra I, 3 more in Honors, 12 in Algebra II), five of them with nothing in their place. Each was given new numbers, with the same method and difficulty:

| File | Example | Now |
|---|---|---|
| Algebra I | `ex-rate-table` | rows (1, 9), (3, 17), (4, 21), (8, 37) |
| Algebra I | `ex-equation-from-table` | rows (−1, 1), (0, 5), (1, 9), (5, 25) |
| Algebra I | `ex-line-two-points` | through (2, 6) and (4, 14): y = 4x − 2 |
| Algebra I | `ex-translate-vertical`, `ex-translate-horizontal` | points (−3, −3), (1, 1), (5, 5) under f(x) − 8 and f(x + 10) |
| Algebra I | `ex-parallel-line` | parallel to y = 3x − 4 through (4, 1) |
| Algebra I | `ex-perpendicular-line` | perpendicular to y = (2/5)x + 4 through (2, 7) |
| Algebra I | `ex-solve-inequality`, `ex-inequality-reverse` | 2x + 3 > 21 and −5x + 3 ≤ 13 |
| Algebra I | `ex-graph-system` | y = 3x and y = x + 6, crossing at (3, 9) |
| Algebra I Honors | `ex-geometric-sequence` | 625, 125, 25, 5 (ratio 1/5) |
| Algebra II Honors | `ex-u2-identify`, `ex-u2-map`, `ex-u2-match` | vertex (−4, 5); y = 3√(x + 1) − 4; center (−5, 4) |
| Algebra II Honors | `ex-u3-derive` | the inverse of f(x) = 4x + 20 |
| Algebra II Honors | `ex-u4-vertex`, `ex-u4-plot` | vertex (5, −4); g(x) = −\|x + 8\| + 9 |
| Algebra II Honors | `ex-u8-trinomial-signs` | x² − 7x − 8 |
| Algebra II Honors | `ex-u9-add`, `ex-u9-multiply` | √8 + √32; 2√3 · 5√15 |
| Algebra II Honors | `ex-u10-evaluate`, `ex-u10-properties` | 27^(5/3); (y^(3/5))^10 |
| Algebra II Honors | `ex-u11-rational` | (x − 1)^(5/2) = 32 |

The guided note that quotes an example on one line was changed with it.

**What plays now.** Every question that names an example is played that example. Two later Algebra I questions that borrow their skill's first example (`tg-u3-q2`, and `tg-u4-h1` in Honors) are played the platform's own similar problem instead, because the borrowed numbers meet their own answers. Four Algebra I Step Algebra examples and the Algebra II "isolate the radical first" example are played as tool replays: the board's own lines, from the lesson's moves. The Algebra II one is now written for the radical equation tool, whose replay knows the squaring move.

**Opening.** On Classwork the example opens by itself before the first question on a skill. On the second question of a skill it opens again, faded, only where the example hands over (a built-in replay does; the packets' step cards do not). An example that opens by itself is recorded as shown, not as help the student asked for, so it does not make the attempt a supported one.

**Follow-through is graded.** A later part of an answer box is marked right on the answer that follows from the student's own earlier value, as well as on its own key. Every such part of the packets was graded with a slip carried through and with a wrong value. One part does not benefit: Algebra II Unit 3 question 7, where the later answer is the earlier expression plus 1. A carried expression is keyed in brackets and the comparison reads it as written, so the simplified answer from a slip is still marked wrong there, as it would be with no follow-through.

**The checked step.** Algebra II Unit 8 question 6 (the ac method) opens its last part on a factor-pair step in the tool. The step now names the trinomial it works on, which the validator requires.

**One platform fix.** The player's Back button and the "Spot the mistake" choices changed one border property while the whole border was set, which made React log a console warning on every example. The whole border is swapped now.

**Screens.** `node tests/browser/thanksgivingPacketCheck.mjs` was run again on all three files at both widths, against the platform's player: 394 of 394 screens passed (108 Algebra I, 130 Algebra I Honors, 156 Algebra II Honors), with no console error and nothing off the side. The lesson's own example plays on 53 of 54, 63 of 65 and 70 of 78 questions; the platform's own plays on the two borrowers named above and on the two Algebra II parent-function questions; the six SAT questions are Practice and are offered none.

**Not re-done on 2026-11-23.** The answering described below (right and wrong answers through the screen) was not repeated on the platform's player. The tools, the graders and unlimited tries are the same code; the example player, follow-through labels and the checked step are new on those screens and were seen only as far as the sweep goes: each question renders, its example opens and closes, and nothing runs off the side. The checked step on Unit 8 question 6 was not driven. "Why this step?" and "Spot the mistake" were not driven on packet questions.

## What was checked and how

**Mounting.** A small page (`tests/browser/thanksgivingPacketCheckMain.jsx`) compiles each packet the way an import does, stores it and reads it back the way the student's screen does, and puts one question in the real question engine as a student on Classwork with unlimited tries. It was opened in Chromium at 1366×768 and at 390×844.

**Every question, both widths** (`tests/browser/thanksgivingPacketCheck.mjs`). For each of the 197 questions, at each width:

- it renders with no page error, no console error and no error text;
- the strip above it says "Unlimited tries on this question";
- its worked example opens by itself or on request, as the player's rules say it should, is the lesson's own example wherever the question names one, and closes on "Your turn";
- nothing reaches past the right edge, with the example open and with it closed.

| File | Questions | Rendered, desktop | Rendered, phone | Authored example plays | Platform's own example | No example |
|---|---|---|---|---|---|---|
| Algebra I | 54 | 54 | 54 | 54 | 0 | 0 |
| Algebra I Honors | 65 | 65 | 65 | 65 | 0 | 0 |
| Algebra II Honors | 78 | 78 | 78 | 70 | 2 | 6 |

The two with the platform's own example are the parent-function questions of Unit 2, as the packet intends. The six with none are the SAT questions, which are Practice.

The whole check was run again after the fixes below: 393 of the 394 screens passed. One (`tg-u7-q4` in the Honors file, on the phone) stopped on a click that timed out while the machine was busy; it passed three times out of three when run again by itself.

**Reading each screen.** The text of every question's screen was read against its prompt (same equation, same numbers, same points, nothing pre-filled that is an answer), and a picture of each tool in each file was looked at, desktop and phone.

**Answering as a student.** For each tool, in each file, a script clicked and typed in the real controls: plotting points on the grid, drawing mapping arrows, placing cards, choosing from lists, typing in the math boxes, using the balance buttons of Step Algebra. Nothing was put into the question's state from outside. Each script first gave a wrong answer a student would plausibly give (slope upside down, a closed circle for `<`, the sign of h flipped, the inequality symbol not reversed), then the right one.

| File | Questions answered | Right answer accepted | Wrong answer refused as a try | Wrong step refused inside the tool |
|---|---|---|---|---|
| Algebra I, desktop | 33 of 54 | 33 | 28 | 5 |
| Algebra I Honors, desktop | 38 of 65 | 38 | 31 | 6 |
| Algebra II Honors, desktop | 45 of 78 | 43 (2 more only part of the way) | 40 | 1 |
| Algebra I Honors, phone | 12 | 11 | 11 | 1 |
| Algebra II Honors, phone | 10 | 10 | 10 | 0 |

"Refused inside the tool" is Step Algebra and the substitution workspace. They do not let a wrong step become an answer: the step is refused on the spot with a sentence and no try is used.

After every graded miss the screen was checked for four things: the try was marked wrong, the words "tries are unlimited on this question" were there, no worked solution was shown, and none of the question's solution steps appeared anywhere on the page. All held, with one explained exception: on `tgp-u3-7` one line of the solution is on the page before and after a miss, because the label of its second part says the same thing.

A few questions have no wrong answer in the counts: two where only the right answer was driven (`tgp-u1-3`, `tgp-u5-1`), the no-solution system `tg-u9-h1`, and the two that were only driven part of the way.

Tools answered right and wrong, by file:

- **Algebra I and Algebra I Honors** (the Honors-only questions in the Honors file): mapping diagram, open sort, intercepts from a graph, domain and range, the Multiple Representations board (from a graph and from a story), the table workbench (rate, and rate with an equation), graphing a line (slope-intercept, intercepts, horizontal, vertical, parallel, perpendicular), sequences (arithmetic, with f(10), geometric), the data lab, transformations (plot the images, map one point), Step Algebra (one step, two steps, no solution), the number line, inequalities in Step Algebra with their graph (keeping and reversing the symbol), systems by graphing (one solution, none), substitution (one solution, none), inequalities in two variables (one, a system, one written from a story), and the answer boxes (two systems from stories, the perpendicular line).
- **Algebra II Honors:** the number line with interval notation (interval, ray, union), relation with mapping and plot, graph analysis (domain and range, with a vertex), transformations (read a, h, k; describe; map a point; match; plot the images), inverse and composition (undo, derive the inverse, compose), the Polynomial Workshop (add, subtract, area model, long division, synthetic division, factor theorem both ways, factoring), Step Algebra with an absolute value equation, elimination 2×2, the Matrix Lab (multiply, write the equation, solve, model and solve), the fixed-category sort (two of them), the radical solver (a solution, an extraneous one), six answer-box questions, and two SAT questions (a number and a choice).

## Defects found and fixed

### Algebra I and Algebra I Honors

- **Unit 2 questions 4 and 8 (`tg-u2-q4`, `tg-u2-q8`): the right meaning was always the first choice.** On the bowling and melting-ice boards, "What the slope means" and "What the y-intercept means" each listed the right sentence first, and so did the list for x on question 4. A student who picked the top of each list got full marks. The right choice is now in a different place in each list.
- **Unit 6 question 7, Unit 7 question 6 and the Unit 7 Honors question (`tg-u6-q7`, `tg-u7-q6`, `tg-u7-h1`): the Hint button offered the wrong example.** These questions named no example, so the platform offered the first example of the skill: a one-step equation for an equation with like terms on both sides, and an inequality that keeps its symbol for two that reverse it. Each now names the example for its own method (the multi-step equation, the inequality that reverses). The builder used to refuse an example named twice; it now allows it, and the packet test holds exactly which questions do.

### Algebra II Honors

- **Unit 1 questions 1 to 3 (`tgp-u1-1`, `tgp-u1-2`, `tgp-u1-3`): the number line was centred on the answer.** The tool chose its own window from the answer: −5 to 10 labelled every 2.5 for −2 < x ≤ 6, so neither endpoint sat on a labelled tick and the answer was in the middle of the screen. They now open on a plain −10 to 10 line, as the Algebra I number line already did.
- **Unit 3 question 3 and Unit 5 question 3 (`tgp-u3-3`, `tgp-u5-3`): the Hint button offered the wrong example.** "Find the inverse of f(x) = −5x + 15" offered the example about undoing one value, and the second 3×3 system offered the 2×2 example. Each now names the example for its own method, with a one-sentence idea in its guided notes.

### The platform

- **"Submitting it again uses another try" under unlimited tries.** After a miss, the line under the question said "This is the same answer as your last try. Submitting it again uses another try." right below "tries are unlimited on this question". With unlimited tries it now says "This is the same answer as your last try. Change it before you submit again." Counted questions keep the old sentence. (`src/platform/student/submitCost.js`, test in `tests/platform/studentWords.test.mjs`.)
- **Matrix Lab: a wrong cell that was fixed lost its border colour.** The cell set a border and, when wrong, a border colour beside it; when the cell was fixed the colour was removed and the border turned the colour of the text. It also wrote a warning to the browser console. The cell now swaps the whole border. (`src/tools/matrixLab/matrixLabUi.jsx`, test in `tests/tools/matrixLabFeedback.test.mjs`.)

After the fixes all three files still pass `validate:authoring-v5` and Pre-Flight with 0 errors and 0 warnings, and the two packet tests pass.

## Defects found and not fixed

Severity: **high** stops a student, **medium** teaches or allows something wrong, **low** is friction.

| Severity | Where | What a student sees | Why it was left |
|---|---|---|---|
| Medium | Number line with interval notation (`tgp-u1-2`, and any ray) | `[−1, ∞]`, a square bracket on infinity, is marked correct. | It is grading. Grading was not to be changed here. |
| Medium | Inequality written from a story (`tg-u10-q4`, `tg-u10-h1`) | Choose the wrong symbol and the tool answers: "“At most $10” means $10 or less: ≤." The right symbol is given after one miss. | It is the tool's own teaching message, used by other lessons. A design decision for the owner. |
| Low | Every "Graph y = …" question (Graphing) | As soon as two points are plotted the panel shows "Your line: y = 2x + 3". A student can drag a point until it reads the equation in the prompt. | Deliberate in practice sections, by a comment in the code. Worth a second look for unlimited tries. |
| Low | Inequalities in Step Algebra (seen on `tg-u7-q4`; `tg-u7-q6` and `tg-u7-h1` use the same tool) | After dividing by a negative number the tool says "Update the relation symbol(s) yourself before continuing" and waits. It does not say this after dividing by a positive number, so it tells the student the symbol must change. | Tool behaviour; it still does not say which symbol. |
| Low | Questions that start a new method inside one skill (`tg-u6-q2` to `tg-u6-q6`, `tg-u7-q4`, and others) | Their example does not open by itself. Only the first Step Algebra question of the unit does. The student has to press Hint, then "Try a similar one". | The platform's rule: one example opens by itself per skill. Not to be changed here. |
| Low | `tg-u4-h1`, `tg-u10-q3`, `tg-u10-q6`, `tgp-u7-3`, `tgp-u7-8` | On request they get the first example of their skill, which is close but not their exact case (a shift for a reflect-stretch-shift; a graph for a rewrite-then-graph). | No closer example is written. |
| Low | SAT section, 6 questions | No worked example and no similar problem, only hints. | By design: they are audited Practice items with each student's own numbers. |
| Low | `tgp-u3-7`, `tgp-u8-6` (answer boxes "one step at a time") | The labels of the parts contain most of the working, and a later label shows the answer to an earlier part (part 4 of `tgp-u8-6` prints the 2 and the 6 that parts 2 and 3 ask for). | Intended as a scaffold. A student can go on with a blank part, read it, and go back. |
| Low | Sequences, on a phone (`tg-u3-q1`, `tg-u3-q2`, `tg-u3-h1`) | The table shows terms 1 to 4. The box for term 5 is off the right side of the table, which scrolls sideways with nothing to show that it does. | Tool layout. |
| Low | Sequences (`tg-u3-q1`) | A wrong common difference with the right family gets "Classify from the table: equal differences make a sequence arithmetic…", which is about the part that was right. The "Focus on" line under it is right. | Tool wording. |

## What was not checked

- **Not answered to the end:** absolute value inequalities (`tgp-u4-6`, `tgp-u4-7`, `tgp-u4-8`): the split into a three-part inequality was made and accepted, the rest was not driven. The absolute value equation that must be isolated first (`tgp-u4-4`). The radical equation in Step Algebra (`tgp-u11-2`): squaring was opened, not finished. The two 3×3 systems by elimination (`tgp-u5-2`, `tgp-u5-3`). All of these opened, showed the right equation and their example; they are unverified, not passed.
- **Same tool, other numbers:** where several questions use one tool in one mode, one or two were answered and the others were only opened and read (for example, all 12 Step Algebra questions of Algebra I were opened and read, and 4 were answered).
- **Phone:** every question was opened on a phone; 22 were tried on one and 21 were answered. `tg-u3-q1` could not be answered by the script on the phone (the phone's number pad was open over the grid when the script plotted); it is fine on a desktop, and a student can close the pad.
- **The real assignment screen.** The page used here is the question as the assignment screen mounts it, inside the same frame, but without the navigator, the save line and a signed-in student. On the desktop picture the task card overlaps the "Unlimited tries" strip a little; this may be the test page and should be looked at once on the real screen.
- **Spanish, read aloud, dark mode, large text, keyboard only.** Not part of this check.
- **Saving and grades.** Tries were recorded by the test page, not by the server.

## Tool quirks and upgrade ideas

### Every tool (the question frame)

- After a miss the page says "Not quite. You can try again — tries are unlimited on this question." and, under it, the tool's own sentence. On some tools the tool's sentence is only "Not yet." (Systems Workspace) or "Needs another look." (table workbench), with the useful sentence further down. **Upgrade:** put the most specific sentence first.
- On a phone, the task, the language buttons, the tries strip, the grade weight, Open Work View and the guided-notes bar take about half of the first screen before the tool starts. **Upgrade:** fold the grade weight and Open Work View into one row, or collapse the task after the first scroll.
- The first time a page with math chips loads, the chips are empty for about a second while the math font loads (seen on the mapping diagram's ordered pairs). **Upgrade:** show plain text until the typeset version is ready.
- Part-by-part answer boxes show a hint line such as "Write a single number. For example −8." The example number is different on different questions. Harmless, but a student may read it as a clue. **Upgrade:** one fixed example per kind of box.

### Step Algebra

- On an inequality the "Other operations" panel is open when the question opens, showing "Take square root", "Reverse absolute value" and "Complete the square" to an Algebra I student solving x − 4 < 3. **Upgrade:** open it only when the question needs one of them, and list only the operations that fit the course.
- A wrong simplification is answered with "The balanced move remains available. Revise the right side expression; equivalent algebraic forms are accepted." A struggling student will not know what that asks. **Upgrade:** "That is not equal to 7 + 12. Try the arithmetic again."
- Dividing an inequality by a negative number makes the tool stop and ask for the symbol. Good teaching, but it announces the moment. **Upgrade:** ask "Does the symbol stay or change?" after every multiply or divide, so the student decides each time.
- The long paragraph about cancellation under the equation ("Cancellation works directly on visible matching opposite terms and common numerator/denominator factors…") is on every question. **Upgrade:** move it behind "How to do this".
- With an absolute value split, "Branch B · click to work here" is plain text, not a button, and the second branch is easy to miss. **Upgrade:** a button, and a count such as "1 of 2 branches solved".

### Graphing

- "Your line: y = …" is shown while the student is still plotting (see the table above). **Upgrade:** show it after the first check, or let an assignment turn it off.
- For a parallel or perpendicular line the given line is drawn dashed, but the point the new line must pass through is not marked. **Upgrade:** mark the given point.

### Number line

- Its own window is centred on the answer and can label every 2.5. The packets now set a plain line, but any other lesson gets the tool's window. **Upgrade:** default to −10 to 10 by ones unless the answer is outside it.
- On a phone the tick labels are very small. **Upgrade:** larger labels at phone width.
- The interval box accepts a square bracket on ∞ (see the table above). **Upgrade:** mark it wrong with "Infinity always takes a round bracket."

### Multiple Representations board

- A wrong fact cannot be saved, which is good, but "Check board" then says "2 parts are still empty" and offers "Submit anyway". A student who presses it spends a try on a board the tool already knows is unfinished. **Upgrade:** with unlimited tries, drop "Submit anyway" or call it "Check what I have".
- The lists of meanings are shown in the order written. **Upgrade:** shuffle them for each student, so an author cannot leave the right one first.

### Table workbench

- Nothing on the screen says that an interval is made by clicking two rows. It is only under "How to do this". **Upgrade:** one line above the rows: "Click two rows to compare them."

### Sequences

- The table scrolls sideways on a phone and hides the fifth term (see the table above). **Upgrade:** wrap the table, or stack n and f(n) in two columns at phone width.
- The box is labelled "Common change" until a family is chosen, then "Common difference" or "Common ratio". **Upgrade:** keep one label and say "difference or ratio".

### Data lab

- The prompt says "First fit a line by hand", but the lab accepts the question with the line untouched once regression is run. **Upgrade:** require one move of the slope or intercept, or do not ask for it.

### Transformations Lab

- When reading a, h and k from a graph the boxes start at 1, 0 and 0. For `tgp-u2-3` the right value of a is 1, so one box is already right. **Upgrade:** start the boxes empty.
- On the "plot the images" questions the source points S1 to S3 sit close together near the origin on a −10 to 10 grid and their labels overlap. **Upgrade:** a smaller default window when the points are small.

### Inverse and composition lab

- When deriving an inverse the student only picks the operation and the number; the lab writes each new line itself, and prints the inverse at the end. It checks the plan, not the algebra. **Upgrade:** let the student type the new line, as Step Algebra does.

### Systems Workspace

- On a story inequality the tool names the right symbol after one wrong choice (see the table above). **Upgrade:** first miss "Read the phrase again: which way does 'at most' point?", the symbol only on a later miss.
- The buttons to go back a step read "Change check your region" and "Change write the inequality". **Upgrade:** "Change the region check", "Change the inequality".
- In substitution, a wrong value in the check of an equation gets "The values are placed. Recheck the arithmetic on each side; the two sides should match." Clear, and nothing is given away. No change suggested.

### Matrix Lab

- When solving with matrices the calculator shows the answer column and the student copies it into x, y and z. That is the method, but a student can finish without knowing which number is which. **Upgrade:** ask what one of the values means in the story (the modelled question has the words to do it).

### Polynomial Workshop

- No problems found. Its messages name the row or box that is wrong ("Check the sign of r…", "Your table is right. P(r) is the remainder…") and were the clearest of any tool.

### Radical solver

- After a miss each step is marked "right" or "not yet", which is clear. Nothing else to report.

### Sorts

- On the open sort (make your own groups) a wrong sort gets "Not every group holds together yet" without saying which card. The fixed-category sort marks the cards that are wrong. **Upgrade:** mark the cards on the open sort too.

## Found while the packets were written (not seen on a screen)

These came from building the three files, the example player and the unlimited-attempts option. They were found in the compiler, Pre-Flight and the graders, not in the browser check above.

### Authoring and Pre-Flight

- **A graphing question that gives a point and a slope prints the answer.** The task line reads "Graph the line through (1, −3) with slope 2" and the hints give rise and run. `referenceLine: { m, b, relation }` hides it, but the authoring guides do not mention the field. Upgrade: document it, and warn when a parallel or perpendicular question lacks it.
- **Dropped hints are silent.** A hint containing any number that equals part of an answer is never shown, and the validator still prints PASS. On plot-and-identify questions nearly every small digit is a coordinate. Upgrade: print the dropped hints in the validator, and do not count numbers quoted from the prompt.
- **The back-up step refuses an option equal to any part's answer**, so a GCF question cannot ask "which number divides 6 and 9?" when 3 is a later part.
- **One inequality is written three ways in one question** (LaTeX in the prompt, text in `sourceConstraints`, coefficients in `expectedConstraints`) and nothing checks that they agree. Upgrade: a validator check.
- **Adding one lesson needs edits to about eight unrelated test files** that pin corpus counts, and new sentence shapes need Spanish pairs before two strict tests pass. Upgrade: derive the counts, or keep them in one place.
- **The Spanish pack matches literal sentence shapes.** 58 pairs were added for the packets and were not written by a Spanish speaker; they need a reader.
- **Honors readiness counts audited CCMR items only in a Practice section of five or more.** A Classwork-only review reports "not required" and can never be "ready". "Multiple representations" is not detected for graph analysis with typed intervals.
- **Question weights are automatic** (by workload), so questions are not equal weight unless pinned.
- **AGENTS.md does not say the suite needs `npm --prefix functions ci`.** With the root install alone, files that load `firebase-admin` fail before any assertion.
- **Repo copies under `.claude/worktrees/` exhaust the file-watcher limit**, which fails the tests that start Vite. Remove finished copies before running the suite.

### Worked examples

- **The player's guard counts any number.** An example is hidden on a question if any step or "why" holds a number equal to one of that question's answers, even as a coordinate, an index such as f(2), or the 1 in 1/2. On questions whose answers are several small coordinates, an example has to be written around four or five digits. Upgrade: count a number only where a step states it as a result, or compare the example's computed values with the question's.
- **A hidden example is silent.** Pre-Flight does not say that an authored example will not be shown; the question quietly gets the platform's own, or nothing. Only a test that asks the player finds it. Upgrade: a Pre-Flight warning that names the question, the example and the step.
- **A label the student must pick counts as a leaked answer.** "function", "geometric", "no solution" and every option of a choice are refused in an example, whichever case the question is. The packets' examples say the conclusion in other words. Upgrade: an allow-list for choice labels.
- **Words are matched as plain text.** "x + 5x = 42" is refused for containing "x = 4".
- **"State the facts of a parent function" questions cannot have an authored example**, because any honest sibling shares the facts. They use the platform's built-in example.
- **A later question borrows its skill's first example**, and the guard is applied to the borrower too. A sequence question cannot borrow another sequence's example if one of its own terms is 2, since every example writes f(2).
- **Replays cover Step Algebra and radical equations.** A lesson's own moves for the plane, the inequality builder and division are not played yet. Step Algebra has no move for distributing, combining like terms or splitting an absolute value, so those examples are step cards.
- **Examples have no Spanish.** Translate on an authored step usually says there is no translation yet.
- **Follow-through on an expression that is not one term works only for the literal text.** See Unit 3 question 7 above. Upgrade: compare a bracketed key by value.

### Unlimited attempts

- **Choice-only questions are unlimited too** in an assignment that declares it, so a student can click through the options to full credit. The packets have none. Decision open: keep choice-only questions at one try.
- **There is no teacher toggle.** The policy is set in the file at import.
- **Declaring it on an assignment already in progress reopens questions whose solutions were shown.** Declare it before students start.
- **A teacher's per-question grade override is tied to the attempt count**, so another try invalidates it; unlimited tries make that more likely.

### Tools, beyond what the screen check lists

- **Graphing a system:** one `snapStep` serves both axes, so a graph with y in fives forces x to snap to fives. Upgrade: separate x and y snap.
- **Systems Workspace:** special cases also ask for "inconsistent" or "consistent-dependent", and it cannot be turned off.
- **Equations from a description:** no tool writes a system from a story or the equation of a parallel or perpendicular line; those are answer boxes.
- **Sequences:** the platform's worked solution writes aₙ on a question that shows f(n).
- **Transformations Lab:** "describe" always asks all ten rows, including horizontal scale and y-axis reflection when nothing multiplies x. Upgrade: an authoring switch for the rows asked.
- **Matrix Lab, multiply:** asks "Is A · B defined?" and the dimensions by default.
- **Inverse lab:** in `inverse` mode the only graded part is f⁻¹(f(x)), which is the given x, so a student can type the input back. `composition` mode takes numbers only, not a rule.
- **Factoring tool:** handles only x² + bx + c with an integer pair. GCF, ax² + bx + c, cubes and grouping need answer boxes, and the student never enters the factored form.
- **Polynomial division:** `dividePolynomial` asks only for coefficient lists with no working; `syntheticDivision` has two different screens chosen by the data type the author writes.
- **Radical solver:** an equation whose isolated root equals a negative makes the student square before "no solution" appears.
- **Answer boxes for radicals and rational exponents:** only the key's notation is accepted (`x^(3/2)` yes, `x√x` and `x^1.5` no; `0.667` refused for 2/3).

### A tool for radical expressions and rational exponents

Units 9 and 10 of the Algebra II packet use answer boxes because no tool covers them. What one would need:

- **Simplify a radical:** the student factors the radicand into perfect-power and leftover tiles and drags the perfect power out. Any index; absolute value on even roots of variables; a check that nothing extractable remains.
- **Combine like radicals:** simplify each term in place, then add coefficients. Unlike radicals must visibly not combine (√12 + √27 → √39 is the usual error).
- **Multiply and divide:** "outside × outside, inside × inside" slots, an area grid for binomials, and a rationalize step where the student picks the multiplier, including a conjugate.
- **Rational exponents:** a root ↔ power converter with index and power as separate slots, exponent-rule steps with the fraction arithmetic shown, "root first, then power" evaluation, and a negative exponent as a reciprocal move.
- **How to build it:** as Step Algebra moves on an expression (`extractPerfectPower`, `combineLikeRadicals`, `rationalize`, `toRationalExponent`, `applyExponentRule`) or as Polynomial Workshop views, so each line is checked and moves are recorded.
- **Grading:** accept every simplest form unless the prompt fixes the notation, and say which condition of "simplest" fails.
