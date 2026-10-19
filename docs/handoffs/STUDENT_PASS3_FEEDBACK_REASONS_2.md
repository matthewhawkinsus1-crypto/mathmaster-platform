# Student pass 3 — wave 7, session W7-4: feedback reasons 2

Branch `claude/pass3-feedback-reasons-2`, from `claude/modest-pasteur-xzagn7` at `530ac3cf`. Scope: item 1 (STUDENT_WORDS
review B2's layout note), item 2 (TOOL-5; FEEDBACK_REASONS survey rows 2–4), item 3 (survey row 1), item 4
(SUBMIT_AND_FINISH "Not done"), item 5 (survey row 5). Nothing here was deployed or written to Firebase. No verdict, score or
recorded part changes: every new sentence is chosen from what the shared grader already returns, and the two shared
graders touched (composed workflow, Data Modeling) answer the server exactly as before (proved below).

Every new reason appears only where the item's outcome feedback is shown. On an exit ticket, quiz or test before release it
is withheld through the platform's existing gates (a tool's `feedback` is null unless `showImmediateFeedback`,
useToolSubmission; a composed question's review reaches WorkflowRunner only when `showOutcomeFeedback`), and the browser
proves it per message (`feedbackReasons2`, `composedOutcomePolicy`).

## Each item: what a student saw (confirmed on `530ac3cf`) → what changed → proof

### Item 1 — the outcome box and the action bar (review B2): did not reproduce as stated; a guard was added

- **Checked on the base** (scratch probe on the toolAttemptOutcome harness, real QuestionEngine + App wrappers, two misses so
  the box holds the coaching, Read, the hint sentence and both offers; Inverse & Composition, Function Investigation,
  Regression; 390×844 and 360×640; inline and Work View; the box lengthened by up to 20 extra lines). After the box's own
  `scrollIntoView({ block: 'nearest' })` its end sits 4–12 px above the bar (the "4 px" of the note). But the work area
  **does** scroll further: with every scroller at its end the box ends **21–34 px above the work bar inline and 8–17 px
  above the Work View rail**, at both sizes, however long the box is; scrolled to its start its first line is on screen and
  uncovered (below the tries strip). So "the phone work area cannot scroll it clear" does not hold on the base, and no
  layout change was made.
- **Added** `tests/browser/toolOutcomeReach.mjs` (84 checks), so it stays true: 3 tools × 2 sizes × inline/Work View × the
  box as given, lengthened by the longest English sentence of this wave's tool messages (×3) and by the longest Spanish
  sentence of the support pack (`lang="es"`, ×3): scrolled to the end, the whole box is above the bar and on screen;
  scrolled to its start, the first line is on screen and not under anything. The "same answer again" note is removed
  first, so the worst case (nothing below the tool) is measured. **Mutation:** a work area that runs 120 px under the bar
  (`margin-bottom: -120px` on `.math-tool-workspace`) → 18 FAIL. Screenshots: `tests/browser/artifacts/toolOutcomeReach/`.

### Item 2 — tool messages that were false or raw (TOOL-5)

Each tool's sentence is now chosen by a small pure module from the shared grader's own parts.

| Tool | Saw on the base | Now | Proof |
| --- | --- | --- | --- |
| Regression Calculator | "A correlation value has not been produced." for any miss of that stage, including an r on screen from an earlier table; "Regression setup is incomplete or invalid." for both "never run" and "run on another table" | `regressionFeedback.js`, by each stage's `isComplete`: short table ("…does not have every data point yet. Make a table (+, then table)…"), wrong row, no regression run yet, regression run on a different table, no r, an r that is not this table's regression, a blank or wrong interpretation | `regressionCalculatorSharedGrading` "the feedback sentence says what the grader found" (every sentence through the real grader; never "not produced" when r is shown); mutations: the r-stale branch, the run-stale branch, the component's sentence → red |
| Function Operations | "Some parts are correct. Review the operation panels…" after every miss, also when none was | `functionOperationsFeedback.js`: "No part is correct yet. Review each operation panel." / "Correct so far: (f + g)(x), … Review the other part(s)." / "Still blank: …". The parts to change are the outcome's "Focus on" line, not repeated | `feedbackReasons2` (tools) through the real grader; mutations ×3 → red |
| Representation Bridge | "Recheck: generalForm." (the grader's id) | `bridgeFeedback.js`: each stage by its panel's name and what to recheck ("Equations, y = a(x − c): recheck a, c and the equation you wrote."; "Graph: recheck your two points: one must be the x-intercept, and both must be on the line."); a blank stage says what it lacks ("Graph: plot two points.") | `feedbackReasons2` (tools): every stage on a blank board, no id ever; mutations ×3 → red |
| Representation Match (find the mismatch) | "That card is actually consistent with the others…" also when the card was right and only the correction wrong (the grader's 0.6) | `linearMismatchFeedback.js`: wrong card → that line; right card, correction blank → "…Now choose what that card should say instead."; right card, wrong correction → "You found the card that does not match, but your correction does not fix it…" | `feedbackReasons2` (tools) through the real grader at score 0 and 0.6; mutations ×2 → red |

Browser (`feedbackReasons2.mjs`, 390×844, real QuestionEngine): each message is on screen in practice and photographed
(`tests/browser/artifacts/feedbackReasons2/{regression,functionOperations,match,bridge}.png`); on an exit ticket the same work
is submitted and none of them is shown.

### Item 3 — a composed question says why a step is red (survey row 1)

- **Saw:** red steps and "The red steps above are the specific responses that need revision." Every stage has a grader
  `detail` ("Check the y-axis unit.", "2 of 5 values do not match.", "The arrows do not match the relation — check which
  value each one is joined to."), dropped by `gradedResult` from the part record.
- **Changed:** `composedWorkflow.mjs` — the **browser's** Check (`gradeComposedWorkflowCheck`) asks for `stageReasons`, the
  failed stages' details keyed by stage id (`failedStageReasons`: graded, wrong, not a generic "Not correct yet." /
  "Not answered." / "Reviewed by your teacher."). The server's grade (the default export, `gradeServerResponse`) never asks,
  so what ingestion grades and records is byte-for-byte unchanged, and no part carries a reason. `workflowAnswerState`
  carries them beside `parts` (never in them: parts are what `onGrade` records); QuestionEngine's submission review keeps
  them; `buildWorkflowReviewState` gives a red step its reason (not a changed, right or unchecked step); WorkflowRunner draws
  it under that step's prompt (`data-stage-reason`). The outcome box adds "Each one says what to check." (or "Where it can,
  …") when the steps do (`composedReasonsNote`).
- **Withheld on an exit ticket, quiz or test:** the review reaches the runner only through
  `submissionReview={showOutcomeFeedback ? workflowSubmissionReview : null}`, so there is no review, no red step and no
  reason. `composedOutcomePolicy` (browser, new block): practice shows both reasons inside their red steps and the note; DOL,
  quiz and test submit the same wrong work (`__mmGraded`) and show no reason, no red step, no outcome. Unit:
  `composedStageReasons` (6 tests; mutations ×8 — reasons asked by the server, not asked by the browser, generic filter off,
  review reason for a right step, answer-state reasons dropped, the render gate, the engine's review field, the note → red).
  A browser mutation of the gate (review passed on a DOL) stays green because a second barrier holds: the withheld work's
  response key carries `outcomesWithheld`, so no step matches the review and every step reads "draft". The unit contract on
  the gate goes red under the same mutation.
- Screenshot: `artifacts/feedbackReasons2/composed.png`.

### Item 4 — words that match the button (D9)

- **New:** `useSubmitActionName(ownName)` (ToolRuntimeContext): what a sentence calls the final button, with the same three
  cases as `useSubmitLabel` — the host's label ("Record answer"), "Submit" where the press spends a try, the tool's own word
  elsewhere (a composed stage, the tools lab).
- **Matrix Lab** (`MatrixLab.jsx` ~97): "…or press Check again to check it as it is." beside a Submit button →
  `UNTOUCHED_START` is a function of the button's name, worded by `CheckRow`: "…Change what needs fixing, or press Submit
  again if it is right as it is." Only the constant and one render line in `matrixLabUi.jsx` changed (W7-2 edits the radio
  groups). Proof: `matrixLabFeedback` (tools) + mutations ×3; the browser driver now requires the prompt to name the
  button's own first word. **Found by that driver and fixed:** with the prompt a function, `setConfirmed(confirm)` ran it as
  a React state updater, so the prompt never showed and the first press spent a try (driver: "the first press asks" FAIL,
  "a press after the prompt has settled checks: one try" FAIL). `setConfirmed(() => confirm)` stores it; the unit contract
  pins that form, and the driver passes.
- **Sign Solution Analyzer review** (~270, ~420): a closed question's worked solution said "select no interval and press
  Check." → "…so the answer is no interval: leave every interval unselected." (and the candidate twin). The review names no
  button. `signSolutionAnalyzerSolutionReview` + mutation.
- **Relation solver** (`MultiRelationAlgebraCore.jsx` ~2821): "press Check again" is now the number line's button as it
  reads (`useSubmitActionName('Check')`, the same default its button uses) — "Check" in practice, a secure host's
  "Record answer" there. `toolWordsMatchButton` + mutation.
- **Rewrite Linear Form** (~264): the finishing step said "submit it" also where the button reads "Check equation" (a
  composed stage, the tools lab) → "press <the button's name>". Rendered in `toolDirectionsSplit` under three runtimes
  (Submit, Record answer, Check equation) + mutation. In a student's QuestionEngine a stored `stepAlgebra2` rewrite opens the
  Step Algebra engine (assignment runtime repair), so this text is reached in the tools lab and composed hosts.
- **Transformations Lab** (the fifth text in SUBMIT_AND_FINISH's list, not in this session's list but the same defect):
  "Press Check when the two graphs overlap." / "…, then check." → "press <the button's name>" (Submit on an activity).
  Rendered in `toolDirectionsSplit` + mutation; on screen in `feedbackReasons2` (`transformations.png`).
- **Systems workspace** (`AlgebraicSystemMode.jsx` ~1685): "…from that token form." → "…from that form of the expression.
  …Choose Change expression and write it another equivalent way, or go back to the expression you first isolated."
  `toolWordsMatchButton` + mutation. Not triggered in a browser (it needs a parse failure the substitution handoff no longer
  produces); no screenshot.

### Item 5 — Data Modeling's "Still to fix" (survey row 5)

- **Saw:** "Still to fix: the fitted function. Everything else is right." for a right slope with a wrong intercept (and the
  same folding for direction/strength vs causation, and prediction value vs interpolation/extrapolation).
- **Changed:** `dataModelingMissReasons(question, work)` (exported beside the grader, called only by the lab) runs the
  grade's own checks and, for a missed part with exactly one half right, names the half to change in place of the part's
  name: "the intercept b (your slope m is close enough)", "the causation choice (your direction and strength are right)",
  "the predicted value (your interpolation or extrapolation choice is right)", and their twins. Both halves wrong, or a box
  blank, keep the part's name. No phrase names a value. The phrases ride in the submit metadata as `missReasons`; the engine
  records only `parts` (`toolSubmissionParts`), so they never reach an attempt. The mode graders the server runs take two
  arguments and never return reasons.
- **Proof:** `feedbackReasons2` (tools): every phrase through the real grader; browser and server parts identical; no
  reason in either result; mutations ×4 → red. Browser: `dataModeling.png`; withheld on a DOL.

## Gate (on the branch head; base `530ac3cf`)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 12,119 / 12,119. (A first run had 20 more failures, all in suites that load `functions/` code — Classroom push, release planner, provenance — because `functions/node_modules` was not installed in this container; after `npm ci` in `functions/` those suites pass, 459/459, and the full rerun is clean.) |
| `node --test tests/tools/*.test.mjs` | 1,725 / 1,725, 0 skipped |
| `npm run lint` / `build` / `build:firebase` | 0 / 0 / 0; no tracked file rewritten |
| first load (`check-first-load-budget.mjs --report`) | **studentHome 839.5 KB, signIn 291.9 KB**. The base `530ac3cf` built in a worktree in this container reads 839.4 / 291.8, so this branch adds **0.1 KB** to each (the brief's 839.3 is the integrator's measurement). Within baseline; limit 847.3 KB; baseline not edited |
| emulators | `test:grade-authority` 14/14, `test:canonical-persistence` 35/35; `test:authoring-v5` 686/686 |
| browser (Vite 5199, one at a time, Playwright 1.56.1 / Chromium 1194) | all exit 0: `toolAttemptOutcome`, `composedOutcomePolicy` (with the new reasons block), `assessmentLeakGates`, `toolPolicyGates`, `feedbackTeaches`, `afterLastMiss`, `phoneToolPanelReach`, `workViewHelpReach`, `regressionCalculatorPhone`, `matrixLabFeedback` (failed once on the branch, which found the Matrix Lab bug in item 4; passes after the fix), `linearMultipleRepresentations`, `systemsWorkspaceStudio`, `readAloudTranslate`, `toolOutcomeReach` (new, 84 checks), `feedbackReasons2` (new, 33 checks); `captureToolResponses dataModelingLab --debug` and `regressionCalculator --debug` exit 0, fixture unchanged |

## Deploy targets

- **Hosting**: every change.
- **Functions**: the release planner's classifier (`classifyChangedFiles`, read only) says `functions`, `functions:path-admin`
  and `hosting`, because two files under `functions/shared/serverGrading/` changed (`questionGraders/composedWorkflow.mjs`,
  `tools/dataModelingLab.mjs`). Their server behaviour is unchanged (the reasons are asked for only by the browser; tests
  prove server results are identical), so a functions deploy changes nothing a student or teacher sees. Deploying it keeps
  the server's copy in step with the client's; skipping it is safe.
- **Rules / indexes**: none.

## Decisions for the owner

1. **Spanish.** The new sentences are tool chrome (a tool's own coaching), which stays English with the honest "No Spanish
   translation for this text yet." line (H-114, as in wave 5's FEEDBACK_REASONS decision 5). The composed stage reasons
   and the outcome-box note are not on a Read aloud or Translate path. No `esSupport.js` entry was added. If the owner wants
   tool coaching translated, these modules are the place to start: each holds its sentences in one frozen object.
2. **How much a reason may say.** Data Modeling now says which half of a part held ("your slope m is close enough"), and a
   composed step says which axis field or how many values are off. Both are outcome feedback, shown only where outcomes
   are; they narrow what a later try has to change. The same trade the owner accepted for figure sorts (P2-4).
3. **The relation solver's nested number line.** Inside a registry tool that sets a try cost (Systems Workspace's
   embedded inequality rewrite), the nested number line's own button would read "Submit — uses 1 of N tries" though its
   press only records the graph. Not changed here (not observed in a student host; outside this item); worth a look.

## Touched outside the listed scope

- `src/QuestionEngine.jsx` (W7-3 owns App.jsx, not this file): the review keeps `stageReasons`; the composed outcome line
  appends `composedReasonsNote`; one import.
- `src/tools/shared/ToolRuntimeContext.jsx`: `useSubmitActionName`.
- `src/tools/matrixLab/matrixLabUi.jsx` (W7-2 works in MatrixLab.jsx's radio groups): one render line and the hook call in
  `CheckRow`; in `MatrixLab.jsx` only the `UNTOUCHED_START` constant.
- `src/tools/representationMatch/RepresentationMatch.jsx` (W7-2): one message line and one import.
- `src/tools/transformations/TransformationsLab.jsx`: three step strings, a helper, the hook.
- Tests re-anchored per the playbook (behaviour asserted, then mutation-checked): `regressionCalculator202`,
  `regressionCalculatorSharedGrading`, `toolStudentWording`, `solverRuntimeOutcomePolicy`, `matrixLabFeedback` (tools),
  `signSolutionAnalyzerSolutionReview`, `toolDirectionsSplit`, `representationBridgeLinearSharedGrading`,
  `dataModelingLabSharedGrading`; `tests/browser/matrixLabFeedback.mjs` (the prompt names the button).
- New: `tests/tools/feedbackReasons2.test.mjs`, `tests/tools/composedStageReasons.test.mjs`,
  `tests/platform/toolWordsMatchButton.test.mjs`, `tests/browser/toolOutcomeReach.mjs`,
  `tests/browser/feedbackReasons2{.mjs,.html,Main.jsx}`.
- `esSupport.js`: not touched.

## Not done

- `toolOutcomeReach` and `feedbackReasons2` are not in a CI workflow (`.github/workflows` is W7-7's this wave). They belong
  beside `toolAttemptOutcome` in `student-runtime-browser-gates.yml`.
- No screenshot of the systems workspace's parse-failure message (not reachable from the harness) or of Rewrite Linear
  Form's step in a student host (see item 4); both are rendered or asserted in unit tests.
- `src/components/student/MyMathPathProductionContainer.jsx:379` still says "press Check again" after a submission error;
  it was not on this session's list and was not checked against its button.
- The mapping step in a composed question shows both its own coaching (from its stage Check) and, after Submit, the
  grader's reason under the step; they agree but overlap.
