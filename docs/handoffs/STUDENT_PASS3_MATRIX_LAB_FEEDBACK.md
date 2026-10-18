# Student pass 3 — wave 5: Matrix Lab feedback: Matrix Lab feedback, credit for right models

Branch `claude/pass3-matrix-lab-feedback`, on `claude/modest-pasteur-xzagn7` at `e822504`, with the base at `cbeff6a`
merged in (merge commit). The integration review's S1–S4 and notes are addressed in the last section.
Nothing here deploys, writes to a production project or re-grades a recorded attempt. Student words follow D9
("tries", "Check" never costs a try, "Exit ticket (DOL)").

Evidence: `docs/qa/algebra2-matrices-student-walkthrough.md` §3 (P2-1 … P2-13) and R-1 … R-13;
`docs/qa/student-experience-pass-3/07-open-items-prs.md` rows PR-32 and PR-33. The walkthrough was written at
`25250b4`, so every item was first re-run on this base in a browser (the `algebra2MatricesLesson` harness: the
teacher import compiled and mounted in the real QuestionEngine, 1366×768 and 390×844).

## Per item: what a student saw on the base → what changed → proof

Every "proof" below names an assertion that was mutation-checked: the code was broken once, the assertion went red,
the code was restored (18 mutations, table at the end).

### PR-33 (R-4) — a correct model refused on a hidden-system item

**Base (reproduced).** PR 10 with `3x + y + 0z = 80` (z = 2x substituted into the count), money ×4 and
`2x − z = 0`: 86 %, "Reconsider: Row 1 of the matrix equation", nothing to fix.

**Changed.** `matchSituationRows` (`functions/shared/toolMath/matrixLab/matrixLabModel.mjs`). On a `solve` item whose
system is hidden (`showEquations: false`, now `model.hiddenSystem`), a row is right when it combines **at most
n − 1** of the situation's n facts (two of three; one of two; three of four) and adds something the student's earlier
right rows do not. A full set of such
rows has exactly the situation's solution set. Where the system is printed (CW 7, CW 8, PR 4) the task is to write
*that* system, so `matchEquationRows` (one equation per row) still decides.

"At most n − 1" is deliberate: `x = 15` is true of the baskets too, but in a system with one solution a row that
isolates a variable generally needs all n facts. It is the answer written as rows, and the walkthrough recorded it as
rightly refused. This holds at 2 × 2 and 4 × 4 too (a fixed "at most two" let the 2 × 2 answer through and refused an
honest 4 × 4 double substitution; S2). The literal R-4 (any rows with the
key's solution set and a full-rank A) would accept it. See decision 3.

A refused row says why, and **the reason is computed from the student's own work only**, so it adds nothing to the
verdict the row already has: "has no variable" (0x + 0y + 0z), "repeats what the other rows already say" (the
student's own A is rank-deficient), or, on a hidden system, "is not one of the situation's facts…". On a printed
system, a row that combines two printed equations says so. That test uses only pairs of printed rows (`inSpanOfFewRows`,
at most two and fewer than n), never the span of the whole system, which for one solution is every row true at the
solution and would have confirmed a guessed value (S1).

**Server.** The same pure grader runs in the browser and on the server (`functions/shared/serverGrading/tools/
matrixLab.mjs`, reached through `gradingManifest` → `serverResponseGrading`). See "Deploy targets" for the functions.

**Proof.** `tests/tools/matrixLabFeedback.test.mjs`:
- PR 10's substitution model, a reordered model with money written `2,086.25`, and the theater's `x + 2y = 82` are
  correct, through `bothPaths`: the browser (`gradeToolCheck`) and the server (`gradeServerResponse` over the
  serialized tool response) must agree on verdict, score and every part. This is the re-grade agreement test.
- The answer as rows, the count written twice and `0 = 0` are refused.
- A printed system still refuses a combination, and the list says "combines two of the equations".
- The same no-leak property on printed systems: CW 7's `1x + 0y + 0z = k` reads the same for k = 1, 2, 3, 4 (x = 2);
  so does a value row on CW 9 (S1).
- At 2 × 2 the answer as rows is refused; at 4 × 4 `6w + z = 7` (three facts) is accepted and `7w = 7` (all four) is
  not (S2).
- The no-leak property: `x = 15` (true) and `x = 14` (false) get the identical line, and the line holds no key value.

Browser: `matrixLabFeedback.mjs` "PR 10 substitution model" scores 100 %.

### P2-2 (hypothesis 7) — a singular system passed on a second guess

**Base (reproduced).** CW 10: "No solution" → "Reconsider: Number of solutions" → "Infinitely many" passes. Three
buttons, three tries.

**Changed.** An authored `justifySingular: true` on a `solve` item adds a reason the student gives once they choose
"none" or "many": "In A, row [3] is [3] times row [1]. The constants in B [follow the same multiple / do not
follow it]." It is graded as a part (`singularReason`) against the matrices the student holds (their own A and B, or
the given ones). It must be true of those matrices and agree with the decision the student chose ("follows" with
many, "breaks" with none), so a right reason about wrong rows earns this part as carried-error credit. Check stays off
until it is filled.
- On for CW 10, PR 8 and DOL 3 in the repo's lesson JSON.
- Off everywhere else. The work shape gains `singularReason` only where asked, so published items grade as before.
- Pre-Flight refuses `justifySingular` on a singular A with no two proportional rows (the reason could not be given).
- The worked solution (`matrixLabReview.js`) now submits the reason it already states, so it still self-grades correct.

Guessing a button no longer passes. A student who finds the pair and the multiple can still flip "follows" on a later
try, but that is arithmetic on numbers on the screen, not a guess at the classification.

**Proof.** Unit: "P2-2: a singular decision needs its reason…" covers the classification alone, the wrong multiple,
rows that are not multiples, an inconsistent reason, and either direction. Also "…a question that does not ask grades
exactly as before". `algebra2MatricesLesson.test.mjs` (rewritten per the playbook) checks that every singular item asks for
the reason, credits the independently derived one, and refuses the bare guess. Browser: CW 10 "many" alone cannot be
checked, the wrong multiple is not credited, and the right reason passes.

### P2-3 — one mistake, five "Reconsider" lines (and P3 "triple-listed feedback")

**Base (reproduced).** CW 9 with the missing variable written as 1 showed:
- the pill "Not yet — see what to reconsider";
- "Focus on: Row 1 …, Row 2 …, The value of x, …y, …z";
- five "Reconsider:" lines.

**Changed.** `matrixLabFixList` (shared, pure) turns the attempt's parts into **one list**. Each line names a row, a
cell or a field, and every wrong part is covered exactly once:
- a row says why when the reason is visible ("equation 1 has no z term", "copies equation 1 as it is printed",
  "no variable", "repeats");
- x, y, z that are exactly what the student's own A and B give are **one** line: "Your x, y and z are what your A and B
  give. Fix the rows above, then run the calculator again.";
- the outcome box keeps "Not quite. You have 2 tries left…" but no longer repeats the parts as "Focus on"
  (`<AttemptOutcome showDetail={false}>`). The list is said to a screen reader with the outcome.

**Proof.** Unit: CW 9 gives exactly three lines, and values that do not follow from the student's rows are not called
carried. `coversEachWrongPartOnce` runs on every list test. Browser: three lines, no "Focus on", outcome still said.

### P2-4 — CW 4's sort turned red without naming a figure

**Base (reproduced).** Two of eight figures wrong: the step is red with "The red steps above are the specific
responses…". Neither the figures nor the count are named (the stage `detail` is dropped by `gradedResult`).

**Changed.**
- `figureMatchWrongItems` (`functions/shared/toolMath/workflow/figureMatch.mjs`) lists positions, never ids.
- `WorkflowRunner` passes them to `FigureMatchStage` only for a step whose review is `incorrect`. That is the exact
  response that was checked. The review exists only where QuestionEngine shows outcomes.
- The stage says "Figures 3 and 8 are not in the right category yet." and marks those cards.
- The old comment in `workflowGrading.mjs` said naming was withheld on purpose (elimination on a later try). It now
  points to decision 1.

**Proof.** Unit "P2-4" covers positions, no key → nothing, and the wiring to `showOutcomeFeedback`. Browser: "Figures 3 and 8…" with
two cards marked.

### P2-5 — A⁻¹ graded as one part; "4 places" against the 3 accepted

**Base (reproduced).** PR 5's panel: "Record A⁻¹ (exact fractions, or decimals to 4 places)". `cellMatches`
accepts ≥ 3 places. A rounded-early A⁻¹ got "Reconsider: The inverse matrix A⁻¹".

**Changed.**
- The list names the cells: "In the inverse matrix, row 3, column 3 is not right yet. In the inverse matrix, row 2,
  columns 1, 2 and 3 were rounded too early. Write the exact fraction, or keep at least 3 decimal places."
- Those cells are marked (`aria-invalid`, red border, `matrixLabWrongCells`); so are a product's wrong cells.
- x, y, z rounded early say so too.
- The panel asks for "decimals to at least 3 places", matching the grader. The grader is unchanged: refusing 3 places
  now would mark answers wrong that were accepted.
- The score was already per cell (`credit = right / cells`) and is unchanged.

**Proof.** Unit "P2-5…" (text, the four marked cells, 3 places accepted, panel wording). Browser: same, four cells marked.

### P2-9 — 0x + 0y + 0z = 0 refused with no reason

**Changed.** "Your equation for infinitely many solutions: every coefficient is 0, so it is not an equation in x, y
and z. It is true for every x, y and z, or for none, so it cannot complete the system. Give it at least one
variable." The grading is unchanged.

**Proof.** Unit "P2-9…"; browser "PR 9".

### P2-10 — a bare sign or an untouched prefill spent a try

**Base (reproduced).** CW 7 with `-` for −y: Check on, graded wrong, `attemptCount: 1`, "Reconsider: Row 1". CW 8's
untouched prefill: Check on.

**Changed.** Every view computes `formatProblem(...)` over its fields, and `complete = !blocker && …`. A cell that is
not a number keeps Check off and says, under Check, before anything is counted:
- "Row 1 of A, coefficient of y: “-” alone is not a number. For a term like −y, write −1. No try has been used."
- Dimensions and row/column numbers must be whole numbers.

An authored start the student has not changed is **asked about, never blocked** (S3): the first press of Check says
"This is the matrix equation as it was given. Change what needs fixing — or press Check again to check it as it is."
and spends nothing; a second press checks. An item already published with a right start therefore stays answerable.
Pre-Flight refuses a new `startFrom` that is already right (judged by the hidden-system rule on a hidden system).

The messages describe only what was typed, so they also show on an exit ticket.

**Proof.** Unit "P2-10…" (all five views, the sign rule, the Pre-Flight error). Browser: CW 7 (laptop `-`, phone `+`)
and CW 8 (Check on, the first press asks, no record written).

### P2-6 (R-11) — hints that state the answer

**Base (reproduced, from the JSON).** CW 2 hints 2–3, CW 8 hints 2–3, PR 4 hints 1–2, PR 10 hint 2, PR 11 hint 1.
CW 4 hint 3 also sorted Figure 6.

**Changed.**
- `matrixLabHintLeaks` (shared) flags a hint that writes a row the student must write. That means the standard form of
  a printed equation not yet in standard form, or any fact of a hidden system. It also flags a value of the solution
  (`x = 15`) and the place of an element described in words ("row 3 … column 1", `b₄₂`).
- `hintAnswerPreflight.js` adds the figure-sort case (a hint quoting a figure).
- Pre-Flight shows these in their own advisory panel, "Hints that give the answer"
  (`LessonPreflightModal`, `preflightModel.hintAnswers`). Like attempt feedback, it is not a readiness diagnostic: it
  never turns an assignment Needs Review.
- The nine flagged hints are rewritten to point at the move ("Equation 1 has 5z on the right side. When you move it to
  the left side, what happens to its sign?").

`check-teacher-import`: valid, 0 errors, the same one intended warning as before.

**Proof.** Unit "P2-6…": each original hint is flagged, a method hint is not, and the lesson now has 0 warnings.

### P2-12 (R-12) — the lab's calculator never recorded

**Base (reproduced).** DOL 2 after `[A]⁻¹·[B]`: `supportUsage.calculatorUsed: false`.

**Changed.**
- Every lab calculator (operate, solve, completeSystem) reports `onAction('CALCULATOR_USED')`.
- `QuestionEngine.handleMissingToolAction` calls the same `markCalculatorOpened()` as the platform calculator:
  `calculatorUsed: true` and the `calculator`/`used` evidence. It is not mathematical help, so it does not touch
  `isMathematicallyIndependent`.
- Every other host of a tool's `onAction` (WorkflowRunner, MultiRelationAlgebraCore) filters by action type, so it
  ignores the new action.

**Proof.** Unit "P2-12…"; browser DOL 2 `calculatorUsed === true`.

### Layout

- **P2-1 (reproduced).** Under the app's `scroll-padding-bottom`, base left the "Reconsider" lines at 711–795 px, under
  the bar (top 703). The list now comes **before** the outcome box, which scrolls itself clear of the bar once per
  attempt. Branch: lines 465–577 px, outcome 585–673 px. Browser "CW 2 after Check" (the harness opts into the app's
  `.mathmaster-assignment-screen` rule, which it does not mount itself).
- **P2-8 (reproduced).** CW 6: the calculator was 171 px below the grid. The fill grid and the calculator now share a
  wrapping row: side by side at 1366, stacked at 390. Browser checks both.
- **P2-11 (reproduced).** CW 5's S scrolled vertically (scrollHeight 88 > 84). `MatrixGrid`'s scroll box is now
  `overflowY: hidden` with 4 px block padding, and no matrix box scrolls vertically.
- **P2-7.** In the QuestionEngine harness at 390×844 (touch), Check brought into view after the last value is never
  covered: PR 5, PR 6, PR 10, CW 2 and CW 6 were probed; the driver keeps PR 6. Not re-checked in the full App phone
  shell (see "Not done").
- **P2-13 — no longer covers the lab.** After "Show a hint" at 1366 the panel sits above the lab and the matrix is on
  screen (lab top 216 px). The page scrolls to the hint, so Check (1197 px) is below the fold: out of view, not
  covered. Hint placement is QuestionEngine-wide and was not changed here.

### Exit tickets: nothing tells the answer or the method

- The list and the cell marks render only from `feedback`, which `useToolSubmission` holds only when
  `showImmediateFeedback`.
- The figure names come only from a submission review, which QuestionEngine passes only with `showOutcomeFeedback`.
- The reasons themselves are key-free (the no-leak property above).
- Unit: "the list and the cell marks render only with a verdict the activity shows" (mutation M10).
- Browser DOL 1–3: no list, no marked cell, no verdict ("Correctness feedback is held…"). DOL 3 asks for its reason
  and a wrong read says nothing.
- `toolPolicyGates`, `assessmentLeakGates`, `toolAttemptOutcome` and `composedOutcomePolicy` are green.

### Spanish (Read aloud and Translate)

The list is the tool's coaching in the outcome box, which offers Read and Translate. Every sentence it can say has a
curated template in `src/platform/language/packs/esSupport.js` (`matrixLabFixes`, cell sentences generated per shape).
The unit test translates 15+ generated lines to full coverage. The format message is a plain status line, not
offered for Translate, so it has no entry. A Spanish-speaking teacher should review the new entries (as for the rest
of the pack).

## Gate (results on this branch)

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11 599 / 11 599 pass (after `npm ci` in `functions/` and `functions-path-admin/`) |
| `node --test tests/tools/*.test.mjs` | 1 688 pass, 0 fail, 1 skipped (19 new in `matrixLabFeedback.test.mjs`) |
| `npm run lint` | exit 0 (warnings only, none in changed files) |
| `npm run build` | exit 0 |
| `npm run build:firebase` | exit 0; no tracked file rewritten (`git status` clean) |
| `node scripts/check-first-load-budget.mjs` | studentHome **1048.8 KB** gzip, over its 1023.4 KB baseline by 25.5 KB. **The base measures the same 1048.8 KB (25.4 KB over)**: pre-existing, this branch adds ~0.1 KB. Baseline file not edited. |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run test:grade-authority` (Firestore emulator) | 14 / 14 |
| `npm run test:rules` (Firestore emulator) | 218 / 218 |
| Matrix Lab unit/tool tests (`matrixLabSharedGrading`, `matrixLabPlatform`, `algebra2MatricesLesson`, new `matrixLabFeedback`) | all pass |
| Secure-item storage (A2.3B: `secureItemNestedArrays`, `algebra2FidelityV2Staged`) | pass (in `test:platform`) |
| `tests/browser/matrixLabFeedback.mjs` (new) | every check passed (laptop 1366×768 + phone 390×844 touch, incl. P2-7 and DOL 1–3) |
| `algebra2MatricesLesson.mjs` | 56 views, 0 findings |
| `toolPolicyGates`, `assessmentLeakGates`, `toolAttemptOutcome`, `composedOutcomePolicy` | exit 0 each |
| `workViewMatrix` | exit 0 (480 screenshots) |
| `studentUxPlatform`, `feedbackTeaches`, `readAloudTranslate`, `stagedQuestion`, `focusSafeToolControls` | exit 0 each |
| `captureToolResponses.mjs matrixLab --debug` | 0 captures: it drives Path tools only, and has no Matrix Lab driver |

Vite ran as the plain `npx vite --host 127.0.0.1 --port 5199 --strictPort` with `AUDIT_ORIGIN`; its cache stays in
`node_modules/.vite`.

### Mutation checks

Each row: the break, then the new tests (`matrixLabFeedback` + `algebra2MatricesLesson`) went red; restored after.

| # | Break | Red |
| --- | --- | --- |
| M1 | drop the "at most two facts" rule | 2 |
| M2 | `hiddenSystem` always false | 2 |
| M3 | make the hidden-row reason depend on the key | 1 (the no-leak property) |
| M4 | do not check the singular reason against the rows | 1 |
| M5 | ask for the reason on every singular item | 1 (published items unchanged) |
| M6 | never call values carried | 1 |
| M7 | never say "rounded too early" | 1 |
| M8 | no no-variable reason | 2 |
| M9 | remove one Spanish template | 1 |
| M10 | render the list without a verdict | 1 |
| M11 | operate view ignores the format blocker | 1 |
| M12 | QuestionEngine ignores `CALCULATOR_USED` | 1 |
| M13 | name no figure | 1 |
| M14 | hint lint ignores rows | 1 |
| M15 | allow a right `startFrom` | 1 |
| M16 | panel back to "4 places" | 1 |
| M17 | solve calculator does not report | 1 |
| M18 | the lesson does not ask for the reason | 1 |
| S1 | "combines" judged by the whole system's span | 1 |
| S2 | "at most two" at every size | 1 |
| C | `singularReasonHolds` ignores the constant | 1 (part-level) |
| D | the reason no longer has to agree with the decision | 1 (part-level) |
| J | the solve view no longer asks about an untouched start | 1 |
| S3 | the first press checks instead of asking | 1 |
| S3 | the hidden start judged by the printed rule | 1 |

## Deploy targets

- **Hosting**: the lab, QuestionEngine, WorkflowRunner/FigureMatchStage, MatrixGrid, Pre-Flight, the Spanish pack.
- **Functions**: the shared grader changed (`functions/shared/serverGrading/tools/matrixLab.mjs`, `toolMath/matrixLab/
  matrixLabModel.mjs`, `toolMath/workflow/figureMatch.mjs`). The functions that grade or re-grade a response with it:
  `ingestStudentSubmissions`, `applyWorkspaceDraftRecovery`, `finalizeStudentResponseCheckpoints`,
  `sweepStudentResponseCheckpoints`, `inspectStudentResponse`, `overrideStudentResponseGrade`,
  `advanceSectionRecovery`, `resolveHeldSectionRecovery`, `getStudentPersistenceRecoveryReport`,
  `resolveStudentPersistenceHold`, `syncGradeToClassroom` (all `functions/index.js`; each reaches
  `gradeServerResponse` or `gradeFamilyInstanceResponse`). `loadMyReviewWork` loads the modules but never grades.
  Not affected: `submitPathResponse`, `submitLiveChallengeResponse`, `gradeChallengeDryRunResponse`,
  `submitSecureExamResponse` and `submitTestCycleCorrectionResponse` (separate Path/secure-item graders).
  Path-admin: its four exports load none of these modules; its vendored copy is re-synced by the build and needs no
  redeploy.
  **Follow the planner:** `node scripts/release-firebase.mjs --since e822504` (plan only) maps the change to the whole
  default fleet plus `functions:path-admin`. The list above is a reading aid, not the deploy list: the content-upgrade
  and teacher-repair paths (`lib/assignmentContentVersion.js`, `lib/teacherQuestionRepair.js`) also load shared
  grading, per the integration review (N4).
- **Rules**: none. **Indexes**: none.
- **Content**: the lesson JSON (`teacher-import-jsons/…/T2_L3_Solving_Systems_with_Matrices.json`) is deployed by
  nothing. It reaches classes when a teacher re-imports it. Assignments already published keep their compiled copy,
  their hints and their grading: the nine rewritten hints and `justifySingular` are `fundamental` changes, so a
  published copy keeps the leaking hints until the teacher re-imports (N3). Teachers of this lesson should re-import.
  Adding `justifySingular` to a published DOL 3 retires its existing work rather than re-grading it.

## Decisions for the owner

1. **Naming the wrong figures (P2-4)** reverses a recorded choice: "which are wrong is deliberately not named… it
   would turn a second attempt into elimination". The walkthrough's R-10 asks for it, and an 8-figure sort that only
   turns red leaves nothing to act on. Keep, or name only from the second miss?
2. **`justifySingular` is opt-in (P2-2).**
   - On for the repo's three singular items. Make it the default for every singular `solve` item?
   - DOL 3: a wrong read now scores 3 of 5 parts (60 %, was 75 %). Should the decision weigh more, e.g. a part weight?
   - `questionValue` (grade weight) does not count the new step.
3. **PR-33's "at most n − 1 facts".** It accepts substitution (the walkthrough's case and PR 11's) and refuses the
   answer as rows at every size. It would also refuse an honest row combining all n facts. The literal R-4 (any
   full-rank system with the solution set) accepts the answer as rows.
4. **Hint lint is advisory**, like attempt feedback, so it never hides an assignment. Should a Matrix Lab row leak
   block publishing instead?
5. **An untouched prefill asks before it is checked** (P2-10, S3). Pre-Flight refuses a new right `startFrom`; a
   published one stays answerable with one extra press.
8. **The reason panel shows only on `justifySingular` items** (N6). Choosing "No solution" on DOL 2 (no panel) vs
   DOL 3 (panel) hints that DOL 3 is singular — weak, since the calculator's "no inverse" already says so. Showing it on
   every none/many choice would ask for work that is not graded on other items; left for you.
6. The pill now reads "Not yet — see what to fix" (was "…to reconsider").
7. Spanish entries need a Spanish-speaking teacher's review.

## Touched outside the Matrix Lab (kept minimal)

- `src/QuestionEngine.jsx`: the `CALCULATOR_USED` branch (7 lines). Merges cleanly with b5 and b6.
- `src/components/common/MatrixGrid.jsx`: `overflowY: hidden`, `paddingBlock: 4` on the scroll box (P2-11).
- `src/platform/workflow/WorkflowRunner.jsx`, `FigureMatchStage.jsx`, `functions/shared/toolMath/workflow/
  figureMatch.mjs`: P2-4. `workflowGrading.mjs`: a comment only.
- `src/platform/contract/authoringIntentV5Core.js`: copies `justifySingular` through the compile.
- `src/platform/preflight/hintAnswerPreflight.js` (new), `assignmentV5PreflightModel.js` (one advisory field),
  `src/components/teacher/LessonPreflightModal.jsx` (one panel).
- `src/platform/language/packs/esSupport.js`: the `matrixLabFixes` block.
- `src/tools/shared/reviews/matrixLabReview.js`: the worked solution submits the singular reason.
- **Expected conflict with b5** (`claude/pass3-b5-submit-and-finish`): one hunk in `matrixLabUi.jsx` `CheckRow`.
  b5 wraps the button label in `<SubmitText>`; this branch changes the button's `onClick` to `press` (the S3 confirm)
  and the pill on the next line. Resolve with b5's button line using `onClick={press}`, plus this branch's pill line
  (`<ResultPill ok={feedback.isCorrect} stageCheck>{verdict}</ResultPill>`) and its comment. No other wave-4 branch conflicts with this branch's changes.

## Not done

- **R-3's "compare two rows" helper** as a separate tool. P2-2 is closed by the reason step instead.
- **P2-7 in the full App phone shell.** It was checked only in the QuestionEngine harness. The platform-wide "action
  row sticks above the work bar" (R-2) is out of scope.
- **P2-13's scroll to the hint**, which takes Check out of view (QuestionEngine-wide).
- R-5 (calculator history), R-6 (Read aloud reads the matrices), R-7 (fading expansion), R-8 (judge-only), R-1's
  thousands separator in multi-answer fields (P0-1), and the P3 list.
- The new browser driver is not added to `.github/workflows/student-runtime-browser-gates.yml`. Run it as its header
  says; adding it is the integrator's call.

## Integration review round (S1–S4, notes)

- **S1** (the oracle): fixed as above. Property tests on printed systems (CW 7, CW 9) and mutation S1.
- **S2**: "at most n − 1 facts"; every 3 × 3 result is unchanged. Tests at 2 × 2 and 4 × 4, mutation S2.
- **S3**: soft confirm; Pre-Flight's start check uses the hidden rule on a hidden system. Tests and mutations J, S3.
- **S4**: part-level asserts for the constant (C) and the decision agreement (D); DOL 3's wrong read scores 3 / 5.
- **N1**: policy chosen and written in `gradeSolve`: the reason must agree with the decision the student chose
  (carried-error credit for this part only).
- `toolStatePersistence.js` declares the confirm prompt's `confirmed` state as presentation (the transient-state contract).
- Re-run on the merged tree (`cbeff6a` in): test:platform, tools, lint, build, build:firebase (tree clean), budget (unchanged), and the drivers matrixLabFeedback, algebra2MatricesLesson, toolPolicyGates, assessmentLeakGates, toolAttemptOutcome, composedOutcomePolicy — all green.
- **N3, N4, N6**: in "Deploy targets" and decision 8. **N8**: the format message now ends "No try has been used."

## Wave 4 merge and the double-press guard

- Base `c350dfc` (wave 4) merged as `bf2569e7`. The one conflict (`CheckRow`) resolved with B's `<SubmitText>` button
  using `onClick={press}`, and this branch's stageCheck pill.
- A double-click or double-tap on an untouched start used to ask and check in one gesture, spending a try before the
  prompt could be read. A second press within `CONFIRM_SETTLE_MS` (400 ms) of the ask is now ignored, using a
  timestamp ref, not a timer, so Check never goes dead. Driver: a double-click asks and spends no try, and a press
  after 400 ms checks (one try). The unit test pins the guard. Mutation (guard removed): both the driver and the unit
  test go red.
