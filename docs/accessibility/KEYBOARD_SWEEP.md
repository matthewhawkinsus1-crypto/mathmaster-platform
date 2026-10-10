# Keyboard sweep — student tools (WCAG 2.1.1 Keyboard, 2.4.7 Focus Visible)

Audit date: 2026-10-07. Re-runnable: `tests/browser/keyboardSweep.mjs` (an audit,
not a gate; always exits 0). Nothing in application source was changed.

```
npx vite --host 127.0.0.1 --port 5499 --strictPort &
AUDIT_ORIGIN=http://127.0.0.1:5499 node tests/browser/keyboardSweep.mjs              # 24 tools + extra modes
AUDIT_ORIGIN=http://127.0.0.1:5499 node tests/browser/keyboardSweep.mjs --host=bare  # without the assignment-screen wrapper
#   --tool=<id> | --tool=<id>:<variant>   one scene      --extras-only / --no-extras
#   --out=<name>                          write report-<name>.json instead of report.json
```

Output: `tests/browser/artifacts/keyboard/report.json` (gitignored, like every
browser artifact) plus one `tool-<scene>.json` per scene.

## Status after job F (same day)

The shared gaps below were fixed on `claude/student-push-f-accessibility` and
re-measured with this script; tool-specific gaps (T1–T8) are for the wave-2
per-tool sweep (job A's files).

| Gap | Status | Where | Re-measured |
| --- | --- | --- | --- |
| S1 focus to `<body>` after Check | **fixed** | `src/components/common/useFocusReturnAfterLock.js`, one call in `QuestionEngine.jsx` | graphing2: lostAfterCheck 2 → 0 (and 2 again with the call removed) |
| S2 nested figure blurs focus | **fixed** | `EnlargeableFigure.jsx` (no blur when nested) | graphing2: late drop 200 ms → none |
| S3 Scratchpad not a real modal | **fixed** | `ScratchpadOverlay.jsx` on `<Dialog>`; Dialog recovers an opener disabled while loading | opens inside, Tab stays in, Escape asks about unsaved work, focus returns to Scratchpad |
| S4 Tab walks out of Work View | **fixed** | `EnlargeableFigure.jsx` on `useModalDialog`; the floating calculator is an allowed layer | graphing2: dialog tabbing leaked=false, Escape closes |
| S5 controls under the action bar off the assignment screen | **fixed per host** (job H) | `src/platform/layout/actionBarFocusReveal.js` + `useActionBarFocusReveal` in `PathSessionPlayer`, `SectionRecoveryRunner`, `LiveChallengeStudent`: after the browser reveals a keyboard-focused control, the page scrolls only if the sticky bar actually covers it (overlap + 12px); pointer focus and in-view controls never move the page. Rich runtime / secure exam: see the job H handoff | `tests/browser/hostAccessibility.mjs`: 17 covered stops at 1366×768 on five Path tools and a DOL Recovery → 0 (17 again with the hook removed); Live Challenge tool round 0 → 0 |
| S6 points movable by pointer only | **fixed** | `CoordinatePlane.jsx`: Enter picks up / arrows / Enter drops / Escape | `tests/browser/graphDescription.mjs` |
| S7 calculator ignores Escape | **fixed** (job H) | `CalculatorPanel.jsx`: Escape (capture phase, one layer) closes it and focus returns to the opener; ✕ too; the ↕ grip is a "Move calculator" button (arrows, Enter = next corner; a pointer still drags) | `tests/browser/calculatorKeyboard.mjs` (both viewports, over Work View) |
| S8 ring for custom tab stops | **fixed** | `src/index.css` global `:focus-visible` for ARIA widgets, beats inline `outline:none` | `tests/browser/accessiblePrimitives.mjs` |
| S9 "values have not changed" dialog | **fixed** (job H) | `QuestionEngine.jsx`: both modals on `<Dialog>`; the confirm is named, opens on Go Back, Escape = Go Back | `tests/platform/accessibleDialog.test.mjs` (no allow-list left) |

## Bottom line (the original measurement)

* **No keyboard traps** in any of the 31 scenes (24 tools + 7 extra modes):
  Tab and Shift+Tab always got from one sentinel to the other.
* **Every tab stop showed a visible focus change** in Chromium on the assignment
  screen (404 stops measured). The global ring in `src/index.css:231` does its job
  for native controls; the six `outline: none` rules in tool CSS either lose to
  it or sit on programmatic-focus (`tabIndex={-1}`) containers.
* **Every tool's sample question could be answered and submitted with keys
  only** (23 of 23 that have a student action; Solution Review's sample has
  none). Per tool, counting the extra modes: **yes 19, partial 3, no 1, n/a 1**.
  The gaps are modes: Mapping Diagram's coordinate *plot* is mouse-only (no),
  the 3D three-plane view rotates by drag only, placed Number Line endpoints
  cannot be toggled or moved by keyboard, and a misplaced Transformations Lab
  point can only be fixed with Undo (partial).
* **The serious problems are shared, not per tool.** Pressing Check with the
  keyboard throws focus to `<body>` in **every** tool QuestionEngine grades (S1),
  a nested Work View figure can blur the student's focus shortly after load
  (S2), the Scratchpad is a modal you cannot Escape and that never takes focus
  (S3), Work View lets Tab walk out of an `aria-modal` dialog (S4), and on hosts
  other than the assignment screen Tab parks controls under the sticky action
  bar (S5). Fixing S1–S5 in shared code fixes them for all 24 tools at once.

## What was measured, and how far to trust it

* **Scope.** The 24 tools in `src/tools/toolRegistry.js` (`TOOL_LOADERS`), each
  with its preview-bench question (`SAMPLE_SPECS` in `src/dev/MathToolsLab.jsx`),
  plus 7 extra scenes for tools whose modes are different interfaces
  (Systems Workspace inequality builder / algebraic board / augmented matrix /
  3D three-plane view, Transformations Lab parameter matching, Sequence Explorer
  full bridge, Mapping Diagram coordinate plot). 31 scenes in all.
  Legacy question types outside the registry (StepByStepAlgebra, GraphAxisEditor,
  the graders in `src/*.jsx`) are **not** covered.
* **Surface.** `tests/browser/keyboardSweep.html` mounts the tool through
  `QuestionEngine` exactly as `workViewCertificationMain.jsx` does, inside the
  same `mathmaster-assignment-screen` wrapper App.jsx uses, with both
  stylesheets in production order (`index.css` owns the global focus ring). So
  Work View, the work bar (Undo / Reset / Scratchpad / Calculator), hints and the
  submit lock are all real. Two sentinel buttons bracket the tool.
* **Device.** Chromium (Playwright, `/opt/pw-browsers/chromium`), 1366×768,
  deviceScaleFactor 1. Chromium's UA focus ring is counted as a visible
  indicator; other engines were not run.
* **Per scene, keys only:**
  1. *Forward walk* — Tab from the start sentinel to the end sentinel. Every stop:
     Chrome accessibility-tree role and name (CDP), and a focus-indicator check:
     computed outline / box-shadow / border / background of the element, its
     `::before`/`::after` and two ancestors, focused vs blurred, **plus** a pixel
     diff of the area around it, **plus** an `elementFromPoint` test for whether
     the focused control is under something else (2.4.11). A walk that stops or
     cycles before the end sentinel is a trap.
  2. *Reverse walk* — Shift+Tab back to the start sentinel.
  3. *Popups and dialogs* — every stop with `aria-expanded`/`aria-haspopup` or
     named like Work View / Scratchpad / Calculator / hint / menu is opened with
     Enter; dialogs are Tab-walked (is focus contained? is Close reachable?);
     Escape must close a dialog, menu or floating panel (not a plain disclosure)
     and focus should come back to the trigger.
  4. *Primary action* — a fresh copy is answered with keys only (type into every
     box, arrows/Space on selects, radios and choice buttons, arrows + Enter on
     any focusable plane) for up to three passes, pressing every Check/Submit
     with Enter. "graded" = QuestionEngine's `onGrade` fired. **A correct answer
     is not the test** (the sweep does not know the answers); "the tool accepted
     a keyboard-only attempt" is. Focus position after Check is recorded.
  5. *Late focus loss* — Tab once right after load, watch focus for 3 s.
  6. *Mouse-only handlers* — every rendered element whose React props carry a
     click/pointer/drag handler: is it a tab stop, and can Enter/Space reach it?
  7. *Static scan* (same script) of `src/tools/**`, `src/components/common/**`,
     `src/ui/**`, `MathDisplay.jsx`, `MathInput.jsx`, `index.css`, `App.css` and
     the QuestionEngine chrome (`QuestionEngine.jsx`, `ScratchpadOverlay.jsx`,
     `CalculatorPanel.jsx`, `MobileViewportContainer.jsx`): non-button JSX with
     click/pointer handlers, pointer-only buttons, `draggable`/`onDragStart`,
     and `outline: none|0`.
* **Hand-driven follow-ups** (scripted keyboard flows, same harness) for the
  tools whose flow the generic probe cannot guess: Open Sort Board, Linear Table
  Workbench, Expression Meaning, Number Line and Intervals, Regression
  Calculator. Each control was reached by Tab and pressed with Enter/Space or
  typed into. Results are quoted per tool below.
* **Not measured:** screen-reader output, contrast of focus rings (2.4.11/2.4.13
  appearance), touch, other viewports, tools' other modes beyond the scenes
  listed, teacher surfaces.

## Counts

From run 3 — the committed script, assignment-screen host, all 24 sample
scenes + 6 extra modes — plus the Mapping Diagram plot scene (added afterwards,
run with `--tool=relationMapping:plot`). The sticky-bar numbers come from run 2
with `--host=bare` (24 sample scenes), made with an earlier revision of the same
script: its obscured-control test also sampled the bounding-box corners of round
SVG nodes and so reported 6 Mapping Diagram nodes as "covered" by the oval drawn
behind them; those 6 false positives are excluded below, and the committed
script samples only the centre of an SVG node. Late focus loss is
timing-dependent, so it is given for both runs.

| Measure | Result |
| --- | --- |
| Registry tools / scenes | 24 / 31 |
| Tab stops recorded (inside the tool + work bar) | 404 |
| Keyboard traps (forward or reverse) | **0 / 31** |
| Reverse walk reached the start | 31 / 31 |
| Tab stops with no visible focus change (assignment screen, Chromium) | **0 / 404** |
| Tab stops hidden under the sticky action bar — assignment screen | 0 |
| Tab stops hidden under the sticky action bar — `--host=bare` (24 sample scenes) | **17 stops in 8 tools** (S5) |
| Tab stops with no accessible name | 1 (Data Modeling residual table scroller, T6) |
| Scenes where a keyboard-only attempt was graded by QuestionEngine (generic probe) | 24 / 31 |
| …plus graded by a hand-scripted keyboard flow | Open Sort Board (correct), Linear Table Workbench, Expression Meaning (correct), Number Line, Regression Calculator |
| Scenes where focus was on `<body>` after a keyboard Check | **24 / 24** graded scenes (S1) |
| Scenes where focus fell to `<body>` within 3 s of load, unprompted | **15 / 30** (run 3), 10 / 24 (run 2) (S2) |
| Work View: Enter opens / focus moves in / Escape closes / focus returns | 31 / 31 each |
| Work View: Tab leaves the `aria-modal` dialog | **31 / 31** (S4) |
| Scratchpad: Escape closes | **0 / 31** (S3); Tab leaves it 31 / 31 |
| Calculator panel: Escape closes | **0 / 31** (S7) |
| Rendered elements with a pointer handler and no keyboard route | 3 surfaces: Number Line line, 3D three-plane model, Mapping Diagram plot (T1–T3) |
| Tab stops whose Enter/Space do nothing | Number Line endpoints, 3 JSX sites (T3; verified by keyboard flow) |
| Static: non-button JSX with click/pointer handlers | 17 (9 tool, 8 shared/platform) — each classified in the appendix |
| Static: buttons with only a pointer handler | 0 |
| Static: `draggable` / `onDragStart` | 2, both with a click-to-pick-up alternative |
| Static: `outline: none` / `outline: 0` | 8 (6 tool CSS, 2 shared) — 0 produced an invisible focus |

**Gap totals:** **10 shared-component gaps** — S1–S8 plus the two small items
in S9. S1–S4 and S7 hit every tool; S5 hits every tool on hosts other than the
assignment screen; S6 hits the 9 call sites that let a student move a point;
S8 and S9 are latent. **7 tool-specific gaps** (T1–T7: 2 block a mode, 1
partial, 4 minor) plus a 6-site CSS watch list (T8).

---

## Part 1 — SHARED-component gaps (integration lane)

Ordered by impact. "Every tool" means every one of the 31 scenes
showed it, because it lives in the chrome QuestionEngine renders around every
tool. Items marked **platform chrome** live in files outside the listed shared
directories (`QuestionEngine.jsx`, `ScratchpadOverlay.jsx`,
`components/CalculatorPanel.jsx`) but are shared by every tool and are not
tool code; they are listed here so the integration lane can decide ownership.

### S1. Pressing Check by keyboard drops focus to `<body>` — every graded tool (platform chrome)

* **Where:** `src/QuestionEngine.jsx:2096-2101`. While `submitting` is true the
  whole tool is wrapped in `<fieldset disabled>` and an `inert` div. The Check
  button the student just pressed is inside it, so the browser blurs it; when
  `submitting` goes false nothing puts focus back. `setSubmitting(true)` at
  `QuestionEngine.jsx:919, 934, 1070, 1082, 1187`.
* **Evidence:** focus was on `<body>` after Enter on Check in **24 of 24**
  scenes QuestionEngine graded (both presses, every tool). The one Check that
  kept focus was Representation Bridge's per-stage "Check this stage", which does
  not go through QuestionEngine's submit. Mutation log during the press (Number Line):
  `DIV inert=""`, `FIELDSET disabled=""`, then both removed; the `focusout`
  stack is React's `setProp` in `commitUpdate`. The button is still connected and
  enabled afterwards, but `document.activeElement === document.body`.
* **Effect:** after every wrong answer (attempts left) a keyboard or switch user
  is thrown to the top of the page and must Tab through the task card, Work View
  button and directions again to get back to their answer. Fails 2.4.3 in
  spirit and makes 2.1.1 operation very costly.
* **Proposed fix (small):** remember what had focus when the lock starts and
  give it back when the lock ends.
  ```jsx
  // QuestionEngine.jsx, next to the submitting state
  const submitFocusRef = useRef(null);
  useLayoutEffect(() => {
    if (submitting) {
      const active = document.activeElement;
      submitFocusRef.current = active && active !== document.body ? active : null;
      return;
    }
    const previous = submitFocusRef.current;
    submitFocusRef.current = null;
    if (!previous) return;
    if (document.activeElement && document.activeElement !== document.body) return; // something else took focus deliberately
    if (previous.isConnected) previous.focus({ preventScroll: true });
    // else: the button was replaced; focus the feedback/status region of this
    // question instead (give it tabIndex={-1}) rather than leaving <body>.
  }, [submitting]);
  ```
  (`useLayoutEffect` with `submitting` in deps runs before the blur is visible to
  the next key press. The correct-answer path, which moves to "Next question",
  already sets its own focus and is left alone by the `activeElement` guard.)
  The same disabled-while-focused pattern drops focus on the work-bar
  **Scratchpad** button (`QuestionEngine.jsx:1841`, `disabled={scratchpadLoading}`);
  `src/components/common/useFocusSafeDisabled.js` already exists for exactly this
  and is used by `UniversalUndoButton.jsx` — use it there too.

### S2. A nested Work View figure blurs whatever is focused, anywhere on the page

* **Where:** `src/components/common/EnlargeableFigure.jsx:169-174`:
  ```js
  useEffect(() => {
    if (!shouldForceClose) return;
    if (typeof document !== 'undefined') document.activeElement?.blur?.();
    ...
  }, [shouldForceClose]);
  ```
  `shouldForceClose = forceClosed || questionTerminal || nestedWorkView`
  (line 117). Every `EnlargeableFigure` a tool renders inside QuestionEngine's own
  Work View is *nested*, so `shouldForceClose` is permanently true for it and the
  effect blurs `document.activeElement` on mount **and every time React
  reconnects its effects** (a Suspense boundary above it re-showing after a lazy
  chunk, a stage that mounts a new figure). 27 `<EnlargeableFigure>` call sites
  in `src/tools`.
* **Evidence:** with one Tab pressed right after load, focus fell to `<body>`
  on its own within 200–400 ms in 15 of 30 scenes in run 3 and 10 of 24 in run 2
  (different tools each run). The `focusout` stack is
  `EnlargeableFigure.jsx` → `commitHookPassiveMountEffects` →
  `reconnectPassiveEffects`. It is timing-dependent (it fires when the tool's
  lazy pieces settle), which is why it is not every scene on every run.
* **Effect:** a student who starts tabbing as the question opens, or whose
  focused control causes a new figure to mount, is dropped to `<body>`; in one
  observed walk (Representation Bridge) the next Tab then landed on the work bar,
  skipping the whole tool.
* **Proposed fix (one line of intent):** only blur when this figure is the one
  being force-closed while it holds focus, and never for a nested figure (it is
  never enlarged, so it has nothing to close):
  ```js
  useEffect(() => {
    if (!shouldForceClose) return;
    const host = hostRef.current;
    if (!nestedWorkView && enlarged && host?.contains(document.activeElement)) document.activeElement.blur();
    setDrawer(null);
    setEnlarged(false);
  }, [shouldForceClose]);
  ```
  (Keeps the documented purpose — dismiss the mobile keyboard when a grading
  transition closes an open Work View — without touching focus elsewhere. Read
  `enlarged`/`nestedWorkView` through refs or add them to the deps so the
  exhaustive-deps lint stays quiet.)

### S3. Scratchpad dialog: no focus in, no Escape, focus not contained, focus not returned — every tool (platform chrome)

* **Where:** `src/ScratchpadOverlay.jsx:405-420` (`role="dialog" aria-modal="true"`),
  `requestClose` at `:395-401`; opened from `QuestionEngine.jsx:1310-1319`.
* **Evidence:** 31 / 31 scenes: Escape did not close it and Tab left the
  dialog. Hand probe (Graphing): open with Enter → focus is
  `<body>` (the trigger is disabled while loading, see S1); Escape → still open;
  Tab walks out of the "modal" into the page behind (sentinels, task card);
  closing with its Close button → focus `<body>`.
* **Not a gap:** the drawing canvas (`ScratchpadOverlay.jsx:515`) is freehand
  and path-dependent, which 2.1.1 exempts. Its toolbar (pen, colours, eraser,
  undo, pages, Save, Close) is all real buttons and reachable.
* **Proposed fix:** the pattern already in this repo at
  `src/components/common/SolverWorkspaceFrame.jsx:116-147` (Escape + Tab wrap +
  initial focus) applied to the overlay root:
  * on open: remember `document.activeElement` (or take an `openerRef` from
    QuestionEngine) and focus the first toolbar button (`requestAnimationFrame`).
  * `keydown` on the overlay: `Escape` → `requestClose()` (so unsaved work still
    gets the "Save your work first?" alertdialog, `:580-584`); `Tab` wraps between
    first and last focusable inside the overlay.
  * on close: focus the Scratchpad button again (QuestionEngine owns it; pass an
    `onClosed` that focuses its ref).

### S4. Work View is `aria-modal` but Tab walks out of it — every tool

* **Where:** `src/components/common/EnlargeableFigure.jsx:542-544` (dialog
  semantics) and its keydown effect `:176-189` (Escape only).
* **Evidence:** 31 / 31 scenes: Tab from Close walked on past the dialog into
  the page behind (sentinels, task card, directions). What already works: Enter
  on "Enlarge question"
  opens it and focus moves to Close (`:187`); Escape closes; focus returns to the
  opener (`:250-259`).
* **Effect:** with Work View covering the screen, Tab goes on into controls of
  the page underneath that the student cannot see (2.4.3, 2.4.11).
* **Proposed fix:** add the Tab wrap to the existing handler (same code as
  `SolverWorkspaceFrame.jsx:124-137`, using `hostRef.current` as the container):
  ```js
  if (event.key === 'Tab') {
    const focusables = [...hostRef.current.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), math-field, [tabindex]:not([tabindex="-1"])')]
      .filter((el) => el.getClientRects().length);
    const first = focusables[0]; const last = focusables.at(-1);
    if (event.shiftKey && (document.activeElement === first || !hostRef.current.contains(document.activeElement))) { event.preventDefault(); last?.focus(); }
    else if (!event.shiftKey && (document.activeElement === last || !hostRef.current.contains(document.activeElement))) { event.preventDefault(); first?.focus(); }
  }
  ```
  (The calculator panel is a sibling of the figure, not inside it; if it must be
  usable while Work View is open, include `[data-work-view-floating-tool]` in the
  focus set, or render the work bar inside the dialog as the rail already does.)

### S5. Tab can park a control under the sticky action bar on hosts other than the assignment screen

* **Where:** the scroll-padding that keeps a Tab-scrolled control clear of the
  sticky bottom bar is keyed to App.jsx's wrapper class only:
  `src/App.css:736-750` (`html:has(.mathmaster-assignment-screen)`,
  `.mathmaster-assignment-screen { scroll-padding-bottom: … }`), `:2276-2278`,
  and `math-field` scroll-margin at `:1964-1967`. The bar itself
  (`.mathmaster-desktop-action-bar`, rendered by QuestionEngine /
  `MobileViewportContainer.jsx`) is in every host.
* **Hosts that mount QuestionEngine without that class:**
  `components/student/PathSessionPlayer.jsx:513`,
  `components/liveChallenge/LiveChallengeStudent.jsx:481`,
  `components/student/SectionRecoveryRunner.jsx:179`,
  `components/question/RichQuestionRuntime.jsx:296`,
  `components/demo/DemoExperience.jsx:99`, `platform/ToolWrapper.jsx:82`.
  (Each host was not rendered individually; the harness reproduces "QuestionEngine
  without the class" with `--host=bare`.)
* **Evidence:** run 2 with `--host=bare`: 17 Tab stops in 8 tools were covered
  by the bar (`elementFromPoint` at the centre and inset corners hit the bar for
  at least 3 of 5 points; for most of them the focused-vs-blurred pixel diff was
  0, i.e. nothing of the ring showed): Data Modeling Lab (Increase Slope,
  Decrease/Increase Intercept, prediction select, hint), Function Operations
  (Check all operations, hint), Exponential↔Log (hint), Representation Match
  (Context select), Step Algebra (Check solution), Mapping Diagram (both "is it a
  function" choices), Linear Table Workbench (Slope m, y-intercept b),
  Expression Meaning (3 unit choices). The same tools on the assignment screen:
  0. A screenshot of the focused "Increase Slope m" shows only the work bar's
  "Reset Question" button.
* **Proposed fix (CSS only):** key the padding on the bar, not on the page:
  ```css
  /* index.css or App.css, same media query as :736 */
  html:has(.mathmaster-desktop-action-bar),
  body:has(.mathmaster-desktop-action-bar) {
    scroll-padding-bottom: calc(var(--mm-action-bar-height, 72px) + 18px);
  }
  ```
  (`--mm-action-bar-height` is already measured and published by
  `MobileViewportContainer`.) The pinch-zoom override at `index.css:216-224`
  keeps working because it is `!important`.

### S6. CoordinatePlane: a keyboard student can plot but cannot move or remove a point

* **Where:** `src/tools/shared/CoordinatePlane.jsx`. `handleKeyDown` (`:379-397`)
  moves a crosshair and Enter/Space call `onPlot` only. Moving a point is
  `pointIndexNear` → `onMovePoint` inside the pointer handlers (`:305-349`), so it
  is drag-only (`canMovePoints`, `:173`). The help text says "drag a point to move
  it" (`:693-695`) with no keyboard equivalent.
* **Who passes `onMovePoint`:** `transformations/TransformationsLab.jsx:329`,
  `sequenceExplorer/SequenceExplorer.jsx:298, 687`, `graphing2/Graphing2.jsx:384`,
  `representationBridge/LinearMultipleRepresentationsBoard.jsx:1047`,
  `representationBridge/RepresentationBridge.jsx:545`,
  `representationBridge/process/ProcessMethods.jsx:430`,
  `systemsWorkspace/StudentBuildInequalityMode.jsx:818`
  (and `platform/workflow/GraphFeatureSelectStage.jsx:244`).
* **Why it is "partial", not "no":** every one of these tools could still be
  completed by keyboard in the sweep (plot with arrows + Enter, correct with the
  work-bar Undo or Start over). Transformations Lab is the worst case: once all
  transformed points are placed, `onPlot` ignores further presses
  (`TransformationsLab.jsx:322`), so fixing one point means Undo back to it.
* **Proposed fix (contained in CoordinatePlane):** Enter/Space with the crosshair
  on a movable point picks it up instead of plotting; arrows move it; Enter drops
  it (`onMovePoint(index, cursor)`); Escape cancels. Reuse `pointIndexNear` and
  the existing polite live region (`:685`) to announce "Picked up point (2, 3)…
  dropped at (3, 3)". Optional: Delete/Backspace on a picked point → an
  `onRemovePoint` prop where a tool supports removal. Update the one-line help.

### S7. Calculator panel: Escape does not close it; it can only be moved with a pointer (platform chrome)

* **Where:** `src/components/CalculatorPanel.jsx:404-422` (toggle,
  `aria-expanded`), panel `:426-441` (`position: fixed`), drag handle
  `:445-452` (`onPointerDown/Move/Up` only), Close button `:454`.
* **Evidence:** 31 / 31 scenes: Escape left the panel open. Opening by keyboard
  moves focus into the expression field (good); Escape leaves it open with focus still inside; the
  Close button and the toggle both close it by keyboard.
* **Proposed fix:** `onKeyDown` on the panel: Escape → `setOpen(false)` and focus
  the toggle. Give the drag handle a keyboard route (a `button` "Move calculator"
  that cycles corner positions, or arrow keys on a focusable handle) so a
  keyboard user can uncover what the panel sits on.

### S8. The global focus ring does not cover custom tab stops (low; no failure measured in Chromium)

* **Where:** `src/index.css:231-234` and `src/App.css:617-621` style
  `input, select, textarea, button, math-field` (and `a` in the tool shell).
  Custom tab stops — SVG `<g role="button" tabindex="0">` (Number Line endpoints,
  Mapping Diagram nodes), scrollable regions, `[tabindex="0"]` divs — rely on the
  UA ring. Chromium draws one, so the sweep measured them as visible; no other
  engine was measured, and nothing in our CSS guarantees a ring there.
* **Proposed fix:** add `#root :is([tabindex]:not([tabindex="-1"]), [role="button"], [role="radio"], [role="option"], summary, a[href]):focus-visible { outline: 3px solid var(--mm-focus); outline-offset: 2px; }`
  to `index.css` next to `:231`.
* **Note on `outline: none` in shared CSS:** `src/ui/uiKit.css:197` (search input,
  replaced by `.mm-search:focus-within` box-shadow at `:190`) and
  `src/App.css:530` (`:focus:not(:focus-visible)` only) are both fine.

### S9. Smaller shared items (static, not exercised by the sweep)

* `src/components/common/InteractivePlotPoint.jsx:3-8` — `role="button"
  tabIndex="0"` with only `onPointerDown`: Enter/Space do nothing. **No importer
  in `src/`**; delete it, or add `onKeyDown` before anything uses it.
* `src/QuestionEngine.jsx:2343-2352` — "Your values have not changed" confirm
  (`role="dialog" aria-modal`): no initial focus, no Escape, focus not returned,
  backdrop closes on mouse only. Use the same treatment as `src/ui/Toast.jsx:88-110`
  (which does initial focus, Escape and focus return correctly).
* Backdrops that close on a mouse press of themselves —
  `EnlargeableFigure.jsx:548`, `StandardBadge.jsx:156`, `ui/Toast.jsx:146`,
  `QuestionEngine.jsx:2344` — are mouse conveniences; the first three also close
  on Escape (verified for Work View; read for the other two), the fourth does not
  (above).

---

## Part 2 — per tool

"Operable" = can a student complete the tool's primary action with keys only.
Shared items S1–S4 and S7 apply to **every** row (S5 on non-assignment hosts)
and are not repeated;
the Gap column lists what is specific to the tool (and S6 where the tool uses
point moving). "Fix in" says where the change belongs.

| Tool (scene) | Keyboard operable | How verified | Tool-specific gap (file:line) | Fix in |
| --- | --- | --- | --- | --- |
| dataModelingLab | **yes** | generic probe → graded | Residual table scroller is an unnamed tab stop (T6, `dataModeling/DataModelingLab.jsx:478`) | tool |
| regressionCalculator | **yes** | scripted (type `y1~mx1+b`, Tab, Enter) → graded; generic → graded | Add Item `role="menu"` ignores Escape/arrows (T5, `regressionCalculator/RegressionCalculator.jsx:424-450`) | tool |
| inverseCompositionLab | **yes** | generic → graded | — | — |
| functionOperationsLab | **yes** | generic → graded | — | — |
| systemsWorkspace (linearQuadratic) | **yes** | generic → graded | — | — |
| systemsWorkspace:inequalities-build | **yes** | generic → "Check boundary" + "Check my work" graded; plotted with arrows + Enter | boundary-point move drag-only (S6, `StudentBuildInequalityMode.jsx:818`) | shared (S6) |
| systemsWorkspace:algebraic | **yes** (structural) | scripted: Substitution → Isolate y → Subtract → type `x` → "Pick up − x" → "Place … on the left side" all by Enter; not driven to a grade | — (drag token has Pick up/Place buttons, `AlgebraicSystemMode.jsx:106-120`) | — |
| systemsWorkspace:matrix | **yes** | generic → graded | — | — |
| systemsWorkspace:spatial | **partial** | walk; no answer fields in this fixture | 3D model rotate is drag-only (T2, `systemsWorkspace/ThreePlaneWorkspace.jsx:333-342`); choice radios lack arrow keys (T7, `:485-499`) | tool |
| parabolaGeometryLab | **yes** | generic → graded | — | — |
| polynomialWorkshop | **yes** | generic → graded | — | — |
| signSolutionAnalyzer | **yes** | generic → graded | — | — |
| sequenceExplorer (compare / fullBridge) | **yes** | generic → graded both; plotted with arrows + Enter | move = re-plot (`SequenceExplorer.jsx:298, 687`), so S6 costs nothing here | — |
| complexPlaneLab | **yes** | generic → graded | — | — |
| exponentialLogBridge | **yes** | generic → graded | — | — |
| transformationsLab (plotTransform) | **partial** | generic → graded; plotted with arrows + Enter | once all points are placed Enter is ignored (`TransformationsLab.jsx:321-324`) and moving is drag-only (`:329`): a wrong point is fixed only with Undo | shared (S6) |
| transformationsLab:match | **yes** | generic → graded | — | — |
| representationMatch | **yes** | generic → graded | — | — |
| functionInvestigation2 | **yes** | generic → graded | — | — |
| graphing2 | **yes** | generic → graded; plotted 2 points with arrows + Enter | move drag-only (S6, `Graphing2.jsx:384`); a third plot restarts the line, so re-plotting is a full workaround | shared (S6) |
| stepAlgebra2 | **yes** | generic → graded | — | — |
| solutionReview2 | n/a | walk only | sample question has no student control (task, directions, work bar only) | — |
| intervalNumberLine | **partial** | scripted: Closed → type −3 → Place → Open → type 5 → Place → Check, graded | placed endpoints are `role="button"` tab stops whose Enter/Space do nothing; no keyboard move (T3, `intervalNumberLine/IntervalNumberLine.jsx:696-704, 732-740, 771-783`); line `role="application"` not focusable (T4, `:609-616`) | tool |
| relationMapping (mapping) | **yes** | generic → graded | — (nodes have Enter/Space, `RelationMapping.jsx:367-394`) | — |
| relationMapping:plot | **no** | walk + probe: Check graded with nothing plotted | `RelationCoordinatePlot` is click-only, not focusable (T1, `relationMapping/RelationMapping.jsx:76-88`); typed entry only when `plotEntryMode` is `typed`/`clickOrType` (`:125, :309-315`) | tool |
| openSortBoard | **yes** | scripted: card → "Place selected card here" ×4 → "Check my sort" → graded **correct** | — | — |
| constraintFunctionBuilder | **yes** | generic → graded | — | — |
| linearTableWorkbench | **yes** | scripted: rows, Δx/Δy/rate, Record ×3, classification, slope/intercept/equation, "Check my work" → graded | — | — |
| expressionMeaning | **yes** | scripted: 3 × (expression → unit → meaning → role) → "Submit meaning map" → graded **correct** | — | — |
| representationBridge | **yes** (stage 1 driven, later stages structural) | generic → "Check this stage" responded; graph stage uses CoordinatePlane | graph-point move drag-only (S6, `RepresentationBridge.jsx:545`) | shared (S6) |

Per-tool verdicts over the 24 tools (a tool is as good as its worst scene):
**yes 19, partial 3 (transformationsLab, intervalNumberLine, systemsWorkspace),
no 1 (relationMapping, plot mode only), n/a 1 (solutionReview2).**

## Part 3 — tool-specific list for the per-tool sweep (job A, `src/tools/**`)

Not fixed here. Each is file:line, what a keyboard user hits, and the smallest
change.

**Blocking a mode (2)**

* **T1. Mapping Diagram coordinate plot is mouse-only.**
  `src/tools/relationMapping/RelationMapping.jsx:76-88` (`RelationCoordinatePlot`:
  `<svg role="application" onClick onMouseMove>`, no `tabIndex`, no key handler).
  With `ask` including `'plot'` and the default `plotEntryMode`, a keyboard
  student cannot plot at all; the typed x/y + "Plot point" row (`:309-315`) only
  renders when `plotEntryMode` is `'typed'` or `'clickOrType'` (`:125`).
  *Smallest fix:* always render the typed row (default `clickOrType`), or replace
  the plot with the shared `CoordinatePlane` (arrows + Enter, toggles via
  `onPlot`). The existing "Remove plotted point (x, y)" buttons (`:317-321`)
  already give a keyboard remove.
* **T2. Three-plane 3D model rotates by drag only.**
  `src/tools/systemsWorkspace/ThreePlaneWorkspace.jsx:333-342`
  (`<svg role="img" aria-label="… Drag to rotate." onPointerDown/Move/Up>`, not
  focusable). Instruction at `:305` says "Rotate the model…". Only "Reset view"
  and the plane checkboxes are keyboard-reachable. *Smallest fix:* `tabIndex={0}`,
  `role="application"`, arrow keys adjust yaw/pitch by a fixed step
  (Shift = larger), or two pairs of "Rotate left/right/up/down" buttons next to
  Reset view.

**Partial (1)**

* **T3. Number Line endpoints: Enter/Space do nothing; no keyboard move.**
  `src/tools/intervalNumberLine/IntervalNumberLine.jsx:696-704, 732-740, 771-783`
  — `<g role="button" tabIndex="0" onClick onPointerDown>` with no `onKeyDown`.
  Verified: focusing "Open endpoint at 5. Click to switch open or closed…" and
  pressing Enter, then Space, leaves it open. Placing works by keyboard (Closed /
  Open toggle `:535-551`, "Exact endpoint value" + "Place endpoint" `:566-601`),
  so a student can complete the task, but cannot fix a placed endpoint except by
  Start over. *Smallest fix:* `onKeyDown` — Enter/Space call the same handler as
  `onClick`; ArrowLeft/Right move the endpoint by the snap step (the drag code
  already computes the value).

**Minor (4)**

* **T4. `role="application"` on non-focusable SVG.**
  `IntervalNumberLine.jsx:609-616` (the typed entry is the keyboard route, so not
  blocking) and `RelationMapping.jsx:81-88` (T1). `application` tells a screen
  reader to pass keys through to an element that cannot receive them. Either make
  it focusable with key handling or drop the role (`role="img"` + label).
* **T5. Regression Calculator "Add Item" menu.**
  `src/tools/regressionCalculator/RegressionCalculator.jsx:424-450`:
  `aria-haspopup="menu"` + `role="menu"` / `menuitem`, but focus stays on the
  trigger, there are no arrow keys and Escape does not close it (sweep: Escape
  failed). Items are buttons, so it is operable with Tab. *Fix:* on open focus
  the first item; ArrowUp/Down move; Escape closes and refocuses the trigger — or
  drop the menu roles and keep it a plain disclosure of buttons.
* **T6. Unnamed tab stop: the residual table scroller.**
  `src/tools/dataModeling/DataModelingLab.jsx:478` (`<div style={{ maxHeight:185,
  overflow:'auto' }}>`). Chrome makes scrollable regions keyboard-focusable, so
  it is a tab stop with role "generic" and no name. *Fix:* `role="region"
  aria-label="Residual table" tabIndex={0}`.
* **T7. Three-plane interpretation choices are `role="radio"` buttons without
  radio keyboard behaviour.** `ThreePlaneWorkspace.jsx:485-499`. Each option is
  its own tab stop and there are no arrow keys (operable, but not the radiogroup
  pattern a screen-reader user is told to expect). *Fix:* roving `tabIndex` +
  arrow keys, or drop `role="radio"` and use `aria-pressed`.

**Watch list (T8) — `outline: none` in tool CSS, not failing today**

`regressionCalculator/RegressionCalculator.css:468`,
`systemsWorkspace/AlgebraicSystemMode.css:64, 175, 483`,
`systemsWorkspace/InequalityWorkspace.css:416`,
`systemsWorkspace/ThreePlaneWorkspace.css:89`. The ones on native controls lose
to `#root :is(…):focus-visible` (ID specificity) and the others target
`tabIndex={-1}` programmatic-focus containers (`AlgebraicSystemMode.jsx:370`,
`InequalityBuildPanels.jsx:46`). They stop being harmless the moment one is
written with an ID or `!important`; prefer deleting them.

**Checked and not a gap:** the two `draggable` tokens
(`stepAlgebra2/LinearIntercepts.jsx:330`, `systemsWorkspace/AlgebraicSystemMode.jsx:106`)
both have click/Enter pick-up and button drop targets; Regression Calculator's
row `<li onClick>` (`RegressionCalculator.jsx:501`) is mirrored by the input's
`onFocus` (`:539`); Mapping Diagram nodes (`RelationMapping.jsx:367-394`) handle
Enter/Space; read-only CoordinatePlanes carry pointer handlers that return
immediately (`CoordinatePlane.jsx:319`).

## Appendix — static scan

Non-button JSX with click/pointer handlers (17), from the scan in
`keyboardSweep.mjs` (`report.json → static`):

| Site | Element | Keyboard route | Verdict |
| --- | --- | --- | --- |
| `tools/intervalNumberLine/IntervalNumberLine.jsx:609` | `<svg role=application>` onClick | typed endpoint entry | T4 |
| `tools/intervalNumberLine/IntervalNumberLine.jsx:696, 732, 771` | `<g role=button tabIndex=0>` onClick/onPointerDown | none | T3 |
| `tools/regressionCalculator/RegressionCalculator.jsx:501` | `<li>` onClick | input onFocus `:539` | ok |
| `tools/relationMapping/RelationMapping.jsx:81` | `<svg role=application>` onClick | typed row only if `plotEntryMode` | T1 |
| `tools/relationMapping/RelationMapping.jsx:367, 385` | `<g role=button tabIndex=0>` | onKeyDown Enter/Space | ok |
| `tools/systemsWorkspace/ThreePlaneWorkspace.jsx:333` | `<svg role=img>` pointer drag | none | T2 |
| `tools/shared/CoordinatePlane.jsx:447` | `<svg>` (tabIndex 0 when interactive) | arrows + Enter plot; no move | S6 |
| `components/common/EnlargeableFigure.jsx:523` | Work View host, backdrop onClick | Escape + Close | ok (S4 for Tab) |
| `components/common/InteractivePlotPoint.jsx:4` | `<g role=button tabIndex=0>` onPointerDown | none (unused) | S9 |
| `components/common/StandardBadge.jsx:156` | backdrop onMouseDown | Escape `:149`, focus return `:221` | ok |
| `ui/Toast.jsx:146` | confirm backdrop onMouseDown | Escape, initial focus, return `:88-110` | ok |
| `QuestionEngine.jsx:2344` | "values have not changed" backdrop | Go Back button only | S9 |
| `ScratchpadOverlay.jsx:515` | `<canvas>` freehand | exempt (path-dependent) | ok (S3 for the dialog) |
| `components/CalculatorPanel.jsx:445` | drag handle | none | S7 |

`outline: none|0`: 6 tool sites (T8) and `ui/uiKit.css:197` (replaced by
`.mm-search:focus-within` at `:190`), `App.css:530` (`:focus:not(:focus-visible)`
only). Buttons whose only handler is a pointer handler: none.

Raw data: `tests/browser/artifacts/keyboard/report.json` (`tools[].forward.stops`
has every stop with role, name, indicator, changed pixels and obscuring element;
`tools[].popups`, `tools[].primary`, `tools[].lateFocus`, `static`).
