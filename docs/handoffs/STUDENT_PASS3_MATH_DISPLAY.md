# Student pass 3 — wave 5, W5-5: math display

Branch `claude/pass3-math-display`, from `claude/modest-pasteur-xzagn7` at `e822504` (wave 3 integrated), with the
base merged in once since (merge commit `1fdbaac` for `cbeff6a`), then the independent review's fixes (`68b845f`,
[below](#after-the-independent-review-b6390a8--68b845f)). Items:
Q-12, Q-13, Q-31 ([06-open-items-qa-docs.md](../qa/student-experience-pass-3/06-open-items-qa-docs.md)), PR-13 / R-1
([07-open-items-prs.md](../qa/student-experience-pass-3/07-open-items-prs.md)), and TOOL-7's remainder from session E's
"Not done" list ([STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md](STUDENT_PASS3_TOOLS_SPEECH_CONTRAST.md)). Nothing here
re-grades a record, writes to Firebase or deploys.

Each item was confirmed on the base first: in node for the engine items, in the browser for the visual ones (the
Algebra 1 M2 T2 walkthrough harness for R-1, the structure-tools harness for Q-13/Q-31).

## Per item: what a student saw → what changed → proof

| ID | What a student saw | What changed | Proof |
| --- | --- | --- | --- |
| Q-12 | Step Algebra's toolbar badge "Support 3 · Standard" and, under the work, "Nothing is simplified for the student. Hints are available on request." Both are the teacher's setting in the teacher's words. | The tool runtime gains `teacherView` (`ToolRuntimeContext`, default **false**, read with `useTeacherView()`). QuestionEngine sets it only for `executionScope` `teacherPreview` / `teacherRepairPreview`, on all three providers. Step Algebra shows the badge and the level sentence only then. A student keeps the D1 sentence, "A longer route is still correct algebra and never uses a try." | `stepAlgebraStudentWords` (Vite SSR of the real solver with no provider, with `teacherView: false`, and with `true`; the flag derives from exactly the two teacher scopes and reaches every provider). Browser: `toolPolicyGates` now also asserts no policy copy on a DOL or test. |
| Q-12 (3rd part) | Rewrite Linear Form: "Attempts remaining: N", never changing. | **Already fixed on the base**: removed by `f82a1ab` (decision D1, valid moves never spend a try), after the report was written at 25250b4. Nothing in `src` writes "Attempts remaining" now. Confirmed in the browser (the structure-tools harness's Rewrite Linear Form questions). | `git log -S"Attempts remaining"` → `f82a1ab` |
| Q-13 | After ÷ −2 on −2x = −10, the board drew the right side as −(10/−2) and the left as −(2x/−2): sign patterns the student never wrote. | `algebraAstEngine.mjs` `additiveTermDescriptor`: a fraction whose numerator is a **written group** is drawn as written. The ÷ operation always writes `(side) / (divisor)`, so (−10)/(−2) reads `\frac{-10}{-2}`. A typed −10/2 has no group and keeps its sign in front. **Display only**: the term's `text`, `sign`, `magnitudeText` and `magnitudeLatex` are unchanged, and those are what rewrites, placement and grading read. | `algebraWrittenDisplay` (the descriptor and the real divide step; the canonical fields pinned unchanged). Browser: `stepAlgebraStructureTools` journey **divide-negative** (new, harness question `st-q8-divide-negative`) reads the rendered right side; red with the rule disabled. |
| Q-31 | Implicit products drew with a gap, "−2 x", because MathJS joins them with a TeX tie (`-2~ x`). | `cleanImplicitMultiplicationLatex` turns the tie into a plain space. Math mode ignores spaces, so −2 x draws as −2x, while the LaTeX still separates the factors for every reader of it. **Why not juxtapose (`-2x`)**: Step Algebra's LaTeX is parsed back (`latexToExpression`) by the systems workspace, and a first version that wrote `bh`, `Prt`, `3\pir` read back as the symbols bh and Prt and an undefined command. The space keeps every round trip exactly as on the base. | `algebraWrittenDisplay` ("reads back as the same product": b h, 2 x y, P r t, 3 pi r, …; red for both the fused and the `\cdot` variants). Browser: `algebraicSubstitutionHandoff`, `algebraicSystems3x3`, the divide-negative journey (start side `-2 x`, no tie). |
| Q-31 (across the deploy) | Not seen yet, but it would be: step credit dedupes visited states by their LaTeX key, so a state recorded `2~ x` before the deploy and `2 x` after it would count twice. | `compactStepStateKey` (attemptPolicy) and `functions/index.js`'s stored-record copy drop the tie with the spaces. This is the same precaution push Q took for `1\left(`. The `index.js` copy now carries every rule of the shared key, push Q's included (review S4). | `stepAlgebraStepCredit`: an old-tie record stays continuous; old and new renderings of one state earn once; the two keys agree over tie, space, `1\left(` and dash inputs. Red on any missing rule. |
| R-1 / PR-13 | The perpendicular-lines lesson (L3 CW 1): line B (slope 1/3) and its "90° rotation" B′ (slope −3) met at about 30°. The 524 × 334 plot drew a y unit about two thirds of an x unit, and the fitter widened y to −30…40 to keep the steep line in frame. | `graphSpecUtils.js`: `staticGraphUsesEqualUnits` decides when a static figure uses equal units, and `fitEqualUnitViewport` frames it: the author's window (widened only), every landmark kept in frame, each line's y-intercept and each pair's meeting point kept in frame (what the old tall window showed), then the shorter axis widened to the plot's aspect, about its middle, or away from a 0 edge for a quadrant-I figure. It applies **automatically** to two or more lines with nothing else (perpendicular, parallel) and to figures with drawn segments (distance, a polygon and its rotation or reflection), and only when both axes measure one unit (no axis titles or units that differ). **Authoring flag**: `equalUnits: true` forces it, `equalUnits: false` turns it off; `lockViewport` still keeps the author's window exactly. **Pre-Flight exemption**: the "mostly outside the visible y-range" warning skips a line in an equal-unit window when it shows on at least a fifth of the window or has a perpendicular partner; curves still warn. Strict boundary visibility (item graphs) does not report such a line as "clipped by its locked viewport" (review B1); a locked window still is. GraphDisplay uses one labelled step on both axes, clips curves to the plot area, and puts a line's arrow where it leaves through the top or bottom (equal-unit figures only). Worksheets fit to their own printed proportions and clip their lines to the plot too. **Interactive planes**: `CoordinatePlane` gains an `equalUnits` prop that changes only the plane's pixel **height** (`planeEqualUnits.js`, height between ⅓ and 1½ plot widths). The window, the snap and every plotted coordinate are unchanged. Graphing reads `graphBounds.equalUnits`; the workflow's feature-marking stage follows the fit, so it shows the static step's frame. | `equalUnitPlanes` (the lesson's own JSON: the right angle to 0.01° and the old fit under 45°; which figures qualify; Pre-Flight; GraphDisplay SSR measures the two drawn lines at 90°, equal gridline spacing, the clip and four arrows on the frame; CoordinatePlane SSR viewBox 560 × 560 vs 380; the Graphing and feature-stage wiring). Browser, real L3 CW 1: lines at 18.43° and −71.51° (89.95°) at 1366 × 768 and 390 × 844. `stagedQuestion`, `planePhoneReach`, `graphPointCheck`, `clickMapLetterbox` and workViewMatrix unchanged. |
| TOOL-7 | Polynomial Workshop: "P(x) = 1x^2 -5x +6". Representation Bridge's "Your line": the grader's record text (`formatLine`: "y = 1x + 0", "y = 0.66666667x + 2"). | `polynomialReadout.js` (new): "x² − 5x + 6": no 1 or 0 coefficient, no + 0 term, a true minus, superscript powers (Read aloud says "x squared minus 5x plus 6"). Only the helper's body changed in PolynomialWorkshop.jsx, to stay clear of wave 4's long lines. Representation Bridge's "Your line" uses session E's `lineReadoutLatex` (typeset) and `lineReadoutText` (`data-line-readout`). Division mode, which asks for coefficient lists, shows zero terms ("x³ + 0x² + 0x − 8"); magnitudes keep ten significant figures (review N7). The coefficient lists and the stored line are unchanged. | `toolMathReadouts` (readout cases; SSR of Polynomial Workshop's factor-zero and division modes; the Bridge readout bound to `lineReadout*`, no `formatLine` left, MathDisplay imported). Browser: `linearMultipleRepresentations`. |
| TOOL-7 (RepresentationMatch spoken label) | Session D had already routed the line-card button through `spokenMathLabel` (Q-91). What remained: point cards said the kind twice, "x-intercept: the point 2, 0". | `spokenLinearCard` in `linearCardLabels.js`: the kind, then the card's speech, without a repeated "the point" ("x-intercept: 2, 0", "Point: negative 1, 3"). | `representationMatchStudentUx` (rewritten per the playbook: assert the spoken names and that the button names itself through `spokenLinearCard`). Red without the de-duplication and with the old label. |

## Source contracts rewritten (SOURCE_CONTRACT_PLAYBOOK)

Each pinned a representation of behaviour that is intact.

- `algebraFactoringModel`, `algebraFractionStructureTools`, `stepAlgebraLineFormFlows`: 17 expected LaTeX strings held
  the tie (`5~x`). Their `tex()` helper strips whitespace, so they now read `5x`. The equivalence and grading asserts
  in the same tests are untouched.
- `classworkQ2SubstitutionHandoff` (precondition "serialises 2y with a ~"): its own comment says it is not a wording
  pin. It now asserts the factors stay separated (tie or space), and that the recorded browser response still carries
  the old tie, which the rest of the file reads back.
- `representationMatchStudentUx`: the line-card label regex now asserts `spokenLinearCard`, and the spoken outputs
  are asserted directly.
- `toolPolicyGates` (browser): its readiness signal was the policy sentence; it now waits for the student sentence
  and asserts no policy copy.
- Kept, not rewritten: `secureRichToolRuntimeWiring` / `toolVerdictPolicy` pin
  `const verdictsShown = useToolRuntimeContext().verdictsWithheld !== true;`. That line is restored verbatim, and the
  teacher flag is read with its own hook. `workflowPresentationRuntime` pins `fitStaticGraphViewport(graph)` and
  `fitStaticGraphViewport(rawGraph)` (the static step and the feature stage share one window). Both calls are kept,
  and the feature stage draws that window with equal units instead of opting out.

## Mutation checks

Every new assertion was broken once in the code and seen red, then restored:

- Q-12: badge gate, sentence gate, one provider's `teacherView`, an extra scope, the hook, and the provider's coercion.
- Q-13: the rule disabled, the group check dropped, `shownSign`, and `sign` changed (the canonical-field test).
- Q-31: the tie left as is, fused, or `\cdot`.
- Step credit: both key copies.
- R-1: the auto rule off; `>= 1` line; units ignored; the exemption removed; the shared step; the plot aspect; the
  CoordinatePlane height; the Graphing and feature-stage props; the edge arrows; the clip; the edge point.
- TOOL-7: unit coefficient; zero terms; the old helper; the Bridge readout; the point de-duplication; the old card
  label.
- Browser: divide-negative is red with the Q-13 rule disabled.

## Gate

On `5182472`, the code head; the commit that adds this file changes only docs. Run one at a time. Browser drivers ran
against `npx vite --host 127.0.0.1 --port 5199 --strictPort` (`AUDIT_ORIGIN`), dark mode Part 2 also against the
teacherWorkflow harness on 5188.

| Check | Result |
| --- | --- |
| `npm run test:platform` | 11613 pass, 0 fail |
| `node --test tests/tools/*.test.mjs` | 1671 pass, 0 fail |
| `npm run test:authoring-v5` | 686 pass, 0 fail |
| `npm run lint` | exit 0 (warnings only; none new in changed lines) |
| `npm run build` / `npm run build:firebase` | both exit 0; no tracked file rewritten (`git status` clean after) |
| `node scripts/check-first-load-budget.mjs` | **studentHome 1049.0 KB gzip in 197 files**, exit 1: 25.6 KB over the 1023.4 KB baseline. **The base is already over**: the same build of `e822504` measures 1048.6 KB in 196 files (25.2 KB over). This branch adds 0.4 KB and one file. Baseline not edited (W5-1 owns first load). signIn 291.5 KB. |
| `npm run test:challenge-finish` (emulator; includes studentAssignmentOverrides) | 453 pass, 0 fail |
| `npm run test:test-cycle-certification` (emulator) | 35 pass, 0 fail |
| `npm run test:grade-authority` (emulator) | 14 pass, 0 fail |
| Step Algebra platform suites (`*lgebra*`, `stepAlgebra*`, `systemsWorkspace*`, `classworkQ2SubstitutionHandoff`) | in the platform run above, all pass |
| `stepAlgebraStructureTools` (browser) | exit 0, no findings (with the new divide-negative journey) |
| toolPolicyGates, focusSafeToolControls, stagedQuestion, graphPointCheck, planePhoneReach, graphKeyboardRoute, composedOutcomePolicy, assessmentLeakGates, toolFocusAndUndo, renderStability, toolAttemptOutcome, systemsWorkspaceStudio, clickMapLetterbox, unansweredChoiceGates | all exit 0. (unansweredChoiceGates first failed only because the dev server hit its time limit mid-run; it passes on a rerun against a live server.) |
| algebraicSubstitutionHandoff, algebraicSystems3x3, mathSpeech, graphDescription, linearMultipleRepresentations | all exit 0 |
| `npm run certify:dark-mode` | passed: Parts 1, 1B and 2 (192 surfaces, 4 viewports, light and dark) |
| `workViewMatrix.mjs --write` | exit 0, all Stage 3A families keep controls, state and Undo; the fixture diff was only `generatedAt`, reverted (no intended change) |
| `captureToolResponses.mjs` graphing2, stepAlgebra, algebra, systemsWorkspace | each captured; `capturedToolResponses.json` unchanged (submissions unchanged). Polynomial Workshop, Representation Bridge/Match have no capture script. |

## Deploying (not done)

```
$ node scripts/release-firebase.mjs --since origin/claude/modest-pasteur-xzagn7
  functions              because functions/shared/algebra/algebraAstEngine.mjs
  hosting                because functions/shared/algebra/algebraAstEngine.mjs, src/GraphDisplay.jsx, src/QuestionEngine.jsx and 13 more
  functions:path-admin   because functions/shared/algebra/algebraAstEngine.mjs
```

- **Hosting**: yes (everything a student sees).
- **Functions**: the planner names the whole default fleet plus `path-admin`, because `algebraAstEngine.mjs` and
  `attemptPolicy.mjs` are shared. What the server reads from this branch:
  - the step-state key (`attemptPolicy.compactStepStateKey`), used by step verification and the partial-credit
    dedupe;
  - `functions/index.js` `storedAlgebraStepPartialCredit`'s copy of that key;
  - the LaTeX written into step records (`equationToLatex`).
  Grading verdicts do not change: all step-credit, grading and emulator suites pass.

### Release in two phases (review S1)

An **old** server reading step records a **new** client or server wrote treats `-2~ x` and `-2 x` as two states. It
would credit a revisited state again, and `getQuestionCredit`'s `max(best, derived)` keeps the extra credit. The
review's probe: −2x + 4 = 14, subtract 4, Undo, the same move, then ÷ −2. The old/new mixes end at 90% instead of 67%.
That can only happen in a rollback, or while old instances still serve after new ones have written. So:

1. **Release 1: functions only.** Ship `compactStepStateKey` and the `functions/index.js` key change. On today's
   data this is a no-op: every record today is written with the tie, so dropping it from every key changes no
   comparison (the push Q `1\left(` rule is already live in `compactStepStateKey`; in the `index.js` copy it only
   affects records written before push Q). The whole fleet and `path-admin` go, as the planner lists. Wait until `platformBuildInfo`
   reports that commit (the release script checks it) and old instances have drained.
2. **Release 2: the engine change and Hosting.** Every server that can read a new-rendering record now keys it
   correctly. A rollback of release 2 alone stays safe, because the servers from release 1 keep both renderings as
   one state.

Practically: cherry-pick only `functions/shared/attemptPolicy.mjs` and the `functions/index.js` hunk for release 1,
or deploy this branch's functions first and hold Hosting until the drain. Ship through
`node scripts/release-firebase.mjs --execute`, never a raw `firebase deploy`.

**One more effect of the LaTeX change (review N3):** QuestionEngine's "same incorrect response" key includes the
equation LaTeX. A `lastResponseKey` stored before the deploy will not match the same answer after it, so a student
repeating a wrong answer across the deploy can spend at most one extra try. It never earns credit.
- **Rules / indexes**: none.

## Decisions for the owner

1. **Which figures get equal units automatically.** Two or more lines and nothing else, or any drawn segment, with
   one unit on both axes. A single line, any curve, and any graph with different axis quantities keep the old fit.
   Say if single-line slope figures should be equal-unit too: steep lines would then often leave the frame.
2. **Interactive planes are opt-in** (`graphBounds.equalUnits` for Graphing; the feature stage follows its static
   fit). Turning it on by default would change plane heights in every tool on phones and in Work View during live
   classes.
3. **Edge arrows and the plot clip apply only to equal-unit figures**, on screen and in print. Other static graphs
   keep the old drawing, where a line may run one window-height past the frame (rare, because their y is widened).
4. **An implicit product's LaTeX now has a space where it had a tie.** Display is identical except for the removed
   gap. The step-credit key treats both as one state. Stored records are not rewritten.
5. **A fraction is drawn as the student wrote it only when its numerator is a written group** (what ÷ produces, and
   what MathLive's `\frac{-10}{-2}` becomes). A typed −10/2 still draws −10/2 with the sign in front.
6. **Polynomial Workshop's division screen shows zero terms** ("x³ + 0x² + 0x − 8"), because it asks for coefficient
   lists (1, 0, 0, −8). The other modes hide them ("x² − 12"). Say if division should hide them too.
7. **The `index.js` key now matches `compactStepStateKey` exactly (review S4).** For a record that mixed push Q's two
   renderings (`1\left(` before push Q's deploy, `\left(` after), `storedAlgebraStepPartialCredit` used to count one
   state twice. It now counts it once, as the shared key and `bestPartialCredit` already do. `getQuestionCredit` is
   `max(bestPartialCredit, derived)`, so a credit can only drop where the double count had pushed the derived value
   above the stored best, and then it drops to what the server already computed. No other record changes. If no
   live credit may move without a regrade report, hold the `1\left(` line back and keep only the tie rule (the
   test then needs that one input removed).

## Touched outside my files (kept minimal)

- `src/tools/shared/ToolRuntimeContext.jsx`: the `teacherView` field, prop and `useTeacherView` hook (additive).
  Wave 4's B5 (`SubmitText`) and B6 (`useMethodWithheld`) also edit this file; expect a small textual merge near the
  provider signature.
- `src/QuestionEngine.jsx`: `teacherPolicyView` and one prop on each `ToolRuntimeProvider`.
- `functions/shared/attemptPolicy.mjs` `compactStepStateKey`, and `functions/index.js` `storedAlgebraStepPartialCredit`'s
  key: the tie is spacing; the `index.js` copy also gains push Q's `1\left(` rule (it lacked it; a synchronous
  caller, `getQuestionCredit`, is why it is a copy and not an import).
- `src/platform/contract/semanticValidation.js` is unchanged; its strict audit reads the exemption in
  `graphSpecUtils.js`.
- `AI_AUTHORING_COMPILER_HANDOFF.md`: one line on `equalUnits` (a deliberately distorted figure needs `false`).
- `src/platform/workflow/GraphFeatureSelectStage.jsx`: one `equalUnits` prop.
- `src/platform/resources/assignmentWorksheetVisuals.js`: the printed plot's aspect passed to the fit, and a plot clip
  for equal-unit figures.
- `src/tools/representationBridge/RepresentationBridge.jsx` (import line and the readout line),
  `src/tools/polynomialWorkshop/PolynomialWorkshop.jsx` (helper body and one import),
  `src/tools/representationMatch/RepresentationMatch.jsx` (imports and the card label). Wave 4 B5 and B6 edit these
  files on other lines.
- Tests of other sessions rewritten as listed above; `tests/browser/stepAlgebraStructureToolsMain.jsx` gains
  question 8 at the end (no other index moves).

## Merge notes for the integrator

Wave 4's B (submit-and-finish) conflicts with this branch in three places:

- `ToolRuntimeContext.jsx` provider signature: take the union,
  `…, submitCost = null, verdictsWithheld = false, teacherView = false, children`. Keep both value fields.
- `RepresentationMatch.jsx` import line: keep `spokenLinearCard` and add B's `SubmitText`.
- `PolynomialWorkshop.jsx` import lines: keep both (`polynomialReadoutText` and B's `SubmitText`).

## After the independent review (`b6390a8` → `68b845f`)

| Finding | Fix | Proof |
| --- | --- | --- |
| **B1 (blocker)**: strict Pre-Flight rejected valid graphComparison / graphScenarioMatch questions. Their item graphs are audited with strict boundary visibility, and an equal-unit steep line leaving through the top hit the "clipped by its locked viewport" error, so yesterday's imports failed. | `auditStaticGraphViewport` skips that check for equal-unit lines, as it does for `allowClipping`. A locked window is still checked. | `equalUnitPlanes` "review B1": a two-line graphComparison plus L3 CW 1 through `validateQuestionSemantics` gives no graph errors or warnings, while a locked window still errors. Red without the skip. |
| S1: an old server reading new records double-counts a revisited state. | No code: the two-phase release above. | — |
| S2: the equal-unit fit could hide what the old fit showed (y = −2x + 12's intercept), and every 2+-line figure was exempt from "mostly outside". | Each line's y-intercept (when x = 0 is in the window) and each pair's meeting point (within a window's span) are landmarks. The exemption needs the line to show on at least a fifth of the window, or to have a perpendicular partner. | "review S2": (0, 12) and a pair's meeting point (7, 7) stay in frame; y = 4x ± 30 warns twice. Red with the landmarks removed or with the blanket exemption. |
| S3: worksheets got the equal-unit window without a clip, so B′ ran through the tick labels. | A `clipPath` for the plot rect on equal-unit figures, with ids unique per packet. | "review S3": rendered with a minimal DOM; both lines are clipped to the 354 × 224 plot, two figures get different ids, and a parabola gets no clip. Red without the attribute or the counter. |
| S4: `functions/index.js`'s key lacked push Q's `1\left(` rule (pre-existing), yet the test said the copy "agrees". | The copy carries every rule. It stays a copy because `getQuestionCredit` is synchronous; `await import` would make it and its five callers async. | `stepAlgebraStepCredit` compares the two keys over tie, space, `1\left(`, dash, empty and null inputs. Red on any missing rule. |
| N4: `useTeacherView` sat under the hint comment. | Its own comment. | — |
| N5: authoring docs; a quadrant-I figure widened into negative x. | One line in `AI_AUTHORING_COMPILER_HANDOFF.md`; a window that starts or ends at 0 widens away from that edge. | "review S2": a quadrant-I segment keeps xMin 0 and yMin 0. Red with symmetric widening. |
| N7: 1.00001 printed "1x"; division hid the zero terms its own entry asks for. | Ten significant figures; division mode shows zero terms (owner decision 6). | `toolMathReadouts`; red with four places or without `keepZeros`. |
| N3: a pre-deploy `lastResponseKey` will not match after the deploy. | Noted in the release section (at most one extra try, never credit). | — |
| Q-13's spoken name (pre-existing). | Unchanged; listed under Not done. | — |

## Not done

- **The board's spoken name for a divided term** reads "negative 10 / minus 2". It comes from the term's text through
  `speechText` ("/" not read as "over", a sign after "/" read as "minus"). This was the same on the base (text is
  unchanged). It belongs to the shared speech module (W5-2's area); `mathToSpeech('\frac{-10}{-2}')` already says
  "negative 10 over negative 2".
- `r^2 h` does not survive `latexToExpression` (`{ r}^(2) h`). This is pre-existing and identical on the base.
- Polynomial Workshop, Representation Bridge and Representation Match have no `captureToolResponses` script. Their
  submissions are unchanged; the SSR and source tests above cover what is shown.
- No equal-unit option for R-9's "fix the scale" toggle (R-9 builds on this).
