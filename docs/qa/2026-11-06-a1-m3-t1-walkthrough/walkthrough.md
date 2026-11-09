# Algebra I Module 3 Topic 1, Lessons 1 and 3: student walkthrough

**Environment.** Branch `helper/walk-a1-m3-t1`, from `9feae163`. The lesson harness
(`docs/qa/2026-10-22-walkthroughs/harness`) runs each lesson through the teacher-import chain, then the real
QuestionEngine with App.jsx's record, policy, Guided Notes and Exit Ticket mode. As on 2026-10-23, it passes a real
family context (`buildStudentFamilyContext`), so every family slot deals a student's own version. Headless Chrome at
1366×768 and 390×844 (the phone with touch), drawn with CI's fonts (`tests/browser/support/ciFonts.conf`).

| Lesson | File | Questions |
|---|---|---|
| L1, Solving Linear Equations | `T1_L1_Solving_Linear_Equations.json` | 37 |
| L1 Honors | `T1_L1_Solving_Linear_Equations_Honors.json` | 38 |
| L3, Modeling and Solving Linear Inequalities | `T1_L3_Modeling_and_Solving_Linear_Inequalities.json` | 41 |
| L3 Honors | `T1_L3_Modeling_and_Solving_Linear_Inequalities_Honors.json` | 39 |

All four files are in `teacher-import-jsons/algebra1-module3/`. None is built by a script: they are edited as files.
This branch rewrote their reasoning choices (`2a81a71c`, `8adfb4f1`); no one had walked them as a student since.

**Priorities.** **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or
understanding. **P3** is polish.

## What was done

- **Keys, by hand, for all 155 questions.** Every fixed key, choice, table, sort card and graph point was worked
  out again, and every worked step and hint read against it. Every distractor of the reasoning choices this branch
  rewrote is false, as a distractor must be. One key was wrong (W1) and one worked step (W2).
- **Every generated version.** 41 slots are Question Family slots (all 12 Warm-Up and 8 DOL questions, and 21 Practice
  questions), in seven families. A checker of my own (its own parser and exact-fraction solver, never the family's
  arithmetic) worked out every key again: each equation's solution or special case, each inequality's direction,
  boundary and display, both sides and the verdict of each check, each context model's inequality and least or
  greatest whole answer, each phrase's symbol, and the support ("reduce complexity") versions too. Every version of
  the L3 and L3 Honors slots and of the L1 and Honors Warm-Ups was dealt and checked (2,486,670 distinct versions),
  except Honors WU 2. It and the other multi-step equation slots (up to 31 million parameter tuples each) were
  sampled at every 53rd tuple (2,114,589 distinct versions: 98,858 with no solution, 2,792 with every real number).
  The first 1,000 versions of each slot's real sequence, for three students, were checked as dealt (156,342). No
  key, step or display is wrong; a planted wrong key of each kind is caught. What the families say is logged below.
- **"Practise one like this".** 41 of the 135 Classwork and Practice items offer a sibling after the last miss. The
  first two of each (82) were worked by hand, with their steps and checks: all right, but some do not keep the
  item's case (logged).
- **Grading outside the browser,** with the production graders: right answers typed other ways (expanded and
  factored areas, mixed numbers, a true minus sign, thousands separators, dollar signs, an inequality turned round,
  a compound inequality the situation bounds). One right answer was refused (W3), and one more is logged (CW 8).
- **Screen pass.** Every question at both sizes, 310 views (the phone with touch, both with CI's fonts). Automated
  flags: page errors; unfilled templates, raw LaTeX, `undefined` / `NaN`, a caret in text; sideways scroll and
  controls off the screen; no final action; unnamed inputs; spoken math labels that spell letters. Then the
  screenshots, reviewed by eye. No page errors, unfilled templates, raw LaTeX, `undefined`, carets, unnamed inputs or
  spelled labels. The 65 Step Algebra items (26 on the equation board, the rest in the relation workspace) show no
  Submit until the work is done, as trained. Found: the lost line breaks (P-1), the sort order (P-2), the axis title
  (P-3), the example (W5, P-4), a ResizeObserver notice on the DOL 2s (P-5) and, on the phone, Step Algebra boards
  that cut off a long side (P-6). In the harness the
  phone's Expression Meaning items (L3 CW 2, PR 15) ran off the right edge; in the App's own phone shell nothing is
  cut, and the matrix (372 px) scrolls inside its 322-px box. The harness's centred box takes its content's width,
  as noted on 2026-11-06, so both phone findings were checked in the App's shell before they were logged.
- **Read-aloud sweep.** 4,712 distinct texts through `speechTextFor` (below).
- **Interactive pass.** A wrong try, then a right one, on every tool and mode in the four lessons (table at the
  end). It found P-7 and P-8. Typing in the model builder (L3 CW 1) also logs a React warning about mixing `border`
  and `borderStyle` in one style; development builds only.

## Fixed

### W1 (P1, wrong key; L1 CW 5): the check box refused the right value
CW 5 shows a correct solution of 24x + 7 = −4x (x = −1/4) and ends with "Check: the value of 24x + 7 when
x = −1/4". The key was **−1**. The value is 24(−1/4) + 7 = −6 + 7 = **1**, as the item's own worked steps say
("Check: 24(−1/4) + 7 = −6 + 7 = 1, and −4(−1/4) = 1").
- **What a student met:** a correct check, 1, was marked wrong and spent a try; −1 was marked right. Since the
  lesson was written (`68c1d93e`).
- **Fixed:** the key is 1. The Honors file's CW 5 is a different item, and its check (18) is right.
- **Test:** `tests/platform/algebra1Module3T1Rederived.test.mjs`. It reads every "value of … when x = …" box in the
  four files (24 boxes) and works each expression out at the stated value from the label, never from the key. It
  also grades CW 5 through the import, in the browser and on the server: 1 is right and −1 is not. Both tests
  fail on the old key.
- **In the harness, after the fix:** −1 gets "Not quite. You have 2 tries left … 3 of 4 parts right — still to fix:
  Check …"; 1 gets "Correct! This question is complete."
- **Commit:** `6ec831f5`. **Reaches students** when L1 is imported again.

### W2 (P2, wrong worked step; L3 Honors CW 14): the symbol turned at a subtraction
The radios item solves two inequalities. Its closed review read "Above 2,000 feet: 4800 − 20m > 2000 →
**−20m < −2800** → m < 140". Subtracting 4800 keeps the symbol: it is −20m > −2800. Dividing by −20 then turns it,
m < 140. The lesson's point is that only multiplying or dividing by a negative turns the symbol, and the step
showed it turning at a subtraction. The answer, 80 < m < 140, was right.
- **Fixed:** "4800 − 20m > 2000 → −20m > −2800 → m < 140."
- **Test:** the same file reads every worked chain "a → b → c" in the four files (60 chains, in prompts, labels,
  hints and worked steps) and requires each statement to have the first one's solution set, from its own two sides.
  On the old text it names this step: "4800 − 20m > 2000" is m < 140, but "−20m < −2800" is m > 140.
- **Commit:** `782b6ab8`. **Reaches students** when L3 Honors is imported again.

### W3 (P2, right answer refused; L3 CW 4): the region the graph shows was marked wrong
CW 4 asks for "an inequality for the number of boxes, b, in this region": the part of the sales graph below
y = 1600, up to the point where they meet. The graph is drawn from b = 0, so that part is **0 ≤ b ≤ 420**. The box's
example is the compound form "a ≤ x ≤ b". Only the key's b ≤ 420 was accepted.
- **What a student met:** the region typed exactly, as the example suggests, was "Not quite" and spent a try. The
  next part ("Do all the solutions of your inequality make sense here?") still has the same answer, "No", for a
  student who wrote 0 ≤ b ≤ 420.
- **Fixed:** 0 ≤ b ≤ 420 is accepted beside the key. The key is unchanged, and so is every verdict on b ≤ 420.
  0 < b ≤ 420, b ≥ 0, 0 ≤ b ≤ 421 and b < 420 are still refused. This is not a grading fix: the grader is right that
  the two sets differ. The item's situation (no negative boxes, the graph from 0) makes both right.
- **Phone keypad:** in practice the "Needed for this answer" row is read from every accepted answer. Both forms need
  only ≤, so the row does not change. (This is why CW 8 was not changed; see below.)
- **Test:** the same file re-derives the region from the graph the student reads (where f(b) = 3.75b + 25 meets
  y = 1600, from the graph's first input), grades both forms and the near misses through the import, in the browser
  and on the server, and checks the keypad row. It fails without the accepted form, and fails if an accepted form
  needs a key the key does not.
- **In the harness, after the fix:** b < 420 gets "Not quite … still to fix: An inequality for the number of
  boxes, b, in this region"; 0 ≤ b ≤ 420, typed on the keyboard, gets "Correct! This question is complete."
- **Commit:** `a8992e47`. **Reaches students** when L3 is imported again.

### W4 (P3, wrong reason; L1 Warm-Up 3): the review named a slip the question cannot produce
Warm-Up 3 (`equations.verifySolution`) asks whether a value solves a linear equation such as 3x + 4 = x + 10, by
substituting it into each side. After the question closes, the review's common error read "Forgetting the
parentheses when substituting a negative value, so **−3² is computed instead of (−3)²**". Nothing in these
equations is squared: every version is linear.
- **Fixed (wording only):** "… so 2x with x = −3 becomes 2 − 3 = −1 instead of 2(−3) = −6." The family, its
  numbers and its keys are unchanged. The Honors file already said only "Forgetting the parentheses when substituting
  a negative value."
- **Recovery:** after the edit, `node scripts/recovery-coverage-report.mjs` still reads L1 "Warm-Up 3/3 ready, DOL
  2/2 ready" (and so do L1 Honors, L3 and L3 Honors), and the family's certification test
  (`module3QuestionFamilies.test.mjs`) and `recoveryCoverageReport.test.mjs` pass. Only the review's wording
  changed, so no binding moves.
- **Test:** the same file deals 60 versions of each Warm-Up 3 slot (regular and Honors) and requires that none
  raises anything to a power, and that the review names no power. It fails on the old text.
- **Commit:** `cf5bcff8`. **Reaches students** when L1 is imported again.

### W5 (P2, gives the answer away; L1 CW 8 and Honors CW 8): the empty check box showed the answer
CW 8 compares two strategies for 4(3x + 2) = 8x + 4 and ends with "Check x = −1: the value of 4(3x + 2) — and of
8x + 4 — when x = −1". The key is −4. An empty number box says "Write a single number. For example **-4**." and shows
**-4** in the box: the answer, before the student substitutes anything.
- **Reach:** of every hand-written typed box in every teacher-import lesson, these two are the only ones whose
  example is their key.
- **Fixed:** each box has its own placeholder, "a number" (an author's placeholder replaces the example, so the line
  above reads "Write a single number."). The key is unchanged.
- **Test:** the same file reads every hand-written typed box in the four files (the box's placeholder or example,
  through the screen's own `describeBoxPlaceholder`) and requires that none is a value the box's grader accepts. It
  names exactly these two boxes without the fix.
- **Commit:** `d156c4e6`. **Reaches students** when L1 and L1 Honors are imported again.
- **Not fixed here:** the same example shows in Warm-Up 3's dealt boxes, and a dealt side can be −4 (P-4, a
  platform change).

## Logged: Classwork and Practice, not changed

| Where | What a student meets | Severity | The fix I would make |
|---|---|---|---|
| L3 CW 8, part b ("How many boxes … to earn less than $2,050?") | **0 ≤ b < 540**, right in the situation and in the shape the box's example shows, is refused; b < 540 is the key. | P2 | Accept it, as W3 does. Not done: the phone's "Needed for this answer" row reads every accepted answer, so it would add ≤ to an answer, b < 540, that needs none. Platform: let the row read the key alone (or what every accepted answer needs), then accept the bounded form. `src/MultiAnswerGrader.jsx` (`inferRequiredAnswerSymbols(acceptedAnswersForField(field))`). |
| L1 CW 11 and PR 14 (no solution), CW 13 (every real number); Honors CW 11 and CW 12 | After the last miss, "Practise one like this" offers a one-solution equation ("Solve x + 8(x + 11) = 6x + 2(x + 3) + 79", x = −3). The student who missed the special case never practises it, and the sibling's prompt drops "If no value of x makes the equation true, or every value does, say so". Every sibling key is right. | P2 | Build the sibling in the item's own case. The support family's `numericSibling` (`src/platform/supports/families/linearEquations.js`) skips any draw whose coefficients are equal and any whose last move is a special case, so it can only make one-solution equations. |
| L3 CW 1 and CW 12, Honors CW 1 and CW 10 (the model builder) | The siblings are proportional and increasing ("W(t) = 15t", "M(x) = 7x"); the items have a starting amount (f(b) = 3.75b + 25) or decrease (h(m) = 4800 − 20m). Keys right. | P3 | Draw siblings with a starting amount, and a decreasing one for CW 12. |
| L1 CW 16 and Honors CW 16 (the rectangles) | The third box's label says "After distributing, 30 + 12x = 8x + 40", the expanded forms of the two area boxes above it, which are graded as equivalent expressions. A student can copy 30 + 12x into "The area of rectangle A". | P3 | "After setting the areas equal and distributing, the x-terms are collected on one side. That step is justified by the …" |
| L3 PR 5 and Honors PR 5 (Diego, candles, Tasha, the elevator) | The back-up step asks "A goal of 'at least' an amount uses which symbol?" In 99 of its 191 versions the situation says "no more than" or "at most". Not wrong, but about a phrase the student was not given. | P3 | "Let's back up. Does the goal include the amount itself?" (Yes: ≤ or ≥ / No: < or >). |
| L3 CW 1 and CW 12, Honors CW 1 and CW 10 (the model builder) | The table is headed "x" and "f(x)" for f(b) = 3.75b + 25 (CW 12: for h(m) = 4800 − 20m), and the rule's box shows the example "f(x) = …". The items write no table columns, so the tool's default shows. | P3 | Give each table its columns: `"table": {"columns": [{"key": "x", "label": "b"}, {"key": "y", "label": "f(b)"}]}` (m and h(m) for CW 12), keys unchanged so grading is not; and a placeholder "f(b) = …". |
| L3 Honors PR 14 (two batteries) | "h > 10" is the key for when the tablet has less charge. The tablet is empty at 16⅔ hours and the phone at 20, so in the situation it is 10 < h < 20; the item asks when the phone reaches 0 but does not come back to it. | P3 | A closing part: "For which hours does your answer make sense?" |

## Logged: Warm-Up and exit-ticket items (families), not changed
These are Question Family slots: their wording is the family's (`functions/shared`), which the Recovery batch owns.

| Where | What a student meets | Severity | The fix I would make |
|---|---|---|---|
| L3 WU 2, Honors WU 2 (`inequalities.translatePhrase`) | "The temperature, T, in degrees Fahrenheit, is fewer than 50." "Fewer" goes with things counted, and the family says it of every subject: a temperature, a height, a time, an amount in dollars, and "the number of" boxes or tickets (a number is "less than"). | P3 | "is less than" or "is below". It needs a new family version: the sentences are its fingerprint. |
| L3 DOL 2 and PR 6, Honors DOL 2 and PR 4 (`inequalities.contextModel`, tank and hike) | "The least whole number of minutes **after which** the tank holds less than 200 gallons." In 74 of the 104 tank and hike versions the boundary is whole (m > 40). "After 40 minutes" can be read as any time past 40, so 40 is a reading; the key is 41. On the exit ticket, one try. | P3 | "The least whole number of minutes m for which the tank holds less than 200 gallons." |

## Not changed, by the owner's list (handoff section 5)
- **L1 PR 8 (r2) and Honors CW 5 (j2)**, the "name the property for each step" lists, are as they were: keys, options
  and hints. Every key in them was checked and is right.

## Logged: platform (screens)

### P-1 (P2, display): a prompt's line breaks are lost
Error analyses and strategy comparisons are written one step to a line ("Step 1: 3x − 4 = 2x + 5", then "Step 2: …").
The task card joins the lines into one: "Daniel: 12x + 8 = 8x + 4 → 4x = −4 → x = −1 Chloe: 3x + 2 = 2x + 1 → x = −1",
"24x + 7 = −4x Step 1: 28x + 7 = 0 Step 2: 28x = −7 Step 3: x = −1/4". The student has to find where each step starts.
- **Reach:** 19 prompts here (L1 CW 1, 2, 5, 8, PR 8 and PR 9; Honors L1 CW 1, 2, 5, 8 and PR 8; L3 CW 11, 16, 18 and
  PR 11; Honors L3 CW 9, 15, 16 and PR 13), of the 24 in all teacher-import lessons. The import keeps the "\n"; the screen drops it.
- **Fix I would make:** render a prompt's prose with `white-space: pre-line` (or one line per "\n") in
  `src/QuestionPrompt.jsx`. A shared student screen, so not changed here.

### P-2 (P2, gives answers away): sort cards keep their authored order, and here that order is the answer
Choice options are shown in a stable shuffled order; a sort's cards are not (`FigureMatchStage.jsx` draws
`matchItems(stage)` as authored). In four of the seven sorts here the authored order runs through the categories,
and in two more it mostly does (only L1 PR 12 is mixed):
- L3 PR 12: x < −4, x < −4, x ≤ −4, x ≤ −4, x ≥ −4, x ≥ −4, x > −4, x > −4, the category list's own order, two each;
- Honors L3 PR 9: every number ×3, no solution ×3, some numbers ×2;
- L1 CW 14 and Honors CW 14: zero first, then the categories in pairs;
- L3 CW 20 and Honors CW 17: always, always, sometimes, sometimes, …

A student who notices the pattern can sort without simplifying. **Fix I would make:** shuffle a sort's cards per
attempt, as choices are (a platform change); meanwhile the cards could be reordered in the files. Not done: the order
is the platform's.

### P-3 (P3, display): the y-axis title runs over four-digit tick labels
With CI's fonts, "Total sales, f(b) (dollars)" overlaps "1500" and "1000" on the sales graphs (L3 CW 3, 4, 6, 8;
Honors CW 2, 5). `src/GraphDisplay.jsx` sets the title at a fixed offset from the axis.

### P-4 (P3, gives the answer away): a number box's example can be a dealt key
Every empty number box shows "For example -4." W5 removes the two hand-written boxes keyed −4. In Warm-Up 3
(`equations.verifySolution`), 76 of 3,000 dealt versions (2.5%) have a side whose value is −4, and that box shows it.
**Fix I would make:** an example no box can be keyed with (in words: "a whole number, a decimal or a fraction"), held
by a test like `inequalityExample.test.mjs`. `src/platform/interaction/answerFormatHints.js` (shared).

### P-5 (P3): a ResizeObserver notice on L1 DOL 2
Opening L1 DOL 2 and its Honors twin (the relation workspace on an exit ticket) raises "ResizeObserver loop completed
with undelivered notifications" as a page error. Nothing on screen goes wrong; it is noise for any error report.

### P-6 (P2, display, phone): Step Algebra cuts off a long side of the equation
On a 390-px phone, Honors L1 PR 7's board reads "2(3(x − 1) −" for the left side 2(3(x − 1) − (x + 4)), in the
App's own phone shell. The rest of the side is cut off, and nothing scrolls to it. The student can still read the
equation in the task card above, but not on the board they work on. Each side has 117 px for its math there (101 px
in the lesson harness, where L1 PR 1 read "−5x + 3 −" for −5x + 3 − 5x).
- **Reach:** in the harness at 390 px, after scrolling each board into view, 14 of the 26 Step Algebra boards in the
  four lessons (all in L1 and L1 Honors; L3 solves in the relation workspace) had a side cut off on the right, in
  the versions dealt: L1 PR 1, PR 2, PR 4 and DOL 1 (the exit ticket); Honors WU 1, CW 6 (both sides), CW 7, CW 9
  (both sides), PR 1, PR 2, PR 5, PR 6, PR 7 and DOL 1. Honors CW 6, 7, 9 and PR 7 are fixed items, so every
  student meets them; the rest depend on the version dealt. The longest, Honors PR 7's 2(3(x − 1) − (x + 4)), needs 191 px.
  In the App's own phone shell (the teacher-workflow harness, signed in as a student, L1 Honors at 390 × 844), CW 6
  (both sides, 163 and 142 px), CW 9 (both, 119 and 122 px) and PR 7 (191 px) are cut, with 117 px a side; CW 7's
  116-px side just fits. On the laptop no side of the 26 boards is cut (320–490 px a side, at 34 px).
- **Why:** three things together. (1) Below 720 px, `src/App.css` sets `.algebra-equation-side` to
  `font-size: calc(20 * var(--mm-px)) !important`. The board's auto-fit (`AutoFitEquationExpression` in
  `src/StepByStepAlgebraCore.jsx`) writes its size on the side's parent, and the side's own `font-size: inherit`
  loses to the `!important`: on a phone every side is drawn at 20 px, however long (measured: the fit's box at 34 px,
  the side at 20 px). (2) On a phone each side gets half the board (`adaptiveBalanceColumns`, which lets a long side
  borrow room, is laptop-only). (3) The side's box has `overflow: hidden`.
- **A second fault in the fit:** it measures once, when the board mounts, and then watches only the space around
  the equation. The math (`<math-span>`) renders only when it comes on screen, and on a phone the board starts below
  the fold, so the fit measured a side with no math in it (20 px wide) and never measured again.
- **Fix I would make:** let the fit set the side's size on a phone (drop the `!important`, or give the fit a 20-px
  base there), measure again once the math has rendered, and let the longer side borrow width on a phone too.
  Shared Step Algebra files, used by every lesson, so not changed here.

### P-7 (P2, attempts): L3 Warm-Up 2 says "0 tries left", then takes another try and says "Correct"
L3 WU 2 and its Honors twin deal `inequalities.translatePhrase`: four statements, each a choice. A question that is
all choices gets one try (`isChoiceOnlyQuestion` in `functions/shared/attemptPolicy.mjs`). In the harness, after one
statement turned round: "0 of 1 tries left" and "Not quite. You have 0 tries left.", but Submit stayed on, and the
next Submit gave "Correct! This question is complete." with the question marked complete.
- **Why:** three places count the tries of a family slot, and they do not agree. The QuestionEngine and the server
  (`submissionIngestion.mjs`, `family.question || question`) resolve the limit from the dealt question: all choices,
  one try. `App.jsx` resolves it from the stored slot, which has no choices yet: three tries (`handleGradeSubmit`,
  `handleStepGrade`, the entry limit and the QuestionEngine's `maximumAttempts` prop). So the App's record is not
  closed after the first miss, and the screen does not lock. Read in the code, not run on a server: the server
  then records nothing more ("A finished question records nothing more"), so the student is shown a completion the
  teacher never sees.
- **In the App's own phone shell** (teacher-workflow harness, signed in as a student, Warm-Up open): the same.
  "Submit — your only try"; after one statement turned round, "Not quite. You have 0 tries left." with Submit still
  on; the next Submit, "Correct! This question is complete." (That harness's server is a stand-in, so what the real
  server records is read in the code, as above.)
- **Reach here:** these two slots only (every family slot in the four lessons was dealt and compared: only these
  two are all choices once dealt).
- **Fix I would make:** resolve the limit in `App.jsx` from the delivered question where there is one
  (`familyDeliveryForQuestion(…)?.renderedQuestion`, as its own checkpoint already does), with a test that a family
  slot dealt as all choices gets one try on the client and on the server. `App.jsx` is shared, so not changed here.

### P-8 (P2, drafts): the exit ticket's unsent work does not reach another device
Typing in L3 DOL 2 (`inequalities.contextModel`, the water tank) logged: "[MathMaster draft sync] The server backup
will NOT store "…multi-answer": forbidden-key at `solution`. The student's work is still saved on this device, but
it will not reach another device." The family names its inequality box `solution`, and `solution` is on the draft
guard's list (`FORBIDDEN_DRAFT_KEYS`, `functions/shared/workspaceDraftSchema.mjs`). A multi-answer draft is keyed
by field id, so the guard refuses the whole draft. The student sees nothing: a Chromebook swapped mid-question loses
the typed work.
- **Reach here:** the six `contextModel` slots: L3 PR 5, PR 6 and DOL 2, Honors PR 4, PR 5 and DOL 2 (every field
  of every question in the four lessons, as authored or dealt, checked against the list). The same id is in other
  families (linear, substitution, systems) and in five hand-written fields elsewhere. The Recovery runner met the
  same refusal and was given its own allowlist (handoff `STUDENT_PUSH_M_RECOVERY_DRAFTS.md`); the assignment draft
  was not.
- **Fix I would make:** keep a multi-answer draft's responses under one container the guard does not read as
  keys (or escape field ids in the draft), with a test that a field named `solution` survives a draft round trip.
  Renaming the family's field would need a new family version. Shared draft code, so not changed here.

## Read aloud (platform, logged)
4,712 distinct texts went through `speechTextFor`: every authored prompt, label, option, hint, back-up step, worked
step, guided note and figure, and the prompts and labels of 40 dealt versions of each family slot. 48 keep a symbol
a speech engine would read badly. `src/platform/language/speechText.js` is another batch's file, so these are logged.

| Written | Read aloud now | Texts | Where |
|---|---|---|---|
| `x + 7 = 9 → 4x + 28 = 36` | the arrow is passed raw | 40 | L1 CW 1, CW 5, CW 8, CW 14, PR 9 and the Honors twins; L3 CW 11, CW 15, CW 16, CW 18, PR 12 and the Honors twins; Honors worked steps |
| `4(x − 2) + 3 = 4x + ___` | the blank is passed raw ("___") | 6 | L1 PR 11; Honors PR 10 |
| `(starting amount) − (rate) · (variable)` | the minus between words is passed raw | 2 | L3 PR 6 hint 1 and worked step |
| `6(4) + 4 = 28` | "6 times the quantity 4 plus 4 equals 28", which sounds like 6(4 + 4) | 1 | Honors PR 13, worked step |
| `(f(153) = 598.75)` | "the quantity f of 153 equals 598.75": a bracketed aside read as a quantity | 2 | L3 CW 11 and Honors CW 9, worked steps |

- The arrows are already on the handoff's list (section 6, "Read aloud still reads → and ←"). Suggested reading:
  "gives" (or "becomes") between two statements.
- The blank: read "blank".
- No math label spells letters, and no power, root or interval in these lessons is misread.

## Pacing, scaffolding and pedagogy (log only)

**Length.** L3's Classwork is 20 questions in 80 minutes (Honors: 18 in 80), more than a class period. L1's is 16 in
55 (Honors: 17 in 60). If L3 runs over two days, it meets the open question on two-day Classwork (handoff
section 5).

**Help that hands over an answer.** Pre-Flight's hint guard finds no hint that states a key, and none does. But some
after-miss messages and back-up steps state another box's answer while the item is still open:

| Item | Shown | What it gives away |
|---|---|---|
| Honors L3 PR 12 | after the first miss: "Simplify 2(2x + 3) + 2x before solving" | the perimeter box's key, 2(2x + 3) + 2x |
| Honors L3 PR 14 | after the first miss: "Set 100 − 6h < 80 − 4h …" | both model boxes (100 − 6h, 80 − 4h) and the inequality to solve |
| Honors L1 PR 16 | after the first miss: "Write 5(x − 2) as 5x − 10 …" | c = −10, next to "5(x − 2) = 5x + c" |
| Honors L1 CW 17 | after the second miss: "Compare the x-coefficients (12 and w) …" | w = 12 for "never equal" |
| Honors L3 PR 13 | after the second miss: "Substitute 0: −(1/2)(−6) = 3 …" | the test box, 3 |
| Honors L3 PR 11 | back-up step: "“Gym A costs less than Gym B” is written … 30 + 25m < 40m" | both model boxes |
| L3 CW 16, Honors CW 15 | hint 2: "dividing by the coefficient of x in 12 ≥ −2x" | the divisor box, −2 |
| L1 CW 1 | hints 2 and 3: "every term changed by the same factor", "an x-term was taken away from both sides" | the properties of steps 2 and 3 |
| L1 CW 8 | hint 2: "BOTH sides divided by the same number" | Chloe's property |

The platform's direction elsewhere is that the first hint asks and only the last shows the step (handoff
section 2, the radicals and L4/L5 feedback rows). These lessons have not had that pass.

**A key's reason.** L1 CW 2 asks "Are both equations equivalent to x = 2?" and keys "Yes — x = 2 makes both equations
true." Being a solution does not make an equation equivalent to x = 2: it must be the only one. CW 3 and CW 4 then
show it is (P3).

## Interactive pass
A wrong try, then a right one, in the real QuestionEngine (1366×768 unless a phone is named).

| Item | Tool / mode | Wrong try | What the student was told | Result |
|---|---|---|---|---|
| L1 CW 5 | choices and a typed check | check −1 (the old key) | "Not quite. You have 2 tries left … 3 of 4 parts right — still to fix: Check: the value of 24x + 7 when x = −1/4" | right with 1 (W1) |
| L3 CW 4 | graph, choices, an inequality box | b < 420 | "Not quite … still to fix: An inequality for the number of boxes, b, in this region" | right with 0 ≤ b ≤ 420, typed (W3) |
| L1 CW 11 | relation workspace, no solution | "All real numbers" before any algebra | "That conclusion is not justified by the current relation." No try spent. | after distributing, combining and subtracting 4x (3 = −1): "No solution" accepted, "Correct! This question is complete." |
| L3 CW 19 | relation workspace, an inequality | after dividing both sides by −4, kept "<" | "That relation symbol does not keep the relation equivalent after your operation." | ">" accepted ("Relation symbols accepted. Continue solving."); x > 1/2, then the number line opens |
| L1 CW 9 | Step Algebra | rewrote 6(x − 1) as 6x − 1 | "That is not equivalent to that side. Your equation has not been changed." | Distribute: "Distribution complete."; the side reads (6)(x) + (6)(−1), to simplify next |
| L1 PR 5 (this student's version: 8(x − 9) − 2 = 8x − 74) | relation workspace, a family slot | — | — | distributed, combined, subtracted 8x (−74 = −74): "All-real-numbers conclusion accepted.", "Correct! This question is complete." |
| L3 CW 5 | number line, by keyboard only (Tab, arrows, Enter) | closed dot at 0, open dot at 420 | "Not quite. You have 2 tries left. Your endpoints are in the right places. Check whether each one is open or closed: a closed dot includes the number, an open dot leaves it out." | the right try is the row below, on the same tool |
| Honors L3 CW 14 | number line with typed endpoints, and an inequality box | closed dots at 80 and 140, 80 ≤ m ≤ 140 | the same open/closed message, then "Solve each inequality separately first; each one reverses when you divide by −20." | open dots, 80 < m < 140: "Correct! This question is complete." |
| L1 CW 14 | sort, 10 cards (also on the phone, with touch) | Figure 1 (x = 0) placed under "positive" | "Not quite. You have 2 tries left." "Figure 1 is not in the right category yet", 90% so far | moved to "neither positive nor negative (0)": "Correct! This question is complete." |
| L3 CW 2 | Expression Meaning | 3.75's unit as "dollars" | "Not quite. You have 2 tries left. Some connections need another look." "3.75: reconsider its Unit.", 92% so far | "dollars per box": "Correct! This question is complete." |
| L1 WU 3 (this student's version: −3x − 8 = −6x − 17 at x = −5) | typed boxes and a choice, a family slot | left side 8 (it is 7) | "Not quite. You have 2 tries left. Focus on: Value of the left side, −3x − 8, when x = −5." "2 of 3 parts right" | 7: "Correct! This question is complete." |
| L3 WU 2 (this student's version) | four choices, a family slot, one try | "T > 65" for "is less than 65" | "0 of 1 tries left", "Not quite. You have 0 tries left." | Submit stayed on, and the next try was "Correct! This question is complete.": P-7 |
| L3 DOL 2 (this student's version: the water tank) | exit ticket: a model choice and typed boxes, one try | the first option and 1 in every box | "Submit — your only try"; then "Your answer is saved. You will see whether it is right when this activity's results open.", and no Submit | one try, by design. Typing in it raised P-8 |
| L3 CW 1 | model builder: quantities, the rule, a table | f(b) = 25b + 3.75 (rate and start swapped), then a table that does not follow the rule | Submit stays off until the table is filled; then "Not quite. You have 2 tries left. The red steps above are the specific responses that need revision." and, on the table, "4 value(s) do not follow the function you wrote." | right rule, f(b) = 3.75b + 25: that step was accepted ("2 of 3 parts right — still to fix: Complete the table using your function"). My driver typed the table by row number, so a right table was not tried |

## Verification
- `tests/platform/algebra1Module3T1Rederived.test.mjs` (new, 6 tests). Each assertion was broken once and seen to
  fail: the old key, the old worked step, no accepted form, the old review, the placeholder removed.
- Every test file that reads these lessons (53, found by grep, directly or through a sweep of
  `teacher-import-jsons`): 699 tests, all pass. The answer-acceptance workflow's own tests: 66, all pass.
- `npm run lint` and `npm run audit:theme-colors`: exit 0. `npm run audit:answer-acceptance`: 29,167 known-correct
  spellings of 1,510 open responses, 0 refused. `node scripts/check-family-version-bumps.mjs --base 9feae163`: no
  family version to move.
- Browser: every question at 1366×768 and 390×844 (touch) in the lesson harness, the interactive pass above, and the
  phone findings again in the App's own phone shell (the teacher-workflow harness), on ports 5830 and 5831. The
  CI areas for these files are the full platform suite (not run here, as the brief asks) and
  `answer-acceptance-audit.yml`, whose steps are the tests and audits above.

