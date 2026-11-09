# Algebra II Honors module 1, Lesson 1, and the Algebra I District DOL 1 review: student walkthrough (part 1)

Environment: branch head `0e38234b`. The 2026-10-22 lesson harness (docs/qa/2026-10-22-walkthroughs/harness), with the family context the 2026-10-23 walk added: each lesson goes through the teacher-import chain and mounts the real `QuestionEngine` with App.jsx's record, policy, Guided Notes, Exit Ticket mode, generation key and `buildStudentFamilyContext`. Headless Chromium at 1366×768 and 390×844 (touch). Part 2 (Lessons 2 to 4) is written separately.

| Lesson file | Questions |
|---|---|
| `algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json` (the ALEKS bridge) | 20: WU 3, CW 7, PR 8, DOL 2 |
| `algebra2-honors-module1/L1_Day1_Interval_Domain_Range.json` (Day 1) | 17: WU 3, CW 6, PR 5, DOL 3 |
| `algebra2-honors-module1/L1_Day2_Function_Attributes_Relations.json` (Day 2) | 18: WU 3, CW 7, PR 5, DOL 3 |
| `algebra1-dol1/District_DOL1_Technology_Graph_Analysis_Review.json` (the District review) | 35: WU 4, CW 13, PR 10, DOL 8 |

Priorities, as in the 2026-11-03 walkthrough: **P1** blocks or misleads a student, or grades wrongly. **P2** costs a student time or understanding. **P3** is polish.

## What was done

- **Keys, checked by hand, every item.** Each key was worked out from the item's own numbers (the interval, the function, the pairs, the scenario) and compared with what the device grades against after import. That covers the intervals the number line builds, the domain, range and behaviour intervals of every graph, the mapping sets and function verdicts, the transformed points and parameters, the models' rules, tables and sets, the intercepts, extremes, axes and asymptotes, and the sequence terms.
  - **All keys are right.** The only templated item is the ALEKS bridge's SAT item (PR 8, `max(a, b)` on [−a, b]). Through the family engine with a real seat context, 400 students were dealt 16 distinct versions, each keyed `max(a, b)` with `a ≠ b`; the grader accepts that answer and refuses `min(a, b)`.
- **Worked steps and hints, checked the same way.** Every review, worked step, hint and back-up step a student can open was checked against the item: each number, each "=", each named point. None states a wrong value. Findings on fit and wording are below.
- **Screen pass, 180 views** (every question at both sizes). There were no page errors, unfilled templates, raw LaTeX, `undefined` or `NaN`, no sideways scroll, and no unnamed inputs. Every question has its final action. The only flag was a false positive: step buttons in the steppers' own horizontally scrolling strip.
- **Read-aloud sweep.** 2,076 texts (prompts, labels, options, stage prompts, hints, back-up steps, reviews) went through `speechTextFor`. 168 distinct spoken texts still carry raw symbols (F-READ-INTERVALS).
- **Interactive pass.** A wrong try, then a right one, on each tool and mode (table below), at 1366×768, and at 390×844 by touch for the number line and the Mapping Diagram.
- **Right answers in other spellings.** The graders were run directly on every typed part with the spellings a student might use.
  - **Interval boxes:** `∞`, `inf`, `infinity`, `\infty`, `U`, `u`, `∪`, `\cup`, "all real numbers" and ℝ are all accepted.
  - **Inequality boxes:** either direction, `≤` or `<=`, "and", and the All Real Numbers button are accepted.
  - **Points:** any order and any separator are accepted.
  - **Refused:** braces in the Mapping Diagram (fixed), and a set box's plain list (by design, F-SET-NOTATION-UNSAID).
- **A harness caveat for the next walk.** The harness passes each section's own policy. App.jsx narrows "request a new question" per question (`resolveQuestionReplacementAllowed`). So on a static one-try choice item (Day 2 PR 5) the harness says "Review it, then request a new question to continue", which a student does not see: App resolves no replacement there, as Pre-Flight warns.

## Fixed

### F-MAP-BRACES (P1, grading; every Mapping Diagram that asks for a domain or range)
**What a student met:** Day 1 CW 6 was answered with every arrow right, "Yes — every input has exactly one output", and the domain and range typed the way the item's own worked steps write them, `{-3, 0, 2, 5}` and `{-2, 1, 4}`. The answer was marked wrong at 50%, with a try used: "Not quite. You have 2 tries left. The domain is not right. It is the set of every x-value that appears, listed once each." The same values without braces were right.
- **Cause:** the box split the text on commas and dropped every piece that is not a number. `{-3` and `5}` were dropped, so the set was read as {0, 2} (`functions/shared/toolMath/relationMapping/relationSets.mjs`, `parseList`). A minus pasted from a prompt that writes its pairs with the true minus sign (Day 1 PR 5, "(−2, 5)") was dropped the same way, so that value disappeared from the set.
- **Reach:** Day 1 CW 6, PR 5 and the exit ticket; Day 2 WU 3, CW 4, PR 3 and the exit ticket; any other lesson's Mapping Diagram.
- **Fix:** the box reads braces, the true minus sign and a dash as notation. The composed stages' own set reader (`parseSetAnswer`) and the misconception classifier already read them this way. It is one rule, shared by the lab's Check, its registry grader and My Math Path's contract.
- **Effect on grading:** right answers only move from wrong to right. A braced list that used to shrink onto the key (`{1, 2, 3}` read as {2}) is now read in full, and is wrong, as it should be.
- **Test:** `tests/platform/relationMappingTypedSets.test.mjs`. It covers all seven items as a device gets them, five spellings each, near misses (a value missing, one added, a sign lost, the range typed as the domain), and My Math Path. Mutation-checked: without the brace reading, without the minus reading, and with sets always equal, each goes red.
- **Browser:**
  - **Day 1 CW 6, before and after.** The braced answer scored 50% before the fix and is "Correct! This question is complete." after it.
  - **Day 2 CW 4 on a phone, by touch:** the braced domain and range are marked right.
  - **CI drivers, all passing:**
    - `toolKeyboardRelationMapping`, at both sizes;
    - `toolPolicyGates` and `undoTyping`;
    - `testCycleRichToolQa` for the Mapping Diagram (70 checks, against a private Firestore emulator);
    - the answer-acceptance job's tests and audit (no false negatives in 29,167 known-correct variants).
- **Commit:** `931bd536`.

## Logged, not fixed

### F-READ-INTERVALS (P1 for a student who uses Read aloud; all four lessons)
Read aloud says interval notation wrongly, in a lesson about interval notation:

| Written | Said |
|---|---|
| `(1, ∞)` | "the point 1, infinity" |
| `[4, ∞)` | "4, infinity" |
| `[−4, 3)` | "negative 4, 3" |
| `(−∞, −2) ∪ [4, ∞)` | "the point negative infinity, negative 2 ∪ 4, infinity" |
| `(−∞, −5] ∪ (1, ∞)` | "the quantity negative infinity, negative 5 ∪ the point 1, infinity" |
| `{(−2, 5), (1, 0), …}` | "{ the point negative 2, 5, the point 1, 0, … }" |
| `x ∈ {−2, 0, 2, 4}` | "x ∈ { negative 2, 0, 2, 4 }" |

- **What the student loses:** square brackets are dropped, so an endpoint that is included and one that is not sound the same. `∪`, `∈` and braces reach the speech engine raw.
- **Sweep counts:** 168 distinct texts carry raw symbols: braces 93, `→` 31, `∪` 26, `…` 5, `←` 4.
- **Cause:** `src/platform/language/speechText.js` reads any `(a, b)` as a point, reads every other `(` as "the quantity", and strips `[` and `]`.
- **Not fixed:** it needs words in English and Spanish, and the Spanish phrases wait for a Spanish-speaking teacher's reading (handoff section 5). It also needs a rule for `(a, b)`, which is a point or an open interval only by context.
- **Proposed rule:**
  - read a bracket group as an interval when an end is ±∞, when its brackets differ, or when `∪` joins it ("the interval from negative 4, included, to 3, not included");
  - `∪` is "union", `∈` "is in", braces "the set".

### F-SET-NOTATION-UNSAID (P2, feedback; set boxes)
**Where:** Day 2 CW 5 (domain, range) and PR 4 (range); the zeros step of District CW 3, CW 7, CW 8, PR 2, PR 4, PR 5, DOL 2 and DOL 4.
**What a student meets:** a box asking to "List the domain", "List the range" or "What are the zeros of this function?". The values typed as a plain list (`-2, 0, 2, 4`; `-1, 5`) are refused, and only the step turns red ("1 step needs attention … Step 4: Write the values"). With braces they are right.
- **The refusal is by design.** `functions/shared/answerUtils.mjs`: "writing a set as a set is part of what the question is assessing", and a test holds it.
- **But nothing says braces are needed:**
  - **The placeholder:** the box shows the bare word "set". `WorkflowRunner.jsx` means to show `{ }` for a value set, but the stage's `notation` takes its place.
  - **The item before:** Day 2 CW 4's Mapping Diagram asks for "the values, separated by commas" (example `-4, -2, 1, 3`), and Day 2 CW 5 comes right after.
  - **The grader itself:** `3` for {3} and `0, 1, 2, ..., 48` are accepted without braces.
- **Suggested:** show `{ }` or an example (`{−4, −2, 1, 3}`) in a set box, and name the form on a miss ("Write the values as a set, in braces { }"), as the radicals' "right value, wrong form" messages do.
- **Not fixed:** it changes every set box on the platform (a design change), and the rule itself is recorded.

### F-GYM-VISITS-CONTINUOUS (P2, content; District CW 4)
"A gym charges a one-time sign-up fee plus a fixed cost per visit." The graph is a continuous segment, keyed 0 ≤ x ≤ 10 and 15 ≤ y ≤ 95.
- **The conflict:** visits are counted. Two items earlier (CW 2, the bus) and in CW 13 (the van), the review teaches that a count is discrete.
- **What a student meets:** one who applies that lesson cannot enter {0, 1, …, 10} (the box takes inequalities) and has no way to say the graph should be points.
- **Suggested:** a continuous situation (a garage that charges by the minute), or keep the visits and key a listed domain.
- **Not fixed:** it changes the item and its keys, so a re-import could mark saved answers wrong. That is a content decision.

### F-CONTINUITY-HINT (P3, hints; Day 2 CW 5, PR 4)
The "discrete or continuous" hint is the one written for a situation: "Decide whether an input in between makes sense here, for example one and a half of the input. If only whole-number inputs make sense, the graph is separate points…". The graph hint follows it: "connect the points only if every input in between makes sense".
- **Why it misfits:** these items are a bare rule over a listed set (`f(x) = 0.5x + 1 over x ∈ {−2, 0, 2, 4}`). The deciding fact is that only the listed inputs belong, as the worked steps say ("Only the listed inputs are used, so the graph is 4 separate points"). A student who reasons that 1.5 can go into 0.5x + 1 is led to "continuous".
- **Suggested:** when the inputs are a listed set with no situation, say "Only the inputs listed belong to this relation: is any value between them part of it?"
- **Where:** the family hint (`functionFeatures.js`, `continuity` and `graph`), used in other lessons too.
- **Not fixed:** it needs a Spanish pack entry.

### F-CLOSED-AT-THE-TURN (P3, grading convention; Day 2 CW 1, CW 3, PR 1, exit ticket 1)
"Increasing on [2, ∞)" is refused for (x − 2)² − 4; only (2, ∞) is accepted, and hint 3 says so ("The turning x-value itself belongs to neither open interval"). The function is increasing on [2, ∞) too. This is a teaching convention, so it is the teacher's or owner's call; logged so that the choice is visible.

### F-Y-WITH-T (P3, grading spelling; Day 2 CW 7)
- **Refused:** `y = 1.8t`.
- **Accepted:** `V(t) = 1.8t`, `V = 1.8t`, `1.8t` and `y = 1.8x`.
- **Why:** a bare `y = …` model is read with x as its input.

This is for the grader-spellings batch to judge.

### Wording and display (P3)
- **District CW 2 (the bus):**
  - The prompt is only the scenario, with no question.
  - Hint 1 names steps the item does not have ("every later step (rule, table, graph, domain, range)").
- **District CW 13 (the van):** asks the student to "decide whether the claim is correct", but no step records that decision; the discrete choice stands in for it.
- **District CW 9, CW 10, PR 5 and exit ticket 5:** the behaviour step asks "Where is this function increasing and where is it decreasing?" and offers "Exponential growth / Exponential decay".
- **Day 1 CW 3 (a restricted graph to read):** the caption under the graph reads "This relationship has a finite domain. Its graph must stop at explicit open or closed boundary markers." That is construction language on a graph the student only reads, and it tells them the domain is finite.
- **Day 2 CW 5 (the graph step):**
  - The point cards read "P1: x = -2", "P2: x = 2", "Center / Key Point", "P4: x = 4".
  - The x = 0 row is named "Center / Key Point", without its x, and comes third; there is no P3.
- **ALEKS bridge:**
  - **CW 2 and CW 4:** hint 3 reads "Its new y is a times 5, plus k" (CW 4: "a times 4"). It names the first point's y-value where the other items say "its y-coordinate".
  - **CW 7:** the back-up step opens "One step back." where every other item says "Let's back up."
- **ALEKS bridge PR 8 (the SAT item):**
  - The lesson's copy has a one-line worked solution ("Analyze the nonlinear function." / "compare the absolute values of the two endpoints"). It is right, but the same for every version.
  - The bank's copy of the family (`mm_sat_A2_2A_absolute-value-interval-maximum_v21`) works each version ("|−a| = a and |b| = b, so the maximum value is …") and names the common error.
- **Day 1 PR 2:** asks to "write the interval" for a union. CW 2 and WU 3 say "the compound interval".
- **Generic hints:** the District sorts (WU 2, WU 4, PR 7), the vertex choice (WU 3) and the sequences (CW 12, PR 8), and the ALEKS bridge's |x| item (PR 3), show the generic hints ("Look at one card at a time…", "Read each choice all the way through…"). They are not wrong, only not about the item.

### Exit tickets and Warm-Ups (log only: another batch is building Recovery for them)
- **Day 1 exit ticket 3:** "For the relation {…}, state the domain and range and decide whether it is a function". The tool also asks for the mapping, which the prompt never mentions. Fix I would make: "Build the mapping for the relation {…}, then state…", as CW 6 says.
- **ALEKS bridge exit ticket 1:** the rationale for "compression by 1/2" on the vertical scale reads "This treats a factor outside f like one inside", on an item with absolute value bars and no f. Fix I would make: "outside the bars".
- **Day 1 exit ticket 1** (x < −1 or 2 ≤ x ≤ 5) is the first union with a bounded piece. Classwork and practice only join two unbounded pieces (CW 2, PR 2), so the one-try ticket asks for something not practised. Fix I would make: let PR 2 have one bounded piece.
- **The District review's exit ticket 7 against its Warm-Up 1** (same task, different rigour) is already in handoff section 5.
- **F-READ-INTERVALS, F-MAP-BRACES and F-SET-NOTATION-UNSAID** reach these sections too. All three are platform behaviour, not item wording. F-MAP-BRACES's fix grades the two exit tickets' Mapping Diagrams with the same rule, and only moves right answers to right; no item changed.

## Interactive pass

| Item | Tool / mode | Wrong try | What the student was told | Result |
|---|---|---|---|---|
| Day 1 CW 2 | number line, two pieces, endpoints typed | −2 closed | "Your endpoints are in the right places. Check whether each one is open or closed…" | right on try 2; same at 390 px by touch |
| Day 1 CW 6 | Mapping Diagram | domain and range typed in braces | "The domain is not right. It is the set of every x-value that appears…" | **fixed** (F-MAP-BRACES, `931bd536`): now "Correct!" on the first try |
| Day 2 CW 4 | Mapping Diagram, 390 px, touch | braces | after the fix: domain and range right | as designed |
| Day 1 PR 4 | graph analysis, interval boxes typed | domain (−∞, ∞) for 1/(x + 1) | "Focus on: Domain in interval notation" | `(-inf,-1)U(-1,inf)` right on try 2 |
| District PR 7 | sort, function or not | figures 1 and 2 swapped | "Figures 1 and 2 are not in the right category yet." (50%) | right on try 2 |
| ALEKS PR 8 | SAT item, typed number (version −8 ≤ x ≤ 5) | 0 | "Focus on: Answer" | 8 right on try 2 |
| Day 2 CW 5 | table, discrete or continuous, plot points, sets | `-2, 0, 2, 4` | "2 steps need attention… Step 4, Step 5" | right with braces; F-SET-NOTATION-UNSAID |
| District CW 7 | 12-step stepper; intercepts and minimum marked on the graph by keyboard | zeros `-1, 5` | "1 step needs attention… Step 4: Write the values" | right with braces; every other step right first time |
| District CW 12 | typed terms | a(5) = 19 (the fourth term) | "Focus on: a(5)" | right on try 2 |
| Day 2 PR 5 | three choices, one try ("This has one try — a hint is available.") | range [0, 60] | "That was your only try. The worked solution is below."; the card says "67% partial credit… still to fix: Reasonable range" | as designed |
| ALEKS CW 7 | Transformations Lab, describe | "left 2" | "…Focus on: Horizontal translation" | right on try 2 |
| ALEKS PR 7 | match with a b box | a = 1, b = 1, k = −4 | "Compare one parameter at a time…" | a = 2, b = 1 (the same graph as \|2x\| − 4) accepted, as the prompt promises |
| ALEKS CW 2 | plot transformed points, keyboard | y = g(x) reflected across the y-axis | "0 of 3 defining points are in the right place. Find each image from its own original point…" | right on try 2 |

Not driven in the browser: Day 2 CW 6 and CW 7, the seven-step models.
- **How they were checked:** through the composed grader that marks them, with ten spellings of each model's equation (F-Y-WITH-T is the one refusal).
- **Why that is enough here:** their table, point and set stages are the ones Day 2 CW 5 drove, and `kSteps_lessonWorkedSteps.test.mjs` grades their worked steps.

## Pacing and difficulty (log only)

- **The ALEKS bridge** climbs well: transformation language (WU), general graphs point by point (CW 1–5), all six moves in one function (CW 6), then |x| (CW 7). Practice repeats each mode once and ends with the SAT item. The exit ticket (a six-part analysis and a match) mirrors CW 6, CW 7 and PR 4.
- **Day 1 and Day 2** are short (6 and 7 classwork items). Day 2's two seven-step models (CW 6, CW 7) are the longest items; the chocolate bars' domain and range are choices, the shower's are typed.
- **The District review** is 35 questions (13 classwork, 10 practice, 8 exit ticket). For one review period that is long; the 12-step quadratic items (CW 7, CW 8, PR 4) take the most time.
- **The Mapping Diagram lists the domain and range values as its two columns,** so "state the domain and range" there is copying the columns (every relation item in Day 1, Day 2 and the District review).
