> Investigator report for [student-experience-pass-3.md](../student-experience-pass-3.md): Rich tools and accessibility (TOOL and A11Y findings, capability matrix, VPAT check).
> Read-only review of main at `25250b4` on 2026-10-16; rows were spot-checked before they went into the report.

# MathMaster student audit: rich tools and cross-cutting accessibility

Audit date 2026-10-16, `main @ 25250b4`. The audit was read-only: no repo file was changed, and nothing was run in a browser. Every claim below comes from reading the current source and is cited as `file:line`. I mark a claim "medium" confidence where it depends on browser or screen-reader behaviour I inferred from the code rather than measured.

**Scope.** The 25 registry tools (`src/tools/toolRegistry.js:13-39`) and the legacy root tools (StepByStepAlgebra*, MultiRelationAlgebra*, InteractiveGraphWorkspace / FunctionGraphBuilder / GraphAnalysis, GraphLine, NumberLine, TableGrader, AlgebraWorkSteps, MathInput, GraphScenarioMatch). Also the cross-cutting pieces: calculator, scratchpad, Enlarge / Work View, Universal Undo, the reference card, math speech, theme, large text and reduced motion. My Math Path and teacher screens are out of scope.

**Prior docs checked for overlap:** `docs/accessibility/KEYBOARD_SWEEP.md`, `docs/accessibility/VPAT_2.5_WCAG_MathMaster.md`, `docs/handoffs/STUDENT_PUSH_F/H/N/Q*.md`, `docs/qa/platform-quirks-audit.md`, `docs/qa/algebra2-matrices-student-walkthrough.md`. Each finding is tagged NEW or with the prior doc it overlaps.

---

## 0. What the prior pushes fixed, re-checked in code

All of these still hold, so I do not repeat them as findings:

| Prior gap | Now | Evidence |
| --- | --- | --- |
| S1: focus went to `<body>` after Check | fixed | `src/QuestionEngine.jsx:455-456` (`useFocusReturnAfterLock`) |
| S2: a nested figure blurred focus | fixed | `src/components/common/EnlargeableFigure.jsx:170-178` |
| S3: the Scratchpad was not a modal | fixed | `src/ScratchpadOverlay.jsx:407-421` (`<Dialog>`, Escape → `requestClose`, unsaved-work alertdialog at 580-608) |
| S4: Tab walked out of Work View | fixed | `EnlargeableFigure.jsx:186` (`useModalDialog`) |
| S6: plane points could not be moved by keyboard | fixed | `src/tools/shared/CoordinatePlane.jsx:450-489` (Enter picks up, arrows move, Enter drops, Escape cancels) |
| S7: calculator Escape and move | fixed | `src/components/CalculatorPanel.jsx:249-265, 277-287, 528-547` |
| T1/T4: Mapping Diagram plot was click-only | fixed | `src/tools/relationMapping/RelationMapping.jsx:136-144` |
| T2/T7: the 3D model, and its radios | fixed | `src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx:376-385, 544-547` |
| T3: Number Line endpoints | fixed | `src/tools/intervalNumberLine/IntervalNumberLine.jsx:800-804, 837-841, 877-881` |
| T5: Regression "Add Item" menu | fixed | `src/tools/regressionCalculator/RegressionCalculator.jsx:458-488` |
| T6: unnamed residual scroller | fixed | `src/tools/dataModeling/DataModelingLab.jsx:482` |
| T8: `outline:none` in tool CSS | fixed (now guarded) | `InequalityWorkspace.css:418`, `AlgebraicSystemMode.css:67` |
| Large text: px font sizes | fixed, with a ratchet | N push. Every px font in `src/**` is now `calc(N * var(--mm-px))`. SVG text is excluded on purpose |

---

## 1. Tool × capability matrix (registry tools)

Every registry question gets the same platform chrome from QuestionEngine:

- **Work bar:** ↶ Undo · ↺ Reset Question · ✎ Scratchpad · Calculator · 💡 Hint / ✋ Ask · 🔊 Read (`QuestionEngine.jsx:2076-2138`).
- **One opener:** "⤢ Enlarge question" opens Work View (`QuestionEngine.jsx:2365-2371`).
- **Work View rail:** Undo, Reset, Scratchpad and Calculator, plus whatever actions the tool itself publishes (`QuestionEngine.jsx:2345-2364`).

So "Enlarge" and "Work View" are **✓ for every tool**, and the calculator and scratchpad sit in the same place on every tool. The matrix shows what differs between tools.

Key:

- ✓ yes · ◐ partial · ✗ no · — not applicable.
- **SR**: is the tool's *own* feedback text announced? "outcome" means only the platform sentence ("Not quite. You have 2 attempts remaining…") is announced (`ToolShell.jsx:296-341`). The tool's diagnostic text sits in a plain `<span>`/`<p>`.
- **Undo**: is the tool registered with Universal Undo (`useMathUndoHistory`)?
- **WV rail Check**: is the tool's Check button in the Work View action rail? If not, the student scrolls inside Work View to find it.
- **WV focus**: does the tool mark `data-work-view-focus` / `-reveal`, so Work View opens on the live work?
- **How-to**: the "How to do this" steps (TaskCard). The steps are hidden inside Work View at every width (`WorkViewShell.css:371`). On a phone the tool header with "About this tool" is hidden too (`WorkViewShell.css:246`).

| Tool | Keyboard | SR | Undo | Tool reset | WV rail Check | WV focus | How-to | Phone / dark notes |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| dataModelingLab | ✓ | outcome | ✗ | — | ✗ (wrapper) | ✗ | ✓ | plane text ≈6–7px |
| regressionCalculator | ✓ | ✓ (`:738`) | ✓ + own ↶↷ | "Start over" ↺, "Delete All" | ✗ | ✗ | ◐ (no steps, `:388-392`) | fake ＋/− zoom glyphs |
| inverseCompositionLab | ✓ | outcome | ✗ (derivation has its own Undo, not wired) | "Start over" | ✗ | ✗ | ✓ | |
| functionOperationsLab | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | feedback never says which part is wrong |
| systemsWorkspace | ✓ (token Pick up/Place) | ◐ | ✓ (✗ spatial) | per mode | ✓ (own) | ✓ algebraic only | ✓ | 3D labels and lines unreadable in dark |
| parabolaGeometryLab | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | |
| polynomialWorkshop | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | "1x^2 -5x +6" plain text |
| signSolutionAnalyzer | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | |
| sequenceExplorer | ✓ | outcome; plot silent | ✓ | — | ✓ | ✗ | ✓ | plane labels dark-invisible |
| complexPlaneLab | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | generic feedback |
| exponentialLogBridge | ✓ | outcome | ✗ | — | ✗ | ✗ | ✓ | |
| transformationsLab | ✓ | outcome; plot silent | ✓ | "Clear" (disables itself) | ✓ | ✗ | ✓ | A/A′ labels dark-invisible |
| representationMatch | ◐ (no radio arrows; selection state missing in 3 modes) | outcome | ✗ | — | ✗ | ✗ | ✓ | selected shown by border colour only |
| functionInvestigation2 | ✓ | outcome | ✓ | — | ✓ | ✗ | ✓ | |
| graphing2 | ✓ | outcome; plot silent | ✓ | "Start over" (disables itself) | ✓ | ✗ | ✓ ("Click the grid") | "Your line: y = 1x + 0"; given vs own points by colour in dark |
| stepAlgebra2 | ✓ | ◐ (`:212`) | ✓ | "Start over" (disables itself) | ✓ | ✗ | ✓ | |
| solutionReview2 | — | — | — | — | — | — | — (exempt) | |
| intervalNumberLine | ✓ | ◐ (typed-endpoint error not announced) | ✓ | "Start over" | ✓ (own) | ✗ | ✓ | |
| relationMapping | ✓ | ◐ (arrows never listed) | ✓ | "Clear plot", "Clear arrows" | ✓ (own) | ✗ | ✓ | pale ellipses and 3:1 labels in dark |
| openSortBoard | ◐ (focus lost after every placement) | outcome; placements silent | ✗ | "Remove group" destroys typed text | ✗ | ✗ | ✓ ("Tap") | |
| constraintFunctionBuilder | ✓ | outcome | ✓ | — | ✓ ("Submit this model") | ✗ | ✓ | |
| linearTableWorkbench | ✓ | ✓ (`:367`) | ✓ + own ↶/Redo (disables itself) | "Start over" | ✗ | ✗ | ✓ | Edit/Remove buttons 32px |
| expressionMeaning | ✓ | outcome | ✓ + own ↶ | — | ✗ | ✗ | ✓ | "Submit meaning map" |
| representationBridge | ✓ | ◐ | ✓ + own ↶/Redo (disables itself) | "Start over" | ✗ | ✗ | ◐ (multiple-representations board mode: About only) | "Check this stage" uses no attempt |
| matrixLab | ✓ (radios without arrows) | ◐ (calculator live; "Reconsider" list not) | ✓ | — | ✗ | ✗ | ✓ | op labels read "[A]⁻¹·[B]" |

**Legacy tools:**

- **InteractiveGraphWorkspace** (functionGraph / functionInvestigation / graphAnalysis): points can be placed by keyboard, but the **required sketch step is pointer-only** (✗). It announces well (`:1582`), registers Undo, and is one of only two tools with a Work View reveal marker (`:1335`).
- **StepByStepAlgebra / MultiRelationAlgebra:** the keyboard works. Distribution tokens read program syntax and disable themselves on press. The Work history reads descriptions instead of the equations (`AlgebraWorkSteps.jsx`).
- **TableGrader and GraphLine:** wrong cells are marked by colour only.
- **Legacy NumberLine:** the selected point is not exposed to screen readers.

**Counts (registry):**

- Universal Undo: **14 of 24** gradable tools. The other 10 show a permanently disabled ↶ Undo.
- Own feedback announced: **3 ✓, 7 ◐, 14 outcome-only**.
- Work View focus marker: **1** tool.
- How-to reachable inside Work View on a phone: **0**.

---

## 2. Findings, most impactful first

### A11Y-1 · A screen-reader student hears that a Check failed, but not why. Plotting a point is silent. (P1, M, NEW, high)

- **Scenario:** On Graphing, a blind student presses "Check construction". They hear "Not quite. You have 2 attempts remaining on this version." They never hear "Point P1 is on the line, but the other one is not. Keep the good point and move the other." Earlier, each Enter that plotted a point produced no announcement. So they cannot tell whether Enter worked, or that a third Enter wiped both points.
- **Evidence:**
  - `src/tools/shared/ToolShell.jsx:296-341`: only the platform `outcome.text`/`detail` goes into the `role="status"` region.
  - `ToolShell.jsx:347-386`: the `ResultPill` itself is a plain span.
  - `src/tools/graphing2/Graphing2.jsx:433-438`: the feedback `<p>` is not live.
  - 17 tool files render a `ResultPill` with no live region of their own (inverseComposition, functionOperations, parabola, polynomial, signSolution, sequence, complexPlane, exponentialLog, transformations, representationMatch, functionInvestigation2, graphing2, openSort, constraintBuilder, expressionMeaning, matrixLabUi, rewriteLinearForm).
  - `CoordinatePlane.jsx:548-552, 880`: the only live region holds `previewText` ("Plot (3, −2)"). Enter at `:458-476` calls `onPlot` and leaves that text unchanged, so nothing new is announced.
  - `QuestionEngine.jsx:1296-1303`: tool attempts never get `incorrectParts`, so the "Focus on: …" line (`:1652-1654`) never appears for a registry tool.
- **Recommendation:**
  - Make the verdict container a live region in one shared place: `ResultPill`, or a `ToolFeedback` component that wraps the pill and its message. Then 17 tools are fixed at once.
  - In CoordinatePlane, announce commits: "Plotted (3, −2). 2 of 2 points." Also announce "Line restarted" when a plot replaces earlier points.

### A11Y-2 · Buttons that disable or unmount themselves throw keyboard focus to the top of the page (P1, S–M, NEW: the pattern is known, but only the platform Undo is fixed)

- **Scenario:** In Open Sort Board, a keyboard student selects a card and presses "Place selected card here". The button turns into a disabled "Select a card first", and focus drops to `<body>`. This happens for **every card**: in a 12-card sort they Tab back from the top of the page 12 times. In the controlled sort, the focused category button sits inside the card that just left, so it unmounts and focus is lost the same way.
- **Evidence:**
  - `src/tools/openSortBoard/OpenSortBoard.jsx:260` (`disabled={!selectedId}` after `moveSelected` clears it) and `:195-212` (the card unmounts).
  - The same self-disable happens on:
    - "Start over": `Graphing2.jsx:428`, `stepAlgebra2/StepAlgebra2.jsx:222`.
    - "Clear": `transformations/TransformationsLab.jsx:357`.
    - Tool-local Undo: `linearTableWorkbench/LinearTableWorkbench.jsx:439`, `representationBridge/RepresentationBridge.jsx:625`, `inverseComposition/InverseDerivationLab.jsx:211`, `regressionCalculator/RegressionCalculator.jsx:449, 491`.
    - "Reset view": `CoordinatePlane.jsx:867`.
    - Step Algebra distribution token and targets: `src/StepByStepAlgebraCore.jsx:2005, 2028`.
  - The fix already exists: `src/components/common/useFocusSafeDisabled.js:3-24`. Its own comment describes this failure, but only `UniversalUndoButton.jsx:8` uses it.
- **Recommendation:**
  - Use `useFocusSafeDisabled` for every self-disabling control.
  - After a placement, move focus to the next unplaced card, or to the group's heading.
  - Add the OpenSortBoard case to `tests/browser/keyboardSweep.mjs` as a check that focus is not lost after an action.

### TOOL-1 · Function-graph questions cannot be finished without a mouse or finger (P1, M, NEW: the sweep excluded legacy types, `KEYBOARD_SWEEP.md:66-67`)

- **Scenario:** A keyboard-only or switch student places every point with the arrow keys, presses "Check Point Placements", and is told "The drawing layer is unlocked." The curve must then be drawn by hand. There is no keyboard route, and Enter answers "Choose which point you are placing first…". The endpoint markers that follow are reachable only after the sketch "snaps".
- **Evidence:**
  - `src/InteractiveGraphWorkspace.jsx:904-1000`: strokes come only from `beginDrawing`/`continueDrawing`/`endDrawing`, which are pointer events (`:1368`).
  - `:837-866`: the keyboard handler only calls `placeAtCoordinate`.
  - `:793-828`: `placeAtCoordinate` has no sketch branch.
  - `:815`: markers require `construction.snapped`.
  - `:890`: "The drawing layer is unlocked."
- **Recommendation:** Add a "Connect my points" button that builds the stroke through the student's own placed points. The grader already has a check for exactly that (`constructionSketchThroughOwnPoints`, `:993`), so the student still has to choose the right points. Mirror it for the inverse sketch.

### A11Y-3 · Screen-reader labels on algebra tokens read program syntax, not math (P1, S, NEW: F fixed `MathDisplay` labels; button `aria-label`s bypass that fix)

- **Scenario:** In Systems substitution, the token button is announced as "Pick up the expression ((12-3x)/(2)) from the isolated equation". A voice-control student cannot say what is on screen ("12 minus 3x over 2"), because the accessible name does not match the visible label (WCAG 2.5.3).
- **Evidence:**
  - `src/tools/systemsWorkspace/AlgebraicSystemMode.jsx:116, 134, 1847` (`aria-label` built from `tokenExpression`).
  - `tokenExpression` is `latexToExpression` output, which produces doubled parentheses and slashes (`functions/shared/algebra/latexToExpression.mjs:21-48`).
  - Drop targets: "Variable x currently has value …" (`AlgebraicSystemMode.jsx:193-195`).
  - The same raw interpolation appears in:
    - `StepByStepAlgebraCore.jsx:2007, 2032` ("Pick up the factor -3", "Apply the factor to 2*x").
    - `systemsWorkspace/EliminationStack.jsx:101`.
    - `representationMatch/RepresentationMatch.jsx:426` (`describeLinearCard` returns the raw equation string, `functions/shared/toolMath/representationMatch/representationMath.mjs:308`).
    - `matrixLab/MatrixCalculator.jsx:63-65` ("[A]⁻¹·[B]").
- **Recommendation:** Pass these labels through the existing `spokenMathLabel()` (`src/platform/language/mathSpeechLabel.js:27-41`; already used by `AlgebraTermRow` and `MatrixGrid`). Add a static test: any `aria-label` that interpolates a math value must go through it.

### TOOL-2 · Ten tools have no Universal Undo, but the Undo button is always shown, greyed out. One of them deletes typed work with no way back. (P1, M, NEW framing; the inventory already declares the gap)

- **Scenario 1:** A student removes the wrong group in Open Sort Board. The group's name and its two-sentence rationale vanish: no confirmation, and ↶ Undo is disabled.
- **Scenario 2:** In the Inverse Derivation lab, two Undo buttons sit on screen. The tool's own "Undo" works. The work bar's "↶ Undo" is permanently disabled.
- **Evidence:**
  - `OpenSortBoard.jsx:136-140, 261`: the group is deleted, and its cards silently return to the unplaced pile (`functions/shared/toolMath/openSortBoard/openSortMath.mjs:174-177`).
  - No `useMathUndoHistory` in: dataModelingLab, inverseCompositionLab (both labs), functionOperationsLab, parabolaGeometryLab, polynomialWorkshop, signSolutionAnalyzer, complexPlaneLab, exponentialLogBridge, representationMatch, openSortBoard. `src/tools/workViewInventory.js:5-28` lists no `undo` for them.
  - The disabled button is always rendered: `QuestionEngine.jsx:2082`.
  - The derivation lab's local history: `InverseDerivationLab.jsx:104-106, 211`.
- **Recommendation:**
  - Add the documented hook to each tool, about 10 lines per tool (`docs/platform/WORK_VIEW_CAPABILITY_API.md:52-79`). Card sorts first.
  - Wire the derivation lab's history to the platform Undo, and remove its local Undo button.
  - Hide or explain the work-bar Undo for a tool that has no history.

### TOOL-3 · On a phone, inside Work View, students cannot reach the tool's how-to or "Ask my teacher" (P1, S–M, NEW: PQ-023 assumed Work View keeps "About this tool"; that is true only on desktop)

- **Scenario:** On a phone, a student enlarges Matrix Lab and taps Help. The drawer says "Use the directions and controls in this workspace…", but the directions are hidden. "How to do this (3 steps)" and the platform's hint panel, with "✋ Ask my teacher", are gone until they close Work View.
- **Evidence:**
  - The TaskCard is hidden whenever Work View is open: `src/components/common/WorkViewShell.css:371`.
  - The tool header, and with it "About this tool", is hidden on the mobile layout: `WorkViewShell.css:246` (restored only in the header by `src/App.css:2137`).
  - The generic Help text: `src/tools/shared/RegisteredToolWorkView.jsx:63-65`, published for 15 tools.
  - Published help overrides the platform help: `src/platform/workView/workViewCapabilities.js:31-45`.
  - The platform help holds the hint ladder and Ask: `QuestionEngine.jsx:2051-2054`, `src/platform/supports/hints/HintPanel.jsx:71-79`.
  - On a DOL, the generic text replaces even the Ask-only panel (`RegisteredToolWorkView.jsx:56-58`).
- **Recommendation:** Build the Work View Help drawer from three parts:
  1. The tool's description and steps (pass TaskCard's steps up as `help.content`).
  2. The platform hint panel with Ask my teacher, which should never be overridden.
  3. Then the tool's own hints.

### A11Y-4 · Dark mode hides point labels on every coordinate plane and the axes of the 3D model (P2, S, NEW)

- **Scenario:** In dark mode, a student on a Graphing "through two points" item sees two coloured dots and no "given 1", "P1" labels. The only remaining cue is "Purple points are given to you. Blue points are yours."
- **Evidence:**
  - `CoordinatePlane.jsx:806-807`: `fill="#24324a"` on `--mm-graph-bg` `#171a20` (`src/theme/tokens.css:197`), about 1.35:1 contrast.
  - Colour-only cue: `Graphing2.jsx:277-278, 400-403`.
  - ThreePlane, on `var(--mm-surface-sunken)` (`ThreePlaneWorkspace.jsx:384`):
    - Axis names `#3c4043`, about 1.7:1 (`:420`).
    - Intersection lines `#202124`, invisible (`:466`), although the legend says "Dashed line: where two shown planes meet" (`:492`).
  - Mapping diagram: pastel ellipses `#f4f8ff` / `#f7f4ff` and `#5f6b7a` headings, about 3.1:1 (`RelationMapping.jsx:395-399`).
  - Dark-mode certification covers only the sample scenes of graphing2, stepAlgebra2 and dataModelingLab, with no plotted points (`tests/browser/darkModeCertification.mjs:66`).
- **Recommendation:**
  - Replace these hard-coded colours with `var(--mm-graph-label)` / `--mm-graph-axis` through `style` props.
  - Add a plotted-points scene, the 3D view and the mapping diagram to the certification.

### TOOL-4 · Selection state is invisible to screen readers, and radio groups don't work like radio groups (P2, S, partly prior: T7 fixed one place)

- **Scenario:** In Representation Match "find the mismatch", a screen-reader student presses card 2. Nothing tells them it is now selected; only a blue border changes. In Matrix Lab and Mapping Diagram, a screen reader announces "radio button 1 of 3", but the arrow keys do nothing.
- **Evidence:**
  - Choice buttons with no `aria-pressed`/`aria-checked`: `RepresentationMatch.jsx:364, 370, 376`, and the legacy `src/NumberLine.jsx:36`.
  - `role="radio"` with no roving tabindex or arrow keys:
    - `matrixLab/matrixLabUi.jsx:166-168`
    - `matrixLab/MatrixLab.jsx:469-471`
    - `representationBridge/process/processUi.jsx:56`
    - `stepAlgebra2/LinearIntercepts.jsx:315`
    - `RelationMapping.jsx:490, 527` (no `radiogroup` container at all)
    - `RepresentationMatch.jsx:240, 388`
    - `src/LinearInterceptsOrchestrator.jsx:409`
    - `src/MultiAnswerGrader.jsx:230`
  - The fixed pattern exists in `ThreePlaneWorkspace.jsx:544-547`, and a shared helper in `src/platform/interaction/radioGroupKeys.js`.
- **Recommendation:**
  - One `ChoiceGroup` component on `radioGroupKeys`.
  - `aria-pressed` on every single-select card or button.

### TOOL-5 · Two hint systems on one screen, with different rules (P2, M, NEW)

- **Scenario:** In practice, a Graphing student has two hint buttons:
  - The work bar's "💡 Hint" unlocks one hint per attempt and includes "Ask my teacher".
  - The tool's "Stuck? Show a hint" reveals all three at once; the third names the exact points to plot.
  - In Work View, the tool's panel replaces the platform's, and hints revealed there are not shown as revealed in the embedded panel.
- **Evidence:**
  - Platform gating: `src/platform/supports/hints/questionHints.js:98-106`, `QuestionEngine.jsx:1494-1504`.
  - Tool panel: `ToolShell.jsx:473-519`.
  - Graphing's third hint: `Graphing2.jsx:163-171`.
  - Two separate `HintPanel` instances: `Graphing2.jsx:332` and `:440`.
- **Recommendation:** Feed tool hints into the platform ladder and show one "Hint" control everywhere.

### A11Y-5 · The Work history reads the step's description instead of its equations (P2, S, NEW)

- **Scenario:** A screen-reader student reviews their Step Algebra work history. For each step they hear "Before: Subtracted 3 from both sides → After: Subtracted 3 from both sides". The equations are never spoken.
- **Evidence:**
  - `src/AlgebraWorkSteps.jsx:35, 37` pass `ariaLabel={`Before: ${step.description}`}`. `mathSpeechLabel` lets an authored label replace the value (`src/platform/language/mathSpeechLabel.js:45-48`).
  - `:21` labels every math fragment of the description with the whole description, so it is spoken repeatedly.
  - Used in `src/StepByStepAlgebra.jsx:61-64` and `RewriteLinearForm.jsx:14`.
- **Recommendation:** Drop the `ariaLabel` props. MathDisplay speaks the equation itself. Put "Before"/"After" as visually hidden text next to it.

### TOOL-6 · "Check" means two different things, and the vocabulary differs from tool to tool (P2, S–M, NEW; PQ-029 fixed one label)

- **Scenario:** In Representation Bridge, "Check this stage" is free, but the final "Check" spends one of three tries. Constraint Builder says "Submit this model". A table question says "Submit Answer". A student cannot predict which presses cost an attempt.
- **Evidence:**
  - Free stage check vs. attempt: `RepresentationBridge.jsx:283-289` vs `:325-328`. Every `submit()` call is an attempt (`src/tools/shared/useToolSubmission.js:8-13`).
  - "Submit" labels: `ConstraintFunctionBuilder` "Submit this model", ExpressionMeaning "Submit meaning map", Regression "Submit my regression", DataModeling "Submit model reasoning", the multiple-representations board "Submit your board".
  - The platform's own labels: `QuestionEngine.jsx:2007-2017`.
  - Reset words: "↺ Reset Question" (`QuestionEngine.jsx:2025-2031`) vs "Start over", "Clear", "Clear plot", "Clear arrows", "Delete All", "Clear Sketch", "Clear All". Regression's "Start over" reuses the ↺ icon (`RegressionCalculator.jsx:494`).
  - Developer words students see:
    - "stage": `RepresentationBridge.jsx:477-564`.
    - "Residual evidence": `DataModelingLab.jsx:491`.
    - "In this view: Numeric controls · Table data · Edit mathematical objects": `RegisteredToolWorkView.jsx:11-15`, rendered at `EnlargeableFigure.jsx:648-657`.
    - "that token form": `AlgebraicSystemMode.jsx:1681`. `SubstitutionReductionMode.jsx:131` already says "form of the expression".
- **Recommendation:**
  - "Check" never costs a try. "Submit" always does, with "uses 1 of 3 tries" beside it.
  - Use one reset word.
  - Rename the capability captions in student words.

### TOOL-7 · Tool readouts show math the platform itself bans (P2, S, NEW: the Q push banned 1x and +0 in the solver only)

- **Scenario 1:** A Graphing student plots (0, 2) and (3, 4) and reads "Your line: y = 0.66666667x + 2". Through (0, 0) and (1, 1) they read "y = 1x + 0".
- **Scenario 2:** Polynomial Workshop shows "P(x) = 1x^2 -5x +6" as plain text. A screen reader reads the caret.
- **Evidence:**
  - `functions/shared/toolMath/graphing2/graphingMath.mjs:164-169` (`formatLine`), with `lineFromPoints` rounding to 8 decimal places (`:11`).
  - Shown at `Graphing2.jsx:414`, and in the Work View caption at `:326`.
  - `src/tools/polynomialWorkshop/PolynomialWorkshop.jsx:21-27`, rendered as a plain `<p>` at `:64, 113, 128`.
- **Recommendation:** Format through the shared exact-fraction formatter and render with `MathDisplay`.

### TOOL-8 · Feedback that doesn't tell the student what to change (P2, M, NEW; Matrix Lab specifics are in the matrices walkthrough, P2-3/P2-5)

- **Scenario:** In Function Operations, a student gets every part wrong and reads "Some parts are correct. Review the operation panels and try the remaining parts." No panel is marked.
- **Evidence:**
  - Function Operations' only miss message: `src/tools/functionOperations/FunctionOperationsLab.jsx:150-155`.
  - Regression: "Regression setup is incomplete or invalid." and "Data entry/table does not match the provided data." (`RegressionCalculator.jsx:371-381`).
  - Complex Plane gives one generic rule for any wrong part (`ComplexPlaneLab.jsx:92, 122`).
  - The calculator shows a bare "Error" (`CalculatorPanel.jsx:151-153, 318`).
  - The good pattern already exists: Matrix Lab's "Reconsider: <part>" (`matrixLabUi.jsx:180-197`) and Graphing's per-point messages (`Graphing2.jsx:300-309`).
- **Recommendation:**
  - A shared `missedParts(result.parts)` → "Check the quotient panel."
  - Mark the failing panel.
  - Make the calculator say what it could not read.

### TOOL-9 · Regression Calculator has no how-to, and draws zoom buttons that do nothing (P2, S, NEW)

- **Scenario:** A first-time student sees a Desmos-style panel with a "y₁ ~ mx₁ + b" row and no steps. They try the ＋/− in the graph corner, and nothing happens.
- **Evidence:**
  - `RegressionCalculator.jsx:388-392` (`steps={[]}`).
  - `:430-433`: decorative `aria-hidden` ＋/− glyphs, styled as 40×38 boxes in `RegressionCalculator.css:103-125`.
- **Recommendation:**
  - Add three steps: "Type your data in the table", "Press the curve icon to add y₁ ~ mx₁ + b", "Read r, then choose direction and strength".
  - Remove the fake controls, or make them work through CoordinatePlane zoom.

### A11Y-6 · Calculator keys have no spoken names, and the result is never announced (P2, S, NEW: S7 covered only Escape and moving the panel)

- **Scenario:** A screen-reader student hears the keys as "C", "x superscript y", "a fraction slash b". After pressing "=", nothing announces the answer unless the result has an exact fraction.
- **Evidence:**
  - Keys with no `aria-label`: `src/components/CalculatorPanel.jsx:16-30, 571-587`.
  - Only "Exact:" is `role="status"`: `:556-560`.
  - Close and Move are 34px: `:539, 545`.
  - Compare `src/MathInput.jsx:13-42`, which labels every key ("Insert square root").
- **Recommendation:**
  - Reuse MathInput's labels.
  - Add a polite region: "equals 3.75".
  - Make Close and Move 44px.

### A11Y-7 · The Open Sort board's repeated buttons have identical names (P2, S, NEW)

- **Scenario:** A screen-reader student tabs through "Place selected card here", "Remove group", "Place selected card here"… and cannot tell which group each belongs to. A placed card is announced as "Graph C ↩"; the action exists only in a title attribute.
- **Evidence:** `OpenSortBoard.jsx:260-261, 266` (and `:224-232` in the controlled sort).
- **Recommendation:**
  - "Place Graph C in Group 2 · Linear".
  - "Take Graph C out of Group 2".
  - Announce each placement.

### TOOL-10 · The Mapping Diagram's arrows can't be reviewed without sight (P2, S, prior: VPAT 1.1.1 lists mapping diagrams as undescribed)

- **Scenario:** A screen-reader student draws four arrows and hears "4 arrows drawn". There is no way to learn which arrows they drew, or to remove a single one.
- **Evidence:**
  - Arrows exist only as SVG lines; the status line is `RelationMapping.jsx:455-459`.
  - Domain node names omit their mappings (`:427`).
  - The only removal is "Clear arrows" (`:461`).
  - The SVG is still `role="application"` and not focusable (`:394`).
- **Recommendation:**
  - A text list "−2 → 3 [Remove]".
  - "Domain value −2, maps to 3" on each node.
  - `role="group"` on the SVG.

### TOOL-11 · On a phone, plane text is tiny and a missed drag erases the line (P2, M, partly NEW; the restart is noted only as a workaround in KEYBOARD_SWEEP)

- **Scenario:** At 390×844, tick numbers on a Graphing plane render at roughly 6–7 CSS px, below the 11 px they are authored at (not measured in a browser). A student tries to drag P2, lands just outside its snap cell, and lifts. That plots a third point, which silently wipes the line.
- **Evidence:**
  - Text sizes in a 560-wide viewBox: `CoordinatePlane.jsx:105` (`width=560`), `:671-686, 806` (`fontSize` 11–13).
  - The phone column's paddings: `src/components/student/MathToolMobileLayout.css:200-202, 230-237`.
  - SVG text does not follow large text, by decision: `STUDENT_PUSH_N_LARGE_TEXT.md:51`.
  - Pick-up radius 18 viewBox units, about 10 CSS px: `CoordinatePlane.jsx:375-389`.
  - Restart: `Graphing2.jsx:212-215`.
- **Recommendation:**
  - Scale SVG font sizes by `width / renderedWidth`, with a 12 px floor.
  - Let a touch within about 22 CSS px pick up a point.
  - In Graphing, replace the nearest point, or ask, instead of restarting.

### A11Y-8 · Errors marked by colour alone in the legacy graders, and the Number Line's typed error is silent (P2, S, NEW)

- **Scenario:** A colour-blind student is told "Incorrect blanks are outlined", but every box has an outline. On the Number Line, typing "13/8x" shows an error that a screen reader never announces.
- **Evidence:**
  - `src/TableGrader.jsx:97, 108-110`: red or green border, no `aria-invalid`, no text.
  - `src/GraphLine.jsx:50`: the same.
  - `IntervalNumberLine.jsx:640-669, 681-683`: the input has no `aria-invalid`/`aria-describedby`, and the error div is not live.
- **Recommendation:**
  - Use `aria-invalid` plus "✗ check this" text.
  - Make the error the input's live description.

### TOOL-12 · The reference card ("Information you need") disappears in Work View (P2, S, NEW)

- **Scenario:** A student enlarges a formula question to work on a phone. The formula card stays behind the modal, and Task shows only the prompt text.
- **Evidence:**
  - The card lives only in the task panel: `QuestionEngine.jsx:1983-1985, 2338`; `MobileViewportContainer.jsx:443, 474`.
  - The Work View task carries only the prompt: `QuestionEngine.jsx:2347`.
  - A real reference sheet exists only for the SAT secure exam (`src/platform/assessment/secureExamTools.js:34-53`).
- **Recommendation:**
  - A "Reference" drawer in the Work View header whenever `referenceInfo` exists.
  - Consider a STAAR reference-sheet tool in the work bar.

### A11Y-9 · The VPAT is out of date and understates the product in seven rows (P2, S, NEW)

- **Evidence:**
  - The VPAT was last edited 2026-10-10 (8d92674), and only row 2.4.1 changed.
  - Rows still list gaps that jobs H (10-10) and N (10-15) fixed: 1.4.3 (147 nodes), 1.4.4 (2,190 px font sizes), 1.4.12 (not evaluated), 2.1.1, 2.4.3 (two QuestionEngine dialogs), 2.5.1 (3D drag), 4.1.2 (3D radios). See `VPAT_2.5_WCAG_MathMaster.md:54, 62, 64, 74, 84-85, 89`.
  - Conversely, 3.2.4 "Supports" overstates (two Undo buttons with different histories; two hint ladders), and 4.1.3 understates the problem (A11Y-1).
- **Recommendation:** Refresh the VPAT from section 3 below before it goes to a district.

### TOOL-13 · Small Work View inconsistencies (P3, S, NEW; PQ-026 fixed the visible title only)

- The dialog's accessible name is "Question Work View, Work View" (`QuestionEngine.jsx:2366` + `EnlargeableFigure.jsx:549`).
- Only systems-algebraic (`AlgebraicSystemMode.jsx:370`) and the legacy graph (`InteractiveGraphWorkspace.jsx:1335`) mark the work area, so every other tool opens Work View at its top.
- In 15 tools, Check is not in the Work View rail: the wrapper filters it out (`RegisteredToolWorkView.jsx:67-69`).
- "Enlarge question" is disabled once a question closes, so a student cannot enlarge their own graded graph to review it (`EnlargeableFigure.jsx:479` with `forceClosed={locked}`).

### A11Y-10 · On a phone, Undo and Reset are near-identical icons side by side (P3, S, NEW)

- At ≤384 px, or with Submit in the bar, the bar shows ↶ and ↺ as icons only: `MathToolMobileLayout.css:371-378, 397-412`; `QuestionEngine.jsx:2082-2096`.
- **Recommendation:** Keep a 2–3 letter caption ("Undo"/"Reset"), or use a distinct reset glyph.

### A11Y-11 · Reduced motion and small targets: polish (P3, S, NEW)

- **Motion:**
  - The Scratchpad's 220 ms slide-up is an inline animation with no reduced-motion guard (`ScratchpadOverlay.jsx:419`, `App.css:268`).
  - JS smooth scrolls ignore the preference (`AlgebraicSystemMode.jsx:352, 464`; `EliminationReductionMode.jsx:176`; `QuestionEngine.jsx:1525`).
- **Targets:** Inline `minHeight` 32–36 beats the phone 44 px rule (`MathToolMobileLayout.css:172-176`):
  - `LinearTableWorkbench.jsx:372-373`
  - `OpenSortBoard.jsx:266`
  - `RelationMapping.jsx:373, 377`
  - `MatrixCalculator.jsx:80-81`
  - The Scratchpad toolbar has no minimum height at all (`ScratchpadOverlay.jsx:553, 571-573`).
- All of these are ≥ 24 px, so they pass WCAG 2.5.8.

### A11Y-12 · Instructions assume a mouse (P3, S, NEW)

- "Click the grid to plot a point" (`Graphing2.jsx:64, 347`), "Tap a card…" (`OpenSortBoard.jsx:178-183`), "now click the value it maps to" (`RelationMapping.jsx:457`). None mention the keyboard routes.
- The plane's keyboard sentence appears only after keyboard focus (`CoordinatePlane.jsx:897-903`) and omits pick-up and move.
- **Recommendation:** Use neutral verbs ("Choose a point on the grid"), and add one line on the keyboard route to "How to do this".

---

## 3. VPAT rows that are Partially Supported: do the claims still hold?

| Row | VPAT says | Code now |
| --- | --- | --- |
| 1.1.1 | tool SVGs undescribed | **Still true.** Mapping arrows (TOOL-10), the 3D view (name only), the matrix calculator labels. New: token labels read syntax (A11Y-3), work history (A11Y-5) |
| 1.3.1 | `aria-label` on role-less elements (points badge, Step Algebra, timer) | Those three are fixed (H). **New instances:** `EliminationStack.jsx:227, 242` (`span aria-label`), `linearInterceptsConceptualUi.jsx:60-61` (`div aria-label`), `role="radio"` without a radiogroup (`RelationMapping.jsx:490, 527`) |
| 1.3.3 | "red line" wording not reviewed | **Still true.** "Purple points are given to you. Blue points are yours." (`Graphing2.jsx:402`) |
| 1.4.1 | not audited per tool | **Still true:** RepresentationMatch selection, legacy NumberLine, TableGrader / GraphLine |
| 1.4.3 | 147 undecided nodes | **Stale.** H decided 134 nodes. **New failures** in dark mode, uncertified: A11Y-4 |
| 1.4.4 | 2,190 px font sizes | **Stale.** N swept them and added a ratchet. Remaining: SVG text by decision (TOOL-11) |
| 1.4.10 | not every tool at 320 px | Still true, though the global phone CSS (`MathToolMobileLayout.css:230-237`) is robust |
| 1.4.12 | not evaluated | **Stale.** N measured text spacing on 17 scenes |
| 2.1.1 | Mapping plot, 3D, Number Line, calculator | **Stale.** All four fixed (H). **New:** the function-graph sketch is pointer-only (TOOL-1) |
| 2.4.3 | two QuestionEngine dialogs | **Stale.** Fixed (H). **New:** self-disabling and unmounting controls (A11Y-2) |
| 2.4.6 | not audited per tool | Identical button names (A11Y-7) |
| 2.5.1 | 3D drag-only | **Stale.** Fixed. The legacy sketch is arguably path-based, but see TOOL-1 |
| 2.5.3 | not audited per control | **Fails** for the token and card labels (A11Y-3) |
| 3.3.1 | not audited per tool | Colour-only errors; silent typed error (A11Y-8) |
| 4.1.2 | 3D radios; `role=application` on SVGs | The 3D view and number line are fixed. **Still:** 9 radio groups without arrow keys, the mapping SVG `role="application"` unfocusable, missing `aria-pressed` (TOOL-4) |
| 4.1.3 | not every tool verified | **Worse than stated:** 14 tools announce only the attempt outcome; plotting is silent (A11Y-1) |
| 3.2.4 (Supports) | shared controls consistent | Overstated: two Undo buttons with different histories (TOOL-2), two hint ladders (TOOL-5) |

---

## 4. Strengths worth keeping

- **One platform work bar** puts Undo, Reset, Scratchpad, Calculator, Hint and Read in the same place and order for every question type, and Work View re-registers the same controls (`QuestionEngine.jsx:2076-2138, 2345-2364`).
- **Universal Undo is well designed where tools use it.** Presentation state is stripped out, the Scratchpad overlay takes priority, the button keeps focus when it disables itself, and history persists per question (`useMathUndoHistory.js`, `UniversalUndoButton.jsx`).
- **Math speech:** `MathDisplay` produces one spoken copy in words (`MathDisplay.jsx:81-129`), and `spokenMathLabel` exists for authored labels.
- **The coordinate plane** offers press, slide and lift with a preview, keyboard plot and move, button-only zoom, and an assessment-safe description (`CoordinatePlane.jsx:332-489, 491-546`).
- **Accessible primitives are shared:** `Dialog`/`useModalDialog`, the global focus ring that beats inline `outline:none` (`index.css:252-266`), and the action-bar focus reveal.
- **Large text is complete,** with a ratchet. Dark tokens are well structured and the theme is certified on the main screens.
- **Phone layout** is handled centrally: single-column grids, 44 px minimums, a one-row work bar.
- **Scratchpad:** pages, its own Undo, a save-before-close guard, read-only replay, and graph-paper support.
