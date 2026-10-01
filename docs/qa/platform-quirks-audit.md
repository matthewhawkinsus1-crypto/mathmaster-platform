# Platform quirks audit

Branch `ai/claude-platform-audit`, from `main` at `524b3e04` (PRs #397 and #398
merged). Not deployed.

This pass fixes the ten issues PR #398's QA left open, then hunts for other
student-facing quirks across the whole tool registry. Every finding below was
**reproduced in a browser** (or is a deterministic source defect, and says so),
classified, and either fixed and re-driven or recorded with the evidence the
next engineering pass needs.

**Reconciled with `main` after PR #400** (teacher workflow redesign, merged
while this PR waited for its certification). A normal merge, no rebase or
force-push: no file is changed on both sides, PR #400's `App.jsx` changes do
not touch the student assignment wrappers, identity shell or Work View, its CSS
is namespaced (`.tw-*`), none of its tests read a file this branch changed, and
this branch's tests read only `App.jsx` from its set. Every gate below was
re-run on the merged head.

## Summary

**P0 FOUND 1 · P0 FIXED 1**
**P1 FOUND 5 · P1 FIXED 4**
**P2 FOUND 22 · P2 FIXED 13**
**P3 FOUND 12** (1 fixed)

| Severity | Found | Fixed in this PR | Deferred | Not reproduced |
| --- | --- | --- | --- | --- |
| **P0** | 1 | 1 | 0 | 0 |
| **P1** | 5 | 4 | 1 | 0 |
| **P2** | 22 | 13 | 8 | 1 |
| **P3** | 12 | 1 | 10 | 1 |

The one deferred P1 (PQ-036, a DOL correctness leak in the plotting workspace)
was closed in the 2026-10-01 cleanup of PRs #407/#408, together with the same
leak in multi-step questions; see its entry. (The counts above are as this
audit first recorded them; each entry's status line is current.)

| ID | Sev | Status | Finding |
| --- | --- | --- | --- |
| PQ-008 | P0 | FIXED | Enter contract: the first Enter spent a graded attempt in three tools |
| PQ-001 | P1 | FIXED | Staged-graph Enlarge on a phone opens with the graph off screen |
| PQ-002 | P1 | FIXED | iPad portrait: the "enlarged" plane is smaller than the embedded one |
| PQ-014 | P1 | FIXED | A tap on a letterboxed plane lands on the wrong coordinate |
| PQ-015 | P1 | FIXED | Phone in landscape: the tool starts below the fold behind a blank column |
| PQ-036 | P1 | FIXED (2026-10-01 cleanup) | In a DOL, the plotting workspace tells the student which points are wrong |
| PQ-003 | P2 | FIXED | Phone: tap a point card, and the plane is scrolled away |
| PQ-004 | P2 | FIXED | 1366×768 Work View: the plane is taller than the stage body |
| PQ-005 | P2 | FIXED | `workViewCertification.mjs` "times out" |
| PQ-006 | P2 | FIXED | Draft-sync coverage: Signs and Solutions and Expression Meaning had no runtime records |
| PQ-007 | P2 | FIXED | "Write a single number." boxes got the full expression keypad |
| PQ-010 | P2 | FIXED | Wide-profile candidates |
| PQ-011 | P2 | FIXED | The QA harness did not render the real identity / sticky stack |
| PQ-012 | P2 | FIXED | MathLive hand-off relies on internals |
| PQ-013 | P2 | FIXED | Calculator icon depends on an emoji font |
| PQ-016 | P2 | FIXED | Phones ≤375px: the action bar wraps to two rows |
| PQ-017 | P2 | FIXED | The attempt outcome is not announced to screen readers |
| PQ-018 | P2 | FIXED | Data Modeling: "Your model" disagrees with the steppers |
| PQ-038 | P2 | FIXED | "b = 4" in a number box is graded wrong and spends a try |
| PQ-009 | P2 | FIXED | Whole-board Undo |
| PQ-020 | P2 | DEFERRED | Landscape phone Work View gives the stage 120–150px |
| PQ-021 | P2 | DEFERRED | Phone identity bar is 67–86px and always pinned |
| PQ-022 | P2 | DEFERRED | After a tool's Check, the attempt outcome is off-screen |
| PQ-023 | P2 | DEFERRED | Tool chrome and folded help sit between the task and the mathematics |
| PQ-024 | P2 | FIXED (2026-10-01 cleanup) | Point cards say "P1: x = −1" but x is not locked |
| PQ-035 | P2 | NOT REPRODUCED | Memory growth over a long session |
| PQ-039 | P2 | NOT A PRODUCTION ISSUE | Typing latency in the student harness |
| PQ-040 | P2 | FIXED | Typing "−2/3x + 4" on a keyboard makes −2 over (3x + 4) |
| PQ-019 | P3 | FIXED | Inverse & Composition writes "1(x − 2)²" and "−1x" |
| PQ-025 | P3 | DEFERRED | "Enlarge question" sits on top of content on phones |
| PQ-026 | P3 | DEFERRED | Work View header says "Question Work View" and clips the task |
| PQ-027 | P3 | DEFERRED | Work View capability chips look like disabled buttons |
| PQ-028 | P3 | DEFERRED | Expression Meaning reopens on its first row after a reload |
| PQ-029 | P3 | DEFERRED | Regression Calculator's button says "Submit workflow" |
| PQ-030 | P3 | DEFERRED | The identity bar's ⭐ is an emoji too |
| PQ-031 | P3 | NOT REPRODUCED | Scroll padding assumes a 140px task card |
| PQ-032 | P3 | DEFERRED | Multi-line verdict text in a pill |
| PQ-033 | P3 | FIXED (2026-10-01 cleanup) | Dev-server hazards for the browser gates |
| PQ-034 | P3 | DEFERRED | Three click maps still stretch linearly |
| PQ-037 | P3 | DEFERRED | Typed stages inside a staged Work View may not scroll above a keypad |

---

**How it was driven.**

- `tests/browser/studentUxPlatform.html` — the real `QuestionEngine` inside
  App.jsx's `mathmaster-assignment-screen` / `-shell` / `-stage` wrappers,
  questions compiled through the teacher import chain. This pass added two
  options (defaults unchanged, so its nine journeys are unaffected):
  - `?identity=1` renders the **real signed-in `StudentIdentityBar`** above the
    navigator, as `renderStudentIdentityShell` does. It publishes
    `--mm-student-identity-stack-offset`, which the sticky task, the
    navigator, the phone container height and the scroll padding all
    subtract. PR #398's measurements had that offset at 0.
  - `?tools=1` appends one question per registry tool (its sample spec, the
    way the Work View certification mounts it), so all 24 tools can be opened
    inside the real wrappers in one long session. The harness navigator shows
    section tabs plus the current section's numbers, like App.jsx's.
- `tests/browser/assignmentMobile.html` (composed/staged questions),
  `toolOpenAudit.html` (one tool, no chrome), `workViewCertification.html`.
- Viewports: 344×882, 360×800, 375×812, 390×844, 390×664 (phones, touch);
  844×390, 740×360, 667×375 (phones in landscape); 820×1180 (iPad, touch);
  1366×768 (Chromebook); 1920×1080; 2040×1146 (a 1366×768 Chromebook zoomed out
  to ~67%).
- The probe scripts lived in the session scratchpad; the ones worth keeping
  are committed as gates (see *Tests*).

**Coverage.** Every registry tool was opened, worked (typed, chose, tapped the
plane) and Checked inside the real wrappers with the identity bar at 1366×768
and 390×844 (twice, to watch memory); every typed box was driven with Enter
(Enter survey); every draft-backed tool was worked and its records run through
the real sanitizer (draft sweep); every tool went through Work View on seven
devices with an edit, Undo, Fit and rotation (certification).

| Surface | How it was used here |
| --- | --- |
| Step Algebra (legacy) / Step Algebra 2 | studentUxPlatform `enter`, `rapid-switch`, `persistence`; hunt; Enter survey (operand applies); certification |
| Graphing 2 | hunt; edge-tap mapping; 4× throttled drag (§5); identity + Enlarge; certification |
| Systems Workspace | hunt; wide-profile measurement; certification |
| Linear Table Workbench | stack/focus probes (identity bar, 4 sizes); landscape grid; wide measurement; Enter survey |
| Representation Match / Bridge | hunt; Enter survey; draft sweep; certification; PR #397 journeys |
| Function Investigation, Sequence Explorer, Transformations, Data Modeling, Interval Number Line, Constraint Builder, Polynomial Workshop, Parabola Geometry, Complex Plane, Relation Mapping, Inverse Composition, Exponential/Log, Signs and Solutions | hunt (Check + feedback placement + jargon + tap sizes); Enter survey; draft sweep; certification; Data Modeling also wide + model line; Inverse Composition also labels |
| Single-answer, multi-answer | keypad profile + shape guard; focus probes; studentUxPlatform `enter`, `phone` |
| DOL / submit-only, one attempt | studentUxPlatform `enter` (second Enter); DOL plotting probe (§13) |
| Composed / staged workflow | assignmentMobile; enlarge matrix (8 viewports); embedded card→plane loop; keypad-in-Work-View probe |

**Limit.** This is the real question runtime and the real identity bar, not a
signed-in Firebase session. No QA credentials were used and nothing was
written to production. The harness passes `questionRecord={null}`, so its
"tries left" count does not decrease after a graded attempt (App.jsx feeds the
updated record back); that is a harness limitation, not a product finding.

---

## 1. Known issues from PR #398

### PQ-001 · Staged-graph Enlarge on a phone opens with the graph off screen — **P1 · FIXED IN THIS PR**

- **Surface:** any staged (workflow) question whose plotting stage uses
  `InteractiveGraphWorkspace` (`coordinatePlot`, `functionGraph` stages;
  `graphAnalysis` recipes) → "⤢ Enlarge question" (QuestionEngine Work View).
- **Viewport:** 344×882, 360×740, 390×664 (the `assignmentMobile.mjs` phones);
  also 375×812 and 390×844.
- **Reproduction:** `node tests/browser/assignmentMobile.mjs` on `main`:
  `enlarge: only 0% (390, 360) / 2% (344) of the enlarged graph is on screen`.
  By hand: open the staged question, tap *Enlarge question*.
- **Student-facing symptom:** the student presses Enlarge to see the graph
  bigger and gets the data table, the facts strip ("Table points ·
  Coordinates shown") and five point cards in a 304px band; the plane is
  ~700px further down an inner scroller.
- **Root cause — two defects stacked:**
  1. **CSS order tie.** `App.css` (b800534b, Sep 5) puts the plane first when
     enlarged on a phone (`order: -1` on the graph). `WorkViewShell.css`
     (cbe21e80, Sep 13) later gave the *sidebar* `order: -1` "so at least one
     actionable control is immediately reachable". Equal orders fall back to
     DOM order, so the sidebar won and the Sep 5 intent was silently lost. The
     fixture (`assignmentMobileFindings.json`, generated Sep 5) was never
     refreshed, which is why the suite stayed green.
  2. **The reveal scrolled an element that cannot scroll.** EnlargeableFigure's
     "open on the student's current work" effect wrote `surface.scrollTop`, but
     a staged question's Work View makes the surface `overflow: hidden` and
     scrolls only `.workflow-focus__workspace-body` (to keep Previous/Next
     reachable). The write was a no-op. And no marker existed for "the graph"
     — `data-work-view-focus` also drives App.jsx's scroll-on-open and nav
     compaction, so marking the plane with it would have scrolled every
     embedded plotting question past its prompt.
- **Also answered, as asked:** focus management does not scroll anything
  (EnlargeableFigure focuses Close with `preventScroll`); the instructions and
  task text are not the cause (header 78px); modal sizing is correct (the
  panel covers the viewport); graph min-height is not involved; sticky platform
  chrome stands down under Work View (`data-work-view-open`).
- **Fix:**
  - `src/platform/workView/workViewReveal.js` (new, pure): finds the visible
    reveal target (hidden stages are skipped), finds the element that actually
    scrolls, and scrolls it the least distance that shows the whole target.
    `data-work-view-focus` keeps its align-to-top meaning; a new
    `data-work-view-reveal` ("bring fully into view") is read **only** by the
    Work View shell, never by App.jsx.
  - `InteractiveGraphWorkspace` marks its plane `data-work-view-reveal`.
  - One rule for order: in **portrait** Work View at any width the plotting
    stage is one column with the plane first (`WorkViewShell.css`); the
    sidebar-first rule is gone. `App.css`'s phone rule is now portrait-only —
    on a phone held sideways (667×375) the grid keeps two columns and the old
    rule would have put the plane in the 220px sidebar column.
  - Work View caps the plane at the stage body's height (see PQ-004).
- **After** (enlarge-matrix probe, same scene):

  | Viewport | Plane on screen at open: main → now | Task on screen | Close restores scroll, focus and work |
  | --- | --- | --- | --- |
  | 344×882 | 2% → **100%** | yes | yes |
  | 360×740 | 0% → **100%** (assignmentMobile gate) | yes | yes |
  | 375×812 | not measured on main → **100%** | yes | yes |
  | 390×844 | not measured on main → **100%** | yes | yes |
  | 390×664 | 0% → **100%** | yes | yes |
  | 820×1180 iPad | 256×182 plane (PQ-002) → **100%, 502×357** | yes | yes |
  | 1366×768 | 86% with the first half of the fix → **100%** (PQ-004) | yes | yes |
  | 1920×1080 | **100%** | yes | yes |

  The point cards and *Check Point Placements* sit directly below the plane
  in the same bounded scroller; picking a card brings the plane back (PQ-003).
- **Tests:** `workViewReveal.test.mjs` (stand-in DOM: scrolls the body, never
  the overflow-hidden surface; skips hidden stages; nearest vs start;
  mutation-checked by writing the surface again), the rewritten
  `studentWorkspaceVisibility` contract, `assignmentMobile.mjs` now also
  requires **the task to be on screen in the enlarged view**; fixture refreshed
  **after** the behaviour was fixed (0 findings at 344/360/390).
- **Evidence:** `platform-quirks-audit/pq001-before-phone-390x664-enlarge.png`,
  `pq001-after-phone-390x664-enlarge.png`.
- **Next:** none for this surface. See PQ-020 for the landscape phone.
- **Scope:** small.

### PQ-002 · iPad portrait: the "enlarged" plane is smaller than the embedded one — **P1 · FIXED IN THIS PR**

- **Surface:** same Work View, 820×1180 (touch). Found while measuring PQ-001.
- **Reproduction:** open the staged question, tap Enlarge. Embedded plane
  **502×357**; enlarged plane **256×182**.
- **Root cause:** 820px is above `WORK_VIEW_MOBILE_MAX` (720), so Work View
  uses the desktop side rail (240px), and the stage grid is forced to
  `minmax(180px, 230px) minmax(0, 1fr)` at every width.
- **Fix:** the portrait rule in PQ-001 (one column, plane first) applies at any
  width, not only ≤700px.
- **After:** 502×357 with the table above and the point list below.
- **Evidence:** `pq002-before-ipad-820x1180-enlarge.png`,
  `pq002-after-ipad-820x1180-enlarge.png`.
- **Scope:** tiny.

### PQ-005 · `workViewCertification.mjs` "times out" — **P2 (test harness) · FIXED IN THIS PR**

- **Classification (the mission's A–H):** **A (harness bug) + H (needs
  bounded, isolated scenes)**. Not B–G: no tool hangs, the app is not slow, no
  lifecycle leak, no memory growth.
- **Reproduction:** first run on a freshly started Vite server:
  `locator.waitFor: Timeout 30000ms exceeded … [data-stage4-tool="dataModelingLab"]`
  — the very first scene — and the process exits with nothing reported.
- **Investigation:**
  - Re-run on the same server: chromebook **23 tools in 67 s**; all seven
    devices **161 scenes in 538 s** (~3.3 s a scene).
  - Two deliberately cold servers (one with `--force`, one with an isolated
    `cacheDir`): the first tool rendered in **1–3 s**; no Vite dependency
    re-optimisation or page reload occurred. (A transient `mathlive.js?v=…`
    404 appears on every cold load and is harmless.)
  - The failing run never reached MathLive's first render (no fonts log line
    for that window), i.e. React had not committed the first scene inside 30 s
    on a machine with ~250 MB free.
  - Heap per scene stays flat (see *Performance*).
- **Root cause:** the harness called `__mmStage4` as soon as the page reached
  network idle, gave the first scene Playwright's default 30 s while Vite was
  still transforming the tool's module graph, and did not catch the
  `TimeoutError` — so one slow first render ended the whole 161-scene run with
  no findings.
- **Fix (harness only):** wait for `window.__mmStage4`; a cold budget
  (`WORK_VIEW_CERTIFICATION_COLD_TIMEOUT_MS`, default 120 s) only for the first
  scene of a page; every scene isolated (a failure becomes that scene's finding,
  with a screenshot, and the page is reloaded for the next); per-scene time,
  JS heap and DOM size, printed as a slowest-scenes table and a per-device heap
  line; `WORK_VIEW_CERTIFICATION_TOOL` to run one tool. The timeout was **not**
  simply raised for every scene.
- **Final certification — merged head `13ce82c1`** (after reconciling with
  `main`/PR #400), one device per process, local Chrome, warm server:

  | Device | Scenes | Findings | Time | Mean / slowest scene | JS heap first → last (max) |
  | --- | --- | --- | --- | --- | --- |
  | chromebook | 23 | **0** | 67.4 s | 2.93 s / 3.8 s | 88.5 → 97.5 MB (109.6) |
  | laptop | 23 | **0** | 66.9 s | 2.91 s / 3.8 s | 89.2 → 98.3 MB (115.2) |
  | tablet-portrait | 23 | **0** | 83.0 s | 3.61 s / 4.4 s | 88.5 → 104 MB (111.8) |
  | tablet-landscape | 23 | **0** | 82.9 s | 3.60 s / 4.5 s | 88.5 → 95.9 MB (111.0) |
  | iphone-portrait | 23 | **0** | 72.4 s | 3.15 s / 4.0 s | 88.7 → 98.1 MB (109.5) |
  | iphone-landscape | 23 | **0** | 71.1 s | 3.09 s / 4.0 s | 88.4 → 98.0 MB (112.1) |
  | android-narrow | 23 | **0** | 70.3 s | 3.06 s / 3.9 s | 88.6 → 98.2 MB (113.6) |

  **161 / 161 scenes certified, 0 findings.** The slowest scene on every
  device is Sequence Explorer (≤4.5 s). GitHub CI's own per-device `certify`
  matrix (Playwright 1.55, bundled Chromium) also passed all seven on the same
  head, plus `workViewTerminalTransition.mjs`, which passed locally too.
- **How the harness got there** (all harness-only):
  - an earlier attempt on this branch lost its verdicts when the VM ran out of
    memory (kernel: `virtio_balloon … Out of puff!`) and the renderer died
    mid-run; scenes now print time, heap and findings as they finish, a crashed
    page is replaced by a fresh context, and a killed browser stops the run
    with one clear line;
  - a frozen renderer once held a scene for 800 s, so every scene now has a
    budget (`WORK_VIEW_CERTIFICATION_SCENE_BUDGET_MS`, default cold wait +
    120 s); forced with a 1.5 s budget it records "scene exceeded its budget"
    and exits in 5 s instead of hanging;
  - the final runs used a warm dev server, ≥1.1 GB free, and screenshots on
    disk (`tests/browser/artifacts/`, git-ignored) rather than RAM-backed `/tmp`.
- **Also recorded:** editing `src/` while a long gate runs hot-reloads the
  harness mid-scene. One scene in an earlier run reported
  `revealWorkViewTarget is not defined` because it loaded between two of my own
  edits; the clean re-run above has no such finding. Documented in the
  harness header.
- **Scope:** small.

### PQ-006 · Draft-sync coverage: Signs and Solutions and Expression Meaning had no runtime records — **P2 (test coverage) · FIXED IN THIS PR**

- **Reproduction:** `toolDraftSyncFindings.json` on main listed both tools as
  `mounted: true, records: 0` — "covered" without any state ever reaching the
  sanitizer.
- **Root cause:** both tools record **choices** (aria-pressed buttons: sign
  intervals; unit / meaning / role per expression). The generic sweep only
  types, selects, taps planes and presses Check-like buttons.
- **Fix:** `toolDraftSyncSweep.mjs` gains targeted journeys:
  - Signs and Solutions: choose two intervals → Check → take one back (an
    edit after a check).
  - Expression Meaning: fully assign two expressions, half-assign the third.
  - Both: **reload**, and the stored record and what the student sees must
    come back unchanged; every record goes through the **real**
    `sanitizeWorkspaceDraftValue`. The sanitizer is untouched.
- The contract (`toolDraftSyncContract.test.mjs`) now also fails if any
  draft-backed tool leaves **zero records** (mutation-checked), and requires the
  targeted journeys to have restored.
- **Result:** all 23 draft-backed tools produce ≥1 record; 0 findings;
  Signs and Solutions record 20 B, Expression Meaning 331 B, both restored.
- **Scope:** small.

### PQ-007 · "Write a single number." boxes got the full expression keypad — **P2 · FIXED IN THIS PR**

- **Surface:** multi-answer / single-answer typed questions
  (`MultiAnswerGrader`), phones and tablets.
- **Reproduction:** the three-part answer's *y-intercept* box (hint "Write a
  single number.") offered π, e, logₐ, √, ⁿ√, x², xⁿ, |x|.
- **Root cause:** an input-profile model already exists —
  `inputProfile` (`number`, `orderedPair`, `expression`, `equation`, …) and
  `toolProfileForInputProfile` (number → the `number` pad: digits, sign,
  decimal point, a⁄b). The teacher compile chain even writes
  `inputProfile: "number"` on these fields. `MultiAnswerGrader` bypassed it and
  used `basic` for anything not a set or inequality. Separately a slope of
  `-2/3` compiled as `expression`, so its hint read "Write an expression. No
  equals sign."
- **Fix (reusing the existing policy, no new system):**
  - `keypadProfileForResponseField` in `interactionContract.js`: declared
    `number` / `orderedPair` → that pad; a field declared `expression` (or
    nothing) whose **every** accepted answer is a plain number → the number pad
    (covers assignments already stored with `expression`). Anything else keeps
    the renderer default, so algebra keeps π, roots and exponents.
  - `inferAnswerFormatFromExpected`: a fraction of two numbers
    (`-2/3`, `\frac{-2}{3}`, `-\frac{2}{3}`) is a `number`; `x/3`, `-2/3x`,
    `\frac{A}{b}(x+1)` stay `expression`.
  - Mobile discovery and accessibility are unchanged: the pad is the same
    component with fewer keys; a⁄b remains, and a field that needs a fraction
    still shows "Needed for this answer: a⁄b".
- **Tests:** `responseKeypadProfile.test.mjs` (profiles, fraction inference,
  stored assignments, the exact number-pad keys, the grader wiring).
- **Scope:** small.

### PQ-008 · Enter contract: the first Enter spent a graded attempt in three tools — **P0 · FIXED IN THIS PR**

- **Surface:** registry tools; any context (assignment, workflow stage).
- **Reproduction** (new gate `tests/browser/enterContractSurvey.mjs`: every
  registry tool, each typed box in turn, type a number, Enter):

  | Tool (sample mode) | First Enter on main | The unset part of the answer |
  | --- | --- | --- |
  | Inverse Composition (restriction) | **ATTEMPT_SUBMITTED** | the restriction `<select>` (its default "No restriction needed" is itself an answer) |
  | Sequence Explorer (compare) | **ATTEMPT_SUBMITTED** | both sequences still to plot on the plane |
  | Interval Number Line | **ATTEMPT_SUBMITTED** (from the notation box) | the number line graph and the exact-endpoint box |

- **Student-facing symptom:** a student with an Enter habit types their value
  and loses one of three tries before touching the rest of the question.
- **Root cause:** PR #398's resolver pressed a whole-question submit when the
  field was "the ONE answer box in its scope" — counting only **typed** boxes
  in the field's own panel.
- **Fix:** a submit is pressed only when the box is the tool's **only answer
  control**: no other typed box anywhere in the tool, and no select, textarea,
  radio/checkbox, interactive plane or number line (`svg[role=application]`),
  radiogroup or slider. Otherwise Enter brings Submit into focus and a
  deliberate second Enter presses it — the same rule as multi-part questions.
  A plane that is only a picture (`role="img"`) does not count.
- **After:** all three bring Check into focus; the survey records no attempt
  from any tool with more than one answer control.
- **Tests:** `enterContract.test.mjs` (four cases, mutation-checked);
  `enterContractSurvey.test.mjs` asserts the committed survey fixture (every
  registry tool surveyed; no surprise attempts; every box drivable).
- **Enter registry matrix** (from the fixture; "box #n" = Enter moved to the
  next empty box):

| Tool | Typed | Other controls | Declared | What each Enter did (1366×900) | Decision |
| --- | --- | --- | --- | --- | --- |
| dataModelingLab | 2 | 8 | submit | box #2 → focus Check data model | Walk blanks → focus Check (submit) |
| regressionCalculator | 1 | 0 | submit | input | Row input keeps its own Enter (adds/moves rows); nothing submitted |
| inverseCompositionLab | 1 | 1 | submit | focus Check function reasoning | Focus Check (restriction select is part of the answer) — FIXED |
| functionOperationsLab | 5 | 0 | submit | box #2 → box #3 → box #4 → box #5 → focus Check all operations | Walk 5 boxes → focus Check |
| systemsWorkspace | 0 | 1 | submit | — | No typed box in this mode; algebraic modes: solver fields own Enter (data-mm-enter-owner) |
| parabolaGeometryLab | 4 | 0 | submit | box #2 → box #3 → box #4 → focus Check features | Walk 4 boxes → focus Check |
| polynomialWorkshop | 0 | 2 | submit | — | No typed box |
| signSolutionAnalyzer | 0 | 0 | submit | — | No typed box (choices) |
| sequenceExplorer | 1 | 2 | submit | focus Check comparison | Focus Check (plane is part of the answer) — FIXED |
| complexPlaneLab | 2 | 1 | submit | box #2 → focus Check rotation | Walk → focus Check |
| exponentialLogBridge | 2 | 1 | submit | box #2 → focus Check inverse features | Walk → focus Check |
| transformationsLab | 0 | 1 | submit | — | No typed box in plotTransform mode |
| representationMatch | 0 | 3 | — | — | No typed box (card sort) |
| functionInvestigation2 | 0 | 2 | submit | — | No typed box in domainRange mode |
| graphing2 | 0 | 1 | — | — | No typed box; plane keyboard owns Enter |
| stepAlgebra2 | 1 | 1 | — | box #1 | Operand box owns Enter: applies the operation (no attempt) |
| solutionReview2 | 0 | 0 | — | — | Read-only |
| intervalNumberLine | 2 | 1 | submit | box #1 → focus Check | Endpoint box keeps its own Enter; notation → focus Check — FIXED |
| relationMapping | 2 | 1 | submit | box #2 → focus Check | Walk → focus Check |
| openSortBoard | 2 | 0 | — | box #1 → box #2 | Group-name boxes: Enter does nothing (safe) |
| constraintFunctionBuilder | 3 | 2 | submit | focus Submit this model → focus Submit this model → focus Submit this model | Focus Submit this model (other boxes prefilled) |
| linearTableWorkbench | 3 | 0 | submit | box #2 → box #3 → box #3 | Walk m → b → equation; Check disabled until comparisons recorded → nothing |
| expressionMeaning | 0 | 0 | submit | — | No typed box (choices) |
| representationBridge | 1 | 0 | card, card, card, card, card, submit | box #1 | Stage card check declared; disabled until the stage is complete → nothing |

  Question-level types outside the registry (multi-answer, ordered pair,
  table, literal, fraction, equation and the other legacy graders) all go
  through `resolveQuestionEnterIntent`: incomplete → next empty box; one box
  and complete → submit; several boxes, DOL or one-try → focus Submit, second
  Enter submits. Fields that own Enter (`data-mm-enter-owner`: Step Algebra
  rewrites, systems elimination rows) are left alone; Step Algebra 2's operand
  box applies the chosen operation (no attempt).
- **Not changed, deliberately:** no Enter-to-submit was invented for complex
  tools. Tools whose declared Check is disabled until the work is recorded
  (Linear Table Workbench, Representation Bridge stages) keep Enter doing
  nothing, which is safe.
- **Scope:** small.

### PQ-009 · Whole-board Undo — **P2 · FIXED (all four blockers)**

- **Update 2026-10-01, items 3 and 4 — fixed.** The board's platform Undo
  takes back the student's last edit anywhere on the board, one step at a
  time, newest first. That covers a typed equation or feature, a table cell, a
  meaning chosen from a list, a point, a drag and Start over. It runs through
  one `useMathUndoHistory` history (`ownerId: 'lmr-board'`, `persist: true`).
  - **3. Verdicts.** The history records `boardUndoState`, which is the
    board's 18 answer fields and nothing else
    (`linearMultipleRepresentationsUndo.js`). `checkedCards` and
    `expandedCards` are not in it. So a Check is not a step. Undo never
    un-checks a card, and never puts back a verdict for work that was not
    checked. A card shows its verdict whenever it holds exactly the work that
    was checked, the same rule a reload follows. Undo does not clear the
    board's submission result, and it neither spends nor returns an attempt.
  - **4. Invisible edits.** Each Undo opens the card it changed if that card
    was folded. It scrolls the changed field, table or plane into view only
    when it is not already uncovered on screen, and outlines the card for
    about 2 s. The board's one polite live region says it once, for example
    "Undid your last change to Graph 2 (slope-intercept)." Keyboard focus
    stays on Undo, so pressing it again keeps working. The Undo button's
    title names what the next press will change.
  - **Each graph's own Undo** reads the same history, filtered to that graph
    (`undoChangeTo` in `useMathUndoHistory`, `undoMathUndoChange` in
    `mathUndoStack.js`). It takes back that graph's latest change even when
    the student typed somewhere else after it. The step is removed from the
    shared history, so the platform Undo can never replay it.
  - **A fraction bar no longer splits a typing run.** MathLive turns "/"
    into `\frac{1}{\placeholder{}}`, which is not a contiguous character edit.
    Before this change, y = 1/2x − 3 typed into one field took three Undo
    steps, and one of them handed back a fraction with an empty box.
    Contiguity is now judged with MathLive's braces, backslashes and empty
    placeholders stripped (`typingText`). Select-all-and-overwrite and a
    swapped choice are still separate steps. A character typed and rubbed out
    within one run no longer leaves an Undo that changes nothing.
  - **Reload.** The history stays on the device, capped at 12 KB (about 6–10
    board steps), and never goes in the synced work record. It is dropped if
    it was recorded for different work. An Undo after a reload takes back
    one step of the restored work, and Ctrl+Z in a restored math field does
    not empty it.
  - **Gates.** `tests/browser/linearMultipleRepresentations.mjs` journeys
    `undo` (1366×768) and `undo-phone` (390×844, touch), with additions to
    `dol` and `complete`. Node tests: `mathUndoFilteredChange.test.mjs`,
    `mathUndoTyping.test.mjs`, `boardPlatformUndo.test.mjs` and
    `tests/tools/linearMultipleRepresentationsUndo.test.mjs`.

- **Update 2026-10-01:** blockers 1 and 2 below are fixed platform-wide. A run of typing in one field is one Undo step (`mathUndoStack.js`), and a math field's own Ctrl+Z no longer replays what a platform Undo removed (`MathInput` `resetUndo()`). Gate: `tests/browser/undoTyping.mjs`. Wiring the whole board (3, 4) is still open; see `platform-engineering-deep-dive-2026-10-01.md`.

- **Now:** the Multiple Representations board's platform Undo covers its three
  graphs (PR #398, R-14); typed fields keep MathLive's in-field Ctrl+Z; table
  cells and context choices have no Undo.
- **Investigated, and not safe to force into this PR:**
  1. **No coalescing.** `useMathUndoHistory` records an entry on *every* state
     change. Wrapping the board's 19 mathematical fields in it would make Undo
     take back one typed **character** at a time, and a single equation would
     spend a fifth of the 60-entry limit.
  2. **MathLive divergence.** A platform restore writes a field's value, but
     MathLive keeps its own per-field undo stack; Ctrl+Z inside the field after
     a platform Undo would replay the text the platform just removed.
  3. **Verdicts.** `checkedCards` holds per-card fingerprints. A restored
     snapshot that included them would re-mark a card as checked-correct for
     old work. They must be excluded, and verdicts recomputed.
  4. **Invisible edits.** One Undo for the whole board can change a collapsed
     card. The student sees nothing happen.
  5. **Size** is fine: a full board snapshot is ~1–2 KB, so the persisted
     12 KB cap keeps ~6–10 steps across a refresh; 60 in memory.
- **Would it be clearer for students?** Yes, *if* every Undo announces and
  shows what it changed; otherwise no.
- **Concrete proposal (its own PR):**
  - `useMathUndoHistory({ coalesce })`: typed changes to one field group into
    one entry, committed on blur, on field change, or after ~800 ms idle.
  - The board passes `{ equations, features, tableRows, graphPoints, context }`
    — never `checkedCards` or `expandedCards` — with `persist: true` and
    `ownerId: 'lmr-board'`; `onRestore` writes every field back and calls the
    MathLive field's `resetUndo()` for any typed field it changed.
  - Each entry records which card it touched; Undo expands that card, scrolls
    it into view and announces "Undid: slope-intercept equation" in a polite
    live region. The per-graph Undo buttons become filtered views of the same
    stack (as proposed in PR #398).
  - Tests: a node test that a restored entry never contains verdict fields; the
    `graphs` and `persistence` journeys; a new journey "type, Undo, Ctrl+Z in
    the field" proving MathLive and the platform agree.
- **Scope:** medium.

### PQ-010 · Wide-profile candidates — **P2 · FIXED IN THIS PR (Data Modeling only)**

Measured inside the real wrappers with the identity bar, standard vs wide
(same attribute and width the opt-in sets):

| Tool | 1366×768 | 1920×1080 | 2040×1146 (~67% zoom) | Decision |
| --- | --- | --- | --- | --- |
| Data Modeling Lab (6 panels) | unchanged (wide needs ≥1400px) | tool **1715 → 1313px**, page 2178 → 1761px; 2 → 3 columns; panels 488 → 451px; plane 454 → 417px | same as 1920 | **Opt in** when ≥3 panels |
| Systems Workspace | unchanged | plane 559×380 → 800×543, but tool 660 → 824px: the graph's bottom leaves the screen | same | Leave standard |
| Linear Table Workbench | unchanged | page −34px; text lines **960 → 1356px** | same | Leave standard |

- Data Modeling's modes show 2–6 panels. With 2 panels wide would stretch each
  line to ~700px, so `widthProfile` is `wide` only when the lab shows three or
  more panels. The numbered flow reads left→right, top→bottom
  (1 Scatter · 2 Association · 3 Residuals / 4 Compare · 5 Predict · Submit).
- **Tests:** `toolShellWideProfile.test.mjs` records the decision for all three.
- **Scope:** tiny.

### PQ-011 · The QA harness did not render the real identity / sticky stack — **P2 (test gap) · FIXED IN THIS PR** (results below)

- PR #398's harness had no identity bar, so every sticky offset was measured
  with `--mm-student-identity-stack-offset: 0`. The harness now renders the real
  `StudentIdentityBar` (`?identity=1`).
- **Measured stack** (identity → navigator → sticky task → workspace → action bar):

  | Viewport | Identity | Navigator | Task card | Notes |
  | --- | --- | --- | --- | --- |
  | 1366×768 | 38px sticky | sticky, measured | sticky 84–110px | nothing covered (below) |
  | 1920×1080 / 2040×1146 | 38px | sticky | 86–110px | nothing covered |
  | 820×1180 iPad | 38px | 48px sticky | 86–110px sticky | nothing covered |
  | 390×844 phone | **67px sticky (two lines)** | 73px | 142–160px (not sticky; phone panel) | PQ-021 |
  | 344×882 foldable | **86px (three lines)** | 107px | — | PQ-021 |
  | 844×390 landscape | 38px | scrolls | scrolls | tool was below the fold — PQ-015 |

- **Fields scrolled into view** (keyboard focus to each box of the board, LTW
  and the three-part answer, both directions, with the full stack): **no field
  ended under the identity bar, navigator or task card, or under the action
  bar**, at 1366×768, 1920×1080, 2040×1146 and 820×1180. Repeated with the task
  card forced to 158–184px tall: still none (see PQ-031).
- **Graph enlarge with the identity bar:** at 390×844, 820×1180 and 1366×768
  Work View covers the viewport and is the top-most layer (hit tests at the top
  edge and two corners all land inside the dialog, not the identity bar);
  Graphing 2's plane is 344×234 / 466×317 / 591×402, 100% on screen.
- **Action-bar clearance:** at 1366×768, 1920×1080, 2040×1146 and 820×1180 the
  sticky bar never covered a focused field. On phones the bar is in the page
  flow, not over the work (PR #398), and is now one row at every width (PQ-016).
- **Scope:** small (harness).

### PQ-012 · MathLive hand-off relies on internals — **P2 · FIXED IN THIS PR (hardening)**

- **Inventory of MathLive internals in `src/`:** the keyboard sink
  (`[part="keyboard-sink"]`, `.ML__keyboard-sink`) and `hasFocus()` timing
  (the P0 focus hand-off), `[part="render"]` in `<math-span>` (lazy typesetting
  check), and the CSS parts `virtual-keyboard-toggle` / `menu-toggle`
  (`index.css`).
- **Fix:** `src/platform/math/mathLiveCompat.js` is now the **one module** that
  names them; `mathFieldFocusHandoff.js` and `ensureMathElementRenders.js`
  import from it. The working fix is unchanged.
- **Loud failure, never student-visible:**
  - `mathLiveCompat.test.mjs` reads the **installed** MathLive: version must be
    the verified one (0.110.0), the bundle must still contain
    `part=keyboard-sink`, `class=ML__keyboard-sink`,
    `setAttribute("part", "render")` and both CSS parts, and the typings must
    still declare `hasFocus(): boolean`. It also fails if any other `src/`
    module references those internals, and if `index.css` hides a different set
    of parts than the adapter lists.
  - At a field's first real press, development and test builds `console.error`
    once if the sink or `hasFocus()` is gone ("the focus hand-off is inactive
    until mathLiveCompat.js is updated"). Production stays silent and degrades
    exactly as before.
- **Scope:** small.

### PQ-013 · Calculator icon depends on an emoji font — **P2 · FIXED IN THIS PR**

- **Reproduction:** on this project's Linux Chrome (no colour-emoji font) the
  calculator control rendered "□" — in the phone bar, where Submit makes the
  tools icon-only, it was an unlabeled box
  (`pq-calculator-icon-before-phone-bar.png`).
- **Does it matter for school devices?** 🧮 (U+1F9EE) is Unicode 11 (2018):
  missing on Windows 10 builds before 1809, Android before 9 and emoji-less
  Linux. ChromeOS and iPadOS have it. Low probability, but the phone bar makes
  the failure total.
- **Fix:** `CalculatorIcon.jsx`, a 16px inline SVG in `currentColor` (no icon
  library), with a strike for the unavailable state (replacing 🚫). Used in the
  work bar, the Work View rail (actions may now carry an `icon` beside a
  plain-string label) and the calculator panel launcher. Names unchanged.
- **Evidence:** `pq-calculator-icon-after-phone-bar.png`,
  `pq-calculator-icon-after-work-view.png`.
- **CI follow-up:** the icon is an `<svg>`, and PR #399's `browser-readability`
  check (`darkModeCertification.mjs`) read "the first svg" under the Graphing 2
  root as the graph, 300 ms after the root appeared. When the lazily loaded
  plane was not there yet it found the icon (no `<text>`) and
  `getComputedStyle(null)` threw; before the icon existed the same race found
  no svg and **skipped the check silently**. The test now waits for
  `svg.mathmaster-responsive-canvas`, so the graph-contrast check always runs
  (an inverted assertion fails, proving it is live). Passes locally on four
  devices in both themes.
- **Scope:** tiny.

---

## 2. New issues discovered

### PQ-014 · A tap on a letterboxed plane lands on the wrong coordinate — **P1 · FIXED IN THIS PR**

- **Surface:** every interactive plane: `CoordinatePlane` (through the shared
  `clientPointToViewBox`, i.e. most registry tools) and
  `InteractiveGraphWorkspace` (staged plotting, graph analysis).
- **Viewport:** wherever the plane's box aspect differs from its viewBox — the
  **embedded plane on a 1366×768 Chromebook** (the app-wide
  `max-height: min(70dvh, 100dvh − 240px)` on `.mathmaster-responsive-canvas`
  makes it 808×528 for a 760×540 viewBox) and Work View on landscape phones.
- **Reproduction** (edge-tap probe: tap exactly on a drawn grid intersection,
  read the placed point):

  | Where | Tapped the drawn point | Placed (main) | Placed (now) |
  | --- | --- | --- | --- |
  | 1366×768, embedded | (6, 10) | **(5.5, 10)** | (6, 10) |
  | 1366×768, embedded | (−6, 2) edge | **(−5.5, 2)** | outside plot (as at every other size) |
  | 844×390, Work View | (6, 10) | **(5, 10)** | (6, 10) |
  | 844×390, Work View | (−6, 2) | **(−4.5, 2)** | outside plot |
  | 390×844, Work View (aspect intact) | (6, 10) | (6, 10) | (6, 10) |

- **Student-facing symptom:** the point appears half a unit (Chromebook) to 1.5
  units (landscape phone) from where the student tapped, worst at the edges; a
  correct plot becomes a wrong answer unless the student notices and drags it.
- **Root cause:** planes draw with `preserveAspectRatio="xMidYMid meet"`
  (centred, uniformly scaled), but clicks were mapped by stretching the box
  onto the viewBox. That is only the same thing while the aspect ratios match.
- **Fix:** `clientPointToViewBox` uses the uniform scale and centring offsets
  (identical output when aspects match). `InteractiveGraphWorkspace` now maps
  through the same helper, and its magnetic-snap radius uses the same scale.
  `IntervalNumberLine`, `RelationMapping` and `GraphStory` keep their own
  linear maps: their SVGs are `height: auto` with no cap, so they cannot
  letterbox today (PQ-034).
- **Tests:** `responsiveCoordinates.test.mjs` (the measured 808×528 box and a
  landscape box, mutation-checked against the old stretch);
  `enlargeableFigureCoverage.test.mjs` rewritten from pinned source text to the
  behaviour it protects (the same drawn point maps identically at embedded,
  enlarged and letterboxed sizes).
- **Scope:** small.

### PQ-015 · Phone in landscape: the tool starts below the fold behind a blank column — **P1 · FIXED IN THIS PR**

- **Surface:** every question on a phone held sideways (`mode-landscape`,
  height ≤ 500px).
- **Viewport:** 844×390, 740×360, 667×375.
- **Reproduction:** open Linear Table Workbench or Graphing 2 on an 844×390
  phone. The right column shows "3 of 3 tries left" over ~390px of blank; the
  workspace starts at **y = 480** (740×360: 453; 667×375: 453) — below the
  screen.
- **Root cause:** the landscape grid is two columns but has three children. The
  attempt strip (`.mathmaster-question-context-panel`) was auto-placed into
  row 1 of the tool's column and stretched to the prompt's height, so the
  workspace (forced into column 2) dropped into an implicit second row. PR #394
  fixed exactly this collision for **portrait** only.
- **Fix:** explicit rows — the prompt spans both rows of column 1; the strip is
  row 1 and the workspace row 2 of column 2.
- **After:** workspace at y = 139 (844×390) / 153 (740×360, 667×375), beside the
  task.
- **Tests:** `landscapeQuestionGrid.test.mjs` (mutation-checked).
- **Evidence:** `pq-landscape-phone-before-844x390.png`,
  `pq-landscape-phone-after-844x390.png`.
- **Scope:** tiny.

### PQ-003 · Phone: tap a point card, and the plane is scrolled away — **P2 · FIXED IN THIS PR**

- **Surface:** `InteractiveGraphWorkspace` point tasks on touch ("Tap a point
  card, then tap its location on the coordinate plane"), embedded and Work View.
- **Reproduction:** 390×664 Work View: after tapping a card the plane was
  **0–26%** on screen (the card list is below it in Work View, above it
  embedded). Every point cost two manual scrolls.
- **Fix:** on touch, picking a card brings the plane fully into view in
  whatever scrolls it (`revealInNearestScroller`, least movement, never
  horizontal, never the window). Nothing about the mathematics changes.
- **After:** plane 100% visible after each card tap at 344–390px, embedded
  and in Work View; five points placed with five card-tap/plane-tap pairs.
- **Scope:** tiny.

### PQ-004 · 1366×768 Work View: the plane is taller than the stage body — **P2 · FIXED IN THIS PR**

- **Reproduction:** Work View plane 802×570 in a 508px body — 86% visible,
  Check below the fold.
- **Fix:** Work View caps the plotting plane at
  `max(200px, var(--mm-work-view-height) − 280px)` (header, instruction, step
  heading, footer). Safe because taps are letterbox-exact now (PQ-014).
- **After:** 100% visible at 1366×768 and 1920×1080; phone rules (more
  specific) unchanged.
- **Scope:** tiny.

### PQ-016 · Phones ≤375px: the action bar wraps to two rows — **P2 · FIXED IN THIS PR**

- **Reproduction:** with the real identity bar, a question without Submit in
  the bar (tool questions): "↶ Undo ↺ Reset ✎ Scratchpad Calculator" fits at
  390px (61px) but wraps at 375, 360 and 344px: **111px**.
- **Fix:** below 385px the tools show the icons they already show beside
  Submit (PR #398's rule), names kept as accessible labels.
- **After:** 61px at 390, 375, 360 and 344.
- **Tests:** `studentWorkspaceVisibility.test.mjs` (narrow rule; the icon count
  now includes the drawn calculator icon).
- **Scope:** tiny.

### PQ-017 · The attempt outcome is not announced to screen readers — **P2 · FIXED IN THIS PR**

- **Reproduction:** after a wrong attempt, QuestionEngine shows "Not quite. You
  have 2 attempts remaining on this version." — not a live region (only the
  *Correct* overlay was `role="status"`). Registry tools' own verdict pills
  (`ResultPill`) are not live either (13 of 13 tools that showed one).
- **Fix:** `role="status"` on QuestionEngine's attempt-outcome box. It renders
  only when outcome feedback is allowed, so DOL / submit-only items still
  announce nothing about correctness. The tool pills were left alone: they
  appear at the same moment, and making both live would read the result twice.
- **Tests:** `attemptFeedbackAnnounced.test.mjs`.
- **Scope:** tiny.

### PQ-018 · Data Modeling: "Your model" disagrees with the steppers — **P2 · FIXED IN THIS PR**

- **Reproduction:** the steppers read **1.13** and **−0.1**, while "Your model"
  read **y = 1.12571428571x − 0.128571428571**.
- **Root cause:** the stepper starts a whole number of steps from the
  regression line, so its value is off the display grid; the stepper shows
  `toFixed(step decimals)`, the model line printed the raw value.
- **Fix:** display only — the model line uses the steppers' precision
  (y = 1.13x − 0.1; after two taps y = 1.15x − 0.2). Residuals and grading still
  use the exact value.
- **Tests:** `dataModelingModelDisplay.test.mjs`.
- **Scope:** tiny.

### PQ-019 · Inverse & Composition writes "1(x − 2)²" and "−1x" — **P3 · FIXED IN THIS PR**

- **Reproduction:** "f(x) = 1(x − 2)² − 1", "g(x) = -1x + 4", "1·2^x",
  "−1·log_3x".
- **Fix:** `functionLabel` omits a coefficient of 1, writes −1 as the sign, uses
  the true minus sign, drops the dot when no number is written, and always
  brackets a log's argument: "(x − 2)² − 1", "−x + 4", "2^x", "−log_3(x)".
- **Tests:** `tests/tools/batchADeepening.test.mjs`.
- **Scope:** tiny.

### PQ-038 · "b = 4" in a number box is graded wrong and spends a try — **P2 · FIXED IN THIS PR**

- **Surface:** multi-answer / single-answer number fields (`answerFormat: number`).
- **Reproduction:** y-intercept box (key `4`), type `b=4`, Submit →
  `isCorrect: false`, an attempt spent. An `expression` box is protected by the
  shape guard ("Write only the expression, without an equals sign…", Submit
  held back); a `number` box had no guard. Found in self-review of PQ-007:
  once −2/3 became a number, `m = -2/3` in a slope box would have lost that
  protection too.
- **Fix:** `answerShapeGuard.js` gives number boxes the same guard ("Write only
  the number, without an equals sign."). It steps aside when any accepted
  answer contains "=", so it can never hold back an answer the key accepts.
- **Tests:** `responseKeypadProfile.test.mjs`.
- **Scope:** tiny.

### PQ-035 · Memory growth over a long session — **P2 · NOT REPRODUCED**

- **Tried:** every registry tool opened, worked and Checked inside the real
  wrappers with the identity bar, then every tool opened again (48 question
  switches), at 1366×768 and 390×844; Work View opened/closed on 8 viewports;
  the math keypad opened and closed on three boxes; the certification's
  per-scene heap.
- **Measured:** JS heap 82 → 92.5 MB over the first lap (lazy tool chunks
  arriving), **92.3 MB** after the second; DOM ~350 nodes at rest; certification
  scenes 84.7–92.7 MB on the Chromebook profile. No growth on revisit, so no
  leak symptom to chase. See §5.
- **Scope:** —

### PQ-036 · In a DOL, the plotting workspace tells the student which points are wrong — **P1 · FIXED (2026-10-01 cleanup)**

- **Fixed (cleanup of PRs #407/#408):** where outcomes are withheld nothing on
  the plane says whether the work is right, and nothing has to be right to
  continue. There is no point check and no reflected-point check; the curve is
  drawn through the student's OWN points and stays as drawn (Clear Sketch frees
  the points); graph ends offer every symbol, with no pulse and no pull. Each
  part is graded at submission exactly as practice requires before its snap:
  the curve counts when every point it was drawn through is right and the
  sketch follows the function, and a marker counts within the radius practice
  uses — so a correct DOL graph earns full credit (browser-checked) and a wrong
  one does not. Multi-step questions follow the same policy in every step: the
  mapping-diagram and number-line steps no longer say "Correct / Not yet", a
  graph step built from a table no longer reveals whether the table is right
  ("do not agree" block, magnet), and later steps show "Your graph" (the
  student's own points) instead of "Your checked graph" only when right.
  Practice is unchanged. Gates: `tests/browser/graphPointCheck.mjs`,
  `tests/browser/composedOutcomePolicy.mjs`, `tests/platform/graphOutcomePolicy.test.mjs`.

- **Update 2026-10-01:** wherever outcomes are not shown immediately (DOL, quiz, test):
  - A point-only plot has no check. Its points are graded as placed and stay movable until submission.
  - The curve and reflection checks still gate drawing, but they name no point and teach no rule.
  - Workflow grading never read `pointsValidated`. Point parts are graded from the placements.
  - **Still open:** a curve's check is a yes/no that a student can repeat. Counting it as an attempt is the assessment owner's decision.
  - Gate: `tests/browser/graphPointCheck.mjs`.

- **Surface:** `InteractiveGraphWorkspace` point tasks (staged `coordinatePlot`
  / `functionGraph` stages, graph-analysis questions) inside a submit-only
  activity. The DOL policy is `feedback: afterAssignmentSubmit`, 1 attempt.
- **Reproduction:** the staged plotting question mounted with
  `activityRole: 'dol'`; place all five points wrongly; press *Check Point
  Placements* → **"Revise: P1, P2, P3, P4, P5. Use Undo to remove the last
  placement."** Placed correctly it says "All point placements are correct."
- **Student-facing symptom:** a correctness verdict per point, before
  submission, in an assessment that promises none. The student can fix
  points until the check passes.
- **Root cause:** `checkPoints` is also the gate that unlocks drawing
  (`pointsValidated`), and the workspace reads no feedback policy (the
  registry tools' `useToolSubmission` and the PR #397 board both do).
- **Why not fixed here:** the obvious fix — in submit-only contexts, "Lock in my
  points" that checks completeness, not correctness — changes what the stage
  gates, and the workflow grading must first be checked for any reliance on
  `pointsValidated` as a proxy for correct points. That needs the assessment
  owner's decision and a grading review.
- **Recommended next action:** read `useToolRuntimeContext().showImmediateFeedback`
  in the workspace; when false, relabel the button, validate completeness only,
  and prove in `workflowGrading` tests that submission re-grades the stored
  placements. Also audit the other construction gates (inverse reflection,
  endpoint markers) the same way.
- **Evidence:** `platform-quirks-audit/pq036-dol-point-check.png`.
- **Scope:** small–medium.

### PQ-037 · Typed stages inside a staged Work View may not scroll above a keypad — **P3 · DEFERRED (source observation, not reproduced)**

- `mobileFocusViewport.js`'s `VERTICAL_SCROLL_SELECTOR` does not include
  `.workflow-focus__workspace-body`, the only element that scrolls in a staged
  Work View; a focused field there may therefore not be scrolled clear of the
  keypad. My generic driver could not advance an ad-hoc staged question to a
  typed stage, so this was **not reproduced**. **Next:** a studentUxPlatform
  journey that opens a staged question's typed stage in phone Work View and
  types with the keypad open; add the selector if it fails. **Scope:** tiny.

### PQ-039 · Typing latency in the student harness — **P2 · NOT A PRODUCTION ISSUE**

- **Update 2026-10-01:** re-measured on production builds of the same harness (`tests/browser/harnessProduction.config.mjs`). p90 per key is 57–70 ms at 4× CPU and 95 ms on the board at 6×. The numbers below were the development build.

- **Reproduction** (studentUxPlatform, 1366×768, real stack; time from a key
  to two animation frames later; long tasks from `PerformanceObserver`):

  | Question | CPU | Per-key latency (ms) | Longest task |
  | --- | --- | --- | --- |
  | PR #397 board, slope-intercept field | 1× | 90–1208 | 510 ms |
  | PR #397 board | 4× | 185–1809 | 995 ms |
  | Three-part answer | 1× | 215–821 | 354 ms |
  | Three-part answer | 4× | 132–1314 | 781 ms |

- **Reading it carefully:** these harnesses run React **development** builds on
  a VM that was memory-starved at the time, both of which inflate absolute
  numbers. The board is not markedly worse than a three-box answer, so this is
  a per-keystroke platform cost, not the board. No optimisation was attempted
  without a production measurement.
- **Recommended next action:** build the harness with `vite build` (a config
  with the harness HTML as input) and re-measure; if keys still exceed ~100 ms
  at 4×, profile one keystroke. The local draft write is already ruled out
  (≤0.4 ms per write, `draftPersistence.mjs`); the next candidate is
  QuestionEngine re-rendering the whole question on every `onChange`.
- **Scope:** small to investigate.

### PQ-040 · Typing "−2/3x + 4" on a keyboard makes −2 over (3x + 4) — **P2 · FIXED**

- **Update 2026-10-01:** fixed in `MathInput` and the calculator by `src/platform/math/typedFractionEntry.js`. Gate: `tests/browser/mathEntryContract.mjs`.

- **Reproduction:** in any math field, type `y=-2/3x+4` on a physical
  keyboard → `y=-\frac{2}{3x+4}`. MathLive's `/` opens a fraction and keeps
  everything typed afterwards in the denominator until the student presses →,
  Space or the keypad's "↷ out".
- **Student-facing symptom:** the most common way to type a slope-intercept
  equation with a fractional slope silently becomes a different expression,
  graded wrong. It is visible (the fraction bar spans 3x + 4), but easy to miss.
- **Recommended next action:** when the denominator so far is a plain number
  and the student types a letter or `+`/`−`, leave the fraction first (a
  MathLive keystroke hook in `MathInput`), or show a one-line hint the first
  time a denominator grows past a number. Needs care: `1/(2x)` must still be
  typeable. **Scope:** small–medium.

### PQ-020 · Landscape phone Work View gives the stage 120–150px — **P2 · DEFERRED**

- **Viewport:** 844×390, 740×360 (staged question → Enlarge).
- **Reproduction:** Work View header (task + Task/Help/Close) ~56px,
  instruction ~50px, step heading ~55px, Previous/Next footer ~60px: the
  bounded stage body is **150px** (844×390) / **120px** (740×360). The plane is
  218px, so **50–60%** of it is on screen (`pq-open-landscape-844x390-enlarge.png`).
- **Root cause:** Work View's workflow chrome is sized for portrait. The
  short-landscape rules move the action row to a side rail but keep every
  vertical header.
- **Recommended next action:** at `max-height: 460px`, merge the Work View
  instruction into the header's task line and render the step heading inline
  with the footer ("Step 1 of 12 · Plot the points ← →"). Target: a ≥260px body.
  Needs a design look, and `workViewCertification` covers the rotation.
- **Scope:** small–medium.

### PQ-021 · Phone identity bar is 67–86px and always pinned — **P2 · DEFERRED (needs product input)**

- **Viewport:** 390×844 (two lines, **67px**), 344×882 (three lines, **86px**).
- **Reproduction:** `?identity=1`: "Claude QA Student • Period 3", the ⭐ Class
  Points chip and "Not you? Log Out" wrap. It is `position: sticky` over every
  student surface, so on a 390px phone about 8% of the height is permanently
  the account marker, above the navigator and the task.
- **Why deferred:** the bar is deliberately a persistent account-integrity
  marker (the teacher must see whose work is on screen). Shrinking it is a
  product decision.
- **Recommended next action:** below 480px: one line — name and period
  (ellipsised), the points as a compact "⭐ 120" chip, "Log Out" without "Not
  you?" — target 38px.
- **Scope:** small.

### PQ-022 · After a tool's Check, the attempt outcome is off-screen — **P2 · DEFERRED**

- **Reproduction:** Inverse Composition / Function Investigation, wrong Check.
  The tool's own pill ("• Not yet") appears 55–115px below Check (on screen);
  QuestionEngine's authoritative "Not quite. You have N attempts remaining"
  appears **357–403px** below it at 1366×768 and 180px below on a 390×844
  phone — **off-screen in all four cases**.
- **Student-facing symptom:** the student sees "Not yet" but not that an
  attempt was used, or how many remain.
- **Recommended next action:** when a registry tool raises
  `ATTEMPT_SUBMITTED`, render the attempts-remaining sentence inside the tool's
  result area (via `ToolRuntimeContext`) and keep QuestionEngine's box for
  non-tool questions. PQ-017 already announces it.
- **Scope:** small.

### PQ-023 · Tool chrome and folded help sit between the task and the mathematics — **P2 · DEFERRED**

- **Reproduction (phone 390×844, real stack):** identity 67 → navigator ~110 →
  task ~95 → tries ~50 → **tool header** (two-line title beside "Enlarge
  question", "About this tool" on its own row) ~115 → **"How to do this (N
  steps)"** row ~70 → first panel. The first answer control is at
  **557–1358px** (below the 783px fold for every tool measured; e.g. Inverse
  Composition 1358, Complex Plane 1041, Graphing 2 634). At 1366×768 the first
  control is below the fold for about half the tools (480–1076px).
- **What is right already:** both help blocks are folded (PR #398); the task
  leads.
- **Recommended next action (task → workspace → optional support):**
  1. Merge "About this tool" into "How to do this" (one disclosure: a one-line
     description, then the steps).
  2. On phones, set the tool title at label size on the same row as Enlarge.
  3. Put the disclosure *after* the first panel's title row, or as a "?"
     button in the tool header.
  Estimated gain ~100–120px on phones, ~45px on laptops. Needs a pedagogy
  check that students still find the steps.
- **Evidence:** `pq023-phone-first-screen-inverse-composition.png` (390×844,
  real identity bar and a realistic navigator).
- **Scope:** medium (ToolShell + TaskCard; every tool).

### PQ-024 · Point cards say "P1: x = −1" but x is not locked — **P2 · FIXED (2026-10-01 cleanup)**

- **Fixed:** the rule follows the card. One predicate (`taskStatesX` in
  `src/interactiveGraphEngine.js`) decides both what a card prints and what the
  plane holds: a card that states its x places at that x on every route (click,
  drag, keyboard, typed coordinate) and the drag guide shows it; the height is
  the student's. A centre or key point (its x is not on the card — it is part of
  what the student must find) and an x the student chooses are never held.
  Cards that state the same x (a relation that is not a function) are matched
  to their expected points as a set, so a correct plot is correct either way
  round. Tests: `tests/platform/statedTaskX.test.mjs`; browser:
  `composedOutcomePolicy.mjs`, `relationPlotGrading.mjs`.

- **Reproduction:** staged plotting stage, tap P1, tap the plane at x = −4 →
  P1 is placed at **(−4, 4)**. The tasks are built with `lockedX: true`
  (`WorkflowRunner`, `interactiveGraphEngine` ×3) but the workspace never reads
  it.
- **Student-facing symptom:** the label implies the student only chooses the
  height; a fingertip slightly off x = −1 places (−1.5, y) and fails Check.
- **Decision needed:** either honour `lockedX` (x fixed to the task, student
  chooses y — much easier on a phone, but the x-placement is no longer
  assessed) or drop the flag and label the card "P1 (x from the table)".
- **Scope:** tiny either way, once decided.

### PQ-025 · "Enlarge question" sits on top of content on phones — **P3 · DEFERRED**

- **Viewport:** 390px. The opener is absolutely positioned at the top right of
  the question surface: over the workflow's step-chip row (chips 3–4 hidden at
  rest, reachable by scrolling the row) and over the multi-answer heading
  ("Complete Each Pa|rt", `pq007-after-phone-number-pad.png`). **Next:** reserve the button's width at the end of the chip row, or
  place the opener in the task card's header row. **Scope:** tiny.

### PQ-026 · Work View header says "Question Work View" and clips the task — **P3 · DEFERRED**

- 390px: the 23px title "Question Work View" (a product term; the button the
  student pressed said "Enlarge question") sits above a task clamped to 3.2em,
  which cut "…describe what it does" mid-word. **Next:** drop the title when a
  task is shown and give the task the line. **Scope:** tiny.

### PQ-027 · Work View capability chips look like disabled buttons — **P3 · DEFERRED**

- iPad/desktop rail: "Pan and zoom", "Place and move points" are grey
  button-shaped chips under the real actions. **Next:** style as a caption
  ("You can: pan and zoom, place and move points") or remove. **Scope:** tiny.

### PQ-028 · Expression Meaning reopens on its first row after a reload — **P3 · DEFERRED**

- The work restores exactly (PQ-006), but the row being edited is not persisted
  by design, so a student mid-way through row 3 comes back to row 1. **Next:**
  open on the first incomplete row. **Scope:** tiny.

### PQ-029 · Regression Calculator's button says "Submit workflow" — **P3 · DEFERRED**

- "workflow" is platform vocabulary. **Next:** "Submit my regression". **Scope:** tiny.

### PQ-030 · The identity bar's ⭐ is an emoji too — **P3 · DEFERRED**

- Rendered "□" on the emoji-less test machine (U+2B50 is Unicode 5.1, so far
  more widely supported than 🧮). **Next:** reuse the CalculatorIcon approach if
  PQ-021 redesigns the bar. **Scope:** tiny.

### PQ-031 · Scroll padding assumes a 140px task card — **P3 · NOT REPRODUCED**

- `scroll-padding-top: calc(var(--mm-sticky-task-top) + 140px)` guesses the
  task card's height although it is measured (`--mm-sticky-task-height`). With
  the card forced to 158–184px, keyboard focus still never landed a field under
  it in Chrome (Chrome centres focused elements). Safari may align differently.
  **Next:** use the measured height (the `data-work-view-focus` scroll-margin
  already does) the next time this CSS is touched. **Scope:** tiny.

### PQ-032 · Multi-line verdict text in a pill — **P3 · DEFERRED**

- `ResultPill` has a 999px radius; long feedback ("• Odd multiplicity crosses;
  even multiplicity touches…") wraps into a three-line lozenge on phones.
  **Next:** switch to a 10px radius above ~60 characters. **Scope:** tiny.

### PQ-034 · Three click maps still stretch linearly — **P3 · DEFERRED (note)**

- `IntervalNumberLine`, `RelationMapping`, `GraphStory` map clicks linearly.
  Safe today (no height cap on those SVGs); would break the day one is added.
  **Next:** route them through `clientPointToViewBox`. **Scope:** tiny.

### PQ-033 · Dev-server hazards for the browser gates — **P3 (test infrastructure) · FIXED (2026-10-01 cleanup)**

- Editing `src/` while a long gate runs hot-reloads the harness mid-scene
  (seen once as `revealWorkViewTarget is not defined` between two of my own
  edits). MathLive's fonts 404 under Vite's dependency optimiser unless a
  harness sets `fontsDirectory` (three do). A cold server's first scene can take
  >30 s on a loaded machine (PQ-005).
- **Next:** a `npm run gates:serve` script that starts Vite with `hmr: false`,
  a dedicated `cacheDir` and the fonts directory, used by every
  `tests/browser/*.mjs` header. **Scope:** tiny.
- **Update — gate server (after PR #407).** The slow cold start had a cause in
  the harness config itself: five chained `swapFile` plugins each resolved and
  returned null, so Vite resolved every import 326 times. Vite's dependency
  scan took 36 s alone and 82–106 s beside a loading page, which is what PR
  #407's 180 s first-`goto` budget absorbed and why `npm run
  test:durable-outbox` failed from a cold cache. One swap plugin that returns
  its own resolution (`tests/browser/emulator/swapModules.mjs`, pinned by
  `tests/platform/harnessModuleSwap.test.mjs`) brings the scan to ~1 s.
  `scripts/lib/gateServer.mjs` (`npm run gates:serve -- <gate>`) starts a gate
  with `hmr: false`, `appType: 'mpa'`, its own `node_modules/.vite-gates/<gate>`
  cache, `optimizeDeps.entries`/`include` for its harness, MathLive's fonts
  served where pre-bundled MathLive looks for them (they were answered with
  `index.html` and a 200, not a 404), and readiness = the harness page, its
  entry modules and everything they import answer 200. Cold, the draft
  certification's first page load went from 88–113 s to 1.0–1.4 s and the 180 s
  budget is gone. Adopted by the draft-persistence and durable-outbox runners;
  the other `tests/browser/*.mjs` drivers still start Vite themselves.
- **Closed (2026-10-01 cleanup).** All three hazards have their cause removed:
  the cold start (one swap plugin, above); the fonts, which MathLive now loads
  with the editor itself (`src/platform/math/mathliveRuntime.js` imports
  `mathlive/fonts.css`, so no harness sets `fontsDirectory` and production gets
  them too — they were missing there, `tests/browser/mathFontsProduction.mjs`);
  and the mid-run reload, which the gate server cannot do (`hmr: false`). The
  remaining drivers run against a server their operator starts — in CI a fresh
  checkout nothing edits — so the rule for a local run is the one the drivers'
  headers already state: do not edit `src/` while a gate runs, or use
  `npm run gates:serve`. One late re-bundle was seen while closing this: Vite
  optimized `firebase/auth` mid-run, which the draft harness never imports
  (only `index.html` → `main.jsx` reaches it), while other checkouts' runners
  were active on the machine. The gate server named it as designed, and it did
  not recur in two further runs, one from a cold cache.

---

## 3. Fixed during this pass

| ID | Sev | What changed | Files |
| --- | --- | --- | --- |
| PQ-008 | P0 | Enter presses a whole-question submit only from the tool's only answer control | `answerEntryUx.js` |
| PQ-001 | P1 | Staged Work View opens on the plane; one graph-first rule | `workViewReveal.js` (new), `EnlargeableFigure.jsx`, `InteractiveGraphWorkspace.jsx`, `WorkViewShell.css`, `App.css` |
| PQ-002 | P1 | Portrait Work View stacks the plotting stage at every width | `WorkViewShell.css` |
| PQ-014 | P1 | Letterbox-exact tap mapping | `responsiveCoordinates.js`, `InteractiveGraphWorkspace.jsx` |
| PQ-015 | P1 | Landscape phone grid rows | `MathToolMobileLayout.css` |
| PQ-003 | P2 | Card tap brings the plane into view (touch) | `InteractiveGraphWorkspace.jsx`, `workViewReveal.js` |
| PQ-004 | P2 | Work View plane capped to the stage body | `WorkViewShell.css` |
| PQ-005 | P2 | Certification harness: readiness, cold budget, isolation, timing | `tests/browser/workViewCertification.mjs` |
| PQ-006 | P2 | Targeted draft journeys + ≥1 record contract | `toolDraftSyncSweep.mjs`, `toolDraftSyncContract.test.mjs` |
| PQ-007 | P2 | Number keypad for number fields; numeric fractions are numbers | `interactionContract.js`, `MultiAnswerGrader.jsx` |
| PQ-010 | P2 | Data Modeling wide profile (≥3 panels) | `DataModelingLab.jsx` |
| PQ-011 | P2 | Harness renders the real identity bar; `?tools=1` | `studentUxPlatformMain.jsx` |
| PQ-012 | P2 | MathLive internals behind one adapter + compat test | `mathLiveCompat.js` (new), `mathFieldFocusHandoff.js`, `ensureMathElementRenders.js` |
| PQ-013 | P2 | Drawn calculator icon | `CalculatorIcon.jsx` (new), `QuestionEngine.jsx`, `CalculatorPanel.jsx`, `EnlargeableFigure.jsx` |
| PQ-016 | P2 | One-row phone bar below 385px | `MathToolMobileLayout.css` |
| PQ-017 | P2 | Attempt outcome is a live region | `QuestionEngine.jsx` |
| PQ-018 | P2 | Model line at the steppers' precision | `DataModelingLab.jsx` |
| PQ-038 | P2 | Number boxes refuse "b = 4" before it costs a try | `answerShapeGuard.js` |
| PQ-019 | P3 | Function labels written like a student writes them | `inverseCompositionMath.js` |

No production data, Firestore rules, Functions or the draft sanitizer changed.

## 4. Deferred architecture work

- **PQ-009 Whole-board Undo** — coalescing in `useMathUndoHistory`, MathLive
  `resetUndo()` on restore, verdict exclusion, announce-and-reveal. Medium.
- **PQ-023 Tool chrome / help placement** — one merged disclosure, label-size
  titles on phones, help after the first panel title. Touches ToolShell and
  TaskCard, so every tool. Medium; needs a pedagogy check.
- **PQ-020 Landscape phone Work View** — compress the workflow chrome at
  `max-height: 460px`. Small–medium; needs a design look.
- **PQ-021 Phone identity bar** — product decision on a one-line account
  marker.
- **PQ-022 Tool attempts message** — attempts-remaining inside the tool result
  area via `ToolRuntimeContext`. Small.
- **PQ-024 `lockedX`** — honour or remove; pedagogy decision.
- **PQ-036 DOL plotting checks** — see §13.

## 5. Performance / memory findings

- **Long navigation session, no growth** (`?tools=1`, identity bar, real
  wrappers, every registry tool opened, worked and Checked, then every tool
  opened again):

  | Viewport | JS heap after lap 1 (24 tools) | After lap 2 | DOM nodes at rest |
  | --- | --- | --- | --- |
  | 1366×768 | 82.0 → 92.5 MB (lazy tool chunks loading) | 92.3 MB | ~350 |
  | 390×844 | 82.0 → 92.8 MB | 92.8 MB | ~348 |

  The second lap adds nothing: tool switches release their DOM and state.
  No detached-node or listener growth symptom was observable at this level.
- **Work View certification (final head):** 161 scenes in 514 s, a mean of
  2.9–3.6 s a scene per device, slowest 4.5 s; the JS heap stays 88–115 MB
  across each device's 23 tools with no upward trend. The earlier "hang" was a
  cold first scene (PQ-005); the earlier crash was the VM running out of
  memory, not the page.
- **Typing and dragging (CPU throttled via DevTools):**
  - Graphing 2, 30 pointer moves while dragging at 4×: 1640 ms (~55 ms a
    move), long tasks 52–128 ms, heap 104 MB — usable.
  - Typing into math fields: 90–1208 ms per key at 1×, up to 1809 ms at 4×, on
    both the board and a three-box answer, in a development build on a loaded
    VM — **PQ-039**, deferred until it is re-measured on a production build.
  - The local draft write is not the cost: `draftPersistence.mjs` measures it at
    ≤0.4 ms per write (18 writes in a typing burst, 3.6 ms total).
- **Enlarge / close repeatedly:** the enlarge matrix opened and closed Work View
  on 8 viewports with points placed inside; close restored scroll, focus and
  work every time.
- **Nothing was optimised** — no symptom was reproduced that called for it.

## 6. Phone findings

- **Fixed:** PQ-001 (plane 0–2% → 100% on Enlarge), PQ-003 (card→plane loop),
  PQ-015 (landscape tool below the fold), PQ-016 (two-row bar ≤375px), PQ-007
  (number pad), PQ-013 (calculator □), PQ-014 (landscape Work View tap offset).
- **Deferred:** PQ-020 (landscape Work View body 120–150px), PQ-021 (identity
  bar 67–86px), PQ-022 (attempts message off-screen), PQ-023 (first control at
  557–1358px), PQ-024 (`lockedX`), PQ-025 (Enlarge over step chips), PQ-026
  (Work View title), PQ-032 (pill wrapping).
- `assignmentMobile.mjs`: 0 findings at 344/360/390 (was 3). `toolOpenAudit`
  phone and phone-landscape: every tool opens with its surface on the first
  screen (unchanged gate).

## 7. iPad findings (820×1180, touch)

- **Fixed:** PQ-002 — the enlarged plane was 256×182, smaller than the
  embedded 502×357; now 502×357 with the point list below.
- Keyboard-focus scrolling with the full sticky stack: no field covered.
- iPad is laid out by width like a laptop (side rail in Work View) but gets no
  autofocus (PR #398); that remains correct.
- Work View's side rail on a portrait iPad spends 240px of 820 on six buttons
  and two capability chips (PQ-027); the portrait stacking makes that
  acceptable, but a bottom row (as on phones) is worth trying when PQ-020 is
  designed.

## 8. Chromebook findings (1366×768)

- **Fixed:** PQ-014 (tap offset up to 0.5 unit on the embedded plane — the
  most common school screen), PQ-004 (Work View plane taller than its body),
  PQ-008 (first-Enter attempts), PQ-018, PQ-019.
- **Deferred:** PQ-022 (attempts message ~360–400px below Check, off-screen),
  PQ-023 (first control below the fold for about half the tools with the real
  stack).
- The real stack: identity 38 + navigator + sticky task 84–110px; the action bar
  65px. Focus scrolling clears both (PQ-011).

## 9. Reduced-zoom findings (1920×1080; 2040×1146 ≈ 1366×768 at 67%)

- **Fixed:** PQ-010 — Data Modeling uses the wide profile (tool 1715 → 1313px).
- Measured and deliberately not widened: Systems Workspace (graph's bottom
  leaves the screen), Linear Table Workbench (1356px lines).
- Board and card sort (PR #398) unchanged; focus scrolling clean at both sizes.
- Work View plane at 1920×1080: 1076×765, fully visible.

## 10. Graphing findings

- **Fixed:** PQ-014 (letterboxed taps), PQ-001/002/004 (Enlarge shows the
  plane at every size), PQ-003 (card → plane on touch).
- **Deferred:** PQ-024 (`lockedX` ignored), PQ-034 (three linear click maps).
- Checked and fine: lines and curves stay clipped to the plot area in Work
  View (PR #398's clip is in viewBox units, so the letterboxed plane keeps it);
  hover/drop previews use the same mapping as placement, so the ghost point
  now sits under the pointer on a Chromebook; Graphing 2 plotting and dragging
  at 4× throttle (§5); Work View "Fit View" remains camera-only (certification).
- Not reproduced: graph resetting on layout change (resize/rotation keeps the
  mathematics in every certification scene); preview jitter.

## 11. Math input findings

- **Fixed:** PQ-007 (number pad for number fields; −2/3 is a number, so its hint
  now reads "Write a single number."), PQ-012 (MathLive internals behind one
  adapter, loud on upgrade), PQ-013 (calculator glyph).
- Re-verified from PR #398: typing straight after a click lands in the clicked
  field; the phone keypad keeps a typed box above it; one keypad at a time.
- Enter: see PQ-008 and its matrix.

## 12. Persistence findings

- **Fixed (coverage):** PQ-006 — every draft-backed tool now leaves at least one
  real record that passes the real sanitizer; Signs and Solutions and
  Expression Meaning are driven by choice, partial state, check, edit and
  reload, and their work comes back unchanged.
- Enlarge/close, rotation and resize keep the mathematics (certification;
  enlarge matrix: a point placed inside Work View is still placed after Close).
- **Deferred:** PQ-028 (Expression Meaning reopens on row 1), PQ-009 (Undo
  history across the whole board).
- Nothing new is persisted by this PR. `workViewReveal`, the card reveal and
  the keypad profile are presentation only.

## 13. Feedback / grading findings

- **Fixed:** PQ-008 (no attempt spent by a first Enter), PQ-038 ("b = 4" held
  back instead of graded wrong), PQ-017 (attempt outcome announced), PQ-018
  (model line matches the steppers).
- **Deferred:** PQ-022 (attempts message off-screen after a tool Check), PQ-032
  (pill wrapping).
- **PQ-036 (P1, deferred):** in a DOL the plotting workspace's *Check Point
  Placements* returns "Revise: P1, P2, P3, P4, P5" — a per-point verdict
  before submission. Needs an assessment-policy decision (see PQ-036).
- Checked and not a finding: Parabola Geometry's wrong-answer feedback
  ("Focus and directrix are |p|=2 from the vertex…") looks like a leak but p is
  printed as a given in the Geometry panel. The PR #397 board gates its card
  checks on `showImmediateFeedback` and `feedbackTiming`. Registry tools' own
  verdict pills are suppressed when immediate feedback is off
  (`useToolSubmission`).

## 14. Instruction / help placement findings

- **The pattern is right; the cost is the rows.** Tasks lead, and both help
  blocks are folded (PR #398). But every registry tool spends ~185px on a phone
  between the task and its first panel: a two-line title beside "Enlarge
  question", "About this tool" on its own row, "How to do this (N steps)" on
  another (PQ-023). On a 390×844 phone with the real identity bar the first
  answer box is at 557–1358px.
- Instruction appearing after the action it explains: not found in the
  registry tools (steps are in the fold above the work). The staged Work View
  repeats the step twice ("Plot every point from your table." and "Step 1. Plot
  the points"), which costs ~50px in landscape (PQ-020).
- Enlarged mode keeps the task visible at every size (PQ-001, now asserted by
  `assignmentMobile.mjs`).

## 15. Recommended next PRs (priority order)

**Before merging this PR:** nothing outstanding. The Work View certification
that was pending passed on the merged head, 7 / 7 devices (PQ-005).

**NEXT PR A — Assessment integrity in the plotting workspace** — small–medium
- PQ-036 (P1) DOL / submit-only: construction checks must not return
  per-point verdicts; decide "lock in my points", review workflow grading
- PQ-024 `lockedX`: honour or remove (same component, same decision-maker)

**NEXT PR B — Phone first screen: reach the mathematics sooner** — medium
- PQ-023 merge "About this tool" into "How to do this"; label-size titles on phones
- PQ-022 attempts-remaining message inside the tool's result area
- PQ-021 one-line identity bar below 480px (product sign-off)
- PQ-025 Enlarge opener off the step chips and headings
- PQ-032 pill radius for long feedback

**NEXT PR C — Math entry on a keyboard** — small–medium
- PQ-040 "−2/3x + 4" typed on a keyboard becomes −2 over (3x + 4)
- PQ-039 re-measure typing latency on a production build, then profile
- PQ-037 staged Work View typed stage above the keypad (journey first)

**NEXT PR D — Landscape and Work View chrome** — small–medium
- PQ-020 compress Work View workflow chrome at `max-height: 460px`
- PQ-026 drop the "Question Work View" title when a task is shown
- PQ-027 capability chips as a caption
- (iPad) try the bottom action row in portrait Work View

**NEXT PR E — Unified board Undo** — medium
- PQ-009 coalescing in `useMathUndoHistory`, MathLive `resetUndo()`, verdict
  exclusion, announce-and-reveal

**NEXT PR F — Polish and test infrastructure** — tiny
- PQ-028 Expression Meaning reopens on the first incomplete row
- PQ-029 "Submit workflow" wording · PQ-030 ⭐ glyph
- PQ-031 scroll padding from the measured task height
- PQ-034 route the last three click maps through `clientPointToViewBox`
- PQ-033 a gate server script (`hmr: false`, own `cacheDir`, MathLive fonts)

---

## Tests

All results below are on the **merged head `13ce82c1`** (this branch +
`main` with PR #400), unless marked otherwise.

| Gate | Result |
| --- | --- |
| `npm run test:platform` | **6692 / 6692** |
| `node --test tests/tools/*.test.mjs` | **253 / 253** |
| `npm run test:authoring-v5` | **686 / 686** |
| `npm run lint` | exit 0; 450 warnings — the identical list to current `main` (`1fcd1ea7`), compared line by line against a clean export |
| `npm run audit:theme-colors` | passed (127 documented legacy exception groups) |
| `npm run build` | exit 0 (the usual >500 kB chunk warning, as on `main`) |
| `npm run build:firebase` | exit 0; build manifest written (nothing deployed) |
| `npm run test:rules` | not run: no Firestore rules or collections changed |
| `tests/browser/workViewCertification.mjs`, one device per process | **7 / 7 devices, 161 / 161 scenes, 0 findings** (PQ-005 table); CI's per-device matrix also green |
| `tests/browser/workViewTerminalTransition.mjs` | passed on Chromebook and the 390px phone |
| `tests/browser/darkModeCertification.mjs` | passed, 4 devices × light/dark (CI `browser-readability` green after the PQ-013 test fix) |
| `tests/browser/studentUxPlatform.mjs` (9 journeys) | **9 / 9** |
| `tests/browser/linearMultipleRepresentations.mjs` (11 journeys) | **11 / 11**, no findings |
| `tests/browser/draftPersistence.mjs` | all 14 families pass navigate / reload / reopen (and replacement where it applies) |
| `tests/browser/toolDraftSyncSweep.mjs` | 23 draft-backed tools pass the real sanitizer; fixture unchanged |
| `tests/browser/toolOpenAudit.mjs` chromebook / phone / tablet / phone-landscape | exit 0 on all four ("every tool opens with the tool on the first screen and its directions folded") |
| `tests/browser/assignmentMobile.mjs` | **0 findings** at 344/360/390 (was 3 on the old `main`); now also requires the task on screen in the enlarged view |
| `tests/browser/enterContractSurvey.mjs` (new) | no attempt from a first Enter in any multi-control tool; fixture unchanged |

**New node tests:** `workViewReveal`, `responseKeypadProfile`,
`mathLiveCompat`, `enterContractSurvey`, `landscapeQuestionGrid`,
`attemptFeedbackAnnounced`, `dataModelingModelDisplay`; additions to
`enterContract`, `responsiveCoordinates`, `toolDraftSyncContract`,
`toolShellWideProfile`, `studentWorkspaceVisibility`, `calculatorDefaultPolicy`,
`mobileInteractionWiring`, `tests/tools/batchADeepening`. Every new or changed
assertion was broken once to confirm it goes red.

**Source contracts rewritten against behaviour** (per
`docs/handoffs/SOURCE_CONTRACT_PLAYBOOK.md`), each proven intact first:

- `studentWorkspaceVisibility` — "Work View opens on the tool's live work":
  the pinned `surface.scrollTop += …` became calls into `workViewRevealDelta`
  (already-visible regions are not moved; live work lands 8px under the top).
- `enlargeableFigureCoverage` — "enlarging cannot move where a point lands":
  the pinned linear formula became a measured check that the same drawn point
  maps identically at embedded, enlarged and letterboxed sizes (the old formula
  fails it).
- `calculatorDefaultPolicy` / `mobileInteractionWiring` — the pinned
  "🚫 🧮 Calculator" became the drawn icon with its strike, asserted against
  executable source (the comment that explains the emoji stays).
- `studentWorkspaceVisibility` — the bar's icon count includes the drawn
  calculator icon.

**Regression rule.** One gate failure on this branch was mine and was fixed in
the code, not the test: the portrait graph-first rule briefly also matched
small landscape phones (caught by reading the landscape rule before shipping),
and the one-column rule would have overridden the ≥1050px domain/range layout
(fixed with an explicit exception). The draft-sweep, Enter-survey and
assignment-mobile fixtures were refreshed only after the behaviour they record
was corrected.

## Evidence

`docs/qa/platform-quirks-audit/`:

| File | Shows |
| --- | --- |
| `pq001-before-phone-390x664-enlarge.png` / `pq001-after-…` | Enlarge on a phone: point list vs the plane (PQ-001) |
| `pq002-before-ipad-820x1180-enlarge.png` / `pq002-after-…` | iPad Work View: 256×182 plane beside the list vs 502×357 (PQ-002) |
| `pq-landscape-phone-before-844x390.png` / `…-after-…` | Landscape phone: blank right column vs the tool beside the task (PQ-015) |
| `pq-calculator-icon-before-phone-bar.png` / `…-after-phone-bar.png` / `…-after-work-view.png` | "□" vs the drawn calculator (PQ-013) |
| `pq-open-landscape-844x390-enlarge.png` | Landscape Work View's 150px stage body (PQ-020, deferred) |
| `pq007-after-phone-number-pad.png` | The slope box on a phone: "Write a single number.", the number pad and "Needed for this answer: a⁄b" (PQ-007) |
| `pq036-dol-point-check.png` | A DOL plotting stage answering "Revise: P1, P2, P3, P4, P5." (PQ-036, deferred) |
| `pq023-phone-first-screen-inverse-composition.png` | A phone's first screen: identity, navigator, task, tries, tool header and two help rows before any mathematics (PQ-023, deferred) |

## Safe to merge?

**Yes.** Reasons:

- Every change is contained: CSS scoped to Work View / phone landscape /
  narrow phones, one pure geometry helper (identical output whenever a plane
  keeps its aspect ratio), one Enter rule that only ever turns a *press* into a
  *focus*, presentation-only keypad and label changes, a shape guard that steps
  aside whenever a key contains "=", and harness/test changes. No schema,
  rules, Functions, grading or sanitizer changes; nothing new is persisted.
- The only change to what a student can submit is protective: a first Enter no
  longer spends an attempt (PQ-008) and "b = 4" is held back instead of graded
  wrong (PQ-038). Grading of `-2/3`, `\frac{-2}{3}` and `-\frac{2}{3}` was
  checked under the new `number` format.
- Newly compiled assignments record `answerFormat: "number"` for numeric
  fractions such as −2/3 (was `expression`). Grading ignores that field
  (only `interval` and `orderedPair` matter there); stored assignments are
  untouched and still get the number pad through the answer-key check.
- Reconciled with `main` after PR #400 without conflicts or overlap (see the
  note under the title), and every gate — node, lint, builds, the 7-device Work
  View certification, dark mode and all the student browser journeys — passed
  on the merged head, locally and in CI.
- Not deployed. The one deferred P1 (PQ-036) is pre-existing and documented
  with evidence; it is first in the next PRs.
