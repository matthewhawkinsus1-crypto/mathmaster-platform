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
| 89cc82b | Codex review: the partial-credit breakdown follows `feedbackOpen`; a raised hand comes down when its question closes. |
| 6464ca5 | Coordinator review B1, m8: a worked solution on a DOL, quiz or test only after the assignment-level release; "closed" is the question closing, not a lock; an unknown role fails closed. |
| 1ef711c | Coordinator review B2, B3, M6c: help kept across a remount (`supportUseMemory.js`); a problem-specific back-up step and a miss message shown before the attempt count as help. |
| 8f425f2 | Coordinator review M6a, M6b: no generic message on a choice field; no move named while attempts are left. |
| ef18c7a | Coordinator review M4, M5, m7, m9: a hand comes down on lock; raised hands in the Room view and Walkthrough; presence key allowlist and help-time bound; the ask-only panel's copy. |
| bd3b82f | Coordinator review test gaps: a worked sibling with the same value written another way; an unknown role in the browser. |

All 17 builders are implemented and flagged: dataModelingLab, regressionCalculator, inverseCompositionLab,
functionOperationsLab, systemsWorkspace, parabolaGeometryLab, polynomialWorkshop, signSolutionAnalyzer,
complexPlaneLab, exponentialLogBridge, transformationsLab, graphing2, stepAlgebra2, intervalNumberLine,
linearTableWorkbench, expressionMeaning and representationBridge. Each returns `null` for a mode or shape it cannot
explain correctly, and the panel then says plainly that no worked solution is available. Most builders grade their own
stated answer with the tool's shared grader before returning it.

## The safety rules, and where they live

- **Nothing beyond right/wrong while an assessment item can be answered.** `feedbackOpenForItem` in
  `src/platform/supports/feedback/attemptFeedbackPlan.js` requires outcome feedback to be open and the host not to be
  server-graded. On anything other than immediate-feedback practice it also requires the QUESTION to be closed (correct
  or out of attempts, never a section lock) AND the teacher's assignment-level release (`assessmentReviewReleased`,
  fed from `assignmentFeedbackWasReleased` only). A DOL's per-item right/wrong release is not enough: "Grant one more
  DOL attempt" reopens the same item. An unknown activity role fails closed. The outcome box is additionally gated on
  `showOutcomeFeedback`, so there are two layers.
- **A miss message never hands over the answer.** While attempts are left a generic check is worded without the move
  that yields the answer (`GENERIC_MISS_MESSAGES_OPEN`); the named error only once the item has closed. A choice field
  gets no diagnosis at all (`partIsChoice`). The partial-credit breakdown follows `feedbackOpen` too.
- **Grading is unchanged.** The miss message is computed after the attempt was handed to the recorder, from a copy of
  the grader's result held in state the recorder never reads (`gradedForDisplay`). The registry-tool forwarder region
  still contains no diagnosis (`misconceptionCodePassThrough.test.mjs`). The recorded evidence is still only the
  server's classification at ingestion.
- **A hint is never a smaller answer.** `buildQuestionHints` drops any hint, authored or generated, that
  `hintRevealsAnswer` finds containing one of the question's answers. `similarExampleIsSafe` rejects a sibling problem
  with the same answer or prompt, or with a step that names this question's answer.
- **Help is recorded, and survives a remount.** A hint (`hintUsed`), a worked sibling (`workedExampleUsed`), a back-up
  step written for THIS problem (authored or family: `scaffoldUsed`) and a miss message shown before the attempt
  (`feedbackAssisted`) each make the attempt a supported one. Only the platform's generic back-up step is recorded
  (`backUpStepUsed`) without that. `src/platform/supports/supportUseMemory.js` keeps help per draft key and merges the
  record's last attempt, so leaving and returning cannot forget it.
- **Hints and help are withheld on DOL, quiz and test** (`hintsAllowed: false`), on a server-graded host (Path, Test
  Cycle, Live Challenge) and on a closed question.

## Verification

- Node: `tests/platform/feedbackThatTeaches.test.mjs` (24 tests). Every key rule was mutation-checked: gate, leak
  guard, release rule, back-up record, the "review below" wording, the classifier path and the compiler copy; and, for
  the coordinator review, the assignment-release gate, the remount restore, the back-up source rule, the
  feedback-assisted flag, the choice-field skip, the open wording, the lock effect, both teacher views and the
  numeric same-answer check. Also 17
  `tests/tools/*SolutionReview.test.mjs`, 7 `tests/platform/supportFamily_*.test.mjs`,
  `systemsBackSubstitutionSimplified`, `systemsSubstitutionParentheses` and `calculatorExactFractions`. All new
  defect tests fail on the old code.
- Rules: `npm run test:rules` passes 155 of 155, including the "Ask my teacher" case and a presence case built from a
  real `buildLiveStatus` heartbeat with each forged field. Mutation-checked: without the key allowlist, and without the
  time bound.
- `tests/browser/assessmentLeakGates.mjs` (run in CI) `feedback-ladder` surface, 50 checks: also a closed DOL / quiz /
  test item with per-item release on and assignment release off/on, the partial-credit breakdown, a hint recorded with
  the attempt (same page and after a remount), the feedback-assisted next attempt, an unknown role, and a locked
  question lowering its raised hand.
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

- **When the review shows.** In practice: when the question is closed by a correct answer or by running out of
  attempts. On a DOL, quiz or test: only after the teacher releases the assignment's feedback, and then only on a
  closed question. It does not show when the section is merely locked, because Recovery may still ask the item. After
  a correct answer it sits collapsed under "See why it works".
- **Hint release.** The first hint is available on request. Each further hint needs one more attempt on record
  (Path's rule). From the second miss the outcome box offers a hint; it never auto-reveals one.
- **The back-up step.** Every step is recorded as `supportUsage.backUpStepUsed`. An authored or family step names the
  problem's first move, so it is also `scaffoldUsed` and the attempt is supported (coordinator review B3). Only the
  platform's generic step, true of every problem of the type, leaves the attempt independent.
- **Ask my teacher.** It rides the presence heartbeat as `helpRequestedAt` / `helpQuestionIndex`. A separate write
  would be erased by the next 20-second beat. It is offered wherever the host passes `onAskTeacher`, which is student
  assignment work (not preview and not post-due practice), and that includes a DOL. On a DOL it is a raised hand, not
  math help, and it is not recorded as help. The hand belongs to the question it was raised on. It comes down when the
  student cancels, when that question closes, when it locks (DOL timer, closed section, Warm-Up window), when the
  assignment turns into post-due practice, or when the student leaves the assignment. The teacher sees it in the Room
  view (a red "Asked for help" tile, sorted first, counted in the header) and first in Walkthrough's Visit Next.
- **The `1(…)` notation.** Used for a substituted group after `+`, mirroring the existing `−1(…)` rule. Removing the
  group is the student's step.
- **Generic miss messages** are display text only, never registry codes.

Coordinator decisions (2026-10-08): keep "Ask my teacher" on DOLs, but never inside a secure Test or Test Cycle. That
is now pinned by `feedbackThatTeaches.test.mjs` test 6 and a secure-host case in `tests/browser/feedbackTeaches.mjs`:
the control needs a host callback and no server grading, and the secure path passes neither. Keep the last hint
rung. Show the worked solution on question close, not on section lock.

## Files outside lane A (each a small, local edit)

- `src/App.jsx`: the Ask-my-teacher state, the presence payload field, an immediate publish after the stale document
  is deleted, and two QuestionEngine props. The import is asserted next to its use in `feedbackThatTeaches.test.mjs`.
- `firestore.rules`: on `presence/{studentId}`, `presenceKeysKnown` (exactly the heartbeat's keys, a known activity
  role) and `presenceHelpRequestValid` (an int time within the last day of `request.time`, and a position).
- `src/livePresence.js`, `src/components/teacher/LiveClassMonitor.jsx`, `src/platform/teacher/walkthroughMonitor.js`:
  raised hands in the Room view and first in Walkthrough.
- `functions/shared/attemptEvidenceEvent.mjs`, `sectionRecoveryService.mjs`, `responseCheckpointSchema.mjs`,
  `misconceptionCodes.mjs` (comment) and `src/platform/mastery/evidenceClassification.js`: `backUpStepUsed` and
  `feedbackAssisted` reach the evidence, the Recovery gate and mastery.
- `tests/platform/graphSelfCheck.test.mjs`: its independence pin now reads the shared usage builder.
- `functions/shared/attemptPolicy.mjs`: `backUpStepUsed` and `feedbackAssisted` kept in the supportUsage normalizers;
  `feedbackAssisted` is part of `isMathematicallyIndependent`.
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
2. **`firestore:rules`**: the presence document is now an allowlist. The keys are the ones today's heartbeat already
   writes, so the rules are safe before or after Hosting; deploy them with or before Hosting so the help fields are
   validated from the start.
3. **Functions (recommended, not required).** `functions/shared/attemptPolicy.mjs` (keeps `backUpStepUsed`) and
   `algebraicSystemsEngine.mjs` (the `1(…)` text), `attemptEvidenceEvent.mjs`, `sectionRecoveryService.mjs` and
   `responseCheckpointSchema.mjs` are server code. Until they are deployed, server ingestion drops the
   `backUpStepUsed` and `feedbackAssisted` flags from the stored record, but keeps the client's
   `isMathematicallyIndependent: false`, so a supported attempt is still recorded as supported. Nothing breaks and no
   grade changes. The systems reducer compares by
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
