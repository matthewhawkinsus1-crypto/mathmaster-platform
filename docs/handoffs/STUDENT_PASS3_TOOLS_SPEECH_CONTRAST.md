# Student pass 3 — Batch 6, session E: every student can use every tool (what the tools say and show)

Branch `claude/pass3-b6-tools-speech-contrast`, from `claude/modest-pasteur-xzagn7` at `a7dddc7`, with that base
merged in twice since (merge commits `de8215b` for `4af446f`, Batch 4's hint ladder, and `1fc1506` for `8e51f65`); the
gate below is on the second merge. Scope: the
items of [04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md) listed
below, by that file's IDs (the summary tables number them differently). Nothing here re-grades, writes to
Firebase or deploys. No server code, rules or indexes change.

## Per item: what a student saw → what changed → proof

| ID | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| A11Y-3 | Tokens and targets read program syntax: "Pick up the expression ((12-3x)/(2)) from the isolated equation", "Apply the factor to 2*x", the matrix keys bracket by bracket ("[A]⁻¹·[B]"). A voice-control student could not say what the button showed (WCAG 2.5.3). | `src/tools/shared/spokenMathValue.js`: drops grouping a reader never sees (MathLive's `~`, parentheses around a lone term or the whole value), stacks divisions as MathDisplay does, then calls `spokenMathLabel()` (unchanged). Every math value in a control name in Systems (token, solved values, drop targets, elimination terms), Step Algebra (distribution token and targets, the operation token, side targets, cancellable factors), Matrix Lab (calculator keys, result, cells) and Step Algebra 2's intercept equation goes through it. "Place Subtract 4 on both sides on the left side" is now "Place subtract 4 on the left side". Tokens carry their value as `data-token-value` for drivers. A role-less `span aria-label` on the Systems "done" chips is gone (MathDisplay inside speaks). | `toolSpokenMathLabels` (real expressions: "the fraction 12 minus 3x over 2 end fraction", "negative 3 plus 2 y", "A inverse times B"; a static scan that fails on any `aria-label`/`ariaLabel` in the algebra tools interpolating a math value without speaking it, with its own can-fail cases); `stepAlgebraSideTapLabel` rewritten (below) |
| A11Y-4 | Dark mode: point labels `#24324a` on the `#171a20` plane (1.35:1); "Purple points are given to you. Blue points are yours." was the only given/yours cue; the 3D model's axis names (1.7:1) and intersection lines (invisible, though the legend promised them); the mapping diagram's pastel ellipses and 3.1:1 headings. | CoordinatePlane point labels use `--mm-graph-label` with a halo of `--mm-graph-bg`, through `style`. Graphing's given points are squares (`shape: 'square'`, a new point shape) and labelled, the legend names shape and label. ThreePlane's axes, arrowheads, axis names, origin, intersection lines, solution marker, plane labels and legend swatch use tokens. RelationMapping's headings, ellipses, arrows, arrowheads and nodes use tokens. | `darkModeCertification` Part 1B (new): Graphing with given and plotted points, the three-plane model, a mapping diagram with two arrows — measured by SVG `fill`/`stroke` against the shape actually under each element (Part 1 read CSS `color`, which SVG text ignores, so `#24324a` passed it): text ≥ 4.5:1, marks ≥ 3:1, light and dark, 1366×768 and 390×844. All 12 scene runs pass. |
| A11Y-5 | Work history: "Before: Subtracted 3 from both sides → After: Subtracted 3 from both sides"; the equations never spoken, the description repeated per fragment. | `AlgebraWorkSteps.jsx` drops the description labels; MathDisplay speaks each equation; visually hidden "Before:" / "After:". | `workHistorySpeaksEquations` (Vite SSR of the real component, read as a screen reader gets it): "Before: 2x plus 3 equals 7", "After: 2x equals 4", the description once |
| A11Y-6 | Calculator keys named by their faces ("C", "x superscript y", "a fraction slash b"); nothing said after "=" unless the answer had an exact fraction; Close and Move 34px. | Key specs move to `src/components/calculatorKeys.js` with spoken names ("Clear", "Insert exponent", "Insert stacked fraction", "Minus"…). Enter and "=" say "equals 7.5, exactly 15 over 2" in one polite region (the Exact line is shown, no longer a second status); an error says "The calculator could not work that out. Check the expression." Close and Move are 44px. `groupBuiltFractions` is unchanged. | `calculatorResultSpeech` (every key of every mode named in words); `calculatorKeyboard` (browser, both sizes: every rendered key named, Enter and "=" announced, 44px targets); `calculatorExactFractions`, `calculatorPanelWiringV3` rewritten |
| A11Y-8 | TableGrader and GraphLine: a red or green border only, while the directions said "Incorrect blanks are outlined" and every box had an outline. The Number Line's typed-endpoint error was neither announced nor tied to the box. | `GradedEntryMark` (new, `src/components/common/`): under each graded entry "✗ Check this" / "✓ Correct", the input `aria-invalid` when wrong and described by the mark. GraphLine's labels now name their inputs. TableGrader's direction: "After you submit, each entry is marked ✓ Correct or ✗ Check this…". Interval Number Line: the box is `aria-invalid` and described by the hint/error line; the error is said in an alert. | `legacyGraderErrorsInWords` (SSR of both graders with real part grades); `toolKeyboardNumberLine` (browser: "13/8x" → invalid, described, alerted; typing again clears both) |
| TOOL-7 | "Your line: y = 0.66666667x + 2", "y = 1x + 0" (and "Graph y = 1x + 0." as the task). | `src/tools/graphing2/lineReadout.js`: exact fractions (within the 8-place rounding of `lineFromPoints`), no 1 or 0 coefficient, no "+ 0", a true minus. The readout is typeset (MathDisplay); the Work View caption and the task line use the text form. `formatLine` is unchanged: the server stores its text as the response. | `graphingLineReadout` (lines through the student's points: "y = (2/3)x + 2", "y = x", "y = −x − 4", "x = 5/2"…; Graphing no longer writes a student-facing line with `formatLine`) |
| TOOL-10 | "4 arrows drawn" and one "Clear arrows": no way to learn which arrows, or remove one, without sight. | `arrowDescriptions.js`: each domain node "Domain value -2, maps to 3 and 5", each range node "Range value 3, from -2"; "Arrows you drew" lists "-2 → 3 ×" with "Remove the arrow -2 to 3"; the status line says what a press did ("Arrow drawn from -2 to 3. 2 arrows drawn.", "… removed.", "All arrows cleared."); the SVG is `role="group"`. Removing an arrow puts focus on the arrow now in its place, after the last one on the diagram's first value; Clear arrows keeps focus (`useFocusSafeDisabled`). | `mappingArrowDescriptions` (unit); `toolKeyboardRelationMapping` (browser, both sizes: names, list, removal, focus) |
| TOOL-11 | At 390px tick numbers rendered ≈ 6–7 px; a press just beside P2 plotted a third point and wiped the line. | `planeTextScale.js`: plane text keeps a 12 px floor on a narrow plane (at most ×2.25; a wide plane keeps its sizes); the cursor chip grows with it. `planeTouch.js`: a finger's pick-up radius grows toward 22 CSS px but never past 45% of a snap cell, and never below the old 18 units (the keyboard stays exact at 18) — on a dense phone grid it stays 18, because a press in the next cell is a new point there. `placePoint.js`: Graphing replaces the nearest point instead of restarting. Two causes found in the browser and fixed: the phone column scrolled a plane the student had just pressed, moving it between press and lift (`MobileViewportContainer` now skips that reveal for a pressed `.mathmaster-touch-surface`); and the keyboard crosshair chip stayed drawn after focus left the plane. | `planeOnPhone` (unit); `planePhoneReach` (new browser driver: smallest plane text ≥ 12 px at 390, authored at 1366; a missed drag beside P2 keeps the line; a far third point keeps the line); `systemsWorkspaceStudio` (a tap one cell away still plots a new boundary point) |
| A11Y-2 (these tools) | Graphing 2's and Step Algebra 2's "Start over", the plane's "Reset view", Step Algebra's distribution token and targets disabled themselves on the press and dropped focus to the top of the page. | `useFocusSafeDisabled` on each (Step Algebra's mapped targets through a file-local `FocusSafeButton`); each handler ignores a press while unavailable. | `focusSafeToolControls` (new browser driver, both sizes: focus stays on the control, `aria-disabled="true"`, a second press does nothing) |

### Found while proving it: a lost press on Check (fixed)

TOOL-7's typeset readout made `toolAttemptOutcome` fail on the phone: after plotting by keyboard, a press on
"Check construction" released on "Stuck? Show a hint" and no try was recorded. Cause: the plane's keyboard sentence
("The arrow keys move the crosshair…") was removed on blur, so the press that moved focus to Check shrank the page
above it and moved Check from under the pointer. The sentence now stays once keyboard focus has shown it (until the
question changes); leaving the plane still puts down a held point and now also hides the crosshair. Restoring the old
blur makes the driver fail again.

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each pinned the old spelling of behaviour that is intact; each now asserts the behaviour and was mutation-checked.

- `stepAlgebraSideTapLabel`: a side is a named target only while armed, named by `spokenOperation` ("Place subtract 4
  on the left side"), never "undefined".
- `calculatorExactFractions`: the fraction is still shown only beside its own result; it is announced with the result
  (Enter and "=").
- `calculatorPanelWiringV3`: the ÷ key still builds a stacked fraction (the key spec, from `calculatorKeys.js`, and the
  panel's `fractionize` handler).
- `secureRichToolRuntimeWiring`: Graphing's readout is still withheld where help is, now written by `lineReadoutText`.
- `coordinatePlaneClipAndHelp`: leaving the plane puts down a held point and the crosshair, and no longer hides the
  keyboard sentence (the lost press above); the sentence goes with the question.
- `accessiblePlatformWiring`: Enter on a movable point still picks it up, with the keyboard's exact radius.
- `algebraDistributionWorkspaceWiring`: a placed term still cannot be placed again (`available` excludes it, and an
  unavailable `FocusSafeButton` ignores the press).
- `toolDraftPersistenceContract`: three new presentation states declared in `toolStatePersistence.js`
  (`lastArrowChange`, `arrowFocusIndex`, `renderedWidth`), and the plane's `keyboardHelpVisible` re-described.

Browser drivers that read the old names were updated to the new behaviour, not the reverse: `systemsWorkspaceDriver`,
`day1SystemsJourney`, `day2NonuniqueDriver` (they read `data-token-value`), `algebraicSubstitutionHandoff` (checks the
token's value as well as its label for LaTeX spacing), `draftPersistenceScenes` ("Place subtract 4 on the left side"),
`toolAttemptOutcome` (a third plot replaces the nearest point: "Plotted (0, 4). It replaced (0, 0). 2 of 2 points
plotted.").

## Mutation checks

Every new or rewritten assertion was broken once in the code and seen red, then restored:

- Spoken labels: a raw `${distributionState.factorText}` back in a label (scan red); `spokenOperation` saying an
  unknown operation; whole-value parentheses kept.
- Work history: the description labels back on the equations; on the fragments.
- Calculator: a key named by its face; the announcement without the fraction; no announcement on "=" (browser); keys
  without names (browser); the `÷` key as `\div`; `fractionize` inserting `\div`; one `announceResult` removed.
- Legacy graders: no `aria-invalid`; no mark; GraphLine's label not tied to its input. Number Line: no
  `aria-invalid`; an empty alert (both browser).
- Readout: `1x` allowed; the task line back on `formatLine`.
- Mapping: no focus move after a removal; Clear arrows natively disabled; the old domain name (all browser); list
  wording; the range-order tie-break (needed a fixture drawn out of order to go red).
- Dark mode (Part 1B, browser): `#24324a` labels (dark red); `#202124` intersection lines (dark red); no square shape.
- Phone: the reveal guard removed; the cell cap on the pick-up radius removed (unit red); restart instead of nearest; no text growth; the keyboard-sentence blur restored (`toolAttemptOutcome`
  red on the phone). One change did not survive its mutation and was removed: focusing the plane with
  `preventScroll` on press (the reveal guard alone was the fix).
- Focus-safe: each of the four controls back on a native `disabled` (browser, all red); the placed-target guard and the
  ignored press (unit).

## Gate

On the second merge (`1fc1506`), run one at a time with nothing else running.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11,447 / 11,447 |
| `node --test tests/tools/*.test.mjs` | 1,643 pass, 0 fail (one not counted as a pass, as on the base) |
| `npm run test:authoring-v5` | 686 / 686 (nothing in authoring or the compiler changed) |
| `npm run lint` | exit 0 (warnings only; none in lines this branch added) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `npm run audit:theme-colors` | pass |
| Browser drivers (41): the student-runtime gate (incl. the new `planePhoneReach`, `focusSafeToolControls`), `mathSpeech`, `graphDescription`, `accessiblePrimitives`, `calculatorKeyboard`, `studentAccessibleNames`, the five `toolKeyboard*`, `closedVerdictChip`, `workBarPrimaryLabel`, `dolCloseCopy`, `unchangedConfirmWorkView`, `algebraicSubstitutionHandoff`, `algebraicSystems3x3`, `workViewMatrix`, `captureToolResponses`, `studentUxPlatform` | all 41 pass |
| `npm run certify:dark-mode` | pass: Part 1, the new Part 1B (12 plotted-scene runs), Part 2 (192 surfaces, 4 viewports, light and dark) |
| `npm run certify:accessibility` | no new, increased or reduced violations on any screen; **fails** because `secure-exam/start` (desktop and phone) cannot be reached in 180 s. The same failure on the base `8e51f65` alone (`ONLY=secure-exam`, same servers): not this branch. |
| `tests/browser/hostAccessibility.mjs` | **fails** at `scene=recovery` (the page never reaches network idle in 60 s); the same failure on the base `4af446f` alone: not this branch. |

On the first merge the gate found one real regression of this branch, fixed in `90720c0`: a finger's wider pick-up
radius took a tap one cell from a Systems boundary point as a move of that point instead of a second point. Three
drivers that read the old raw names were updated (`algebraicSubstitutionHandoff`, `algebraicSystems3x3`,
`captureToolResponses`).

## Deploying (not done)

Hosting only. No file under `functions/`, `firestore.rules` or the indexes changes.

```
$ node scripts/release-firebase.mjs --since a7dddc7
MathMaster release plan for mathmaster-aleks
  live build: unknown
  diff:       a7dddc7..<head>
  hosting                because src/AlgebraWorkSteps.jsx, src/GraphLine.jsx, src/StepByStepAlgebraCore.jsx and more

Steps, in order:
   1. hosting                  npm run deploy:hosting
```

Ship with the wave's other Hosting changes through `node scripts/release-firebase.mjs --execute` (never a raw
`firebase deploy --only hosting`).

## Decisions for the owner

1. **A third point on Graphing replaces the nearest one** (the report offered "replace the nearest, or ask").
   Replacing keeps the line and needs no dialog; the plot announcement says which point went. "Start over" is the
   way to clear. Say if you would rather ask.
2. **The keyboard sentence under a plane stays once shown**, until the question changes. Hiding it on blur moved the
   page under the pointer (the lost Check press). It is one line of muted text.
3. **The stored response text of a Graphing line is unchanged** (`formatLine`: "y = 1x + 0" in the record). Only what
   the student reads changed. Changing the stored text is a functions change and would make old and new records
   read differently in reports; not done.
4. **A finger's wider pick-up radius stops short of the next grid cell.** On a dense phone grid (−7…7) that keeps
   it at the old 18 units, so the gain is on coarser or zoomed planes only; on Graphing a missed drag on a dense
   grid is caught by nearest-point replacement instead. A press in the next cell must stay a new point (Systems
   plots boundary points one cell apart). If you want more reach on dense grids, it has to come from a different
   gesture (for example, a held press), not a bigger radius.
5. **The ÷ key is named "Divide"** although it builds a stacked fraction (its existing behaviour); the a⁄b key is
   "Insert stacked fraction".

## Touched outside the files listed for E (kept minimal)

- `src/components/student/MobileViewportContainer.jsx`: one guard — a pressed `.mathmaster-touch-surface` is not
  scrolled by the phone's focus reveal (TOOL-11). Keyboard focus is unaffected.
- `src/tools/toolStatePersistence.js`: declarations of the new presentation states.
- `src/components/common/GradedEntryMark.jsx`, `gradedEntryState.js` (new, used only by the legacy graders).
- `.github/workflows/student-runtime-browser-gates.yml`: runs the two new drivers.
- Browser drivers outside my tools that read the old names: `algebraicSystems3x3`, `captureToolResponses`.
- `tests/browser/workViewCertificationMain.jsx`: the certification harness takes an optional spec and scene name.
- `spokenMathLabel()` (session F's) is called, not changed.

## Not done

- Polynomial Workshop's "P(x) = 1x^2 -5x +6" (TOOL-7) and Representation Bridge's "Your line" (it calls the same
  `formatLine`) are session D's files: `lineReadoutText` is ready for the second.
- RepresentationMatch's spoken label (session D, as briefed).
- The calculator still shows a bare "Error" on screen (TOOL-8 asks for what it could not read); it now says more to a
  screen reader only.
- Point dots stay 6 units on a phone (about 3.5 px radius); only text and pick-up reach scale.
- The legacy NumberLine's selected point (TOOL-4) and RelationMapping's own plot (its keyboard sentence still hides on
  blur; it sits below its controls, so no press is lost there).
- The two base failures in the gate (`secure-exam/start` in `certify:accessibility`, `hostAccessibility`'s recovery
  scene) are left to the base's owners.
- No real screen-reader pass (NVDA, VoiceOver) — Batch 6 asks for one across the platform; and the VPAT 1.1.1 / 1.4.1 /
  1.4.3 / 2.5.3 / 3.3.1 rows can now be updated from this table.
