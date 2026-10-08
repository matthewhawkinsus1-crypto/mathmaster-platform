# Student push — Job A: feedback that teaches

Branch `claude/student-push-a-feedback` (draft PR #462). Product decisions 1 and 3 from the student push:
misconception feedback that is never revealing, and a worked solution for every question once it is closed. The
classroom QuestionEngine now follows the same ladder My Math Path and Test Corrections use: specific feedback on a
miss, a hint offered on the second miss, and a worked review once the question closes.

## What shipped

| Commit | What it does |
| --- | --- |
| 2f7211d | Shared foundations: a student-safe message for each of the 23 registry codes (`functions/shared/misconceptionStudentMessages.mjs`); generic miss checks (sign flipped, coordinates swapped, reciprocal, right value not simplified); a display-only diagnosis built on the pure classifiers; one worked-solution model; the hint ladder and "Try a similar one" with leak guards; a per-tool builder seam (`src/tools/shared/reviews/`) and per-family modules (`src/platform/supports/families/`). The `misconceptionCodes.mjs` clause now says what the student is shown may differ, but only as display. |
| 1fc5d56 | QuestionEngine and App wiring. Specific miss messages behind one gate, `feedbackOpenForItem`. A platform Hint control on every question type, in the work bar and the Work View Help drawer. A worked solution on every closed question, plus "See why it works" after a correct answer. Read aloud and Translate on feedback, hints, examples and reviews. The "Let's back up" step is now specific to the question and recorded as `backUpStepUsed`, not as help. A partial-credit breakdown. "Ask my teacher" sends a signal through the presence heartbeat. Firestore rules and emulator cases. |
| df900ae | The V5 compiler keeps authored `hints` / `hint`. They used to be dropped for every type except the two board tools. |
| bfa4d05 | Playwright journey for the ladder at 1366×768 and 390×844. On a phone, Submit loses its second word so the work bar stays on one row; its accessible name keeps the full label. |
| ed03217 | `docs/architecture/MISCONCEPTION_EVIDENCE.md`: what the student sees. |
| 321b42d | Assessment leak gates: the `feedback-ladder` surface (see Verification). |
| f79b853, 2131224, 30fe3cc | Worked-solution builders for all 17 registry tools that had none, with their capability flags. |
| 30fe3cc, 7142e91, 57b97bc, 3384630, 10c807a | Question families: linearEquations, systems, linesAndSlope, fractions, pointsAndIntervals, functionFeatures, inverseComposition. Each gives hints built from the problem's own numbers, a worked sibling problem, and a question-specific back-up check. |
| 217d9be | Systems Workspace. A 2×2 back-substitution must end on the student's computed value: `y = −4(5) + 12` is no longer accepted as solved. A multi-term value substituted for an added variable keeps its visible group, written `1(…)` like the existing `−1(…)` rule. |
| d4e427c | Calculator: the exact fraction beside the decimal (`Exact: 1/2`). |

All 17 builders are implemented and flagged: dataModelingLab, regressionCalculator, inverseCompositionLab,
functionOperationsLab, systemsWorkspace, parabolaGeometryLab, polynomialWorkshop, signSolutionAnalyzer,
complexPlaneLab, exponentialLogBridge, transformationsLab, graphing2, stepAlgebra2, intervalNumberLine,
linearTableWorkbench, expressionMeaning and representationBridge. Each returns `null` for a mode or shape it cannot
explain correctly, and the panel then says plainly that no worked solution is available. Most builders grade their own
stated answer with the tool's shared grader before returning it.

## The safety rules, and where they live

- **Nothing beyond right/wrong while an assessment item can be answered.** `feedbackOpenForItem` in
  `src/platform/supports/feedback/attemptFeedbackPlan.js` requires outcome feedback to be open and the host not to be
  server-graded. On anything other than immediate-feedback practice it also requires the item to be closed. The outcome
  box is additionally gated on `showOutcomeFeedback`, so there are two layers.
- **Grading is unchanged.** The miss message is computed after the attempt was handed to the recorder, from a copy of
  the grader's result held in state the recorder never reads (`gradedForDisplay`). The registry-tool forwarder region
  still contains no diagnosis (`misconceptionCodePassThrough.test.mjs`). The recorded evidence is still only the
  server's classification at ingestion.
- **A hint is never a smaller answer.** `buildQuestionHints` drops any hint, authored or generated, that
  `hintRevealsAnswer` finds containing one of the question's answers. `similarExampleIsSafe` rejects a sibling problem
  with the same answer or prompt, or with a step that names this question's answer.
- **Help is recorded.** Revealing a hint sets `hintUsed`; opening a worked sibling sets `workedExampleUsed` (the first
  thing to set it). Both make the attempt dependent. The back-up step is recorded but does not.
- **Hints and help are withheld on DOL, quiz and test** (`hintsAllowed: false`), on a server-graded host (Path, Test
  Cycle, Live Challenge) and on a closed question.

## Verification

- Node: `tests/platform/feedbackThatTeaches.test.mjs` (17 tests). Every key rule was mutation-checked: gate, leak
  guard, release rule, back-up record, the "review below" wording, the classifier path and the compiler copy. Also 17
  `tests/tools/*SolutionReview.test.mjs`, 7 `tests/platform/supportFamily_*.test.mjs`,
  `systemsBackSubstitutionSimplified`, `systemsSubstitutionParentheses` and `calculatorExactFractions`. All new
  defect tests fail on the old code.
- Rules: `npm run test:rules` passes 154 of 154, including a new "Ask my teacher" case. It was mutation-checked by
  removing the constraint.
- Browser (Chromium, real QuestionEngine):
  - `tests/browser/feedbackTeaches.mjs` at 1366×768 and 390×844 covers the Hint control and its release rule, a
    sign-flip message, the server classifier's message on a Question Family instance, the hint offer, the worked
    solution on close, "See why it works", Ask my teacher, hint use recorded with the attempt, Translate on a hint, and
    a DOL showing nothing.
  - `tests/browser/assessmentLeakGates.mjs feedback-ladder` (27 checks) uses a plain key, a family instance and a
    registry tool under DOL and test. None of the ladder's text may appear anywhere in the document (visible text,
    aria-labels, live regions or hidden nodes) before or after Submit. Letting the Hint control ignore the help policy
    turns 16 checks red.
  - The existing `toolAttemptOutcome`, `assessmentLeakGates`, `algebraicSubstitutionHandoff`, `algebraicSystems3x3`
    and `day1SystemsJourney` suites pass. `toolAttemptOutcome` failed once on its literal-question case under load and
    passed on re-run; its timing may need hardening.
- CI on draft PR #462: all 26 checks green on 10c807a. That includes full-platform (test:platform, tests/tools,
  rules, lint, build, build:firebase), student-teacher-journeys, student-runtime-browser-gates, interactive capability
  certification on 7 devices, work-view-matrix, path-tool-browser-contract, question-family-cases-browser and
  answer-acceptance. The last two commits (217d9be, d4e427c) were checked locally as above; CI runs on push.

### What was not verified

- **Independent adversarial verification did not run.** It was planned for every builder and family: answer leaks,
  grading untouched, and the mathematics recomputed. The account's usage limit stopped all 29 verifier agents.
  Commit messages 57b97bc and 10c807a say "fixes from independent verification"; that is wrong. Those were the
  implementers' own later revisions. What stands in place of the independent check:
  - each builder's own tests grade its stated answer with the shared grader;
  - the runtime leak guards described above;
  - the leak-gates surface;
  - CI.
  An independent mathematics review of the sibling problems and builder steps is the main open risk.
- Three families are not implemented: transformations, quadraticsAbsoluteValue and dataAndModels. Their implementer
  agents also hit the usage limit. Those items get the authored hints and then the generic hint, but no sibling
  problem and no specific back-up question. The stubs are in `src/platform/supports/families/`.

## Calls I made (conservative, recorded here)

- **When the review shows.** It shows when the question is closed by a correct answer or by running out of attempts,
  and outcome feedback is open. It does not show when the section is merely locked, because Recovery may still ask the
  item. After a correct answer it sits collapsed under "See why it works".
- **Hint release.** The first hint is available on request. Each further hint needs one more attempt on record
  (Path's rule). From the second miss the outcome box offers a hint; it never auto-reveals one.
- **The back-up step.** Recorded as a new `supportUsage.backUpStepUsed` field (`functions/shared/attemptPolicy.mjs`),
  not as `scaffoldUsed`, so it no longer makes the attempt dependent. Where the family has nothing specific, the
  platform's fallback question for Step Algebra is one that is true of every equation.
- **Ask my teacher.** It rides the presence heartbeat as `helpRequestedAt` / `helpQuestionIndex`. A separate write
  would be erased by the next 20-second beat. It is offered wherever the host passes `onAskTeacher`, which is student
  assignment work (not preview and not post-due practice), and that includes a DOL. On a DOL it is a raised hand, not
  math help, and it is not recorded as help. Only the student can clear it; the teacher monitor has no clear action.
- **The `1(…)` notation.** Used for a substituted group after `+`, mirroring the existing `−1(…)` rule. Removing the
  group is the student's step.
- **Generic miss messages** are display text only, never registry codes.

## Files outside lane A (each a small, local edit)

- `src/App.jsx`: the Ask-my-teacher state, the presence payload field, an immediate publish after the stale document
  is deleted, and two QuestionEngine props. The import is asserted next to its use in `feedbackThatTeaches.test.mjs`.
- `firestore.rules`: `presenceHelpRequestValid` on `presence/{studentId}` (an int time and position only; no text).
- `functions/shared/attemptPolicy.mjs`: `backUpStepUsed` kept in the three supportUsage normalizers. It is not part of
  `isMathematicallyIndependent`.
- `src/platform/contract/authoringIntentV5Core.js`: `hints` and `hint` added to `copyCommon`.
- `src/problemGenerator.js`: exports `parseFamilyGenerationKey`.
- `src/tools/toolCapabilities.js`: `supportsSolutionReview: true` for the 17 tools.
- Tests whose source-text assertions moved, each rewritten against the behaviour it protects:
  - `closedQuestionReview`, `studentExperiencePass2`, `solverWorkspaceModes`;
  - `toolSupportMatrix` (now reads the builder list);
  - `systemsWorkspace3x3Mode`, `calculatorPanelWiringV3`;
  - `tests/rules/securityRules.test.mjs` (new case).
- `src/tools/systemsWorkspace/AlgebraicSystemMode.jsx` and `functions/shared/toolMath/systemsWorkspace/algebraicSystemsEngine.mjs`:
  the two defect fixes the brief assigned to A.

Not touched, though related: `src/components/student/PathSolutionReview.jsx` (Job D) and
`src/components/question/RichQuestionRuntime.jsx` (Job B). The classroom renderers are consolidated into
`src/SolutionReviewPanel.jsx`; `ToolSolutionReview.jsx` now delegates to it; `SolutionReview2` uses it for an authored
review. Path and secure runtimes can switch to `SolutionReviewPanel` later. It accepts the same authored shape.

## Deploy targets

1. **Hosting**, through the resilient wrapper: almost everything here is client code.
2. **`firestore:rules`**: the presence help fields are validated. The student client sends them, so deploy the rules
   with or before Hosting.
3. **Functions (recommended, not required).** `functions/shared/attemptPolicy.mjs` (keeps `backUpStepUsed`) and
   `algebraicSystemsEngine.mjs` (the `1(…)` text) are server code. Until they are deployed, server ingestion drops
   `backUpStepUsed` from the stored record. Nothing breaks and no grade changes. The systems reducer compares by
   linear form, so old and new substitution text grade the same. Let `node scripts/release-firebase.mjs` (plan only)
   list the exact functions that bundle these modules. Expect at least `ingestStudentSubmissions`,
   `sweepStudentResponseCheckpoints` and `expediteCheckpointsOnSectionClose`, plus `platformBuildInfo` as the release
   process does. I did not run the planner here: it reads the live build and was blocked as deploy-adjacent.
4. No new indexes, no new collection and no migration.

## Findings for other owners (not fixed here)

- **Compiler: graphing2 standard form.** `compileAuthoringIntentV5` overwrites graphing2 standard-form
  `standard: {A, B, C}` with the curriculum standard string (e.g. `'A.3C'`) when the V5 question has a `standard`
  field. The tool then shows "undefinedx + undefinedy" and can never be marked correct.
- **Compiler: exponential/log functions.** An exponentialLogBridge `function` with no `type` becomes `{ type:
  'linear', a, k }` and drops `h` and base, so the grader marks a different function from the prompt.
- **inverseCompositionLab.** A question-level `inverseBranch` (where the V5 compiler puts it) is not read by the
  grader, which reads only `f.inverseBranch` / `f.domain`. On a one-branch parabola, the grader also accepts x as
  f⁻¹(f(x)) when x is on the other side of the vertex.
- **functionOperationsLab.** For (x²−1)/(x²+x), the grader accepts only the unreduced fraction; the reduced
  (x−1)/x is marked wrong.
- **transformationsLab identify/describe.** The grader marks the question's own a, b, h, k even when the graph does
  not determine them (for example, an exponential whose shift can be read two ways).
- **District DOL1 sequenceExplorer items.** They author `commonDifference` / `commonRatio`, which the tool does not
  read, and `analyze` mode grades term 8 while the prompt asks for terms 2, 3 and 5.
- **Hint style.** The most specific rung names the move with the problem's numbers ("subtract 6 from both sides").
  It never states a result. If a stricter reading of "never narrow the answer" is wanted, drop the last rung per family.

## Wave 2

Recovery practice targeted by a student's recurring trusted misconception codes (noted in MISCONCEPTION_EVIDENCE.md's
backlog).
