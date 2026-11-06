# Student walkthroughs, 2026-10-22: four new assignments

These four assignments were done as a student in a real browser, to find what would make the student experience better. **Every finding is logged here; nothing was changed in the four branches.**

| Assignment | Branch @ commit | Questions | Detail |
| --- | --- | --- | --- |
| Algebra I — DOL #3 Review | `claude/trusting-edison-g8e7m1` @ `51da4f81` (no PR) | 13 Practice tool items | [algebra1-dol3-review.md](2026-10-22-walkthroughs/algebra1-dol3-review.md) |
| Algebra II Honors — District DOL #2 Review (absolute value, 3×3 systems) | `claude/funny-hawking-713zyn` @ `d6a4a8dd` (no PR) | 40 (WU 4 · CW 11 · PR 18 · DOL 7) | [algebra2-honors-dol2-review.md](2026-10-22-walkthroughs/algebra2-honors-dol2-review.md) |
| Algebra II Honors — Operations on Polynomials (add, subtract, multiply) | `claude/a2h-operations-on-polynomials-20261022` @ `2589df75` (PR #514) | 32 (WU 3 · CW 11 · PR 15 · DOL 3) | [algebra2-operations-on-polynomials.md](2026-10-22-walkthroughs/algebra2-operations-on-polynomials.md) |
| Algebra II Honors — Dividing Polynomials | `claude/determined-hawking-m81z7h` @ `0ef8b7f0` (no PR) | 33 (WU 3 · CW 11 · PR 16 · DOL 3) | [algebra2-dividing-polynomials.md](2026-10-22-walkthroughs/algebra2-dividing-polynomials.md) |

## Fix status

**Fixed in #517**, in code none of the four branches touch:
- P1 3, in part: the graph step offers every table row (P1–P6), and the grader asks for all six.
- P1 5: the side graph gets the wider column and up to 460 px.
- P2 step counts and tabs:
  - the count looks ahead ("1 of 7" from the start);
  - steps have names ("x-intercept?", "Discrete or continuous?");
  - the strip keeps the current tab in view.
- P2 sequence feedback: names the add-to-n slip, mentions rules only where the item has them, and never states d.
- P2 grade-weight banner: now one line that opens to the sentence.
- P2 Transformation bridge, by owner decision (option b): on point-map items it lives only in Help.
- P2 speech: |…| coefficient and end marker, f(n − 1) + 4, the hyphens, aₙ.

**Status on 2026-11-06.** The four branches merged in #518 at the commits walked. Every item below was checked against the code of `helper/walkthrough-leftovers`; the last column says how. Every finding of the four detail files has its own row [further down](#every-p1p3-finding-in-the-detail-files).

**Waiting for the lesson branches to merge** on 2026-10-22, because those branches rewrite the same tools. All fixed since:

| Item | Status | How it was checked |
| --- | --- | --- |
| Data Modeling Lab, P1 2: the reference model after one wrong try, and "best candidate by RMSE: Quadratic" | Fixed in `3923fef4` (#521). The reference waits for a right answer, the last try, or a surface that shows answers. A best candidate is named only where the item asks for a model family. | `dataModelingReferenceWaits.test.mjs` |
| Data Modeling Lab, P2: "5.33333333333x", the slope card's + cut off at 1366, MAE and RMSE for Algebra I | Fixed in `3923fef4`. The estimate is rounded as the steppers show it, the steppers wrap, and the Algebra I hand fit says "Average distance from your line to the points". | the same test, and `DataModelingLab.jsx` |
| Data Modeling Lab, P2: the "estimate it yourself" line starts pre-fitted | Kept, by owner decision (TL05, [OWNER_DECISIONS_2026-10.md](../handoffs/OWNER_DECISIONS_2026-10.md)): the shared grader refuses an untouched lab. | — |
| Linear Table Workbench misdiagnosis (P1 4) | Fixed in `b3b9a922` (#521). With the right Δx and Δy, the student's own numbers name the slip: Δy left undivided, or Δx ÷ Δy. A wrong Δx or Δy is told about the subtraction. | `linearTableIntervalFeedback.test.mjs` |
| Open Sort | Fixed in `a0878a4a` (#521): a placed card keeps its content, the feedback is plain, "Multiple valid sorts" shows only where more than one sort is authored, the circle is one curve, and the explanation boxes use the page font with a placeholder that fits every card. `f003a36f` draws the circle with equal units. Names and explanations: `c6979206` (GR16) marks them "For your teacher", never right or wrong. | `openSortStudentClarity.test.mjs`, `openSortBoardSharedGrading.test.mjs` |
| Add & Subtract Workshop phone overflow (P1 1) | Fixed in `96d2e3f9` (#521): the problem line scrolls in its own box and the columns may shrink. | `polynomialWorkshopPhone.test.mjs`; in a browser, the App's phone shell at 390×844 and 360×740 (2026-11-06): the exit ticket's first question and Practice 6 (four columns each), and Classwork 3, have nothing past the right edge, on the page or in Work View. The lesson harness (`algebra2PolynomialsLesson.html`) still cuts the exit ticket off at 448 px, but only because its centred box takes the width of its content; the App gives the question the screen's width. |
| −1x² reason (P1 6) | Fixed in `96d2e3f9`: a written coefficient of one is its own problem, with its own message. `97e6a154` (TL31) names what is left in the student's own answer, so a subtraction is no longer told to multiply out products. | `simplifiedPolynomialForm.test.mjs`, `misconceptionEvidencePhase2.test.mjs` |
| Long-division placeholder | Fixed in `96d2e3f9`. Where the method is withheld (DOL, quiz, test), a missing power's column stays empty and the "0 holds the place" note is gone; the task card's steps, which also said it, are withheld there too. | `PolynomialWorkshop.jsx` (`showPlaceholders={!methodWithheld}`) and `ToolShell.jsx` (`taskCardSupport`); seen on Dividing DOL 2 in the 2026-10-23 walkthrough |
| Synthetic division | Fixed in `96d2e3f9`: r's sign slip is named, and a student who used the original coefficients is told that this item divides through first. `9bc41ab2` (TL49) lets the x − r view take a fractional root. On a phone, `d1c92f91` (PH06) fits five coefficients and keeps PR 14's divisor off the dividend. | `polynomialSyntheticFeedback.test.mjs`, `polynomialWorkshopPhone.test.mjs` |

**Still open, not yet scheduled** on 2026-10-22:

| Item | Status | How it was checked |
| --- | --- | --- |
| P1 3, the rest | The stale "✓ Checked correct" and its screen-reader text: fixed in `9b7fb045` (#521). A changed step makes every checked step built on it "changed", and a point-only graph no longer says a curve is drawn. The connected line credited under "continuous" is kept (GR11, `1c1c5d63`): it follows the student's own choice, which is marked wrong, and withdrawing the credit would lower grades, which needs the owner's explicit say. | `workflowUpstreamChange.test.mjs`, `workflowContinuityFollowThrough.test.mjs` |
| Authored `commonError` text not used during attempts | Fixed for PR 1, PR 2, PR 8 and PR 13. PR 1: `31a2eeb3` (FB04) says the error when the student's wrong value is one it names. PR 13: #517 names the add-to-n slip. PR 2 and PR 8: `ec461969` names the error in the step it is in (below). **PR 10 and PR 12 wait on a decision** (below). | `commonErrorMissFeedback.test.mjs`, `sequenceFullBridgeFeedback.test.mjs`, `composedStepSlips.test.mjs` |
| The first screen being mostly header | Fixed in `fa3a3d87` (PH03): rows of one short phrase share rows, and a long work bar is one row of icons. | `phoneFirstScreen.test.mjs` |
| Duplicate Undo/Reset in the Linear Table Workbench | Fixed in `7a20aa72` (#521): one Undo, the work bar's (owner decision, 2026-10-23). By the same rule the tool keeps its own Start over. | `oneUniversalUndo.test.mjs` |
| Click count on the Multiple Representations board | Fixed in `7b8df7f4` (TL27): once the student says which variable is 0, practice takes the intercept typed straight in, and a miss sends them to the solve. | `lmrTypedIntercept.test.mjs` |

**PR 2 and PR 8, `ec461969`.** A keyed slip (`misconceptions`) can now name a step of a composed question: it is read in that step, by the step's own grader. Before, a slip could name only an answer field, which a step is not, so these items had none and said "Not quite" and nothing more. Now, on Practice:
- PR 2, the popcorn model:
  - "continuous" gets "A continuous graph would mean the friends could buy part of a bucket. Can they?";
  - a domain without 0, in any order or spelling, gets "The friends might decide not to buy any popcorn. Is that number of buckets in your domain?";
  - a range without $0 gets "The friends might buy no popcorn at all. What would that cost, and is it in your range?".
- PR 8, the tank: a zero typed as 48 gets "That mixes up the zero and the y-intercept. The zero is the x-value that makes y = 0: the time when the tank is empty."

No sentence states an answer. The Honors review is rebuilt from the regular one and says the same. A class that has the review gets it on re-import.

**Waiting on a decision: Open Sort's common error (PR 10, PR 12).** A miss still says only "Not every group holds together yet". The lesson's error ("Calling a pair causation because the two quantities rise together", "Calling Card D not a function because its outputs repeat") could be said when the card it is about is in the wrong group. These are open sorts, though: the student makes and names the groups. "The wrong group" would mean matching their groups to the authored sort, then naming a misplaced card's mistake. Only a missed fixed-category sort marks wrong cards today (F-SORT-WHICH-CARD), and Controlled Sort deliberately gives no count (TL05). Hints 2–3 already say the idea, one click after a miss (FB10). The question for the owner: on Practice, may an open sort with one authored sort say the lesson's error when the card the error is about is grouped against that sort?

**Not an issue:**
- "Common difference has no accessible name". The input is inside its `<label>`; the harness misread it.
- "Transformed x / Transformed y" (DOL #2 WU 2) and the Data Modeling Lab's prediction box (DOL #3 PR 11). The same misread: each input is inside its `<label>` ("Transformed x", "Predicted y"), as it was at the commits walked.

### Every P1–P3 finding in the detail files

Checked on 2026-11-06. Ids are the detail files' own. "Owner" means a decision recorded in [OWNER_DECISIONS_2026-10.md](../handoffs/OWNER_DECISIONS_2026-10.md); the other ids (FB10, TL28, …) are rows of [P3_OUTCOMES_2026-10.md](../handoffs/P3_OUTCOMES_2026-10.md). A test named here is under `tests/platform` unless it says `tests/tools` or `tests/browser`.

[Algebra I DOL #3 Review](2026-10-22-walkthroughs/algebra1-dol3-review.md):

| Finding | Status | How it was checked |
| --- | --- | --- |
| F-HINT-2STEP (P3) | Fixed in `af33af72` (FB10): after a miss, "Show a hint" opens the hint under the miss, and the page moves only as far as the hint needs. | `hintOpensWhereClicked.test.mjs`; `tests/browser/feedbackTeachesHintPlace.mjs` |
| F-GENERIC-FEEDBACK (P2) | See "Authored `commonError` text" above: fixed for PR 1, 2, 8 and 13; PR 10 and 12 wait on a decision. | see above |
| F-STEP-TABS-CLIP, F-STEPCOUNT-JUMP (P2), F-STEP-NAMES (P3) | Fixed in #517 (`164250b5`). | `workflowStepNamesAndCount.test.mjs` |
| F-CLASSIFY-NO-PROMPT (P3) | Not reproduced in the App. On a laptop, "Current question" is the last part of the sticky task anchor, so the active step's question stays on screen above the step after "Next step"; on a phone it is in the task panel. The walkthrough harness has no App shell, so its anchor does not stick: that is where the question scrolled away. | in a browser, the App at 1366×768 and 390×844, DOL #3 PR 8: the question of steps 1, 2 and 4 on screen and uncovered each time (2026-11-06) |
| F-KEYPAD-GENERIC (P3) | Fixed in part in `7ce22aee` (TL23): on practice, π, e and logₐ appear only where the item's math uses them. A phone's equation pad leaves out ⁿ√ unless the answer needs it. **Still open:** ⁿ√ on a laptop's practice pad, and the other keys the finding lists (√, x², xⁿ, \|x\|, a⁄b), the pad's usual algebra keys, which TL23 left as they were. | `keypadConstants.test.mjs`, `mobileEquationKeypadPolicy.test.mjs` |
| F-GRAPH-5-OF-6 (P1) | Fixed in #517 (`164250b5`): every table row is offered and graded. `d3543c6e` (TL48) removes the 12-row cap. | `workflowGraphEveryTableRow.test.mjs` |
| F-GRAPH-CONTINUOUS-CREDIT (P1) | See "P1 3, the rest" above: the stale check fixed, the follow-through credit kept (GR11). | see above |
| F-CASCADE-SILENT (P2) | Fixed in `0d38067a` (FB24): a step on the branch of a red choice reads "Follows Step N, which needs revision", and a restarted step says why it is empty. | `workflowFollowsIncorrectChoice.test.mjs` |
| F-PLACE-NEEDS-SELECT (P3) | Fixed in `1f3e2edb` (AX27): a cue beside the typed entry says which point it will place, or to choose one first. The x and y boxes sit inside their labels. | `tests/browser/graphKeyboardRoute.mjs` |
| F-A11Y-64-PATHS (P3) | Fixed in `1f3e2edb` (AX27): pieces drawn end to end are one path. | `graphSummaryPaths.test.mjs` |
| F-DUP-CONTROLS (P2) | See "Duplicate Undo/Reset" above: one Undo (owner, 2026-10-23). | `oneUniversalUndo.test.mjs` |
| F-MISDIAGNOSIS (P1) | See the Linear Table Workbench row above. | `linearTableIntervalFeedback.test.mjs` |
| F-GRAPH-2-LABEL, F-CHECK-MSG, F-MEANING-NO-REASON (P3) | Fixed in `8356667a` (TL28): one graph is "Graph"; an empty pair says "Type the point first…"; a wrong meaning shows its definition. | `lmrBoardWording.test.mjs` |
| F-REPEATED-UNLOCK (P3) | Kept (TL28): the locked cards' buttons are a tested keyboard path. | — |
| F-CONTEXT-WINDOW, F-GRID-2 (P3) | Fixed in `d5723bea` (CT11): Q4 names its axes and shows the first quadrant; Q6's points sit on gridline crossings. | `algebra1Dol3Review.test.mjs` |
| F-HEAVY-STEPS (P2) | See "Click count" above (TL27). | `tests/tools/lmrTypedIntercept.test.mjs` |
| F-SMALL-SIDE-GRAPH (P1) | Fixed in #517. | — |
| F-A11Y-POINT-CHIPS (P3) | Not reproduced (AX27): the chip's typeset copy is hidden from the accessibility tree, which holds only the spoken words. | — |
| F-SORT-FEEDBACK, F-SORT-HIDDEN-TEXT, F-MULTI-SORT-BADGE, F-CIRCLE-HALVES (P2), F-PLACEHOLDER (P3) | See the Open Sort row above. | `openSortStudentClarity.test.mjs` |
| F-RATIONALE-LENGTH (P3) | Fixed in `c6979206` (GR16). | `tests/tools/openSortBoardSharedGrading.test.mjs` |
| F-DML-KEY-LEAK, F-DML-QUADRATIC (P1); F-DML-FLOAT, F-DML-OVERLAP (P2); F-DML-JARGON (P3) | See the Data Modeling Lab rows above. The prediction box is named ("Not an issue" above). | `dataModelingReferenceWaits.test.mjs` |
| F-DML-PREFIT (P2) | Kept (owner, TL05). | — |
| F-SEQ-FEEDBACK (P2) | Fixed in #517. | `sequenceFullBridgeFeedback.test.mjs` |
| F-SEQ-CLIP (P2) | Fixed in `fb1b0066` (TL40): no box is behind the edge at 1366 for 3 to 8 terms. On a phone a six-box table scrolls inside its own box. | `sequenceTableColumn.test.mjs`; `tests/browser/sequenceBuildScreen.mjs` |
| F-A11Y, common difference (P3) | Not an issue (above). | — |
| Read aloud (across the assignment) | Fixed in #517. PR 3's table rows are read since AX10. | `speechWalkthroughReadings.test.mjs`, `toolTableReadings.test.mjs` |
| F-PHONE-CHROME (P2) | Fixed in `fa3a3d87` (PH03). | `phoneFirstScreen.test.mjs` |

[Algebra II Honors DOL #2 Review](2026-10-22-walkthroughs/algebra2-honors-dol2-review.md):

| Finding | Status | How it was checked |
| --- | --- | --- |
| F-WEIGHT-BANNER, F-PHONE-WEIGHT (P2) | Fixed in #517. | — |
| F-FIRST-SCREEN (P2) | Fixed in `fa3a3d87` (PH03). | `phoneFirstScreen.test.mjs` |
| F-TASK-NO-EQUATION (P3) | Fixed in `3b51aa15` (CT21): the eight cards carry their equation, so Read aloud says it. Reaches a class on re-import. | `algebra2HonorsDol2Review.test.mjs` |
| F-MATH-PERIOD (P3) | Fixed in `c4207279` (RT14): inline math sits on the text's baseline, so a full stop after it reads as one. | `inlineMathBaseline.test.mjs` |
| F-FORMAT-FEEDBACK (P3) | Fixed in `d14145ab` (FB22): an inequality where interval notation is asked is told so while tries are left. | `formChecksWhileOpen.test.mjs` |
| F-KEYPAD-GENERIC (P3) | See the DOL #3 row above. | — |
| F-BRIDGE-OPEN, F-SPEECH-ABS (P2) | Fixed in #517 (the bridge by owner decision, option b). | — |
| Transformed x / y unnamed | Not an issue (above). | `TransformationsLab.jsx` |
| F-PLACEMENT-HIDDEN | Not an issue (owner, 2026-10-22). | — |
| F-REVERSE-WORDING (P3) | Fixed in `cb42c253` (TL45): the split says what to do in the student's words and names the buttons. | `absoluteSplitPrompt.test.mjs` |
| F-PHONE-NESTED-SCROLL (P3) | Fixed: `fa3a3d87` (PH03) took the scrolling task card from 11 of 14 questions to 2, and `9b8e2a76` (PH09) shows a soft edge where a card still scrolls. | `taskCardRoom.test.mjs` |
| F-MATRIX-6PX (P3) | Fixed in `0d4c51b3` (PH09): a 3×3 matrix fits a 320 px phone. | `matrixGridNarrowPhone.test.mjs` |

[Algebra II Honors Operations on Polynomials](2026-10-22-walkthroughs/algebra2-operations-on-polynomials.md):

| Finding | Status | How it was checked |
| --- | --- | --- |
| "[College-Readiness — SAT style]" in PR 14's task | Fixed in `238027f6` (CT16), on re-import. | `promptBracketTags.test.mjs` |
| F-CELLS-NOT-MARKED (P3) | Fixed in `96d2e3f9`: Add & Subtract and the area model mark the cells the check found wrong. | `PolynomialWorkshop.jsx` |
| F-SPEECH-HYPHEN (P3) | Fixed in #517. | `speechWalkthroughReadings.test.mjs` |
| F-ONE-COEFF (P1) | See "−1x² reason" above. | `simplifiedPolynomialForm.test.mjs` |
| F-CELL-MSG (P3) | Fixed in `96d2e3f9`: the area model's message names signs. | `PolynomialWorkshop.jsx` |
| F-DUP-FEEDBACK (P3) | Kept (TL31): the second copy is the screen-reader copy. | — |
| F-ADDSUB-PHONE-OVERFLOW (P1) | See the Add & Subtract row above. | above |
| Placeholders cut off ("opposit…") | Fixed in `96d2e3f9` and `97e6a154` (TL31). | `polynomialWorkshopPhone.test.mjs` |

[Algebra II Honors Dividing Polynomials](2026-10-22-walkthroughs/algebra2-dividing-polynomials.md):

| Finding | Status | How it was checked |
| --- | --- | --- |
| F-PLACEHOLDER-CLIP (P3) | Fixed in `96d2e3f9` and `97e6a154` (TL31). | `polynomialWorkshopPhone.test.mjs` |
| F-SPEECH-HYPHEN | Fixed in #517. | — |
| F-PLACEHOLDER-GIVEN (P2) | See "Long-division placeholder" above. | above |
| F-R-SIGN-MSG (P3), F-ALT-METHOD (P2) | See "Synthetic division" above. | `tests/tools/polynomialSyntheticFeedback.test.mjs` |
| F-SYNTH-PHONE-SCROLL, F-BRACKET-PHONE-GARBLED (P2) | Fixed in `d1c92f91` (PH06). At 200% text the table still scrolls, with a soft edge. | `polynomialWorkshopPhone.test.mjs` |

## How it was run, and its limits

**What ran:**
- None of the four is merged or live, so no signed-in student could take them.
- Each branch was checked out on its own.
- Its lesson went through the teacher-import chain (parse → preflight review → preflight model → validate → rebuild).
- It was mounted in the real `QuestionEngine` with what App.jsx passes:
  - the question record kept by `recordQuestionAttempt`;
  - the section's effective activity policy and attempts;
  - Guided Notes, the calculator setting, "practise one like this" and `dolMode`.
- The harness is in [`2026-10-22-walkthroughs/harness/`](2026-10-22-walkthroughs/harness/). Copy it into `tests/browser/`, then open `lessonWalkthrough.html?lesson=<path under teacher-import-jsons>`.

**Browser and coverage:**
- Headless Chrome, driven through the rendered controls, at 1366×768 (Chromebook) and 390×844 (phone).
- Every question was screened at both sizes.
- At least one wrong-then-right path was worked on every tool and mode. The DOL exit tickets were submitted once each.

**Baseline:**
- `check-teacher-import` is valid for all four (Operations has two informational warnings).
- The lessons' own tests pass: 20/20, 11/11, 13/13, 15/15.
- No question showed an unfilled template, raw LaTeX, `undefined`/`NaN` or a page error.

**Limits:**
- These are harness runs, not signed-in sessions.
- Per-student versions differ between students; values quoted here are one student's.
- Emoji icons render as boxes in this Linux Chrome. That's an environment artifact and isn't logged.
- Matrix Lab and Systems Workspace items in DOL #2 were only spot-checked; they have their own walkthroughs and journey gates.
- The branches were still being changed today. Findings apply to the commits above.
- Added 2026-11-06: the harness has no App shell. Its centred box takes the width of its content, and its task card does not stick. Check a phone clip, or a question that scrolls away, in the App's shell (`tests/browser/teacherWorkflow`) before logging it. On 2026-11-06 the exit ticket's Add & Subtract item still clipped at 448 px in the harness but fit in the App, and F-CLASSIFY-NO-PROMPT did not reproduce in the App.

## Fix first (P1)

1. **The Add & Subtract Workshop runs off a phone screen** (Operations — PR 6 and the DOL 1 exit ticket).
   - What happens: the four-column board is 436–480 px wide on a 390 px phone, and the page clips rather than scrolls.
   - What's cut off: the task sentence, the expression being subtracted, the second column and the Calculator are cut off with no way to reach them.
2. **The Data Modeling Lab gives away the model after one wrong try** (DOL #3 — PR 11).
   - What happens: the feedback shows "Reference after submit: linear regression y ≈ 6.13x + 54.9" with two tries left, which is exactly what the item asks the student to produce.
   - It also says "best candidate by RMSE: Quadratic." on an Algebra I linear-regression item.
3. **The relationship model's graph step skips a table row** (DOL #3 — PR 2).
   - What happens: the table has x = 0…5, but the graph step offers P1–P5 (x = 0…4), so (5, 30) can't be placed. "All point placements are correct" is shown anyway.
   - A connected line through five points is credited as the graph when the student says "continuous".
   - The later analysis graph shows a sixth point the student never placed.
4. **Feedback that points away from the fix** (DOL #3 — PR 3, PR 5). The authored mistake, using Δy as the rate when x jumps by 2, 3 or 4, gets "Recheck subtraction order and signs before changing anything else." The signs were right; the fix is to divide by Δx. In PR 5 the mistake also flips the conclusion from linear to nonlinear.
5. **A graph too small to read on the steps that need it** (DOL #3 — PR 8; the same tool appears in DOL #2 CW 1, PR 1).
   - What happens: the yes/no and typed steps put the graph in a ~280 px side panel with ~6 px labels.
   - Why it matters: 48 gallons has to be read between labels at 40 and 50.
6. **Correct math refused for the wrong stated reason** (Operations — CW 5).
   - What happens: −1x² + x + 2 gets "Equal, but not simplified: multiply out every product and combine like terms."
   - Why it's wrong: nothing was left to combine; only the written 1 is the issue. It cost a try.
   - Suggested fix: accept the written 1, or name the real problem.

**Not an issue (owner, 2026-10-22):** the Step Algebra solver's balanced-operation placement. Students know they drag the value onto each side; the disabled *Commit step* until both sides are placed is the trained interaction. It's kept in the DOL #2 file as an observation only.

## Then (P2)

**Feedback**
- **Authored "common error" text not used during attempts.** Each item has a `solutionReview.commonError` that names exactly what went wrong, but students get a generic "Not quite… The red steps above need revision". Seen on DOL #3 PR 1, 2, 8, 10, 12 and 13. Showing that text (or the matching hint) on a matching miss would help most.
- **Open Sort feedback is jargon and generic.** "Your cards do not yet form one of the valid mathematical partitions for this set…" is shown twice and never mentions the lurking variable or "a function may repeat outputs" (DOL #3 PR 10, 12).
- **Sequence feedback blames consistency.** For the n + 4 mistake, the message is about keeping representations consistent, although the student's graph matched their table. It also mentions "both rules" on an item with no rule fields (DOL #3 PR 13).
- **Synthetic division with a divisor like 2y − 1 accepts only "divide by 2 first".**
  - The textbook alternative is to use the original coefficients, then divide the bottom row by 2. It gives the right quotient but scores 29% with a red grid.
  - Nothing tells the student it's the method, not the math, that's being refused (Dividing CW 10).
  - The most common synthetic-division slip, the sign of r, gets only the generic red-box message (CW 9).

**What students see first**
- **Grade-weight banner on almost every item.** It reads "Grade weight ×1.75 · this question counts 1.75 times a standard-weight question…" with decimal weights from ×1.25 to ×3.5. It sits above the work on every item (DOL #2, Operations, Dividing) and wraps to four lines on a phone.
- **The first screen is all header.** At 1366×768, the task card, Learning goal, tries bar, weight banner and Guided Notes bar push the tool to ~580 px. On a phone they take about half the screen.
- **Step counts jump and step tabs clip.** "1 of 5" becomes "5 of 7"; "1 of 2" becomes "… of 7". The active step tab is cut off ("5. Buil…") and the strip doesn't scroll to it. Steps are named "1. Classify, 2. Classify, 3. Classify" (DOL #3 PR 2, PR 8; DOL #2 CW 1, PR 1).

**Assessment validity**
- **Long division inserts the 0 placeholder for missing powers by itself**, including on the DOL 2 exit ticket. The exit ticket can't show whether a student knows to hold the place (Dividing CW 5, DOL 2).
- **The Transformations Lab's "Transformation bridge" is open on a Warm-Up retrieval item** and states the answer rule, "A parent point (x, y) maps to (x/b + h, ay + k)" (DOL #2 WU 2).

**Tools**
- **Open Sort** (DOL #3 PR 10, 12):
  - placed cards collapse to "Card A ↩", hiding the words, table or graph being judged;
  - the circle card is drawn as a solid blue top half and a dashed red bottom half;
  - names and explanations count as "correct" parts after a length check only.
- **Data Modeling Lab** (DOL #3 PR 11):
  - the "estimate it yourself" step starts already fitted;
  - "5.33333333333x" is shown unrounded;
  - the slope card's + button is cut off at 1366;
  - MAE/RMSE are shown to Algebra I students.
- **Duplicate controls.** The Linear Table Workbench has its own Undo/Redo/Start over/Submit next to the page's Undo/Reset/Hint, so there are two Undos and two resets (DOL #3 PR 3).
- **Rounds of clicking for simple facts.** Each intercept in the Multiple Representations board takes about 10 actions. In a 13-item review where every item is a multi-part board, that's heavy for DOK 2 facts (DOL #3 PR 7).

**Layout**
- **Clipped at 1366:** the sixth sequence box (DOL #3 PR 13) and placeholder text in Workshop boxes ("next quotient ter…", "opposit…").
- **Phone, Dividing:**
  - the five-coefficient synthetic-division grid scrolls sideways inside its own box, hiding the remainder column on the DOL 3 exit ticket;
  - PR 14's divisor y² + y − 5 overlaps the dividend inside the bracket (fine at 1366).

**Speech (Read aloud and screen readers)**
- |x − 2| is read as "the absolute value of x minus 2 minus 4" with no "times" and no end of the absolute value (DOL #2).
- f(n − 1) + 4 is read as "f of the quantity n minus 1 plus 4" (DOL #3).
- "5a-7" and "x-7" are read with a hyphen; "aₙ" is passed as a raw subscript character.

## Smaller items (P3)

Each is in the per-assignment files:
- Hint chooser after a miss (two clicks, opens at the top).
- Keypads full of π, e, logₐ, ⁿ√ for linear work.
- "Graph 2" with no Graph 1.
- Unlabelled four-quadrant grid for a rideshare context.
- y-gridlines every 2 for a y-intercept of 9.
- Wrong cells not outlined in the Add & Subtract and area-model Workshops (the long-division and synthetic Workshops do outline them).
- Feedback shown twice.
- Unnamed inputs (Transformed x/y, prediction, common difference, point x/y).
- "Choose a point first" on a typed box.
- Sentence-ending period after math shown as a raised dot ("= d·").
- Task cards that say only "Solve the equation." while the equation is inside the tool.
- Matrix Lab 6 px sideways scroll on a phone.
- A literal "[College-Readiness — SAT style]" tag in a task.

## Working well (keep)

- **Exit tickets (DOL), in every tool tried:** one try; no Hint; "THIS QUESTION IS CLOSED — KEEP GOING" with "Your answer is saved. You will see whether it is right when this activity's results open."; no right/wrong colours; fields locked; Undo/Reset disabled; still locked after a reload; partial credit recorded for the teacher.
- **Targeted feedback that names the mistake:**
  - Multiple Representations: "That is an amount, not a change", "Check the direction of the rise", "Keep the order: y₂ and x₂ come from the same point", "Multiply every term by −1".
  - Transformations Lab: "The y-coordinate is right… only h moves a point horizontally".
  - Add & Subtract Workshop: "Check the sign of EVERY opposite".
  - Long division: red boxes with "start with the first one: every later step depends on it".
  - Step Algebra: "An isolated absolute-value expression is required" before splitting.
- **Equivalent answers accepted:**
  - polynomial terms in any order;
  - 1 = |c − 69| and |x − (−2)| = 5;
  - 3/2 and 1.5;
  - "vertical compression ½" for |½(x − 4)|.
- **Partial credit shown clearly:** "2 of 3 tries left · 50% partial credit so far · still to fix: …".
- **Long division bracket:** fills in the paper layout as the student works through the rounds.
- **Error-analysis guard:** submitting Marcus's given matrix unchanged doesn't use a try.
- **Reload:** mid-board work survives a reload.
- **Phones:** no page-level sideways scroll except the Add & Subtract Workshop above.
