# Student pass 3 — Session D: every student can use every tool (keyboard, focus, Undo)

Branch `claude/pass3-b6-tools-keyboard-undo`, cut from `claude/modest-pasteur-xzagn7` at `a7dddc7`, then merged with
that base twice: at `c803501` (Batch 4's hint ladder, the Batch 8 render-loop fix) and at `8e51f65` (Batch 4's
first-hint offer folding into Help on a short Work View, the teacherWorkflow favicon). The merge was clean: Batch 4's single hint
ladder and this branch's Undo, focus and Connect-my-points work both stand. The whole gate below ran on the merged
result.

Scope: Batch 6 of [student-experience-pass-3.md](../qa/student-experience-pass-3.md), plus TOOL-9 from Batch 7. Item IDs
are those of the detail file [04-tools-and-accessibility.md](../qa/student-experience-pass-3/04-tools-and-accessibility.md).

## What a student saw, what changed, and the proof

### A11Y-2: buttons that disable or unmount themselves threw focus to the top of the page

- **Saw.** Open Sort's "Place selected card here" disabled itself after each placement, and focus dropped to `<body>`.
  In a 12-card sort a keyboard student tabbed back from the top 12 times. In the controlled sort the focused category
  button unmounted along with its card, with the same result. The same pattern hit Transformations' Clear, the
  tool-local Undo/Redo of Linear Table Workbench, Representation Bridge and Regression Calculator, and the derivation
  lab's Swap and Apply.
- **Changed.**
  - New `src/components/common/FocusSafeButton.jsx`: the existing `useFocusSafeDisabled` as a drop-in button. Where a
    button would have been `disabled`, it takes `enabled` instead. While it has focus it stays focusable and is marked
    `aria-disabled`, and a press then does nothing.
  - FocusSafeButton is now used by:
    - Transformations' Clear
    - the Undo/Redo of Linear Table Workbench, Representation Bridge and Regression Calculator (both toolbars)
    - the derivation lab's Swap and Apply
    - Open Sort's Place button
    - the graph workspace's Connect buttons
  - Open Sort moves focus after each action (`openSortBoardA11y.js`):
    - after a placement, to the next card still to place, in the order shown;
    - after the last card, to the heading of the group it went into;
    - after a card is taken back out, to that card;
    - after a group is removed, to its neighbour's heading.
  - When "Check Point Placements" or "Check Reflected Points" passes, the button leaves the page. Focus now goes to
    "Connect my points" instead of `<body>`.
- **Proof.**
  - `tests/browser/keyboardSweep.mjs` has a new probe, 7 (`ACTION_FOCUS_PROBES`), and a new controlled-sort scene. It
    sorts both boards by keyboard: Enter on a card, Tab to Place, Enter. Focus must land on a card or a group heading;
    merely not being on `<body>` is not enough. Result: `lostAfterAction=0/4` for both boards.
  - `tests/browser/toolFocusAndUndo.mjs` presses each self-disabling button by keyboard until it is used up, and checks
    that focus is never on `<body>`.
  - `tests/tools/openSortBoardKeyboard.test.mjs` covers the focus rules.

### TOOL-1: function-graph questions could not be finished without a mouse or a finger

- **Saw.** Points could be placed with the arrow keys or typed, but the curve could only be drawn by hand.
- **Changed.**
  - "Connect my points" (`src/graphConnectPoints.js`) builds a smooth stroke through the student's own placed points:
    - It sorts the points by x and fits a monotone cubic Hermite curve, so the curve never overshoots between two
      points.
    - A rational's two branches are split at the student's own placed center.
  - The stroke goes through exactly the checks a hand-drawn stroke meets. `endDrawing`'s tail was factored into
    `commitConstructionStrokes` / `commitInverseStrokes`, which both routes call:
    - where feedback is shown: `constructionSketchMatches`;
    - where it is withheld: `constructionSketchThroughOwnPoints`.
  - Wrong points therefore give a curve through wrong points. It is refused, or graded wrong, exactly as a drawn one is.
  - "Connect my reflected points" mirrors this for the inverse sketch.
  - After connecting, the end markers are placed as before: choose a marker, use the arrow keys, press Enter.
  - The typed x/y entry now owns its Enter (`data-mm-enter-owner`). Before, the question's Enter contract took Enter as
    "next box", and Enter in the y box placed nothing.
- **Proof.**
  - `tests/tools/graphConnectPoints.test.mjs`, against the real checks:
    - the right points pass for quadratic, square root, rational, absolute value and linear;
    - points three units too high fail the snap;
    - the curve passes through a stray point rather than smoothing it away;
    - a one-sided rational fails;
    - the inverse passes with reflected points and fails with unreflected ones;
    - the curve never overshoots.
  - `tests/browser/graphKeyboardRoute.mjs` has a new section that completes the whole question by keyboard alone in the
    real QuestionEngine: practice with right points (graded correct), a DOL with right points (correct), and a DOL
    with wrong points (graded wrong, the curve part with it). With wrong points in practice there is nothing to
    connect. The inverse is also reflected, checked and connected by keyboard.

### TOOL-2: ten tools had no Universal Undo, and the work bar always showed a greyed ↶ Undo

- **Saw.**
  - These tools had no history: dataModelingLab, both inverse-composition labs, functionOperationsLab,
    parabolaGeometryLab, polynomialWorkshop, signSolutionAnalyzer, complexPlaneLab, exponentialLogBridge,
    representationMatch and openSortBoard.
  - Open Sort deleted a named group and its explanation with no way back.
  - The derivation lab had two Undo buttons, and only its own worked.
- **Changed.**
  - New `src/tools/shared/useFieldUndoHistory.js` (pure part: `fieldUndo.js`). It is `useMathUndoHistory` over a
    tool's answer fields, kept across a reload, with `persist: true`. The history lives in this device's storage
    (`persistedMathUndo.js`) and never in the synced draft, so Batch 3's draft merge is unaffected. A restore writes
    back only the fields that differ, and it never submits.
  - The ten tools join through it, every mode of each.
  - Open Sort records `{ groups }`: placements, names, explanations, and which groups exist.
  - The derivation lab records `{ derivation, operation, operand }`, and its own Undo button is gone. One Undo takes
    back one step and gives back the number that was typed for it.
  - `workViewInventory.js` declares `undo` for every migrated tool. That includes five tools that already kept a
    history but never declared it: linearTableWorkbench, representationBridge, regressionCalculator, expressionMeaning
    and matrixLab.
  - `QuestionEngine.jsx`: the work-bar Undo is hidden when no history is registered (one line). The Work View rail was
    left alone.
- **Proof.**
  - `tests/browser/toolFocusAndUndo.mjs` (new, added to CI's Student Runtime Browser Gates). For every tool above, in
    the real QuestionEngine, at 1366×768 (Open Sort and Function Operations also at 390×844):
    - Undo is unavailable before any edit;
    - after two edits, two Undos walk back to exactly the starting state, and focus stays on Undo;
    - after a reload the work is back, and Undo takes back the edit made before it;
    - an Undo after a Check makes no attempt.
  - The same driver brings back a removed group with its name and explanation.
  - `tests/tools/fieldUndo.test.mjs` covers the pure part.
  - `tests/platform/workViewStage3D.test.mjs` holds every inventory declaration to a real history in that tool's
    sources.
  - `workViewCertification` now proves single-owned Undo in Work View for the new tools on all 8 devices.

### A11Y-7: Open Sort's repeated buttons had identical names

- **Changed.**
  - Place: "Place Graph C here, in Group 2 · Linear"; the visible text is "Place Graph C here".
  - Remove: "Remove group 2 · Linear".
  - A placed card: "Graph C: take it out of Group 2 · Linear".
  - A controlled-sort category: "Linear: place Graph C here".
  - A group-name box: "Name this group (Group 2)".
  - Each accessible name starts with the button's visible words (WCAG 2.5.3).
  - Each placement is announced: "Graph C placed in Group 2 · Linear. 2 cards left to place."
- **Proof.** `tests/tools/openSortBoardKeyboard.test.mjs`, and the keyboard sweep's names.

### A11Y-3 (Representation Match only): card names read program text

- **Changed.** The line-card name passes `describeLinearCard(...)` through `spokenMathLabel()`. A screen reader now says
  "y equals negative 2 over 3 x plus 4", not "y = -2/3x + 4". `describeLinearCard` itself is unchanged; the solution
  review uses it.
- **Proof.**
  - `tests/platform/representationMatchStudentUx.test.mjs`: the old pinned regex was rewritten to assert the
    behaviour. The names are spoken (no `= / * ( )`), and the line-card button's own label goes through speech.
  - `tests/browser/studentUxPlatform.mjs` `sort`: a phone student sorts by the cards' names. Its plan-card pattern now
    reads spoken math.

### TOOL-9: the Regression Calculator had no how-to, and its zoom buttons did nothing

- **Changed.**
  - Three steps: Add Item, then table; the curve button; read r and interpret. The last step adapts when no
    interpretation is asked.
  - The student graph uses the plane's own Zoom in / Zoom out / Reset view (`panZoom`). The aria-hidden ＋/− drawings
    and their CSS are gone.
  - Zoom is camera only: it never counts as an edit and never enters Undo.
- **Proof.**
  - `tests/platform/regressionCalculatorHowTo.test.mjs`.
  - `toolFocusAndUndo.mjs`, at 1366×768 and 390×844:
    - the "How to do this (3 steps)" panel is there;
    - Zoom in changes the axes, and Reset view puts them back;
    - the toolbar Undo stays unavailable throughout.

## Fixes from the independent review (head `11d8a2b` → this head)

The integrator's review found one blocker and two should-fixes. All are fixed and pinned.

- **BLOCKER — My Math Path: Undo handed the next question the previous question's answers.**
  - Why: PathSessionPlayer keeps one QuestionEngine mounted and swaps the question under it.
    `usePersistentToolState` re-read the new question's draft in an effect, one render after Universal Undo had
    re-baselined on the old answers. That late re-read was recorded as an edit, so the next item opened blank with
    ↶ Undo enabled, and one press wrote the previous item's answers into it and its draft. This predates the branch
    (the older direct `useMathUndoHistory` tools had it too), but the ten new tools widened the exposure.
  - Fix: the key-change re-read now happens during render (React's adjust-state-while-rendering pattern) in
    `src/tools/shared/usePersistentToolState.js`. That fixes every tool, old and new. This is a shared file; Batch 3
    may touch the same hook.
  - Proof:
    - `tests/tools/undoQuestionSwap.test.mjs` renders real React in node through QuestionEngine's own Undo wiring,
      for both hooks. The next item opens with nothing to undo, an Undo press gives it nothing and writes nothing to
      its draft, its own edit undoes back to its own blank start, and the first item comes back intact.
    - `toolFocusAndUndo.mjs` has a new swap step, through the real QuestionEngine with `?swap=1`, for Data Modeling,
      Polynomial Workshop and Open Sort.
    - Mutation checks: the old effect-based re-read fails both unit cases and the browser step, and `resetKey: null`
      fails the field-hook case.
- **Enter in the typed x box placed the point at y = 0.**
  - Why: `Number('')` is 0.
  - Fix (`src/graphTypedCoordinate.js`):
    - An empty box is missing, not 0.
    - Enter moves on to the empty box, and places once both hold a number.
    - A card that states its x ("Plot the point where x = 2") needs only y. My first version of this fix refused that
      case; `stagedQuestion` caught it, and it is fixed.
  - Pinned by unit tests and three `graphKeyboardRoute` checks.
- **Undo while a submission is grading, or in a tab paused by another.**
  - Fix: the work-bar and Work View Undo now share one rule, `undoUnavailable = locked || submitting ||
    pausedByAnotherTab`, the same conditions Reset and Submit already check.
  - Pinned in `workViewStage3D`, mutation-checked.
  - Not covered: the in-tool Undo/Redo buttons that predate this branch (Linear Table Workbench, Representation
    Bridge, Regression Calculator, Expression Meaning, Matrix Lab) call the same history directly and do not read this
    rule. Left as they were.
- **Notes from the review:**
  - A secure item's draft family is sent without the local Undo history (`withoutPersistedUndo` at both send sites in
    `RichQuestionRuntime.jsx`, two lines in Session B's file). Pinned in `tests/tools/persistedUndoNotSent.test.mjs`.
  - Newly pinned:
    - a rational is split at the student's center, never at the true one;
    - a press on an unavailable FocusSafeButton does nothing (the derivation lab's Apply, in the browser).
  - `useFieldUndoHistory`'s comment now says what happens to a verdict: an Undo does what that tool's own edits do.

## Rewritten contracts (playbook)

| Test | Pinned | Now asserts |
| --- | --- | --- |
| `workViewStage3D` "Undo inventory…" | a fixed map of 9 tools with undo; parabola, function operations and open sort must **not** declare undo | for every migrated tool, a declared undo matches a real `use(Math\|Field)UndoHistory({` in its sources; the ten tools declare it; the field helper is the platform hook |
| `workViewStage3D` scratchpad | `!scratchpadOpen ? <UniversalUndoButton` | inside the work-bar region: hidden when the scratchpad covers it **or** no history is registered |
| `representationMatchStudentUx` | aria-label = raw `describeLinearCard(...)` | the names are spoken, and the line-card button's label goes through `spokenMathLabel` |
| `workViewCertificationManifest` | (data) | the Regression Calculator scene does not count a shell Undo: its Undo is the platform history in its own toolbar, and RegressionCalculator.css hides the shell copy on purpose |
| `studentUxPlatform` sort | program-text plan pattern | spoken-math pattern |
| `secureExamNavigationWiring`, `secureRichToolRuntimeWiring` (review fix) | `workspaceDrafts: readQuestionDraftFamily(draftKey)` | the item's draft family is sent, less the Undo history (`withoutPersistedUndo(...)`) |
| `solverWorkspaceModes` (review fix) | `onClick: () => undoController?.onUndo?.()` | inside the Work View Undo action, the press reaches the assignment's controller |
| `toolDraftPersistence` "initializers before a draft-key change" (review fix) | the key-change restore is a `useEffect` after the initializer | the key-change restore (now `if (renderedKey !== key)`, during render) comes after the current initializer is assigned |

## Mutation checks (each broke the code once and turned red, then was restored)

- **keyboardSweep:** the Open Sort `target.focus` call removed → `lostAfterAction=4/4` on both boards.
- **representationMatchStudentUx:** the `spokenMathLabel` wrapper removed → fail. Also `studentUxPlatform` `sort` →
  fail.
- **workViewStage3D:**
  - Open Sort's `undo` removed from the inventory → fail.
  - complexPlaneLab's history removed → fail.
  - the work bar showing an Undo with no history → fail.
  - the derivation lab's local Undo restored → fail.
- **fieldUndo:** a restore that writes every field → fail. One that blanks fields missing from an old history → fail.
- **toolFocusAndUndo:**
  - parabola's history removed → fail.
  - Clear made a plain `disabled` button → focus on body.
  - Open Sort with `persist: false` → Undo fails after a reload.
- **graphConnectPoints:** a straight line between the end points → fail. Connecting the authored answer instead of the
  student's points → fail.
- **graphKeyboardRoute:**
  - the focus hand-off after Check removed → focus `<body>`.
  - `data-mm-enter-owner` removed → Enter in the y box places nothing.
- **regressionCalculatorHowTo:** `panZoom` off → fail. Empty steps → fail.
- **openSortBoardKeyboard:**
  - focus always to the first card → fail.
  - identical Place names → fail.
  - no target after the last card → fail.

## Gate (on the merged result, base `8e51f65`)

After the review fixes I reran on the final head:

- the node gate and both builds;
- `npm run test:draft-persistence`, because the fixes change how every tool reads its draft;
- the drivers: `toolFocusAndUndo`, `graphKeyboardRoute`, `graphPointCheck`, `composedDraftRestore`, `composedOutcomePolicy`, `clickMapLetterbox`, `stagedQuestion`, `studentUxPlatform`, `workViewMatrix`, `assessmentLeakGates`, `undoTyping`, and (on `aab7974`) `draftEditTime`, `warmupReopenDraft`, `staleTabRecord`, `duplicateTabs`, `captureToolResponses`, `linearMultipleRepresentations`, the five tool keyboard drivers, `toolPolicyGates`, `workViewCertification`.

All pass. The certification rows (accessibility, dark mode) and the five tool keyboard drivers are from the run on
`c803501`; the review fixes do not change what they measure.

| Check | Result |
| --- | --- |
| `npm ci`, `npm --prefix functions ci` | ok |
| `npm run test:platform` | 11,429 / 11,429 |
| `node --test tests/tools/*.test.mjs` | 1,670 pass, 0 fail, 1 skipped |
| `npm run test:draft-persistence` | pass |
| `npm run test:authoring-v5` | not run: authoring and the compiler are untouched |
| `npm run lint` | 0 errors (warnings only, none new from this branch) |
| `npm run build`, `npm run build:firebase` | pass; no tracked file rewritten |
| `toolFocusAndUndo` (new, in CI), `graphKeyboardRoute` (44 checks) | pass |
| `undoTyping`, `workViewMatrix` | pass |
| `workViewCertification` | pass (24 tools × 8 devices, 0 findings). The first full run had one finding (complexPlaneLab iphone-portrait: "Work View opener is blocked: click timeout"), and the rerun passed with no source change in between. Treat it as a flake to watch. |
| `toolKeyboardDataModelingAndSystemsCss`, `toolKeyboardRegression`, `toolKeyboardRelationMapping`, `toolKeyboardNumberLine`, `toolKeyboardThreePlane` | pass |
| `keyboardSweep --tool=openSortBoard` | `lostAfterAction=0/4` on both boards; no unnamed stops, no mouse-only controls |
| `linearMultipleRepresentations`, `captureToolResponses`, `toolAttemptOutcome`, `toolPolicyGates`, `unansweredChoiceGates`, `assessmentLeakGates`, `graphPointCheck`, `stagedQuestion`, `workBarPrimaryLabel`, `unchangedConfirmWorkView`, `regressionCalculatorPhone`, `phoneToolPanelReach`, `mathSpeech`, `workViewTerminalTransition`, `studentAccessibleNames` | pass |
| `studentUxPlatform` | every journey passes on `8e51f65`. `sort` passes after its rewrite (see above). At `c803501`, `staged` and `keypad-short` failed identically on the base itself (checked in a separate worktree); the base's `8fff9c1` fixed them |
| `npm run certify:accessibility` | pass (11 screens × 2 viewports, no new violations) |
| `npm run certify:dark-mode` | pass (192 surfaces) |
| `node scripts/release-firebase.mjs --since a7dddc7` (plan only) | Hosting only |

## Deploying (not done)

`node scripts/release-firebase.mjs --since a7dddc7` (plan mode only) lists **Hosting only**. No functions, rules or
indexes change. When it ships:

```bash
npm run build && npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting   # or the release script with --execute
```

## Decisions for the owner

1. **The work-bar Undo is hidden when a question has no history at all.** Before, it was a permanent grey button.
   Every registry tool now has history, so in practice this hides it only on question types that never registered
   one. The Work View rail's Undo was left as it is (outside the one line in scope).
2. **Undo history persists across a reload for the ten tools** (`persist: true`). It is local to the device and capped
   by size, as on the representations board. Say if any tool should not.
3. **After connecting, "Connect my points" stays on screen as "✓ Curve drawn".** It is unavailable at that point. This
   keeps focus where the student is.
4. **The Regression Calculator's zoom is now the plane's row of controls under the graph.** They are not in the corner
   where the drawings were.
5. **"Connect my points" is offered to every student, not only to keyboard users.** On an exit ticket (DOL) the curve
   part therefore follows from the points: right points connected give a right curve. The reviewer checked 18
   function setups (quadratic, absolute value, cubic, cube root, square root, exponential, logarithmic, rational,
   linear), and every one passes both the practice snap and the hidden DOL curve check. If the curve should stay a
   separate demonstration of skill on assessments, Connect could be limited to practice, or to students with a
   keyboard-access accommodation. That is a policy call, so I left it open.
   **Decided 2026-10-23: keyboard-access only (C1-120).** Where outcomes wait (an exit ticket, quiz or test) "Connect
   my points" and "Connect my reflected points" are offered only to a student whose support plan has the new
   `keyboard-access` accommodation (`src/platform/graph/connectPointsPolicy.js`); everywhere else every student keeps
   them. The accommodation is in the support catalog (teachers tick it in the profile editor), reaches the workspace as
   `supportPresentation.keyboardAccess`, and is recorded as provided when the button shows because of it.

## Not done / for other sessions

- The Regression Calculator now shows CoordinatePlane's "Reset view", which still self-disables plainly. That is
  Session E's CoordinatePlane fix (A11Y-2).
- Open Sort's "Why do these belong together?" boxes share one visible label. They were left as they are: A11Y-7 named
  the buttons only.
