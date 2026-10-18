# Student pass 3, wave 5 (W5-2): figures that say what they show, a one-stop keypad, the reference in Work View, the VPAT

Branch `claude/pass3-figure-descriptions`, cut from `claude/modest-pasteur-xzagn7` at `e822504`. The base was merged
again at `cbeff6a`, cleanly; its CoordinatePlane tick change does not touch these descriptions, which come from data,
not from tick text.

At the integrator's request (TOOL-12 builds on its drawer), W4-1 `claude/pass3-b6-work-view-help` @ `016c2ea` was
merged in as `f5b6146`. Its two conflicts were resolved exactly as the integration resolved them:

- the Regression Calculator TaskCard took the integration's `stepsAreControls` steps;
- `toolPolicyGates.mjs` took W4-1's `/Enlarge question|Open Work View/` opener.

Nothing here deploys, writes to a production project or re-grades. Student words follow D9.

Plan and evidence: [student-experience-pass-3.md](../qa/student-experience-pass-3.md), item IDs as in
[04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md), Q-8 in 06, PR-27 in 07.
Each item was first reproduced on the base (in Chromium where it is visual).

| Commit | What |
| --- | --- |
| `9efa55e` | Q-8 figure descriptions; PR-27 keypad toolbar |
| `0c72e3a` | A11Y-10, A11Y-11, A11Y-12 |
| `f5b6146` | merge W4-1 |
| `b18d8e5` | TOOL-12 Reference drawer |
| `2161b8e` | A11Y-9 VPAT; the new drivers in CI |
| `a177aee` | the two keyboard drivers read the figure's description |
| `634a551` | merge of the base at `cbeff6a` (clean) |

## Per item: what a student saw, what changed, the proof

### 1. Q-8 (P1, VPAT 1.1.1): figures outside the shared coordinate plane

**Saw (reproduced on `e822504`, Chromium accessibility tree):**

| Figure | Named | Described |
| --- | --- | --- |
| Interval number line | "Number line from −7.5 to 10. Click anywhere on the line to place an endpoint, or drag…" | nothing about what is drawn |
| 3D three-plane model | "Three planes in 3D. Drag or use the arrow keys to rotate." (its drawing: "…Drag to rotate.") | its key commands only |
| Static question graph (GraphDisplay, used by most question types) | "Question graph" | nothing |
| Legacy graph workspace | its key commands | nothing; the student's points were never read back |
| Graph Story sketch | "Blank coordinate plane for graph story" | even after drawing |
| Legacy pick-a-point line | — | showed the choice by colour alone |
| Data Modeling scatter and residual plots | "Coordinate plane" | — |
| Regression source plot | "Source scatterplot; coordinates are intentionally not revealed" | — |

**Not a gap.** The inventory found no separate box-plot, dot-plot, histogram or bar-chart renderer anywhere in `src`.
Every statistics chart a student meets (Data Modeling, the Regression Calculator) is drawn on the shared
CoordinatePlane, which already describes itself. Displayed matrices already carry a screen-reader table
(`MatrixGrid.jsx`).

**Changed.** Each figure is now named by what it is and described by what it shows. For a control, the keys follow
the description in `aria-describedby`.

- **Interval number line** (`src/platform/language/numberLineDescription.js`, `IntervalNumberLine.jsx`):
  - Example: "Number line from −8 to 8, labelled every 2. Your graph: Shaded from a closed dot at −3 to an open dot at 5."
  - It covers the parts, rays ("…to the right, ending in an arrow") and a waiting first endpoint.
  - **Never notation.** On an item that asks for the interval notation or the inequality, that is the answer. The
    tool's visible line keeps the same rule.
- **Legacy pick-a-point line** (`src/NumberLine.jsx`): a group named "Number line" and described as "Number line with
  points at −10, −5, 0, 5 and 10. Selected: 5." Each mark is `aria-pressed`.
- **3D model** (`src/tools/systemsWorkspace/threePlaneDescription.js`):
  - Example: "3D model with the x, y and z axes. Plane 1, blue: x plus y plus z equals 6. Plane 2, red: …, hidden. …
    Dashed lines mark where shown planes cross."
  - While the question is open it names no pair of planes and classifies nothing. That is the #361 and #392 caption
    rule: which planes cross, are parallel or coincide is the student's answer.
  - A point is read only when the model marks one ("Marked on the model: the point 1, 2, 3"). It marks one only where
    `threePlaneRevealAvailable` allows, so never on a DOL, quiz or test.
  - A closed question names each pair.
- **Static question graph** (`src/GraphDisplay.jsx`): the shared plane's `describeCoordinatePlane`, built from the same
  data the graph draws. It follows the same rule:
  - while the question is open, the kinds of marks only, ending "Positions are not read out while this question can be
    answered";
  - once closed, positions read at the grid it draws;
  - an authored `graph.accessibleDescription` always wins.
- **Legacy graph workspace** (`src/platform/language/graphWorkspaceDescription.js`, `InteractiveGraphWorkspace.jsx`):
  - It reads back the student's own work: "You placed 1 point: Plot the point where x = 0 at (0, 1)", strokes, graph
    ends and selections.
  - A given graph is only "A graph is drawn. Positions on it are not read out while this question can be answered."
- **Graph Story sketch**: its axes as the student named them and "You drew 1 stroke".
- **Charts named:**
  - Data Modeling: "Scatter plot of the data and your model", "Residual plot".
  - Regression: "Source scatterplot". The policy sentence left its name; the plane's own description already says
    positions are withheld.
- **Every description follows the student's changes:** each is computed from live state on every render.

**Proof.**

- `tests/platform/figureDescriptions.test.mjs`, 10 tests: the three pure modules, including the no-notation and
  fail-closed classification rules, and each figure's wiring.
- `tests/browser/figureDescriptions.mjs` reads `name` and `description` from CDP `Accessibility.getPartialAXTree` at
  1366×768 and 390×844 through the real QuestionEngine (`figureDescriptionsMain.jsx`), then changes each figure once:
  - places endpoints by keyboard;
  - picks a mark;
  - hides plane 2, and reveals the point on practice;
  - places a point;
  - draws a stroke.
- On a DOL the reveal is absent and the text never matches `Marked|planes \d and \d|parallel|share|one point|…`.
- **Mutation:**
  - Dropping `pending`, forcing `detail: 'features'` (3D and GraphDisplay), removing `aria-pressed`, emptying the
    placed points, zeroing the stroke count, `givenGraph: false`, or appending `[a, b)` to a piece each turned its
    browser step red. Restored.
  - The node assertions were mutated the same way (6 mutations, all red).

### 2. PR-27 (#383 R7, #386 item 3; P2): MathInput's keypad is one Tab stop

**Saw.** Every key was a plain button in the Tab order. A keyboard student pressed Tab once per key to get past a field:
12 keys at 1366×768, and 28 at 390×844 across "Keys needed for this answer" and "Math tools".

**Changed.**

- New `src/platform/interaction/rovingToolbar.js` (`useRovingToolbar`, `rovingTargetIndex`). Both keypads are
  `role="toolbar"` with a roving tabindex:
  - arrows move between keys, wrapping (Up and Down too, since the keypad is drawn as a grid);
  - Home and End jump to the first and last key;
  - Tab leaves, and the key last used is the one Tab returns to.
- Every key keeps its `aria-label`.
- A key still types through `insert()`, which focuses the field (mathFieldFocusHandoff unchanged).

**Proof.**

- `tests/platform/mathKeypadToolbar.test.mjs`.
- `tests/browser/mathKeypadToolbar.mjs` at both viewports checks:
  - the toolbars and every named key in `ariaSnapshot`;
  - one tab stop per keypad on a real Tab walk;
  - arrow wrap, Home, End and return to the last key;
  - Enter on an Insert key typing into the field, with focus back in the field.
- **Mutation:** `tabIndex: 0` on every key gave "30 !== 2"; removing the `.focus()` failed the arrow step; End mapped to
  0 and the dropped toolbar `onKeyDown` were red in node.

### 3. TOOL-12 (P2): the reference card in Work View

**Saw (reproduced on the base and on W4-1).** "Information you need" lives in the task card (`taskContextPanel`), which
Work View hides. Opening Work View on a question with a reference card left only Task, Help and Support tools; the
numbers the question gives were gone.

**Changed, on W4-1's capability drawer** (`workViewCapabilities.js`, `EnlargeableFigure.jsx`):

- A `reference` capability the platform owns:
  - a tool below cannot replace it;
  - W4-1's method-withholding merge leaves it alone, because it is the question, not help.
- QuestionEngine publishes the same `ReferenceInfoCard` whenever `referenceInfo` exists, on every activity. W4-1's
  `workViewPlatformHelp` block and B's `barContinueAction` were not touched.
- The shell shows a "Reference" header button (`aria-expanded`) and a drawer "Reference" holding the group
  "Information you need".
- On a phone it opens inside the Task drawer, after the task, as the same labelled group. That follows the "Support
  tools inside Help" precedent: a fourth header button squeezed the task text.
- The card renders only while enlarged, so the page never holds two copies.

**Proof.**

- `tests/platform/workViewReference.test.mjs`: merge rules, an SSR render of the enlarged shell, the phone placement.
- `tests/browser/workViewReference.mjs` reads the group from the accessibility tree at both viewports, on practice and
  on a DOL. It covers both an authored and a scenario reference, and a question with no reference getting neither.
  Screenshots were checked by eye.
- **Mutation:**
  - `reference: null` in QuestionEngine gave 6 browser failures.
  - Platform-loses-to-tool, the emptied drawer and the dropped capability key were red in node.
- `workViewCapabilities.test.mjs`'s frozen capability list gains `'reference'`, with a comment.

### 4. A11Y-9 (P2): the VPAT

`docs/accessibility/VPAT_2.5_WCAG_MathMaster.md` was rewritten row by row. Sources:

- section 3 of 04;
- the "Not done" lists of `STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md`, `STUDENT_PASS3_TOOLS_KEYBOARD_UNDO.md` and
  `STUDENT_PASS3_READ_ALOUD_TRANSLATE.md`;
- jobs H and N;
- this branch.

Every claim cites a test, driver or file. A script checked that every cited path exists. Defects read in code but not
measured say "found in source".

The top of the report says plainly that **no screen reader has been used** (NVDA, JAWS, VoiceOver, ChromeVox), only
automated checks and the Chromium accessibility tree. A new section lists the 11 things a human pass must cover.

**Rows corrected:**

| Row | Change |
| --- | --- |
| 1.4.3 | the undecided nodes are decided |
| 1.4.4 | now **Supports**: the px sweep and its ratchet |
| 1.4.12 | measured now (Partially Supports; it said "Not Evaluated") |
| 2.1.1 | the four keyboard gaps are fixed |
| 2.4.3 | the two dialogs and the self-disabling controls are fixed |
| 2.2.2 | the "17 stylesheets" count is dropped: it could not be reproduced |
| 4.1.3 | no longer "worse than stated" |
| 3.2.4 | the two Undos and the two hint ladders are fixed |

**Still Partially Supports, with file:line:**

- radio groups without arrow keys;
- role-less labels;
- Relation Mapping's unthemed plot;
- MultiAnswerGrader's colour-only marks;
- Matrix Lab's silent "Reconsider" list;
- the pointer-only Graph Story sketch;
- the inert closed question (below).

### 5. A11Y-10 / A11Y-11 / A11Y-12 (P3)

- **A11Y-10 (reproduced at 390×844).** Beside Submit (and below 385 px) the bar shows ↶ and ↺, two near-identical
  arrows. Undo and Reset now keep their word as a 10 px caption under the icon (`mathmaster-action-label--kept`,
  `MathToolMobileLayout.css`). The other tools stay icon-only; accessible names are unchanged.
  - **Proof:** a 390×844 step in `figureDescriptions.mjs` (only "Undo" and "Reset" visible, both names intact; removing
    Reset's class turned it red) and `studentA11yPolish.test.mjs`.
  - Two `studentWorkspaceVisibility` contracts pinned the label span's exact class. Per the playbook they now accept an
    added class and still require the span; dropping the span turns them red.
- **A11Y-11, motion:**
  - `motionPreference.js` `scrollMotion()`; the four scrolls the report named (hint panel; systems solver ×3) jump
    under reduced motion.
  - The Scratchpad's slide-up is off under reduced motion.
- **A11Y-11, targets:** the inline 32–38 px targets the report named are 44 px:
  - Linear Table evidence Edit and Remove;
  - Open Sort's placed cards;
  - Relation Mapping's point, Clear plot and arrow buttons;
  - Scratchpad Pen, Eraser, Clear All and the ink swatches.
- **A11Y-12:** Relation Mapping and Graphing 2 say "choose" or "plot" and name the keyboard route. The one changed
  feedback sentence that Translate covers ("No arrows drawn yet. Choose a value on the left, …") has its Spanish in
  `esSupport.js` (`toolChecks`); `translateWithPack` gives full coverage.
- **Proof:** `tests/platform/studentA11yPolish.test.mjs`, 4 tests. 5 mutations (a smooth scroll, a 36 px card, "Click a
  value", the dropped Spanish group, the unconditional slide) are all red.

## Gate

Run on `634a551`: this branch, with W4-1 merged and the base moved to `cbeff6a` (the merge was clean). Browser
drivers ran one at a time.

Servers, as the workflows start them, each with its Vite `cacheDir` in the scratchpad (outside the repo):
- **Plain:** `vite --host 127.0.0.1 --port 5199 --strictPort`.
- **Accessibility:** the emulator config on 5199, plus the accessibility app harness on 5188.

| Check | Result |
| --- | --- |
| `npm run test:platform` | **11,638 pass, 0 fail** |
| `node --test tests/tools/*.test.mjs` | **1,670 pass, 0 fail** |
| `npm run test:authoring-v5` | **686 pass, 0 fail** |
| `npm run lint` | **exit 0**; no new warnings in changed files |
| `npm run build`, `npm run build:firebase` | **exit 0**; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | studentHome **1048.8 KB** (signIn 291.5 KB): **over** its 1023.4 KB baseline, as the base already is (`e822504`: 1048.6 KB, same check). The +0.2 KB is mine. Baseline not edited. |
| Emulator suites (`test:rules`, `test:*:emulator`) | **Not run: nothing they cover changed.** No `functions/`, rules, indexes or Firestore paths in the diff. |
| **New:** `figureDescriptions.mjs`, `mathKeypadToolbar.mjs`, `workViewReference.mjs` | **pass** at 1366×768 and 390×844, before and after the base merge |
| `npm run certify:accessibility` | **pass**: 11 screens × 2 viewports, axe 4.11.4, no new or increased violations |
| `npm run review:contrast` | **pass**: 134 undecided nodes in 31 families, 0 fail, 28 decorative |
| `studentShellLargeText.mjs --check=targets,s5` and `--check=text` | **pass** (200% text, 320 px reflow, text spacing; 0 clipped, 0 off screen, 0 unscaled) |
| `mathSpeech`, `graphDescription`, `accessiblePrimitives`, `calculatorKeyboard`, `hostAccessibility`, `studentAccessibleNames` | **pass** (`graphDescription` re-run after the base merge) |
| `toolKeyboardRelationMapping`, `toolKeyboardRegression`, `toolKeyboardDataModelingAndSystemsCss` | **pass** |
| `toolKeyboardNumberLine`, `toolKeyboardThreePlane` | **pass after rewrite** (`a177aee`). They asserted the keys were in the figure's *name*; Q-8 moved them to the description, after what it shows. Both now read every `aria-describedby` id. Dropping the content description turns each red. |
| `keyboardSweep.mjs` (audit) | 33 scenes: every one `end=y rev=y`, 0 missing focus rings, 0 unnamed, 0 mouse-only, 0 Escape failures, `lostAfterAction=0/4` |
| Student runtime gates: `assessmentLeakGates`, `clickMapLetterbox`, `composedDraftRestore`, `composedOutcomePolicy`, `draftEditTime`, `duplicateTabs`, `errorRecovery`, `focusSafeToolControls`, `fractionTemplateGrading`, `graphKeyboardRoute`, `graphPointCheck`, `mathEntryContract`, `phoneToolPanelReach`, `planePhoneReach`, `relationPlotGrading`, `renderStability`, `stagedQuestion`, `systemsWorkspaceStudio`, `toolAttemptOutcome`, `toolPolicyGates`, `unansweredChoiceGates`, `undoTyping`, `workViewHelpReach` | **pass** (`planePhoneReach` re-run after the base merge) |
| `toolFocusAndUndo.mjs` | **2 failures, not this branch's** (see below) |
| Also covering these files: `day2NonuniqueJourneys`, `readAloudTranslate`, `secureAccessParity`, `studentUxPlatform`, `assignmentMobile`, `workBarPrimaryLabel`, `closedVerdictChip`, `unchangedConfirmWorkView` | **pass** |
| `teacherWorkflow/journeys.mjs`, `studentScreenChange.mjs`, `restoredDraftFocusRaceJourneys.mjs` (5188) | **pass** (24 journeys at 1440 and 1024) |
| Mutation checks | Every new or rewritten assertion was broken once and seen red, then restored (per item above). |

**The `toolFocusAndUndo` failures come from W4-1 meeting the base, not from this branch.**

- **What fails.** "regressionCalculator how-to and zoom (desktop / phone): the how-to has its steps".
- **Same on the merge alone.** It fails the same way on `f5b6146`: the base plus W4-1, before any TOOL-12 code. W4-1
  itself was cut before this driver existed.
- **Cause.** The driver checks `getByText('How to do this (3 steps)').count() === 1`. W4-1 now also renders the
  TaskCard's directions, with the same summary, inside Work View's **closed** Help drawer. The page has two copies:
  the visible card and a hidden one.
- **Suggested fix**, for whoever owns the integration of W4-1:
  `page.locator('summary', { hasText: 'How to do this (3 steps)' }).filter({ visible: true })`, or scope the check to
  the tool shell. Not changed here.

### After the wave-4 base (`c350dfc`), merged as `d143e23b`

The integrator's scratch merge had found these two conflicts; I resolved them as the integrator described:

- **`src/MathInput.jsx`:** both imports are kept. B's question-lifecycle gate (`toolsVisible = !questionTerminal && …`,
  `requiredKeysVisible = !questionTerminal && …`) stands, and the two roving toolbars render inside it, so a closed
  question's keypad still closes.
- **`student-runtime-browser-gates.yml`:** both sides' steps are kept (`moduleRecoveryLock`, `closedQuestionEnter`;
  `figureDescriptions`, `mathKeypadToolbar`, `workViewReference`).

Re-run on `d143e23b`:

| Check | Result |
| --- | --- |
| `npm run test:platform` | **11,694 pass, 0 fail** |
| `node --test tests/tools/*.test.mjs` | **1,681 pass, 0 fail** |
| `npm run test:authoring-v5` | **686 pass, 0 fail** |
| `npm run lint`, `npm run build`, `npm run build:firebase` | **exit 0**; no tracked file rewritten |
| `node scripts/check-first-load-budget.mjs` | studentHome **845.5 KB**, within budget (W5-1 took mathjs out of Home) |
| `mathKeypadToolbar`, `mathEntryContract`, `closedQuestionEnter`, `undoTyping`, `toolKeyboardNumberLine`, `toolKeyboardThreePlane`, `figureDescriptions`, `workViewReference`, `moduleRecoveryLock`, `secureAccessParity`, `studentUxPlatform` | **pass** |
| `toolFocusAndUndo` | **pass**: the base's `282006b` counts the visible how-to, which fixes the failure above |
| `keyboardSweep` | 33 scenes, all clean |

## Review fixes (reviewer session_01EG79ziTX1TqEwp7k6XxNpY, on the branch as it lands on `c350dfc`)

The reviewer found everything else clean, probed on real DOL items:

- open-question descriptions;
- the 3D model withholding pairs;
- the Reference card (scenario text only; 9 of 4,351 items);
- the keypad toolbar with B's terminal gate;
- every changed locator.

| Finding | Fix | Proof |
| --- | --- | --- |
| **B1 (blocker).** An axis-scale item hides its tick numbers until the student gives the step (`axisDisplay.showX/YTickLabels: false`; AxisSetupStage `requireScale`, RelationshipModel `hideGraphScale`). GraphDisplay's description still began "x from 0 to 50, y from 0 to 200". With the drawn gridlines that is the graded step. | `describeCoordinatePlane` takes `axisNumbersHidden: { x, y }`. A hidden axis's range is left out ("The axis numbers are not shown." / "The y-axis numbers are not shown."). With either axis hidden, the whole reading stays `'kinds'`, closed question or not, since positions would be in tick units the student never saw. GraphDisplay passes `{ x: !showXTickLabels, y: !showYTickLabels }`. | `figureDescriptions.test.mjs` "B1": an SSR of the real GraphDisplay with the reviewer's shape, open, locked and finished. No window end, step or position; one hidden axis keeps the other's range. Mutation: not passing the option, or not forcing kinds, turns it red. |
| **S1.** Positions were read whenever the question was `terminal`, which includes an ended DOL (reopenable), a waiting Warm-Up and a locked section, none of which shows a solution. | `QuestionLifecycleProvider` gains `positionsReadable`, false unless the host says so. QuestionEngine passes `Boolean(showOutcomeFeedback && (isCorrect \|\| isExpired))`. GraphDisplay, ThreePlaneWorkspace **and CoordinatePlane** (the same rule, the same leak) read it instead of `terminal`. `terminal` is unchanged for B's keypad gate. | `figureDescriptions.test.mjs` "S1": SSR, terminal → kinds, finished and shown → positions, plus the engine's expression. `figureDescriptions.mjs`: an ended DOL (`?locked=1`, role dol) reads no positions; correct practice reads them. Mutation: `positionsReadable={locked}` turns the node test and both viewports red. Two contracts follow the prop (`graphDescription.test.mjs`, `workViewTerminalLifecycle.test.mjs`); the latter now matches each provider's `terminal` value, and is mutation-checked. |
| **S2.** Every arrowhead on a closed static graph read "pointing right": `requirement.vector` was dropped. | The vector is kept in the map. | `figureDescriptions.test.mjs` "S2": "pointing down and left" and "pointing up and right". Mutation red. |
| **S3.** VPAT accuracy. | The axe scope says 11 screens (as certify prints). The ✓/✗ cite is `QuestionEngine.jsx:2783`. The 4.1.3 Matrix Lab line says W5-3 (`4d3e5ee`) passes the "Reconsider" lines to `AttemptOutcome`'s `role="status"` coaching, to re-check once it is in the base. 1.1.1 states the positions rule and the hidden-axis rule. | — |
| **N3.** `reference: base.reference \|\| local.reference` would let a tool publish its own text (a method) as "Information you need", which nothing withholds on an assessment. | Only a reference marked `authoritative` (QuestionEngine's) survives a merge; any other is dropped. This is the same convention as `task` and `help`. A plain `base.reference` would have dropped QuestionEngine's own reference too, because the engine is the top provider. | `workViewReference.test.mjs`: a tool's reference is dropped beside the platform's, alone, and through the port. Mutation red. |

### Review round 2 (re-review of `ff77434`: B1, S2, S3 and N3 confirmed)

| Finding | Fix | Proof |
| --- | --- | --- |
| **B2 (blocker).** The S1 comment sat in JSX children (`// Positions in figure descriptions…`) and rendered as visible text above every question. Lint, build, tests and drivers all passed with it. | The comment moved above `return (`. `react/jsx-no-comment-textnodes` is now an error in `.oxlintrc.json`. On the old code it flags exactly that place; `npm run lint` exits 0 with the rule on. | `figureDescriptions.mjs` asserts that no line of `document.body.innerText` is `//` comment text. Reinserting the comment turns both viewports red. |
| **S1'.** On a DOL, `showOutcomeFeedback` is true as soon as the item closes, before the assignment's release. Positions were read on a closed DOL item with no worked solution shown, and a teacher's extra try reopens it. | `positionsReadable = Boolean((isCorrect \|\| isExpired) && feedbackOpen)`: the `closedReview` gate exactly, so positions are read when the worked solution shows. | Node: the engine's expression, the shared gate, and `feedbackOpenForItem` (closed DOL before release → false, after → true, correct practice → true). Browser: a closed DOL item before release reads none, and after release reads them. Mutation to the old expression turns node and browser red. |
| **S4.** Review My Work shows the released solution, but its "Correct graph" said positions were withheld "while this question can be answered". | `ReviewMyWork` wraps the `SolutionReviewPanel` only in `<QuestionLifecycleProvider terminal positionsReadable>`; the "Try one like this" practice stays live. | Node contract, mutation-checked. The `reviewMyWork.mjs` harness has no graph question, so the browser proof is the contract plus the GraphDisplay SSR cases. |
| **For W5-5:** tiny bisected edge-arrow vectors read "pointing right". | `arrowDirection` treats only an exactly-zero vector as missing. | SSR case with `[−4.6e-14, −1.8e-13]` reads "pointing down". Mutation red. |
| **For W5-5:** an equal-unit window was read as "y from −6.374046". | `describeCoordinatePlane` takes `windowSteps`. GraphDisplay passes its tick steps. An end already at the step's precision is read exactly (−5 on a step-2 axis); otherwise "about" one decimal finer ("about −6.4"). | SSR cases for both. Mutation red. |
| **Optional:** "while this question can be answered" was untrue on a closed question with no review. | `positionsWithheldText`: GraphDisplay says "Positions are not read out on this question." when terminal. | SSR and browser (ended DOL, unreleased DOL item). Mutation red. |
| **Optional:** only QuestionEngine sets `authoritative` on `reference`. | A contract scans `src` for any `reference:` line with `authoritative: true`. | Adding one elsewhere turns it red. |

Gate after round 2:
- `test:platform` 11,700/0; tools 1,681/0.
- lint, build and build:firebase exit 0, with no tracked file rewritten.
- studentHome 845.5 KB.
- `figureDescriptions`, `graphDescription`, `workViewReference`, `assessmentLeakGates`, `reviewMyWork` and `mathSpeech` pass.

## Deploy targets

**Hosting only.** Nothing under `functions/`, `firestore.rules`, `firestore.indexes.json` or Firebase config changes;
only `src/**`, `tests/**`, `docs/**` and one workflow. Ship with the wave through
`node scripts/release-firebase.mjs --execute` or `npm run deploy:hosting`, never a raw `firebase deploy --only hosting`.
No functions, no rules, no indexes.

## Decisions for the owner

1. **A given figure is described as the shared plane already describes one.** While a question can be answered, the
   description names the kinds of marks, never their positions; after it closes, the full reading. This keeps the
   platform's existing rule (`graphDescription.js`) instead of reading a given graph's points on an open DOL.
   - The brief said "a given figure's description is part of the question", which could be read as permitting
     positions.
   - If the owner wants given figures read in full while open, it is one switch per figure (`detail`). But a
     description that says "crosses the y-axis at −4" answers a graph-reading item for anyone with ChromeVox.
   - Blind students on graph-reading items still need an authored `graph.accessibleDescription`; preflight warns.
2. **A closed question's work area is `inert` (Q-97), which removes it from the accessibility tree.** A screen-reader
   student cannot review a closed question's graph, number line or 3D model, or hear their own answers in the work
   area. `inert` was chosen so a finished answer cannot be edited. A read-only presentation that stays in the
   accessibility tree would need its own design. **Not changed here.** The integrator is putting this to the owner.
3. **On a phone, the reference opens inside the Task drawer**, with no fourth header button. The alternative is a
   fourth button, which squeezes the phone's task text (the reason Support tools fold into Help).
4. **The figure descriptions are English only.** They are screen-reader text, not Read aloud or Translate text.
5. **The Graph Story sketch is pointer-only** (VPAT 2.1.1 and 2.5.1). Whether a freehand story sketch falls under the
   path-dependent exception is a reviewer's call. Otherwise it needs a keyboard route (for example, points joined in
   order).

## Outside this scope (touched minimally)

Tool and driver files changed only where a name or a target changed:

- **Source:**
  - `GraphDisplay.jsx`, `GraphStory.jsx`, `InteractiveGraphWorkspace.jsx`, `NumberLine.jsx`;
  - `DataModelingLab.jsx` (two `ariaLabel`s); `RegressionCalculator.jsx` (one `ariaLabel`, plus the merge resolution);
  - `ThreePlaneWorkspace.jsx`;
  - `LinearTableWorkbench.jsx`, `OpenSortBoard.jsx`, `RelationMapping.jsx`, `ScratchpadOverlay.jsx` (targets and wording);
  - `AlgebraicSystemMode.jsx`, `EliminationReductionMode.jsx` (one import, one or two `behavior:` values each, kept
    clear of W4 systems tools' and B's hunks);
  - `QuestionEngine.jsx` (Reset's caption class, the hint-panel scroll, the `reference` capability);
  - `UniversalUndoButton.jsx`, `MathToolMobileLayout.css`;
  - `esSupport.js` (two Spanish sentences).
- **Drivers that found a figure by its old instruction name now find it by the new one:**
  - `toolKeyboardThreePlane.mjs` (also reads the description now), `day2NonuniqueJourneys.mjs`, `assessmentLeakGates.mjs` (by `/3D view of the three
    planes/`, which matches either name);
  - `graphKeyboardRoute.mjs` (the plane by its workspace selector);
  - `clickMapLetterboxMain.jsx` ("Graph story sketch").
  - `toolKeyboardNumberLine.mjs` and `toolKeyboardThreePlane.mjs` read the keys from the description, not the name.
- **Contracts rewritten per the playbook:**
  - `tests/tools/threePlaneKeyboard.test.mjs` (the svg's name and describedby);
  - `studentWorkspaceVisibility.test.mjs` (the label span's classes);
  - `assignmentToolFidelity.test.mjs` (the coordinate guide sentence);
  - `workViewCapabilities.test.mjs` (the frozen list).
- **CI:** `student-runtime-browser-gates.yml` runs the three new drivers.
- **Not touched, left to their owners:**
  - MatrixCalculator's 32 px buttons (W5-3);
  - CoordinatePlane's focus-only keyboard sentence (W5-5);
  - Graphing 2's "How to do this" step and Open Sort's "Tap a card…" (both inside W4-1 hunks at the time).

## Not done

- **Marks a tool draws on top of the shared plane** are still only "marks drawn by the activity that are not listed
  here": Complex Plane vectors, the Parabola Lab's sideways curve, inequality polygons.
- **Step Algebra's cancellation factors** are named from raw LaTeX (`StepAlgebraStructureTools.jsx:499, 504`).
- **The ✓/✗ marks** are named on role-less spans (`QuestionEngine.jsx:2676`, `SolutionReviewPanel.jsx:65`).
- **A11Y-11, remaining:**
  - smooth scrolls on Student Home, Grades and Graph Scenario Match (not in the report; GraphScenarioMatch is B's file);
  - the Live Challenge countdown.
- **A11Y-12, remaining:** the pointer wording in Graphing 2's TaskCard step, Open Sort and Representation Match; the
  plane's keyboard sentence (shown only after keyboard focus).
- **No real screen-reader pass** (NVDA, JAWS, VoiceOver, ChromeVox). The VPAT lists what one must cover.
- **First-load budget:** studentHome is over its baseline on the base already. Measured here: base `e822504`
  1048.6 KB, this branch 1048.8 KB (baseline 1023.4 KB, allowance 8 KB). The +0.2 KB is mine; the overage is W5-1's to
  address. `scripts/first-load-baseline.json` is not edited.
