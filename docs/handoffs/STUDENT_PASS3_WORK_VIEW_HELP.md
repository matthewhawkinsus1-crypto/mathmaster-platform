# Student pass 3, session B6: Work View Help on a phone, and no method card on an assessment

Branch `claude/pass3-b6-work-view-help`, from `claude/modest-pasteur-xzagn7` at `6accda1`. IDs are the
[report](../qa/student-experience-pass-3.md)'s: TOOL-3 ([04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md),
line 171), R-10 and R-9 ([07-open-items-prs.md](../qa/student-experience-pass-3/07-open-items-prs.md) PR-6,
[06-open-items-qa-docs.md](../qa/student-experience-pass-3/06-open-items-qa-docs.md) Q-2).

Nothing here re-grades, writes to production or deploys. No Cloud Function, Firestore rule, index or stored shape
changes: browser code only.

## Reproduced first, on the base

Both items still reproduced at `6accda1` (the report was written at `25250b4`), in the real QuestionEngine at
390×844 on the Algebra II matrices lesson harness (`tests/browser/algebra2MatricesLesson.html`):

- **TOOL-3, practice (l3m-pr-6).** Enlarge → Help: the platform's "Show a hint" panel and Support tools, but no
  steps (the TaskCard is `display: none` while Work View is open, and the tool header is hidden on a phone).
  Batch 4 (HELP-10) had already made the platform ladder the Help for registry tools on practice, so the hint
  part was fixed; the steps were not.
- **TOOL-3, DOL (l3m-dol-3).** Enlarge → Help: only "Use the directions and controls in this workspace…" —
  RegisteredToolWorkView's generic sentence still replaced the platform's Help, so the Ask-only panel was gone.
- **TOOL-3, one more case found by the new driver.** Transformations Lab on *practice*: its own Help (the bridge)
  replaced the platform's Help, so Work View had neither "Show a hint" nor "Ask my teacher". Any tool that
  declares `help` itself (Transformations, Step Algebra solvers, Rewrite Linear Form, Linear Intercepts) did this.
- **R-10, DOL (l3m-dol-3).** The card read "How to do this (3 steps)", the third step being the singular-matrix
  rule ("…the system has no solution or infinitely many. Compare the rows to decide which.").

## What changed, item by item

### TOOL-3 — Work View Help reaches the steps, the hints and "Ask my teacher" (P1)

| What a student saw | What changed | Proof |
| --- | --- | --- |
| Phone, Work View, Help: no "How to do this" anywhere (TaskCard hidden, header with "About this tool" hidden). | `TaskCard` publishes what it shows — the tool's description, the directions sentence, the steps and the note — to the enclosing Work View as a new `directions` capability (`usePublishWorkViewCapabilities`). A `ToolShell` with no TaskCard publishes its "About this tool" description the same way. | browser `workViewHelpReach` (matrix practice: "Help shows the steps", "the steps come first"); `workViewHelpAndMethod` contract |
| On a DOL, Help said "Use the directions and controls in this workspace…" and "Ask my teacher" was gone. On practice, a tool that declares its own Help (Transformations Lab) replaced the hint ladder and Ask. | QuestionEngine's Help capability is `authoritative`. `mergeWorkViewCapabilities` never lets a tool's `help` replace an authoritative one: the tool's goes to `toolHelp`. RegisteredToolWorkView publishes no Help unless it holds the hint ladder itself (hints allowed, no platform ladder — the tools lab, a server-graded host); the generic sentence is gone. | `workViewCapabilities` ("an authoritative platform Help keeps its place…", "outside a question a tool Help is the Help"); browser `workViewHelpReach` (matrix DOL, transform practice) |
| — | The Help drawer (`EnlargeableFigure`) is three parts in order: `directions` (`data-work-view-directions`), the platform's Help, the tool's own (`data-work-view-tool-help`). Same on phone and desktop. | `workViewHelpAndMethod` ("directions, then the platform Help, then the tool's"); browser order checks |

On a DOL/quiz/test the platform's Help is the Ask-only panel it was already (or the "Hints are not part of this
activity" sentence where Ask is not wired); hints never appear there — the driver checks that no "Show a hint"
and no hint list are in the drawer.

### R-10 — no method card where outcome feedback and hints are withheld (P1, assessment integrity)

| What a student saw | What changed | Proof |
| --- | --- | --- |
| On an exit ticket every tool's "How to do this" card listed the method; Matrix Lab's DOL card stated the rule that separates "no solution" from "infinitely many". | New `useMethodWithheld()` in `ToolRuntimeContext`: true where the activity withholds hints (`hintsAllowed === false`: DOL, quiz, test, section recovery) or verdicts (`verdictsWithheld`). There the card is the authored prompt alone — no steps, note, directions sentence or tool description, in the card, its header fold, and what it publishes to Work View Help (review round, B3: fail-closed). One pure function, `taskCardSupport()`, decides for the card and for Work View Help. | `workViewHelpAndMethod` (rendered through Vite SSR: practice "(3 steps)", DOL no steps, verdicts-withheld alone no steps); browser `workViewHelpReach` (matrix DOL card and Help) |
| Steps that only say how to work the controls would have gone too. | `TaskCard stepsAreControls` keeps them: Graphing2, IntervalNumberLine, RelationMapping, OpenSortBoard, StepAlgebra2, ExpressionMeaning (each list read and judged controls-only). Every other tool's steps are treated as method (fail closed). | contract lists the six; browser `workViewHelpReach` graphing DOL ("How to do this (3 steps)" and "Click the grid to plot a point" in Help) |
| Transformations Lab on a DOL kept its "Transformation bridge" (the mapping rule) open beside the graph, in Work View Help, and its first method step as the Work View instruction banner. | Withheld with `useMethodWithheld()`: the bridge panel, the bridge in Help, and the instruction banner. | contract; browser `workViewHelpReach` transform DOL |

### R-9 — "Check" on the one graded submission (check only)

Session B's branch `claude/pass3-b5-submit-and-finish` (head `7c01c64`) fixes it under D9: `useSubmitLabel` /
`<SubmitText>` turn a standalone registry tool's final action into "Submit — your only try" on a DOL, including
Matrix Lab's `CheckRow` (`matrixLabUi.jsx`) and Transformations Lab's "Check graph"; the Work View rail is relabelled
the same way (`relabelToolPrimaryActions`). No label changed here.

## Review round 1 (integrator review of `5a3358b`)

| Finding | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| B1 | DOL, server-graded legacy balance solver: Help showed "Use inverse operations in reverse order…" under Ask. | QuestionEngine's authoritative Help carries `withholdsMethod` (hints off or verdicts held). Under it `mergeWorkViewCapabilities` drops a tool's own Help unless the tool marks it `controlsOnly` — only the step-by-step and multi-relation solvers' work history is. Fail closed: Rewrite Linear Form's, Linear Intercepts' and Step Algebra's method Help all go. | `workViewCapabilities` ("a tool Help is withheld…"); browser `workViewHelpReach` balance DOL / practice |
| B2 | Server-graded practice (My Math Path, Corrections): "Hints are not part of this activity" above the tool's own hints. | The sentence is the platform Help only where `toolHintsAllowed` is false. With hints on and nothing of its own (server-graded), the platform declares no Help and the tool's ladder is the Help. | `workViewHelpAndMethod` (B2 contract; the sentence occurs once in QuestionEngine); browser graphing server-graded practice |
| B3 | DOL: Parabola "every parabola point is equidistant…", Log "…positive-input domain", Matrix "X = A⁻¹B" in the subtitle and the task sentence. | **Fail-closed, chosen over rewording.** About 45 tool-written subtitles in 25 files, many naming the method ("Use the Factor Theorem", "swap x and y", "Set one variable to zero", "Use a conjugate"); rewording them is content work in files sessions D/E own and still leaves the next subtitle free to name the method. On an assessment the card is the authored prompt alone: no description (the tool's name in the header still orients), and the directions sentence only beside controls-only steps (`stepsAreControls` is the opt-in). Practice is unchanged. | SSR: DOL card under ToolShell has the prompt and no description, "How to do this" or step; controls-only keeps directions and steps but not the description; header contract; browser matrix-solve DOL (card and Help name no route) |
| S1 | Phone Help pushed "Show a hint" / "Ask my teacher" below the drawer's first screen. | The directions arrive folded (`<details>`, "How to do this (n steps)"); "About this tool" too. | browser: each checked on the drawer's first screen without scrolling (matrix and transform practice, graphing DOL Ask, server-graded tool hint) |
| S2 | Secure Data Modeling lists and the systems inequality build's process-only steps were hidden. | `stepsAreControls={!teachingNotes && Boolean(SECURE_MODE_STEPS[mode])}`; Systems `stepsAreControls={taskKey === 'inequalitiesConstruct'}`. | contracts in `workViewHelpAndMethod`, `secureRichToolRuntimeWiring` |
| S3 | Note gate, hints-off-with-verdicts-shown, and what the card publishes had no behavioural pin. | SSR cases for each; the publication renders `TaskCardDirections` from the same `taskCardSupport()` object. | `workViewHelpAndMethod` |
| N1 | Composed question: two stages' TaskCards, only one's directions in Help. | `directions` from several publishers are concatenated in publisher order. | `workViewCapabilities` ("two stages' directions…") |
| N2 | Graphing2 DOL note "…snap to the nearest 0.5" (computed from the answer line). | Where the method is withheld: "Points snap to the grid as you place them." The anchor note is a grading requirement and stays. | contract; browser graphing DOL |
| N3 | Control steps named a "Check" button session B renames to "Submit — …". | StepAlgebra2: "When x is by itself, submit your solution."; OpenSortBoard: "When every card is placed, submit your sort." / "Submit your sort when it is finished. …" | — (wording) |
| N4 | The drawer's three parts had no labels. | Each is a `role="group"` with a label: "How to do this", "Hints and help", "This tool's help". | — |

Review-round mutations (each made once, seen red, restored): tool Help not withheld; `controlsOnly` ignored;
the no-hints sentence for any null Help; description kept; directions kept; header subtitle on a DOL; note kept;
hints-off ignored; publication ignores the decision; directions replaced instead of merged; Data Modeling and
Systems flags removed; work history not `controlsOnly`; snap note exact — 14 red in the node suite. The Systems flag was first green (its contract only allowed the prop), then pinned and seen red. In the
browser driver: directions unfolded in the drawer, the B2 sentence restored, tool method Help on a DOL — 3 of 3 red.

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

| Test | Protected behaviour | Old pin | New assertion |
| --- | --- | --- | --- |
| `toolShellChrome` (4 tests), `toolOpensReadyForInput` | Steps fold, start folded, are counted in the summary; description is the fold's first line; directions are inside the fold; the fold is keyed by its text | the fold's JSX inline in `TaskCard`, `steps.length`, `contentKey([taskText, ...steps, …])` | the fold renders `<TaskSupport …>`; order description → directions → steps asserted inside `TaskSupport`; the count and key use the steps the card shows (`shownSteps`) |
| `learnFromTheMistakeHints` ("copies step aside…"), `toolHintPolicy` ("Work View Help drawer stops printing…") | One ladder per question; authored hints only through the recorded HintPanel, only where hints are allowed | `useToolHintPublisher` + `platformLadder` filter; `useHintsAllowed` | `useOwnHintLadder` gate before the early return; Help declared only when `helpText` exists |
| `workViewCapabilities` (registry) | The capability registry | frozen list | `directions`, `toolHelp` added, with a comment |
| `secureRichToolRuntimeWiring` (Data Modeling), `systemsDay1Journey361` (3×3 directions) | The card shows the secure / this-task steps | the `<TaskCard …>` tag spelled without the new prop | the same tag with `stepsAreControls` allowed; Data Modeling's flag expression asserted |
| `toolPolicyGates` (browser) | A DOL bridge's Work View Help has directions and no authored hint | RegisteredToolWorkView's generic sentence | the TaskCard's directions and the platform Help (round 1); re-checked after B3 — see gate |

Mutation checks (each made once, seen red, restored): method always shown; `verdictsWithheld` ignored;
`stepsAreControls` ignored; tool Help replaces the platform's; drawer loses the platform part; Help not
authoritative; withheld steps published to Work View; bridge ungated; wrapper Help always declared; `toolHelp`
dropped; Graphing2 loses `stepsAreControls` — 11 of 11 red. The new browser driver run against the base source
(`git stash -- src`) fails 14 checks.

## Gate

Round 2, after the review fixes (head of this branch). One driver at a time; same servers as round 1.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,439 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail (1,644 tests) |
| `npm run lint` | exit 0; no warning in a touched file |
| `npm run build` / `npm run build:firebase` | both exit 0; no tracked file rewritten |
| `workViewHelpReach` (390×844) | 42 checks pass; the three browser mutations above each red |
| `toolPolicyGates` | 50 pass after one more rewrite: B3 removed the tool's directions from a DOL drawer, so the check now asserts the platform Help is there and none of the tool's directions or description (red with directions/description restored) |
| Student runtime gates (the other 22, as in round 1, incl. phoneToolPanelReach, assessmentLeakGates, studentUxPlatform, algebraicSubstitutionHandoff) | all pass |
| `workViewMatrix`, `workViewCertification` | pass |
| teacherWorkflow `journeys`, `appUrlJourneys` (5188) | pass |

Round 1, at `5a3358b`. Run on this branch, one driver at a time (plain `npx vite --host 127.0.0.1 --port 5199 --strictPort`,
`AUDIT_ORIGIN=http://127.0.0.1:5199`; teacherWorkflow harness on 5188).

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,434 pass, 0 fail (functions and path-admin deps installed with `npm ci`) |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail (1,644 tests) |
| `npm run lint` | exit 0; no warning in a touched file |
| `npm run build` / `npm run build:firebase` | both exit 0; `git status` unchanged by the Firebase build |
| New `workViewHelpReach` (390×844) | 30 checks pass; against the base source 14 fail |
| `toolPolicyGates` | pass (50 checks) after one assertion rewritten: it looked for the removed generic Help sentence; it now asserts the TaskCard's directions and the platform Help are in the DOL drawer and the authored hint is not |
| Student runtime gates: mathEntryContract, renderStability, errorRecovery, duplicateTabs, graphPointCheck, phoneToolPanelReach, undoTyping, composedOutcomePolicy, relationPlotGrading, toolAttemptOutcome, assessmentLeakGates, systemsWorkspaceStudio, clickMapLetterbox, stagedQuestion, unansweredChoiceGates, graphKeyboardRoute, composedDraftRestore, draftEditTime, fractionTemplateGrading, mathFontsProduction | all pass |
| `workViewMatrix` (no `--write`) | pass: 480 screenshots, every Stage 3A family keeps controls, state and Undo |
| `workViewCertification` | pass: Stage 4 certified 24 tools on 8 devices |
| `studentUxPlatform`, `algebraicSubstitutionHandoff` | pass |
| teacherWorkflow `journeys`, `appUrlJourneys` (5188) | pass (24 journeys; 12 App URL journeys incl. 390×844) |

`workViewMatrix` and `workViewCertification` launch Playwright's default browser, so they were run with
`PLAYWRIGHT_MODULE=/opt/node22/lib/node_modules/playwright/index.mjs` (the container's browsers match that
version, not the `playwright@1.55.0` the workflow installs). CI installs its own browser and needs no change.
No CSS was added, so no hint-ladder word reaches inlined CSS.

## Deploy targets

Hosting only (browser code). No functions, rules or indexes.

## Decisions for the owner

1. **Which steps are "method".** Steps default to method and are withheld on a DOL/quiz/test; six tools are
   marked controls-only. Mixed lists (Linear Table Workbench, Rewrite Linear Form, Linear Intercepts, Constraint
   Function Builder) lose their control lines too on an assessment. Splitting those lists into control and method
   steps is content work, not done here.
2. **Descriptions and directions sentences are withheld on assessments (fail-closed; review B3).** The reviewer
   judged "X = A⁻¹B" on DOL 2 to name the route the item measures. Rather than reword ~45 subtitles in other
   sessions' files, the card on a DOL/quiz/test is the authored prompt alone; the directions sentence stays only
   beside controls-only steps. Rewording the subtitles so practice reads method-free too remains open content
   work if the owner wants it.
3. **Transformations Lab's bridge counts as method** and is withheld on assessments. Other tools' reference
   panels (none found that state a rule beside the workspace) were not changed.
4. **Desktop Work View** (practice) shows "About this tool" in the tool header and the description again, folded,
   at the top of Help. Left as is; dropping one is a one-line CSS change.
5. **Mixed step lists on assessments.** Data Modeling modes with no secure list (the regression modes) now show
   no steps on a test; their teaching steps were judged method. Writing secure lists for them is content work.

## Touched outside scope

- `src/QuestionEngine.jsx` (sessions A, B, D): one block before `barContinueAction` (`workViewPlatformHelp`) and
  the `help:` line of the Work View capabilities.
- `src/StepByStepAlgebra.jsx`, `src/MultiRelationAlgebra.jsx`: `controlsOnly: true` on the work-history Help.
- `src/components/common/EnlargeableFigure.jsx` (session B): the `help` line becomes the three-part drawer; two
  names added to the capability-label filter. Session B edits the `registeredCapabilities` line a few lines above;
  expect a clean or trivial merge.
- `src/tools/shared/ToolRuntimeContext.jsx` (session B adds `submitCost`): one new hook at the end of the file.
- Tool files (sessions D, E): one `stepsAreControls` line each in Graphing2, IntervalNumberLine, RelationMapping,
  OpenSortBoard, StepAlgebra2, ExpressionMeaning; the same prop in DataModelingLab and SystemsWorkspace;
  TransformationsLab: import, one hook call, three gates; Graphing2: the snap note; StepAlgebra2 and OpenSortBoard:
  step wording (N3).
- `.github/workflows/student-runtime-browser-gates.yml`: the new driver, its path trigger and comment line.

## Not done

- Other tools that put a method step in their Work View `instruction` banner were not audited (Transformations
  was the one found).
- Mixed step lists were not split (decision 1).
- Tool subtitles were not reworded (decision 2); practice still shows them.
