# Student pass 3, wave 6, session W6-4: a tool's directions on an assessment

Branch `claude/pass3-tool-directions`, from `claude/modest-pasteur-xzagn7` at `5062cba5`. Items from the integrator:
[STUDENT_PASS3_WORK_VIEW_HELP.md](STUDENT_PASS3_WORK_VIEW_HELP.md) decisions 1, 2 and 5 and its review rounds;
[STUDENT_PASS3_CALCULATOR_SETTING.md](STUDENT_PASS3_CALCULATOR_SETTING.md) "Not done";
[STUDENT_PASS3_FEEDBACK_REASONS.md](STUDENT_PASS3_FEEDBACK_REASONS.md) (TOOL-8).

Nothing here re-grades, writes to Firebase or deploys. No Cloud Function, Firestore rule, index or stored shape
changes: browser code only. No verdict or score changes. Student words follow D9 ("Submit" spends a try, "Check"
never does; "Work View"). Read aloud and Translate read question and support text (hints, miss messages, back-up
steps, worked examples), not tool chrome, so no new sentence here needs a Spanish entry
([STUDENT_PASS3_READ_ALOUD_TRANSLATE.md](STUDENT_PASS3_READ_ALOUD_TRANSLATE.md)).

"An assessment" below means where the platform withholds the method: `useMethodWithheld()` (hints off or verdicts
withheld: an exit ticket, quiz or test before release, section recovery). Nothing added here is shown there unless it
only says how to work a control.

## Reproduced first, on the base

Every item still reproduced at `5062cba5`, in the real QuestionEngine at 390×844
(`tests/browser/workViewHelpReach.html`, new tool cases added for this) and in node for the calculator model:

| Item | Seen on the base |
| --- | --- |
| 1 | DOL: Constraint Function Builder, Data Modeling (linearFitPrediction) and Representation Match (linearConnections) showed **no steps at all**; Rewrite Linear Form and Linear Intercepts (server-graded host) showed none either. Linear Table Workbench and the Representation Bridge already had W4-1 round 2's separate control lists. |
| 2 | DOL Work View banners stated the method: Linear Intercepts "Choose which variable becomes zero, place the zero on that variable, solve…" (registry tool and the assignment's intercept orchestrator), Rewrite Linear Form "Apply balanced operations and structural steps until y = mx + b." Only Transformations Lab's was gated. |
| 3 | DOL: the Bridge's "Rewrite your own general-form equation: a is the rate, c is the zero/x-intercept." and "Plot the x-intercept from your factored form, then a second point using the slope.", its RATE / SLOPE · START · ZERO highlight buttons (RATE lights m and a together) and their note; Match's "Representation reasoning" fold. |
| 4 | Graphing calculator: "y = (x + 2" and "y = 2x)" → "This line is not finished, or has a symbol out of place."; "y = 2x;" and "y = [x]" → "Use numbers, x, and + − × ÷ ^ with brackets."; **"y = 2x # 3" was graphed as y = 2x** (mathjs reads "#" as a comment). Keypad stand-in after a failed load: "Graphs are drawn in the question itself." |
| 4 (repair) | **Does not reproduce.** The graphing panel has no Clear key and never writes a placeholder "0" or "Error" into a line (errors are shown under the line); a line emptied after an error, then a paste of `(2+3)*2`, reads "= 10". Now pinned by the browser driver. |
| 5 | `(x − 2.718)⁶ − 3` minimum at x = 2.7; `−(x + 0.577)⁸ + 2` at −0.57; `(x − 1.234)⁶` at (1.23, 4.1 × 10⁻¹⁵); zoomed to [2, 4] or [2.6, 2.8] the minimum of `(x − 2.718)⁶ − 3` was **not listed at all**. |

## 1. Mixed step lists: the controls stay, the method goes

**What a student saw.** On an exit ticket, quiz or test a tool either kept all its steps (six tools marked
`stepsAreControls`) or lost all of them, control lines included.

**What changed.** `ToolShell.jsx`: a step wrapped in `controlStep()` says only how to work the tool (which button,
which field, what unlocks what) and stays where the method is withheld; a plain string is method (fail closed, as
before). On practice the list reads in its written order. Beside a split list the tool's directions sentence and note
stay withheld (they are tool-written and may name the route; only a whole list marked `stepsAreControls` keeps the
directions, as before). One function, `taskCardSupport()`, still decides for the card and for Work View Help.

Each split, step by step (C = control, kept; M = method, withheld):

| Tool | Steps | Why |
| --- | --- | --- |
| Linear Table Workbench | C "Tap two rows to form an interval." · C "Enter Δx, Δy and Δy/Δx for that interval in the boxes below, then record it." · M "Work out each value yourself from the two rows, then repeat with a different pair of rows." · C "Record N different intervals; the questions below the table open after that." · M the mode's last step (decide linear / the row that breaks the pattern / m and b) | The row buttons, the three boxes by their on-screen labels and Record, and the lock on the questions are controls; how the values are found and what to conclude are the item. One list replaces W4-1's two. |
| Rewrite Linear Form (both forms) | C "+ − × ÷ do the same thing to both sides. The Rewrite menu changes the shape of a part without changing its value." · M "Get y alone on the left with balanced operations…" · M when to Split fraction / Cancel factors (slope-intercept) or how to Factor out what every term shares (factored) · M "Optionally Arrange terms into mx + b." / "Write what is left of each term inside the parentheses." · C "When the equation reads y = mx + b (y = a(x − c)), submit it. Undo takes back the last step." | The buttons and the finish are controls; the target form is already on screen in the goal chips on every activity. Isolating y, splitting/cancelling and factoring out the common factor are the route the item measures. Also fixes "Press Check equation" beside a button that reads "Submit — …" (D9). |
| Linear Intercepts | M "Decide which coordinate is always 0 at the x-intercept." · C "Place the 0 on a variable (drag it, or tap the 0 and then the variable), then press Substitute and solve." · C "Solve the one-variable equation with the operation buttons. Return to substitution starts the substitution again." · C "Write the x-intercept as an ordered pair and press Check x-intercept." | Which coordinate is 0 is the item. The 0, Substitute and solve, the buttons, Return to substitution, the point boxes and the stage's Check (it never uses a try) are controls. "As an ordered pair" is the tool's own on-screen heading. |
| Constraint Function Builder | M "Read the characteristics first — identify which families are even possible." · C "Choose a family, then adjust the coefficients/parameters while watching the graph update." · M how to read the checklist · C "Submit when every constraint is satisfied." | Ruling families out and reading the checklist are method; the family buttons, parameter fields and Submit are controls. |
| Representation Bridge | C "Table: tap two rows to form an interval, enter Δx, Δy and the rate, and record it. Record more than one." · M "Work out each value yourself, then conclude whether the rate is constant and state m." · C "Then fill in each panel below in order: …" · M General form · M Factored form · M Graph · M Meaning | W4-1 round 2's two control lines, now in the one list; the five method steps as before. Practice now shows 7 steps (was 5). |
| Representation Match, grouping board (linearConnections) | C "Choose a group at the top, then tap every card that belongs to it — …" · C "Choose the next group and repeat." · M "Compare the numbers each card gives you rather than how the card looks." | How the board works vs. how to decide. The other modes' lists are all method and stay withheld. |
| Data Modeling, regression modes and association (new secure lists) | linearFit / quadraticFit / exponentialFit: "Enter … in the … boxes." · "The graph and the residual table redraw from the numbers you enter." · the four *FitPrediction modes add "Enter your predicted y in the Predicted y box, then classify the prediction." · association: "Choose the direction and the strength of the association." · "Choose what this observational data can justify." | Each names a box and what the screen does. None says how the coefficients are found (the teaching list's "Run a linear regression" stays out — the route, the same judgement as W4-1's "X = A⁻¹B"), how to judge the residuals, or which way to classify. |

Every secure Data Modeling list (old and new) is now marked step by step instead of `stepsAreControls`, so the
directions sentence ("Use linear regression technology…", "Use statistical technology to calculate…", which name the
route) no longer comes back beside them on a test.

**Proof.** `tests/platform/toolDirectionsSplit.test.mjs` (new): `taskCardSupport` on a mixed list; each tool rendered
whole through Vite SSR on practice and on a DOL, the steps asserted by their words (control steps on both, method
steps only on practice, the counts, the directions sentence withheld); every regression mode and association on a
test. Browser `workViewHelpReach` (390×844): each of the seven tools on practice and DOL, read in Work View's Help.

## 2. Work View banners and tool subtitles on an assessment

**What a student saw.** The Work View instruction banner (the one sentence above the work) is tool-written, and on a
DOL it still said Linear Intercepts' and Rewrite Linear Form's first method step.

**What changed (fail closed).** `workViewCapabilities.js` `instructionShown()`: where the activity withholds the
method only a banner the tool marks `controlsOnly`, or the platform's own `authoritative` one (QuestionEngine's
authored stage prompt, now marked so), is shown. `mergeWorkViewCapabilities` applies it under QuestionEngine's Help
(`withholdsMethod`), falling back to the stage prompt or to no banner; `EnlargeableFigure` applies it from the tool
runtime for a tool shell with no question around it. A banner written tomorrow is withheld unless someone marks it.

The audit — every `instruction` capability in `src/`, read:

| Banner (file) | Says | On an assessment |
| --- | --- | --- |
| Graphing2 `nextInstruction` | where to click, how many points, the finish button | **kept** (`controlsOnly`) |
| Constraint Function Builder | "Adjust the family and its parameters until every constraint in the checklist is satisfied." | **kept** |
| ThreePlaneWorkspace | "Rotate the model, show or hide each plane, and explore how the three planes relate." | **kept** |
| StepAlgebra2 | "Choose an operation, apply it to both sides, and simplify until x is isolated." (as its controls-only steps) | **kept** |
| InteractiveGraphWorkspace `currentInstruction` | the stage the workspace has opened (plot, draw, mark the ends; an analysis part's own label) | **kept** |
| StudentBuildInequalityMode `currentInstruction` | the build stage, in the order the tool enforces (the process-only words W4-1 judged controls for this mode) | **kept** |
| QuestionEngine `currentStagePrompt` | the authored stage prompt | **kept** (`authoritative`) |
| Linear Intercepts; LinearInterceptsOrchestrator | "Choose which variable becomes zero, place the zero on that variable, solve…" | withheld (method) |
| Rewrite Linear Form | "Apply balanced operations and structural steps until y = mx + b." | withheld |
| AlgebraicSystemMode, Substitution/EliminationReductionMode | "Solve the system with substitution or elimination…" / "…by substitution…" / "…by elimination…" | withheld (names the route) |
| SystemsWorkspace (4 banners) | "Classify the system, then solve where the equations meet.", "Construct every boundary and shade their overlap." / "Test points against both inequalities.", "Find every point satisfying both equations.", "Compute and interpret the RREF." | withheld |
| FunctionInvestigation2, SequenceExplorer (`MODE_STEPS[0]`, `taskSteps[0]`, and the four sequence task sentences) | the mode's first step | withheld |
| TransformationsLab | its first step | withheld (W4-1, unchanged) |
| StepByStepAlgebra, MultiRelationAlgebra, SystemGrader, IntervalNumberLine, RelationMapping | the authored prompt (or a tool fallback) | withheld; the Work View header already shows the authored task |

**Subtitles and descriptions** stay withheld on an assessment exactly as W4-1 left them (ToolShell header and the
card's description, fail closed). The split lists cannot bring them back: `taskCardSupport` returns no description
and no directions sentence wherever the method is withheld unless the whole list is `stepsAreControls` (asserted in
`toolDirectionsSplit`). One tool-written text can still name a route on an assessment, but no student reaches it: a
tool's Work View `task` (Linear Intercepts' "Decide which variable becomes 0, place the 0 on that variable…") is drawn
only by a tool shell with no question around it (the tools lab); every student host puts QuestionEngine around the
tool, whose authored task is authoritative and replaces it.

**Proof.** `toolDirectionsSplit` (the merge on a DOL and on practice; the figure from the runtime, rendered; the six
kept banners and six withheld ones pinned by file); browser `workViewHelpReach` (the Linear Intercepts, Rewrite Linear
Form and orchestrator banners absent on a DOL and present on practice; Graphing2's plotting banner present on a DOL).

## 3. Representation Bridge and Representation Match (W4-1 round-2 notes)

**What changed.** On an assessment the Bridge's factored-form line reads "Rewrite your own general-form equation as
y = a(x − c)." and its graph line "Plot points of your line on the graph."; the highlight buttons are not offered and
a highlight chosen earlier is not drawn (`shownHighlight`), and the note about them goes with the method. Match's
"Representation reasoning" fold is not shown in any mode. Practice is unchanged.

**Proof.** `toolDirectionsSplit` (SSR practice vs DOL: both lines, the highlight group, the note, the fold);
browser `workViewHelpReach` (bridge DOL: no lines, no highlight group; practice: the group; match DOL: no fold).

## 4. The assignment's graphing calculator

**Reasons (TOOL-8), shared.** W5-4's diagnosis (`firstUnreadable`, `bracketProblem`) and sentences
(`calculatorErrorMessage`) moved to `src/platform/policies/calculatorErrorReasons.js`, a module with no imports. The
keypad (`calculatorExpression.js`, `calculatorKeys.js`, which re-exports the same function) and the graphing model
read them from there; nothing was copied. The graphing calculator now says "A bracket is not closed. Add the missing
")".", "A ")" has no "(" to match it.", "It could not read "…". Use x, numbers, + − × ÷, brackets and the function
keys." and "It could not read that. Check for a missing number, or two signs side by side.", and refuses a line with
"#" instead of graphing part of it. Sentences that already named the problem (the allowlist's "not a function this
calculator has", "Put brackets after sin") stand. A value with no real number reads "That has no number answer. Check
for dividing by 0, or a square root or log of a number that is not positive." The reason shows under the line and is
said by the panel's polite region (unchanged mechanism).

**Clear/Error repair.** Not needed (see "Reproduced first"); the driver now proves a paste into an emptied line.

**The keypad's graphing line** (`calculatorKeys.js` `keypadGraphingNote`, `CalculatorPanel` `graphingUnavailable`,
passed by QuestionEngine from `graphingCalculatorFailed`): as the stand-in after a failed load, "The graphing
calculator could not load, so this calculator stands in. It does the arithmetic but cannot draw graphs."; on a host
that draws no graphing calculator (a Path session, an assessment item whose test has no graphing tool), "This
calculator does the arithmetic. It cannot draw graphs." Font 11 → 13 px.

**Proof.** `graphingCalculatorModel` (each reason, one shared function; the mathjs-imports pin rewritten — still only
the parser), `keypadGraphingNote` (new: the function, the rendered panel, QuestionEngine's wiring). Browser
`assignmentGraphingCalculator`: the three reasons shown, marked invalid and announced; the paste; both keypad lines.
It fails on the base's src at the new reasons block.

## 5. Flat turns (W5-7's review note)

**What changed.** `graphingCalculatorModel.js` `flatTurn`: a turn whose rise grows faster than a parabola's
(rise(d)/rise(d/2) ≥ 8, measured where the rise is 1000× above rounding error) is anchored at the middle of its basin
(between the two points where it has risen by half that much, when a lower level agrees on the middle), and rounding
may move x only about as far as rounding error moves those points; the real-turn test looks where the line has clearly
risen. A lopsided flat turn ((x − 1)⁴ + 0.001(x − 1)³) keeps the search's x with that cap. Parabolas, cubic turns and
corners return null and take the old path.

**Proof.** `(x − 2.718)⁶ − 3` reads (2.718, −3) on [−10, 10], [−5, 5], [2, 4] and [2.6, 2.8]; `−(x + 0.577)⁸ + 2`
reads −0.577; `(x − 1.234)⁶` reads (1.234, 0) with the zero 1.234; the lopsided turn reads its true 0.99925 when
zoomed. **W5-7's sweep: 6,448 vertices, 0 misreads.** Over 4,608 generated a(x − h)ⁿ + k lines in four views (scratch
comparison against the base's model, not committed) wrong reads go from 652 to 173, and all 173 are 3.14159 read as
3.1416 — inside that line's measured uncertainty (the base read 3.1 or 3.14). sin(x)⁴ and (1 − cos x)² now list their
flat minima as y = 0 at full precision (the base said 2.4 × 10⁻¹⁵ at 9.425).

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

| Test | Protected behaviour | Old pin | New assertion |
| --- | --- | --- | --- |
| `workViewHelpAndMethod` "R-10: the gate…" | Data Modeling's secure lists show on a test | `stepsAreControls={!teachingNotes && Boolean(SECURE_MODE_STEPS[mode])}` | `taskSteps = secureSteps ? wordedSteps.map(controlStep) : wordedSteps`; rendered per mode in `toolDirectionsSplit` |
| `workViewHelpAndMethod` "round 2: Linear Table Workbench…" | the table keeps how it is worked on a DOL (3 of 5 steps) | two literal lists behind `methodWithheld ?` | the one list opens with `controlStep('Tap two rows…')`; SSR counts unchanged (5 / 3) |
| `workViewHelpAndMethod` "round 2: the Representation Bridge…" | the bridge keeps its two control lines on a DOL | `steps={methodWithheld ? [` and practice "(5 steps)" | `steps={[ controlStep('Table: tap two rows…` and practice "(7 steps)"; DOL "(2 steps)" unchanged |
| `secureRichToolRuntimeWiring` "Data Modeling: the guide steps…" | secure steps say what to do, never how to judge | the `taskSteps` line and the `stepsAreControls` tag | `wordedSteps`/`secureSteps`/`taskSteps` lines, no `stepsAreControls` on the card |
| `graphingCalculatorModel` "it never runs what was typed as code…" | mathjs is only the parser | the import list is exactly the mathjs line | the mathjs line plus the shared reasons module, which imports nothing |
| `graphingCalculatorModel` "anything that is not plain mathematics is refused…" | `[1, 2]` is refused with a sentence | code `unsupported` | code `symbol`, naming "[" |
| browser `secureExamNavigation` | the secure test's calculator never says graphs are not its job | the old sentence | the old sentence or "cannot draw graphs" |

## Mutation checks

Each made once, seen red, restored (node suites unless marked):

- Item 1 (21): split ignored; each tool's control step unmarked or a method step marked control (LTW ×2, RLF, LI,
  CFB, Match); Data Modeling secure steps not wrapped, `stepsAreControls` back (directions return), the linearFit and
  association lists removed; the four rewritten pins (DM ×2, LTW, Bridge) against their old tests.
- Item 2 (6): the merge not filtering; `instructionShown` ignoring the policy; the figure ignoring the runtime;
  Graphing2 not `controlsOnly`; Linear Intercepts marked `controlsOnly`; the stage prompt not `authoritative`.
- Item 3 (5): highlight buttons ungated; "a is the rate" ungated; plotting route ungated; highlight drawn on a DOL;
  Match fold ungated.
- Item 4 (9): the old keypad sentence; QuestionEngine not passing the failure; the note ignoring it; brackets not
  diagnosed; "#" not caught; symbols not diagnosed; the model with its own sentences; the variable dropped from the
  shared sentence; `calculatorKeys` with a wrapper instead of the shared function.
- Item 5 (5): flat turn unused; the symmetry check off; the real-turn probe at one step; the rounding reach uncapped;
  the order test loosened to parabolas.
- Browser: `workViewHelpReach` against the base's src fails 15 checks; `assignmentGraphingCalculator` against the
  base's src fails at the new reasons block.

## Gate

Run on the merge of the moved base (`3cb782a9`, merge `498d7627`), one driver at a time against plain
`npx vite --host 127.0.0.1 --port 5199 --strictPort` with `AUDIT_ORIGIN`, Playwright from `/opt/node22`.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,786 / 11,786 |
| `node --test tests/tools/*.test.mjs` | 1,710: 1,709 pass, 1 skipped, 0 fail |
| `npm run lint` / `build` / `build:firebase` | 0 / 0 / 0; no tracked file rewritten; no new warning in a touched file (the one in `assignmentGraphingCalculator.mjs:180` is on the base) |
| `node scripts/check-first-load-budget.mjs` | **studentHome 847.2 KB gzip**, within baseline (baseline not edited) |
| `npm run test:authoring-v5` | 686 / 686 |
| `npm run test:secure-exam-navigation` (Firestore emulator) | 25 / 25 |
| Browser: `workViewHelpReach` (86 checks), `toolPolicyGates`, `assessmentLeakGates`, `toolFocusAndUndo`, `assignmentGraphingCalculator`, `calculatorKeyboard`, `toolKeyboardRegression`, `toolKeyboardDataModelingAndSystemsCss`, `toolKeyboardThreePlane`, `regressionCalculatorPhone`, `captureToolResponses dataModelingLab` and `regressionCalculator`, `linearMultipleRepresentations`, `toolAttemptOutcome`, `phoneToolPanelReach`, `studentUxPlatform`, `stepAlgebraStructureTools`, `systemsWorkspaceStudio`, `graphPointCheck`, `graphKeyboardRoute`, `planePhoneReach`, `algebraicSubstitutionHandoff` | all pass |
| Browser, the rest of the student-runtime gate: `mathEntryContract`, `renderStability`, `errorRecovery`, `duplicateTabs`, `undoTyping`, `composedOutcomePolicy`, `relationPlotGrading`, `clickMapLetterbox`, `stagedQuestion`, `unansweredChoiceGates`, `focusSafeToolControls`, `composedDraftRestore`, `draftEditTime`, `fractionTemplateGrading`, `moduleRecoveryLock`, `closedQuestionEnter`, `figureDescriptions`, `mathKeypadToolbar`, `workViewReference` | all pass |
| `workViewMatrix` (no `--write`), `workViewCertification` | pass: 480 screenshots, every Stage 3A family keeps controls, state and Undo; Stage 4 certified 24 tools on 8 devices |
| `secureExamNavigation` (standalone, its own Vite) | 364 passed, 0 failed, no production contact |

Not run: `mathFontsProduction` (needs a production preview), `hostAccessibility`, `lmrProcessMode`,
`studentShellLargeText` (fail identically on the base in this container per W4-1's handoff: the proxy blocks outside
hosts). The base's own gate before the merge (12 drivers above) also passed on `0b26b54f`.

## Deploy targets

Hosting only (browser code). No functions, no Firestore rules, no indexes.

## Decisions for the owner

1. **Which steps are controls.** Each split above is a content judgement with its reason. The rule used: a control
   step names a control, a field or what unlocks what, and nothing that says how to find or decide the answer.
2. **Directions sentence beside a split list is withheld.** Only a list marked controls-only as a whole keeps it.
   Data Modeling's secure lists moved to step marking for this reason, so on a test they now show without the
   directions sentence they had under W4-1 (it named the technology route).
3. **The Bridge's highlight buttons count as method** (RATE / SLOPE lights m and a together). They are withheld on an
   assessment with their note.
4. **Kept banners.** Six tool banners are marked `controlsOnly` (table above). Every other banner, including the
   authored-prompt ones, is withheld on an assessment; the Work View header still shows the authored task.
5. **Graphing "undefined" wording.** The graphing calculator's own sentence for a value with no real number now names
   division by 0, square roots and logs; the keypad's shared "notFinite" sentence ("Check for dividing by 0") was left
   as W5-4 wrote it.

## Touched outside my scope

- `src/QuestionEngine.jsx`: the stage prompt instruction gains `authoritative:true`; the keypad element gains
  `graphingUnavailable={graphingCalculatorFailed}`.
- `src/components/common/EnlargeableFigure.jsx`: `instructionShown` applied to the banner (3 lines + import).
- `src/InteractiveGraphWorkspace.jsx`, `src/tools/systemsWorkspace/StudentBuildInequalityMode.jsx`,
  `ThreePlaneWorkspace.jsx`, `src/tools/stepAlgebra2/StepAlgebra2.jsx`, `src/tools/graphing2/Graphing2.jsx`:
  `controlsOnly: true` on one banner each.
- `src/platform/policies/calculatorExpression.js`, `src/components/calculatorKeys.js`, `src/components/CalculatorPanel.jsx`
  (W5-4/W5-7 files): the diagnosis and sentences moved to the shared module (same exports, same words), the keypad line.
- Tests: `workViewHelpAndMethod`, `secureRichToolRuntimeWiring`, `graphingCalculatorModel`, browser
  `secureExamNavigation` (one regex), `workViewHelpReach` + harness, `assignmentGraphingCalculator`.

W6-3 (hints that fit) may touch Linear Table Workbench or Data Modeling hint lists, and W6-1 (student words) step
wording; expect small text conflicts in those `TaskCard` blocks at merge.

## Not done / noticed

- Data Modeling shows "Current MAE … · RMSE …" live under the model on a DOL. It is a fit-quality readout a student can
  tune against; not changed here (outcome-feedback scope).
- The older secure Data Modeling lists were not re-judged (e.g. "Run a correlation calculation … using statistical
  technology", "Use the model to compute the predicted y"); W4-1 accepted them.
- A tool's Work View `task` text is not withheld in a tool shell without QuestionEngine (no student host does that).
- Item 5: lines whose turn is flat and whose values elsewhere on screen are large read their turn to the uncertainty the
  view's scale implies (3.1416 for 3.14159); a tighter reading would need the size of the line's terms near the turn.
