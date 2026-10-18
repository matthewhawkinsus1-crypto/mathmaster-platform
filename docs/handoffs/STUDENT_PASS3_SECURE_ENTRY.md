# Student pass 3, wave 5 — secure answer entry, results that teach, one calculator

Branch `claude/pass3-secure-entry`, from `claude/modest-pasteur-xzagn7` at `e822504`. Session W5-6. Items from
[05-open-items-handoffs.md](../qa/student-experience-pass-3/05-open-items-handoffs.md): H-13, H-16, H-6, H-14,
H-19, and the note "SecureExamReview shows a question's prompt but never its graph" (item 4). RUN-21 / H-11
("1 of 1 try left" on secure tool items) is session B's and is untouched; it still shows on a secure tool item.

Nothing here writes to production or deploys. The grader change (H-13) needs a functions release; see
**Deploy targets**.

Commits: `f277331` (H-13), `6b1db8a` (H-16), `333663b` (H-6, H-14, item 4), `99bc928` (H-19), `01b2565` (a
journey fix), then this doc. The base was merged in once, when it moved to `cbeff6a` (`85525ce`: a merge commit, no
conflicts, none of its files are mine). The gate below ran before that merge. The checks marked † ran again on
the merged head.

## Each item still reproduced on the base

Each was checked on `e822504` before it was changed, in a browser where it is visual:

| Item | On the base |
| --- | --- |
| H-13 | `secureAccessParity` on the base: every ordered pair and inequality went into `input[data-secure-answer-editor="text"]` (letter keyboard on the phone, no keypad). |
| H-16 | New `secureExamNavigation` `supports` journey run against base sources: "the tool item's tray offers Vocabulary" FAIL on Chromebook and phone. |
| H-6 / H-14 | `secureResults` run against base sources: no "Read the worked solution aloud" for a student whose plan grants it, and every result read `H3 H2` (the solution's `h2` under the card's `h3`). |
| Item 4 | Same run: "a table question shows its table" and "a graph question shows its graph (0 svg)" FAIL. |
| H-19 | `secureExamNavigation` SAT practice journey against base sources: the controls were `📈 Graphing calculator \| Calculator` on both devices. |

## What changed, item by item

### H-13 — ordered pairs, inequalities and π, √, %, $ fields get the math editor

**What a student saw.** On a secure Test, an ordered pair, an inequality, or any field whose metadata named π, √, %
or $ was a plain text box. No keypad, the letter keyboard on a phone, `<=` typed by hand. Everywhere else in
MathMaster these answers go in the math editor.

**Why the guards existed.** The history is squashed (`git log -S SECURE_TEXT_PROFILE_REASONS` stops at merge
commits), but [STUDENT_PUSH_P_GRADING_EDGES.md](STUDENT_PUSH_P_GRADING_EDGES.md) gives the reason. The editor
submits MathLive's LaTeX, not the typed characters, and nobody sees a verdict before release. So a right answer the
grader could not read would be marked wrong in silence. Push P taught the grader `\land`, `\lor`, `\pi`, `\sqrt`,
`\%`, `\$` and fractions inside a pair. It left the guards in place until a browser capture showed what the editor
actually sends for each profile. That capture is part of this work.

**What the capture found that the grader still could not read.** I fixed both, in grading only:

1. **A stacked fraction around π or a root.** A `/` typed in the editor builds `\frac{\pi}{2}` or `\frac{\sqrt3}{2}`.
   Against an author's `pi/2` or `sqrt(3)/2` that graded **wrong**, in a number, a pair (unit-circle points) and an
   inequality alike. `stackDivisions` gains a grading-only `constantOperands` option, used by
   `answerEquivalence.canonicalizeDivisions` only. With it, π and `\sqrt{…}` (with a number coefficient
   directly before: `3π/4`, `2\sqrt3/3`) count as operands. Rendering never passes the option, so nothing a student
   sees changes.
2. **The keypad's "and" / "or".** MathLive writes an inserted `\operatorname{and}` back as
   `\operatorname{\mathrm{and}}`. The structural normaliser unwrapped one level and dropped the spaces, so
   `0≤h and h≤12` did not grade against a chained key `0<=h<=12`. Word groups now unwrap fully, and a group that is
   just "and" or "or" keeps a space either side. The chained-key gap also exists on the base for `\text{and}`
   without spaces.

**What changed in the editor** (`src/platform/assessment/secureAnswerEntry.js`, `SecureMathAnswerField.jsx`):

- `SECURE_MATH_EDITOR_PROFILES` = number, set, interval, **orderedPair, inequality**. Expression and equation stay
  typed text; their reasons still hold and are pinned.
- A field naming π, √, % or $ stays on the editor. π and √ become keys. % and $ need none: the grader reads a bare
  `25` for the key `25%`, and the number hint already says "Leave out … % and $".
- **The keypad says nothing about the answer.** On a phone, MathInput captions `requiredSymbols` "Needed for this
  answer". On a test that caption would tell a student the answer has a π in it, or is a fraction (it already did
  for a number field naming `a⁄b`).
  - A secure field now passes MathInput only the symbols no key can type. Those show no key; they only keep the
    phone's own keyboard.
  - Its keys go into the pad itself, uncaptioned, through a new additive MathInput prop `extraKeys`.
  - Every key a profile adds is the same on every item of that profile:
    - pair: √, π;
    - inequality: a⁄b, |x|, xⁿ, √, π, **and**, **or**.
  - The only item-specific keys are an inequality's letters. They come from the prompt's own mathematics
    (`variablesInPrompt`, through `splitMathSegments`, so "$5 and $12" is prose), at most four, `x` if none.
- "and" / "or" keys write `\operatorname{and|or}`. A `\text{}` key left the caret typing text: the first capture
  showed `0\le h\text{ and h\textbackslash le12}`. On a secure field, a typed "and" or "or" now stays the word
  instead of MathLive's ∧ / ∨.
- New hints (how to type, no example numbers):
  - pair: "Write your answer as an ordered pair: (x, y). Make a fraction with / or the a/b key."
  - inequality: "Write your answer as an inequality. Use the ≤ and ≥ keys, or type <= and >=."
  - Neither is read by Read aloud or Translate: a secure item's supports read the prompt only. The hint reaches a
    screen reader in the field's name, as before. So no Spanish entry is needed.
- The results page draws the editor's `\%` and `\$` as math instead of showing the backslash (`answerIsLatex`).

**Proof.**

- `tests/browser/secureAccessParity.mjs --write` typed each profile on a Chromebook and keyed it on a 390×844 phone,
  keypad only. That is 71 answers, among them 38 new ordered-pair, inequality and π/√/%/$ ones. Each was graded
  by the real server grader (`secureItems.gradeItem`), and all grade correct. They are recorded in
  `tests/platform/fixtures/secureAnswerRoundTrip.json`, and `secureMathAnswerRoundTrip.test.mjs` grades them in CI.
- The driver also checks:
  - on the phone, the "Needed" row with a field's metadata equals the row for a bare field of that profile, and the
    item's keys are in the pad;
  - nothing on the page evaluates the answer: after `3/4`, `pi/2`, `3pi/4`, `3sqrt2` and `x >= 3/4`, no 0.75,
    1.57, 2.356 or 4.24, and no verdict, in the field, the live regions or the hint;
  - the editor never leaves math mode (`\text`).
- Round-trip tests pin each new spelling against its key, each beside a near miss that stays wrong. The tests also
  pin the expression and equation reasons, and show that the keypad never reads an answer key (a field carrying
  `expected` gets the same keys as one without).
- Bank sweep, `node scripts/sweep-equivalence-verdicts.mjs --base <e822504 worktree> --draws 3 --check-wrong`,
  over 9,330 fields and 256,482 verdicts:
  - **0 right → wrong**, **0 near miss or other option → right**;
  - 1,263 right answers newly accepted, all in the keypad's "and"/"or" spelling.
  - The sweep now generates both new spellings. No bank key is written `X/Y` around π or a root (105 keys hold π or
    a root at all), so the stacked rule moves no existing verdict. The pinned tests cover it.
- Mutation checks, each red when broken and green when restored:
  - grader: constant operands off, π not an operand, the and/or spaces dropped, a single unwrap;
  - editor: inequality back to text, keys read from `expected`, a naive `$` split, symbols sent to the captioned
    row;
  - wiring: MathInput mobile dropping `extraKeys`, the prompt not passed, captioned keys;
  - in the browser: captioned keys turned the "Needed" check red, and an injected "= 0.75" turned the evaluation
    check red.

### H-16 — Vocabulary on secure tool items, without worked examples

**What a student saw.** A student whose plan grants a glossary on a test had Vocabulary on field items but not on
Rich Tool items: `RichQuestionRuntime` dropped it, because the engine's tray could not hide the glossary's worked
examples.

**What changed.**

- The secure tool tray entitlement keeps every secure tool the plan grants for a test and carries
  `showExamples: false`.
- `SupportToolsTray`'s Vocabulary panel then lists terms through `secureVocabularyEntries`, the same example-free
  helper the secure field tray uses: term, definition, Spanish when Translate is granted.
- Practice surfaces keep their examples.

**Proof.**

- New `secureExamNavigation` `supports` journey (course Test, glossary + Spanish plan), Chromebook and phone:
  - Vocabulary is offered on the tool item, with 5 terms, definitions and Spanish;
  - no "Example";
  - the panel judges nothing, and nothing a test does not allow is offered.
- Red on the base. Turning examples back on turned the browser check red.
- `secureAccessWiring` pins the entitlement and the panel's example-free branch (four mutations red).

**Noticed.** On a phone the panel scrolls inside the engine's prompt card, which is about 211px tall. That is the
engine's existing tray layout, the same as on My Math Path.

### H-6 and H-14 — one worked-solution panel on Test results, with Read aloud and Translate

**What a student saw.** Released worked solutions on Test results, and in Corrections, used `PathSolutionReview`:

- no Read aloud or Translate, even for a student entitled to both;
- a fixed `<h2>` under the results card's `<h3>`, so the screen-reader outline jumped.

**What changed.**

- `SecureExamReview` and `RichQuestionRuntime` now use `SolutionReviewPanel`, the one panel every closed
  question uses. They give it only `{ solutionReview }`, the review the server released, so no family steps,
  legacy review or tool review can appear.
- New props:
  - `headingLevel`: 4 on results, 2 under a runtime item's `h1`;
  - `showIntro`: off on results, where the card already says right or wrong.
- `src/platform/supports/workedSolutionSupports.js` turns an entitlement into the panel's `readAloud` and
  `translation` props:
  - Results: `secureAccessEntitlement` of the student's own profile (their plan for a test).
  - Corrections: the plan for the `corrections` role.
- `TestCycleCard` and `StudentSecureExamDashboard` pass the profile to the review. `TestCycleCard` passes it to
  `TestCycleCorrections` too, which never had it.
- `SupportedTextActions` buttons are 44px (were 32), everywhere they appear.

**Proof.**

- `secureResultsWorkedSolution.test.mjs` renders the panel the way the results page does:
  - an `h4`, nothing above `h3`;
  - only the released lines, no classroom intro;
  - Read aloud only for a plan that grants it on a test (not for one limited to practice, and not when the browser
    cannot speak).
- `secureResults` driver, both devices, against the base and the branch:
  - every result's headings are `H3 (H4)*`;
  - no Read aloud without a plan;
  - with a plan, Read aloud speaks the worked solution, and Translate is offered or says "No Spanish translation
    for this text yet." (an item's authored solution is item content; there is no machine translation).
- Mutations red: intro always on, fixed `h3`, ignoring speech, no profile, the card dropping the profile.

### Item 4 — the question's figure in its result

**What a student saw.** A graph question's result showed the prompt ("Use the graph…") and no graph.

**What changed.** Under the prompt, each result draws the snapshot's `stimulus` (`PathQuestionStimulus`, title at
`h4`: new additive `headingLevel` prop; a panel's title one level deeper) and `formulaLatex`. `publicReview`
already carried both (`reviewSnapshotOf` → `buildSanitizedQuestion`); the screen never read them.

**Proof.**

- `secureResults`: the table question shows its table with an `h4` title, and the graph question shows its graph,
  over 150px wide, on both devices.
- `secureResultsWiring` pins the figure's position (after the prompt, before the answers).
- `secureResultsWorkedSolution` renders the title at `h4`, with `h2` still the Path's default.

### H-19 — one calculator on a Digital SAT or ACT item

**What a student saw.** The exam toolbar's "📈 Graphing calculator" and a second "Calculator" inside the question:

- on a field item, `CalculatorPanel`;
- on a tool item, the engine's work-bar button.

The second one's panel read "SCIENTIFIC CALCULATOR … Graphs are drawn in the question itself."

**What changed.**

- `QuestionEngine` gains `calculatorInToolbar`: no work-bar Calculator, no Work View rail entry, no panel of its
  own.
- `SecureExamContainer` passes `tools.graphingCalculator` (the same resolution that draws the toolbar button)
  through `SecureExamQuestionPlayer` and `RichQuestionRuntime` to both item kinds. `FieldItem` drops its panel.
- Course tests with a scientific calculator or none are unchanged; nothing else passes the prop.

**Proof.**

- `secureExamNavigation` SAT practice: exactly one calculator control, "📈 Graphing calculator", on both devices.
  Red on the base.
- `secureAccessWiring` pins the chain (four mutations red).

## Gate

All on this machine, Chromium from `/opt/pw-browsers`, emulators only. Nothing reached a network
(every driver reports 0 non-local requests or aborts them).

| Check | Result |
| --- | --- |
| `npm run test:platform` † | **11,611 pass, 0 fail** on the merged head (11,610 before the merge) |
| `node --test tests/tools/*.test.mjs` | **1,671 pass, 0 fail** |
| `npm run lint` † | exit 0, no errors. The remaining warnings are pre-existing; one in a line of my driver was fixed |
| `npm run build` † / `npm run build:firebase` † | both pass; `git status` clean afterwards (no tracked file rewritten) |
| `node scripts/check-first-load-budget.mjs` † | **studentHome 1048.3 KB** gzip (194 files), 24.9 KB over the 1023.4 KB baseline. **The base is over too: 1048.6 KB** (196 files) on `e822504`, so this branch is 0.3 KB smaller. `first-load-baseline.json` untouched. signIn 291.4 KB, unchanged |
| Bank sweep (`scripts/sweep-equivalence-verdicts.mjs --draws 3 --check-wrong`, base `e822504`) | 9,330 fields, 256,482 verdicts: **0 right → wrong, 0 near miss → right**, 1,263 right answers newly accepted ("and"/"or" word groups) |
| `npm run test:rules` | 218 pass, 0 fail |
| `npm run test:secure-exam-navigation` | 25 pass, 0 fail |
| `npm run test:canonical-persistence` | 35 pass, 0 fail |
| `npm run test:test-cycle-certification` | 35 pass, 0 fail |
| `npm run test:grade-authority` | 14 pass, 0 fail |
| `npm run test:authoring-v5` | 686 pass, 0 fail |
| `npm run test:challenge-finish` (integration, graders) | 453 pass, 0 fail |
| `npm run test:classroom-regrade-report:emulator` | 5 pass, 0 fail |
| `tests/browser/secureAccessParity.mjs --write` † | **26 / 26 checks**, Chromebook 1366×768 and phone 390×844; 71 answers captured, all graded correct by the server grader |
| `tests/browser/secureResults.mjs` † | **324 passed, 0 failed** (both devices). Its stub and two stale checks were repaired; on the base the page was a SyntaxError |
| `tests/browser/secureExamNavigation.mjs` (all 8 journeys) † | 359 / 360 before the journey fix (my own close step), then `supports` 28 / 28. On the merged head: 337 / 339. The two failures were "Escape inside the list closes it", and then a timeout, in the SAT `practice` journey on the first run against a just-started Vite (the same happened once earlier, also after files changed under it). The `practice` journey then passed 5 runs in a row, 118 / 118: three on a warm server and two on a server the driver started cold. The base `cbeff6a` passed it cold, 114 / 114. Nothing I changed is in the question list. I report it as a cold-start flake, not proven otherwise |
| `tests/browser/assessmentLeakGates.mjs` | exit 0 |
| `tests/browser/readAloudTranslate.mjs` | all checks passed |
| student-runtime-browser-gates.yml, every driver, one at a time on `vite --port 5199` with AUDIT_ORIGIN | all exit 0: mathEntryContract, renderStability, errorRecovery, duplicateTabs, graphPointCheck, phoneToolPanelReach, undoTyping, toolFocusAndUndo, composedOutcomePolicy, toolPolicyGates, relationPlotGrading, toolAttemptOutcome, assessmentLeakGates, systemsWorkspaceStudio, clickMapLetterbox, stagedQuestion, unansweredChoiceGates, graphKeyboardRoute, planePhoneReach, focusSafeToolControls, composedDraftRestore, draftEditTime, fractionTemplateGrading |
| student-teacher-journeys.yml `student` job (5199) | all exit 0: studentUxPlatform, linearMultipleRepresentations, lmrProcessMode (9 journeys), familyPinContainment (77 checks), feedbackTeaches, readAloudTranslate, reviewMyWork, warmupReopenDraft (both) |
| teacherWorkflow harness (5188) | all exit 0: journeys (A–K and retry at 1440 and 1024), supportEvidenceJourneys (22 runs), appUrlJourneys, studentScreenChange, recoveryDraftCrossDeviceJourneys (100 checks) |
| `tests/browser/testCycleSecureWorkflowQa.mjs` | 170 passed, 0 findings |
| `npm run test:test-cycle-lifecycle` | 71 passed, 0 findings |
| `npm run test:test-cycle-device` | exit 0 |
| `tests/browser/testCycleRichToolQa.mjs` | 364 passed, **14 findings, identical on the base `e822504`** (364 / 14): every tool's "reload reopens the same item" reads `Cannot read properties of null (reading 'questionInstanceId')` (the driver's `current` is null). Pre-existing, not in my files; reported to the integrator |

Mutation checks are listed with each item above.

## Deploy targets

1. **Functions.** `functions/shared/stackDivisions.mjs` and `functions/shared/answerEquivalence.mjs` are the
   equivalence layer every field grader imports. Let `node scripts/release-firebase.mjs` (plan only) list the exact
   names. As in Push P, expect the grading functions:
   - `ingestStudentSubmissions`, `sweepStudentResponseCheckpoints`, `expediteCheckpointsOnSectionClose`;
   - the Recovery, Test Cycle, Live Challenge and secure-test graders (secure close and finalize);
   - `submitPathResponse`, `issueNextQuestion`, the CCMR assignment hydration callables;
   - `platformBuildInfo`.
2. **path-admin**: it vendors `functions/shared` (`scripts/sync-path-admin-runtime.mjs`); `release-firebase.mjs`
   handles it after functions.
3. **Hosting**, through the resilient wrapper. The browser runs the same graders, and every screen change above is
   client code. Deploy functions and Hosting back to back, outside class hours: a tab opened before the deploy
   still has the old editor choice, but the old editor only ever sent typed text the new grader also reads.
4. **No rules, no indexes, no migration, no bank refresh.** No Firestore collection or rule changed
   (`test:rules` passes unchanged).

## Decisions for the owner

1. **The grader change reaches every surface, not only secure tests.** A right answer written as a stacked π or root
   fraction (`\frac{\pi}{2}` for `pi/2`), or with a compound inequality written as an "and" word group, was marked
   wrong before and is right after. That could have happened on My Math Path or in an assignment's math editor.
   Whether to re-grade past attempts is the same call as D2 / H-93. Secure tests are not affected backwards: these
   fields were typed text there.
2. **An inequality's keypad letters come from the prompt** (at most four, `x` if the prompt names none). A key whose
   variable the prompt never writes in `$…$` has no letter key on a phone. I found no such secure item, but the
   bank was not swept for it. An alternative is a fixed letter row on every inequality.
3. **Read aloud and Translate on a Test's results follow the student's plan for a *test*.** A plan limited to
   practice gets neither on the results, though the test is over. The results are not gated on the SAT practice
   "accommodations confirmed" flag that gates the test itself.
4. **Vocabulary on a secure tool item includes the tool's own control words** (`TOOL_VOCABULARY`: interval,
   endpoint …) as well as the prompt's, as the engine tray always did. The secure field tray uses prompt words only.
   Definitions only, never examples.
5. **Corrections now receive the student's support profile.** Their own supports (the tray, a calculator
   accommodation) apply to correction questions, not only Read aloud on the worked solution. That is the plan's
   `corrections` role, which supports were always meant to follow; until now the profile was simply never passed.
6. **"Graphs are drawn in the question itself"** stays in `CalculatorPanel` for a graphing policy outside a secure
   exam. On a secure SAT/ACT item the panel is no longer drawn. W5-7 is bringing the graphing calculator to ordinary
   assignments and owns that panel and its label: the line should go, or name the graphing calculator, once theirs
   lands. W5-4 also edits `CalculatorPanel` (error text), so I left it alone.

## Outside my scope

- `src/MathInput.jsx`: one additive prop, `extraKeys`, merged after the profile's keys on both desktop and phone. No
  other behaviour changes. W5-2 (`claude/pass3-figure-descriptions`) edits other regions of the same file (roving
  toolbar); the diffs do not overlap.
- `src/QuestionEngine.jsx`: one additive prop, `calculatorInToolbar` (H-19).
- `src/components/student/supportTools/SupportToolsTray.jsx`: `showExamples` in the Vocabulary panel (H-16).
- `src/components/student/PathQuestionStimulus.jsx`: additive `headingLevel` (default 2; a nested panel's title is
  now one level deeper than its parent's, where it used to repeat `h2`).
- `src/SolutionReviewPanel.jsx`: `headingLevel` and `showIntro` (defaults unchanged).
- `src/platform/supports/SupportedText.jsx`: action buttons 44px.
- `src/components/student/TestCycleCorrections.jsx`, `TestCycleCard.jsx`,
  `src/components/assessment/StudentSecureExamDashboard.jsx`: the profile passed through. W4-2
  (`claude/pass3-test-cycle-dates`) edits `StudentSecureExamDashboard.jsx` elsewhere.
- `functions/shared/stackDivisions.mjs`, `functions/shared/answerEquivalence.mjs` (grading, above).
- `scripts/sweep-equivalence-verdicts.mjs`: two new spellings and a count. Read-only, as before.
- Drivers repaired where the base had drifted, so they run end to end again:
  - `tests/browser/secureResultsTestCycleStub.js`: five missing exports, which made the page a SyntaxError on the
    base;
  - `secureResults.mjs`: the card's heading is now `h1`, and Corrections ask a reflection first.

## Not done

- RUN-21 / H-11 ("1 of 1 try left" on a secure tool item): session B's.
- Expression and equation stay typed text (`SECURE_TEXT_PROFILE_REASONS`).
- `\frac{1}{2}\pi` against `pi/2` stays wrong: the stacked rule claims only a slash spelling. So does a decimal
  for an exact π answer.
- A key that uses π or a root **without** its metadata saying so: a phone gets the √ and π keys on a pair or an
  inequality (profile keys), but not on a number field.
- The first-load budget is over on the base too (see the gate); that is W5-1's lane.
