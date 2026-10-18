# Student pass 3 — wave 5, session W5-4: feedback that says why

Branch `claude/pass3-feedback-reasons`, from `claude/modest-pasteur-xzagn7` at `e822504`. Scope: R-3 / PR-11 and
R-4 / PR-12 ([07-open-items-prs.md](../qa/student-experience-pass-3/07-open-items-prs.md)), HELP-22
([03-help-and-self-correction.md](../qa/student-experience-pass-3/03-help-and-self-correction.md)), the TOOL-8
calculator remainder ([STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md](STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md), "Not done"),
and a survey of other generic refusals (no fixes). Nothing here re-grades or writes to Firebase, and nothing was deployed.
No verdict or score changes (the equivalence sweep below shows it).

Every new reason appears only where the item's outcome feedback is shown. It never appears on an exit ticket, quiz or
test before release (D2), and the proof is listed for each item.

## Each item: confirmed on the base → what changed → proof

| ID | What a student saw (confirmed on `e822504`) | What changed | Proof |
| --- | --- | --- | --- |
| R-3 / PR-11 (P1) | Algebra I M2 T2 L3 Classwork 3.1, "Equation of line B′ in slope-intercept form", key `y=-3x+5`. The student typed `y-5=-3\left(x-0\right)` and got "Not quite" + "Focus on: Equation of line B′ in slope-intercept form.", which is exactly what a wrong line gets. Probe on the base: graded wrong, classifier `[]`. | **New pure classifier `ordinary:multiAnswer`** (`functions/shared/misconceptionClassifiers.mjs`). It uses the same plumbing as HELP-15 (the device runs the server's classifier on the shared grading). Three new codes: `line-wrong-form-slope-intercept`, `-point-slope`, `-standard` (`misconceptionCodes.mjs`, additive under registry v1, TEKS A.2B). A code fires when **all** of these hold: the field was graded wrong; the typed equation and the key have the **same graph** (`linearEquationForm.mjs` `sameLine`); the form asked for is named by the field's label/prompt/placeholder, or by the question prompt **only when the item has one answer field** ("slope-intercept form", "y = mx + b", …), or else is the key's own written form; label and key do not disagree; the key's line can take that form (a **vertical** line is never told to use slope-intercept or point-slope form); and the student's equation is not in that form. Student message: **"Right line, wrong form: write it as y = mx + b."** (also `y − y₁ = m(x − x₁)` and `Ax + By = C`), with Spanish entries in `esSupport.js`. The server records the code at ingestion (evidence only, never a grade). The device shows it under "Not quite" through `diagnoseMiss` → `missFeedback`. Like every miss message, once it is shown the next attempt is recorded as feedback-assisted (`feedbackAssisted`, QuestionEngine). Read aloud says each form letter by letter: "y equals m x plus b", "A x plus B y equals C", "y minus y sub 1 equals m times the quantity x minus x sub 1" (`speechText.js` `spokenLineForms`; Spanish the same way). The routing works with the server's `surfaceId: 'multiAnswer'` and with the device's display grading, which names no surface. **Verdicts unchanged:** a form that is asked for stays required. When no form is asked for, the verdict is still the equivalence layer's (`answerEquivalence.mjs`). This change only names the reason. | `rightLineWrongForm` (new): the real compiled L3 item. The device grading gets the message and `missFeedback` returns it. The server's `gradeServerResponse` + `classifyMisconceptions` records the **same** code on `eqB2`, with score 0. `y=-3x+5` is right; `y=-3x+4` and `y-5=-3(x-1)` get nothing. DOL/quiz/test policies: `feedbackOpenForItem` is false while the item is open and also when it is closed but not released. Form detection cases are covered. 10 new fixtures in `misconceptionFixtures.mjs` (named, not named, disagreeing label/key, standard-form multiple, correct). These run through `misconceptionEvidence` (declared = implemented, every code has a producing fixture, correct work → no code). Review fixtures: a vertical key beside a slope-intercept prompt, a vertical key with one field, the prompt used for one field and ignored for another, a correct accepted alternate form beside a wrong field, and a tool surface on a multiAnswer question (no ordinary classifier). Mutations: device routing off → red; the same-line check removed → red; the label/key-disagree rule removed → red; the feedback gate forced open → red; the vertical guard removed → red; the prompt used for every field → red; the per-part gate replaced by `parts.get` → red; the surface guard set to true → red; the spoken forms removed → red. |
| R-4 / PR-12 (P1) | Transformations Lab, L2 Classwork 1 (f(x) = x left 3, S1–S5). (a) The right images plotted S5→S1 scored 20% and read "1 of 5 defining points are in the correct transformed locations. Use x/b + h for x and ay + k for y." (b) Every point moved **up** 3 lands on t(x)'s line through the wrong points, scored 0/5, and got the same sentence. The plot hint never mentioned order. | `plottedPointCorrespondence` (shared, `toolMath/transformations/transformationsMath.mjs`) recognises `'reordered'`: every image found, one point each (a matching, so a doubled point never counts twice), not in place. It also recognises `'sameGraph'`: every plotted point on the transformed graph and every image on it too, and **no** plotted point is its own image. A plot with some images in place keeps the lab's count sentence ("4 of 5 defining points are in the correct transformed locations…"). `src/tools/transformations/plotTransformFeedback.js` words them in Algebra I terms with the on-screen labels: **"You found every image, but not in order. P1 must be the image of S1, P2 the image of S2, and so on. Check which original each of your points came from."** (the reviewer's wording) and **"Your points are on the right line, but they are not the images of their own points. Find where each original point goes: S1 to P1, …"** ("graph" for other families). Neither names a coordinate or the move. Any other miss keeps the lab's own sentence. The plot hint now starts "Order matters: P1 is the image of S1, P2 is the image of S2, and so on." **Scores unchanged** (the reversed plot is still 0.2). | `tests/tools/transformationsPlotCorrespondence` (new): the real compiled L2 item. The reversed plot scores 0.2 and gets the order message; two swapped points too. Up 3 scores 0 and gets the same-line message with no coordinate or direction. Correct, off-line, doubled and incomplete plots get no new message, and neither do 4-of-5 (score 0.8) and 3-of-5 plots with the rest slid along the line. Images that are not on the shown graph are never "the right line". The lab's plot branch returns it before the old sentence, and the hint says order. Mutations: `reordered` disabled → red; the "plotted points on the graph" condition dropped → red; the "no point in place" rule dropped → red; the "images on the graph" half dropped → red; the lab's `return correspondence` removed → red. Gate: the lab's verdict text exists only when `useToolSubmission` keeps `feedback` (null unless `showImmediateFeedback`). `toolPolicyGates`, `assessmentLeakGates` and `toolAttemptOutcome` pass. |
| HELP-22 (P2) | "Check my points": "(3, 4) — 2 units below the function". That is the correction itself, it could be pressed without limit, it sat beside a second button "Check Point Placements", and it was 11–12 px. | `graphSelfCheck.js` `describeVerticalMiss` says which way and what to work out, never how far: **"too high — find f(3) and compare"** / **"too low — …"**. The distance is no longer carried in the report. **"Check Point Placements" is free and never charged**, as on the base: it commits the points or names the ones to revise. Which way a point is off is **help the student asks for** (HELP-10, D5): one opt-in button, **"Which way is each point off?"**, with its cost said under it ("This counts as a hint. …"). Where outcomes are shown it is offered while the plot is partial (when Check Point Placements cannot run yet) and after that check finds a point off, until a point moves. Only its press is charged. Where outcomes are withheld it is "Check my points", always offered once a point is placed (as before). Where outcomes are shown the report lists only the points that are off, under its count. On a DOL, quiz or test hints are off, so it never appears. The button, report and cost note are body size (16 px) with a 44 px minimum target. | `graphSelfCheck`: direction text with no distance in it; `checkPoints` never builds a report and never charges; the opt-in is the only `runSelfCheck` control, offered where withheld, on a partial plot or after a miss; a moved point withdraws the offer; the report lists only off points where outcomes are shown; 16 px. `learnFromTheMistakeHints` region rebound to the opt-in. Mutations: distance back in the text → red; Check Point Placements charging → red; the offer conditions removed → red; the report filter removed → red; report at 11 px → red. Browser, `graphPointCheck` (real QuestionEngine; the harness now records the attempt's support usage). Practice: offered on a partial plot, not on a complete one, after a free miss check ("Revise: …", no report). Fixing the point and submitting: **not a hint** (`hintUsed: false`, independent). With the opt-in pressed: "(2, 4) — too low — find f(2) and compare" only, then **a hint** (`hintUsed: true`). With Check Point Placements made to charge again, the driver goes red. DOL: no check, no report, no note. |
| TOOL-8 remainder | The calculator showed a bare "Error". Only a screen reader heard more, and only "The calculator could not work that out." | `calculatorExpression.js` refusals carry a `reason` and the `detail` it could not read. Thrown messages and every result are unchanged. `calculatorKeys.js` `calculatorErrorMessage`: "It could not read “=”. Use numbers, + − × ÷, brackets and the function keys.", "It could not read “abc”. …", "A bracket is not closed. Add the missing “)”.", "A “)” has no “(” to match it.", "That has no number answer. Check for dividing by 0.", "It could not read that. Check for a missing number, or two signs side by side.", "This calculator does not have that key on this question.", "Type a calculation first.", "That calculation is too long. …". The panel shows the sentence under "Error" (`data-calculator-error`) while the display still holds it, and the polite result region says the same words. Both Enter and "=" do this. | `calculatorErrorReasons` (new): every reason through the real evaluator; the thrown text is unchanged; Enter and "=" both set and say it; the line is shown only beside "Error". Mutations: one handler's `setErrorText` dropped → red; the line never rendered → red; the reason dropped → red; the bracket diagnosis dropped → red. Browser (work-bar calculator, 1366 and 390): `2+3)`, `2+3=5`, `1/0` each show and announce their sentence. `calculatorKeyboard` passes. |

### Found while proving TOOL-8, then fixed: typing after Clear (integrator's request)

- **Seen on `e822504`** (work-bar calculator, 1366×768): the field shows "0" when it opens and after Clear. The keypad
  replaced it, but a key typed on a keyboard landed after it. Opening and typing `7` gave `07` (harmless). After Clear,
  typing `(2+3` and Enter gave `0(2+3)` and "**equals 0**", a wrong number.
- **Changed:** `calculatorKeys.js` `typedKeyReplacesPlaceholder` decides when a printable key (no Ctrl/Meta/Alt, not
  composing) replaces the placeholder: the panel's own "0" (tracked by `placeholderShownRef`, set when the panel writes
  "0", cleared on any input, so a 0 the student typed stays: `0.5`), or "Error". `CalculatorPanel.jsx` checks it in a
  capture keydown listener registered before the typed-fraction step. That is the same rule the keypad applies in
  `insertCalculatorCommand`. Results, Enter, Backspace and shortcuts are unchanged.
- **Proof:** `calculatorErrorReasons` (the rule and its wiring). Mutations: listener removed → red; any "0" replaced →
  red; the panel's "0" not marked → red. `calculatorKeyboard` (browser, both sizes) now presses Clear, types `(2+3`,
  Enter, and requires "equals 5". It also checks that the TOOL-8 reason is shown and said. That driver passes on this
  branch and **fails on `e822504`** at "typing after Clear replaces the 0". `test:platform` calculator files 86/86,
  lint 0, build and build:firebase 0.
- W5-7's `claude/pass3-calculator-setting` was not on origin when this was done (fetch: no such ref). The change is
  limited to the keydown path and `setCalculatorValue`.

## Item 5: survey of other generic refusals (nothing fixed)

These are tools or surfaces where the student gets a generic line while the grader already knows something more
specific. Every one is already behind the outcome-feedback gate. In every registry tool "Focus on: <part>" already
names the failing part, so this list covers only what the grader knows **below part level**, or tool wording that
contradicts the grader. Spot-checked by reading the code (rows 1–3 re-read for this handoff).

| # | Tool / surface | Student sees | Grader knows |
| --- | --- | --- | --- |
| 1 | Composed workflows (WorkflowRunner) | Red/green steps and "The red steps above … need revision" (`QuestionEngine.jsx` ~2572; `WorkflowRunner.jsx` ~1433, ~1502). "Focus on" is off for composed questions. | Every stage has a `detail` (`toolMath/workflow/workflowGrading.mjs`: "Check the … quantity.", axis unit/scale, "N of M values do not match.", "This graph does not have one", stray-point count, "N value(s) do not follow the function you wrote."). No `part.detail` is rendered anywhere in `src/`. **Strongest gap.** |
| 2 | Representation Bridge (linear) | "Some representations need another look" and `Recheck: generalForm.` (a raw id) (`RepresentationBridge.jsx` ~639, ~652) | `representationBridgeMath.mjs` ~358/~370 evidence `{ mCorrect, bCorrect, structural, equivalent }`: right line in the wrong form, which of m/b is wrong, duplicate intervals, a wrong conclusion. The grader drops `evidence` on purpose. |
| 3 | Regression Calculator | "Regression setup is incomplete or invalid." / "A correlation value has not been produced." (`RegressionCalculator.jsx` ~370–381) | `regressionCalculator.mjs` ~113–140: ran vs. ran on an old table; r was produced but is stale or wrong. "Not produced" also shows when r **was** produced, so the message is false. |
| 4 | Representation Match (findMismatch with a correction) | "That card is actually consistent with the others…" (`RepresentationMatch.jsx` ~513) | `representationMatch.mjs` ~181–185: the card is right and only the correction is wrong (score 0.6). The message contradicts the grader. |
| 5 | Data Modeling Lab | "Still to fix: the requested prediction / the association description / the fitted function" (`DataModelingLab.jsx` ~558) | `dataModelingLab.mjs`: prediction value vs. interpolation/extrapolation label (~243); direction/strength vs. causation (~202); slope vs. intercept (~136). Each is folded into one boolean. |
| 6 | Ordinary fraction question | "Focus on: Fraction answer." | `ordinaryResponseGrading.mjs` ~155: right value, not in lowest terms. `genericMissChecks` says so only after the item closes (QA M1 policy: open items get no move-naming message). It is R-3's fraction twin and needs an owner decision against M1. |
| 7 | Matrix Lab (W5-3 scope) | "Not yet — see what to reconsider" / "Reconsider: <label>" (`matrixLabUi.jsx` ~187–192) | `matrixLab.mjs` ~73–114: dimensions vs. elements; a rows/cols swap. |

Checked and nothing to add: these already use their part results (Interval Number Line, Relation Mapping,
Graphing 2, Function Investigation 2, Inverse Composition, Sign Solution, Systems 2×2 / linear-quadratic / matrix /
inequality, Expression Meaning, Linear Table Workbench, LMR board, Transformations pointMap, Step Algebra 2). Function
Operations, Complex Plane, Polynomial Workshop, Exponential/Log Bridge, Sequence Explorer, Parabola Geometry, Open Sort
and Graph Scenario Match have only per-part booleans. Function Operations' "Some parts are correct…" also shows when no
part is correct, which is a wording issue.

## Gate after the review round (on `9eb0c62` + this doc; base for comparisons `e822504`)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,610 / 11,610 |
| `node --test tests/tools/*.test.mjs` | 1,678 tests: 1,677 pass, 1 skipped (shallow-clone provenance), 0 fail |
| `npm run lint` / `build` / `build:firebase` | 0 / 0 / 0; no tracked file rewritten |
| first-load budget | studentHome 1049.1 KB (unchanged by the review round; the base is 1048.6 KB, both over the 1023.4 KB baseline) |
| sweep `--check-wrong` vs `e822504` | 251,811 gradings, 0 / 0 / 0 |
| emulators | grade-authority 14/14, canonical-persistence 35/35; authoring-v5 686/686 |
| browser | `graphPointCheck` (with the new self-check block), `relationPlotGrading`, `graphKeyboardRoute`, `composedOutcomePolicy`, `composedDraftRestore`, `stagedQuestion` pass; the rest of the list below is re-run and reported to the integrator |

## Gate, first round (run on `5c6e6fc` + this doc; the base for comparisons is `e822504`)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,606 tests, 11,606 pass |
| `node --test tests/tools/*.test.mjs` | 1,676 tests: 1,675 pass, 1 skipped (a provenance check that needs merge-base history; this clone is shallow), 0 fail |
| `npm run lint` | exit 0 (warnings only, all in files this branch does not touch) |
| `npm run build` / `npm run build:firebase` | both exit 0; no tracked file rewritten (`git status` clean) |
| `node scripts/check-first-load-budget.mjs` | **studentHome 1049.1 KB gzip, 25.7 KB over the 1023.4 KB baseline: fails. The base `e822504` is already 1048.6 KB (25.2 KB over, same check).** This branch adds 0.5 KB (the line-form reader inside the classifier the miss box already loads). `first-load-baseline.json` not edited. |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run test:grade-authority` (emulator) | 14 / 14 |
| `npm run test:canonical-persistence` (emulator; submission ingestion and evidence events) | 35 / 35 |
| `npm run test:rules` (emulator) | 218 / 218 |
| `node scripts/sweep-equivalence-verdicts.mjs --base <e822504 worktree> --check-wrong` | 9,330 fields, 251,811 gradings: **rightToWrong 0, wrongToRight 0, nearMissNowRight 0** |
| Browser (Vite on 5199, one at a time; Playwright 1.56.1 `--no-save`, matching the image's Chromium 1194): `graphPointCheck`, `relationPlotGrading`, `graphKeyboardRoute`, `composedOutcomePolicy`, `composedDraftRestore`, `stagedQuestion`, `toolPolicyGates`, `toolAttemptOutcome` | all pass |
| `assessmentLeakGates`, `feedbackTeaches`, `afterLastMiss`, `calculatorKeyboard`, `readAloudTranslate` | all pass |
| `captureToolResponses.mjs transformationsLab --debug` | not supported: the driver has no Transformations Lab capture ("Wrote 0 fresh captures."), so the lab was checked by hand below |

### Checked in the browser by hand (1366×768/900 and 390×844, scratch probes, nothing committed)

- **Transformations Lab**, real QuestionEngine, L2 CW 1's question. Practice, reversed plot: recorded `partialCreditPercent: 20` (unchanged), shows "You found every point. Match each image …". Practice, up 3: 0%, shows "Your points are on the right line …". DOL, up 3: recorded 0%, and neither message nor the old sentence is on screen.
- **Graph check** (`graphPointCheck` harness): practice shows one "Check Point Placements". A wrong x = 2 point gives "Revise: Plot the point where x = 2." plus "(2, 4) — too low — find f(2) and compare" at 16 px, with the cost note before it. DOL shows no check, no report and no note. Same at 390 px.
- **Calculator** (work-bar calculator): `2+3)` gives "A “)” has no “(” to match it."; `2+3=5` gives "It could not read “=”. …"; `1/0` gives "That has no number answer. Check for dividing by 0.". Each is shown under "Error" and said in the result region, at both sizes.

## Deploy targets

- **Hosting**: every student-facing change (miss message, Transformations Lab, graph check, calculator, Spanish).
- **Functions**: the classifier and registry are server code (`functions/shared/misconception*.mjs`,
  `linearEquationForm.mjs`; `transformationsMath.mjs` gains a pure export the grader does not call). The release
  planner's classification of this diff (`classifyChangedFiles`, read only) is `functions`, `functions:path-admin` and
  `hosting`. Without the functions deploy the device still shows the message, but the server does not record the
  code in evidence events (so case review and Recovery targeting do not see it). No grade differs either way.
- **Rules / indexes**: none.

## Decisions for the owner

1. **A line that was not asked for in a form.** When the label names no form, the key's form is required today (side-by-side
   comparison) and the student is now told which form. Should such a field accept any equation of the same line?
   That would be a verdict change: it belongs in the equivalence layer, with a sweep, and is not made here. Related
   grader strictness the reviewer found (pre-existing, unchanged, no reason given): with "point-slope form" asked,
   `y-6=4(x-2)` (the same line through another point) is graded wrong; with "standard form" asked, `-2x-3y=-6` is
   graded wrong.
2. **Transformations Lab partial credit for a reordered plot.** It is still 20% for five right images in reverse. The
   feedback now explains why. Whether order-only misses should earn more is a grading decision.
3. **The graph self-check is an opt-in** (review B1): "Check Point Placements" stays free; "Which way is each point off?" is charged on its own press. (A first version merged the two and charged a miss automatically; that was withdrawn.) The
   question left for the owner is only whether two controls, one after a miss, is the right shape.
4. **Survey rows 1–4** look like the next fixes (they show the student nothing, or something false). Row 6 needs a
   decision against the QA M1 "say nothing that names the move while the item is open" rule.
5. **Spanish review**: three new templates in `esSupport.js` ("La recta es correcta, pero la forma no: escríbela
   como …"), for the same native-speaker review as the rest of the pack. The Transformations Lab sentences, the graph
   check and the calculator are tool chrome. Like every tool's own coaching (H-114) they show "No Spanish translation
   for this text yet."

## Touched outside the listed scope

- `src/platform/language/packs/esSupport.js`: three entries (needed for any new miss message).
- `tests/platform/misconceptionEvidencePhase2.test.mjs`: the registry count 23 now includes the three pass-3 codes,
  each asserted at version 1 (a frozen shape, per the playbook).
- `tests/platform/learnFromTheMistakeHints.test.mjs`: region marker for the graph check now that the standalone button
  is in the withheld branch, plus the merged cost note.
- `src/components/CalculatorPanel.jsx`, `calculatorKeys.js`, `calculatorExpression.js`: W5-7 (calculator setting)
  works near these. The changes are local to the error path and the panel's display.
- `src/tools/transformations/TransformationsLab.jsx`: wave 4's Submit-text and Work View branches also edit this file.
  Test merges of `claude/pass3-b5-submit-and-finish` and `claude/pass3-b6-work-view-help` into this branch have no
  conflict in it (b6's conflicts in `RegressionCalculator.jsx` and `toolPolicyGates.mjs` are with the base, not with
  this branch).

## Not done

- Survey rows 1–7 (item 5 is survey only).
- No form-aware reason for `equationInput` stages in composed workflows (`acceptEquivalentFunctionRule` already
  accepts any form there unless a form is asked for). Their stage `detail` is survey row 1.
- The first-load budget fails on the base and on this branch (above). The fix belongs to W5-1.
