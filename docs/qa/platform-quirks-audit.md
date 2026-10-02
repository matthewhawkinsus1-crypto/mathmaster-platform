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
| PQ-041 | P1 | FIXED (2026-10-01 follow-up) | A phone held sideways cannot scroll the question |
| PQ-044 | P1 | FIXED (2026-10-01 follow-up) | Opening a question on another Chromebook throws the saved work away |
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
| PQ-020 | P2 | FIXED (2026-10-01 cleanup) | Landscape phone Work View gives the stage 120–150px |
| PQ-021 | P2 | FIXED (2026-10-01 cleanup) | Phone identity bar is 67–86px and always pinned |
| PQ-022 | P2 | FIXED (2026-10-01 cleanup) | After a tool's Check, the attempt outcome is off-screen |
| PQ-023 | P2 | FIXED (2026-10-01 cleanup; steps 1–2) | Tool chrome and folded help sit between the task and the mathematics |
| PQ-024 | P2 | FIXED (2026-10-01 cleanup) | Point cards say "P1: x = −1" but x is not locked |
| PQ-035 | P2 | NOT REPRODUCED | Memory growth over a long session |
| PQ-039 | P2 | NOT A PRODUCTION ISSUE | Typing latency in the student harness |
| PQ-040 | P2 | FIXED | Typing "−2/3x + 4" on a keyboard makes −2 over (3x + 4) |
| PQ-042 | P2 | FIXED (2026-10-01 follow-up) | On a phone, "Next step" can open the next step out of view |
| PQ-043 | P2 | FIXED (2026-10-01 follow-up) | A composed question with a plotting step is never backed up to the server |
| PQ-019 | P3 | FIXED | Inverse & Composition writes "1(x − 2)²" and "−1x" |
| PQ-025 | P3 | FIXED (2026-10-01 cleanup) | "Enlarge question" sits on top of content on phones |
| PQ-026 | P3 | FIXED (2026-10-01 cleanup) | Work View header says "Question Work View" and clips the task |
| PQ-027 | P3 | FIXED (2026-10-01 cleanup) | Work View capability chips look like disabled buttons |
| PQ-028 | P3 | FIXED (2026-10-01 cleanup) | Expression Meaning reopens on its first row after a reload |
| PQ-029 | P3 | FIXED (2026-10-01 cleanup) | Regression Calculator's button says "Submit workflow" |
| PQ-030 | P3 | FIXED (2026-10-01 cleanup) | The identity bar's ⭐ is an emoji too |
| PQ-031 | P3 | FIXED (2026-10-01 cleanup) | Scroll padding assumes a 140px task card |
| PQ-032 | P3 | FIXED (2026-10-01 cleanup) | Multi-line verdict text in a pill |
| PQ-033 | P3 | FIXED (2026-10-01 cleanup) | Dev-server hazards for the browser gates |
| PQ-034 | P3 | FIXED (2026-10-01 cleanup) | Three click maps still stretch linearly |
| PQ-037 | P3 | FIXED (2026-10-01 cleanup) | Typed stages inside a staged Work View may not scroll above a keypad |

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
  - `?staged=1` (2026-10-01 cleanup) appends a composed question — complete a
    seven-row table, graph it, give its domain and range — compiled the same
    way, for the `staged` journey (PQ-020, PQ-026, PQ-037).
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

- **Update 2026-10-01:** blockers 1 and 2 below are fixed platform-wide. A run of typing in one field is one Undo step (`mathUndoStack.js`), and a math field's own Ctrl+Z no longer replays what a platform Undo removed (`MathInput` `resetUndo()`). Gate: `tests/browser/undoTyping.mjs`. Wiring the whole board (3, 4) was still open when this note was written; it is fixed since ("items 3 and 4 — fixed", above).

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
  - **Still open when this note was written:** a curve's check was a yes/no that a student could repeat. Fixed since ("Fixed (cleanup of PRs #407/#408)", above): where outcomes are withheld there is no check to repeat, and the curve is graded at submission.
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

### PQ-037 · Typed stages inside a staged Work View may not scroll above a keypad — **P3 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup):** reproduced first. A seven-row table stage
  (compiled through the import chain, `studentUxPlatform.html?staged=1`) in
  phone Work View, number keypad up: at 390×844 row 7 sat at y 547–591 with
  the keys from 570 and the step body ending at 391, so the digit went into a
  box nowhere on screen (same at 344×882 and 360×800). The scroller search
  found the page's `.math-tool-workspace` behind the modal.
  `.workflow-focus__workspace-body` and `.workflow-focus__active-stage` (the
  scroller beside a persistent graph) are now in `VERTICAL_SCROLL_SELECTOR`;
  embedded neither scrolls, so the search passes them as before. Row 7 now
  lands at 335–379, inside the body and above the keys (344×882: 373–417 vs
  keys 608; 360×800: 291–335 vs 526). Gates: `studentUxPlatform` `staged`
  types all seven rows on the keypad after Done and a scroll, as a student
  does, and fails with the selector removed (rows 3–7 off screen);
  `numberEntry.test.mjs`. Evidence: `pq037-before-…`, `pq037-after-…`.
- **Fixed (2026-10-01 follow-up): a small phone with the keypad up.** At
  390×664 the step body was 28px once the keypad and the two-row action row
  were up — the regular chrome (a four-line task in an 81px header, the
  instruction, the step heading, the Previous/Next row) spent the 390px left
  above the keys — so no scroll could show the 44px box being typed into;
  16px of it showed (375×667: 31px, 19px). The keypad is MathMaster's own and
  docked to the bottom, so `resolveWorkViewLayout` now counts its height:
  with less than 460px left above it, Work View takes its short form, as on a
  phone held sideways (instruction in a one-line header, heading in the
  Previous/Next row). The software keyboard still never refolds the view.
  EnlargeableFigure re-reads the layout when MobileViewportContainer flags the
  keypad up or down (`data-mobile-keypad-open`). Keypad up: **28 → 158px** at
  390×664 and **31 → 161px** at 375×667, the row being typed into wholly on
  screen (44 of 44px); Done restores the regular chrome (302 / 305px). 390×844
  is unchanged (482px down, 208px up: 570px is left above the keys), and so are
  iPad 820×1180 (924px; no MathMaster keypad) and Chromebook 1366×768 (509px).
  Gates: `studentUxPlatform` `keypad-short` (390×664, 375×667, 390×844),
  `workViewPhoneChrome.test.mjs`. Evidence: `pq037-keypad-before-390x664.png` /
  `pq037-keypad-after-…`.
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

### PQ-020 · Landscape phone Work View gives the stage 120–150px — **P2 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup), as recommended:** below 460px of layout height
  (`resolveWorkViewLayout().shortHeight` → `data-height="short"`; the layout
  height, so a keyboard never refolds the view) the step instruction sits
  under the task in the header, the step heading joins the Previous/Next row
  ("Step 1. Plot the points · BUILD IT · 1 of 12 ← →"; WorkflowRunner moves it
  through `workViewPresentation.js` without remounting the stage, and the
  buttons' words stay their names), and the insets are trimmed. Stage body
  **150 → 265px** at 844×390, **120 → 235px** at 740×360, **128 → 250px** at
  667×375; the plotting plane **60 / 50 / 55% → 100%** on screen. Portrait
  390×844 484 → 499px; 1366×768 unchanged (508 → 509). The open view now
  re-runs its reveal when the phone turns: a graph stage built from a table was
  81–88% on screen after turning, 100% now. Gates: `studentUxPlatform` `staged`
  (≥250 / ≥220px, folded chrome, plane on screen, work intact after turning
  back), `workViewCertification.mjs` (rotation on every device),
  `workViewPhoneChrome.test.mjs`. Evidence: `pq020-before-…`, `pq020-after-…`.
- **Fixed (2026-10-01 follow-up): seven actions fit the rail at 740×360.**
  Measured first: under a 53px header the rail had 307px, and seven 44px
  actions with its 6px padding and 2px gutters need 332, so Graphing 2's
  "Start over" and Transformations Lab's "Clear" sat at y 335–379 on a 360px
  screen (667×375: 10px short as well; the certification at 740×360 flagged
  both as clipped, 21 / 23). A rail with seven or more actions on a short
  phone now has no padding and no gutters and the header 2px of padding a
  side instead of 4 (`WorkViewShell.css`, `:has(> button:nth-of-type(7))`):
  308px of actions in a 311px rail, every one 155×44 and on screen (Undo at
  49–93 … Start over at 313–357) at 740×360, 667×375, 664×390 and 844×390.
  Rails with fewer actions are unchanged. Gates: the certification gains the
  740×360 phone (`android-landscape`, 23 / 23, also in CI's matrix) and
  `workViewPhoneChrome.test.mjs` checks the budget from the rules themselves.
  Evidence: `pq020-rail-before-740x360.png` / `pq020-rail-after-…`.
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

### PQ-021 · Phone identity bar is 67–86px and always pinned — **P2 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup), compact rather than hidden (the product
  decision):** below 480px the bar is one line, **38px** at 344, 360, 375, 390
  and 479px (was 86 / 67 / 67 / 67 / 67). The name and period end in an
  ellipsis (the full text stays in the DOM and the tooltip; at 344px it reads
  "Claude QA Student • Peri…"), the points read "★ 120" with the words "Class
  Points" visually hidden rather than removed, and "Not you?" gives way to Log
  Out. It stays sticky and still publishes its height, so the navigator, the
  task and the phone container move up 29–48px. iPad and Chromebook are
  unchanged (38px, "Not you?" shown). Gates: `studentUxPlatform` `identity`,
  `studentIdentityPhone.test.mjs`. Evidence: `pq021-before-…`, `pq021-after-…`.
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

### PQ-022 · After a tool's Check, the attempt outcome is off-screen — **P2 · FIXED**

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
- **Reproduced** in a new harness with the real wrappers, the real identity bar
  and a record that counts attempts the way App.jsx does
  (`tests/browser/toolAttemptOutcome.mjs`). After a wrong Check the outcome was
  **357px** (Inverse Composition) and **403px** (Function Investigation) below
  Check at 1366×768 and **190px** / **147px** below it at 390×844; Regression
  Calculator's was 133–142px below — off screen in every case. It also found a
  second, production-only defect: on a question that already had an attempt
  on its record the outcome was **cleared the instant it arrived** (the engine
  compared a registry tool's answer key, which a tool never reports and so is
  always empty, with the recorded one, and read that as "the answer changed").
- **Fixed:** a tool's verdict area offers a slot. `ResultPill` does unless it
  reports one stage rather than the attempt (the classic Representation
  Bridge's stage checks and Inverse Derivation's "y isolated" are marked
  `stageCheck`); Regression Calculator's verdict, already a live region, takes
  the outcome inline. QuestionEngine hands the attempt's outcome — the same
  words its box shows, worded once — through `ToolRuntimeContext` to the slot
  that mounted with the verdict of the Check just pressed
  (`attemptOutcomeSlots.js`), and then does not render its box. It hands it
  over only where the box would have shown it: outcome feedback allowed, not
  blocked, the question still open. A correct or final attempt locks the tool
  (inert, so hidden from screen readers), so the box announces those as
  before; a server-graded tool shows no verdict of its own and keeps the box;
  composed and non-tool questions keep the box. The live region is mounted,
  empty and visually hidden, with the verdict, so the sentence arrives as an
  addition to an existing region; it is scrolled into view only as far as
  needed (`block: 'nearest'`, once per attempt). The engine no longer clears a
  registry tool's outcome against an answer key the tool never reports.
- **After:** 62px below Check at 1366×768 and 59px at 390×844, on screen, for
  both tools; Regression Calculator on screen on both. One element and one live
  region carry the outcome every time; the count goes "2 attempts" → "1
  attempt" → the final-attempt box; a right answer still gets the engine's
  "Correct!" box, once; DOL, quiz and test show nothing about correctness or
  attempts, in the tool or below it; the question with an earlier attempt keeps
  its outcome.
- **Not changed here:** the representations board
  (`LinearMultipleRepresentationsBoard`, being edited elsewhere) has no
  `ResultPill`, so it keeps the engine's box until its verdict renders
  `<AttemptOutcome />` — one line.
- **Worth a follow-up:** the box's "Focus on: …" line moved with the sentence,
  as part of the same outcome. For a registry tool it lists the tool's own
  part ids — "fog, gof, inverse, restriction" (Inverse Composition, whose
  restriction mode does not ask for fog or gof), "data-entry,
  linear-regression, …" (Regression Calculator). The wording is not new; it is
  now on screen.
- **Tests:** `tests/browser/toolAttemptOutcome.mjs` (39 checks; 13 red before
  the fix; with the box rendered beside the tool's outcome it reports "2 shown,
  2 live", and with the old clearing it reports the revisited outcome gone);
  `tests/platform/toolAttemptOutcome.test.mjs` (the ownership rule in node and
  its wiring); `attemptFeedbackAnnounced.test.mjs` rewritten against the
  behaviour it protects (the box's literal condition moved; announced once,
  only where outcome feedback is shown, now asserted for both places). Thirteen
  mutations, all red. One browser mutation survives by design: dropping the
  feedback-policy condition from the hand-over is invisible in a browser,
  because under a withheld policy no tool renders a verdict and so no slot
  exists — the node contract kills it.

### PQ-023 · Tool chrome and folded help sit between the task and the mathematics — **P2 · FIXED (steps 1–2; step 3 not taken)**

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
- **Reproduced** (studentUxPlatform `?identity=1&tools=1`): the same numbers
  as above — on the phone the tool header was **98–117px** (a 16px name over
  two lines beside "Enlarge question", "About this tool" on its own row) and
  "How to do this (3 steps)" was a **60px** two-line pill: a phone rule capped
  it at 46% of a row it shares with the task prompt, which the assignment
  hides. At 1366×768 the header was 63px.
- **Fixed:**
  1. **One disclosure.** The TaskCard's "How to do this (N steps)" now opens
     with the tool's one-line description (and, on a phone, its badge), then the
     directions and the steps. The header's "About this tool" goes once a
     TaskCard has taken the description; it stays for a tool with no TaskCard
     (Solution Review, the representations board) and in Work View, which hides
     the task card. A card with no steps is labelled "About this tool".
  2. **On a phone the name is a label on the Enlarge row:** 13px, left, at most
     two lines, in a 58px header level with the 44px opener.
  3. **The fold takes its row** when the prompt is hidden: one 44px line, and
     opened, the steps use the full width instead of 46% of it.
- **First answer control (y, px), before → after:**

  | Tool | 390×844 | 1366×768 |
  | --- | --- | --- |
  | Inverse Composition | 1359 → **1284** (−75) | 1008 → **1000** (−8) |
  | Complex Plane | 1042 → **986** (−56) | 571 → **563** (−8) |
  | Graphing 2 (the plane) | 634 → **578** (−56) | 553 → **545** (−8) |
  | Function Investigation | 1038 → **963** (−75) | 534 → **526** (−8) |
  | Parabola Geometry | 920 → **845** (−75) | 493 → **485** (−8) |

  Phone header 98–117 → 58px; the fold 60 → 44px. The Chromebook header is
  63 → 55px: its height is now set by the badge, and the opener already fits
  inside it.
- **The steps stay discoverable:** same label and step count, same place (the
  first row under the tool's name), still folded, and still remembered by the
  same key, so a student who had opened them finds them open. The
  description is in the same fold, first.
- **Not done:** step 3 (the fold after the first panel's title, or a "?" in the
  header). It moves the steps away from where students have learned to find
  them, which is the pedagogy check this entry asks for; it is what the
  Chromebook would need for a larger gain.
- **Tests:** two new contracts in `toolShellChrome.test.mjs` (the description
  opens the fold and the header offers it only where nothing else does; the
  phone label, row and fold width); three source pins rewritten against their
  behaviour (the fold's summary moved into a variable); eleven mutations, all
  red. `toolOpenAudit.mjs` (four devices) and `workViewMatrix.mjs` re-run, see
  *Tests*.

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

### PQ-025 · "Enlarge question" sits on top of content on phones — **P3 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup), by reserving its width** (the task card is
  another change's file): EnlargeableFigure publishes the opener's measured
  width and bottom edge on the surface. A staged question's progress rail and
  step chips end before it (overlap 4,643px² → 0 at 344, 360 and 390px; the
  row still scrolls), the multi-answer heading stops before it below 600px,
  and Step Algebra's toolbar ends before it — on a phone it starts below it
  instead, because that toolbar wraps and a right margin narrowed every row to
  ~165px at 344px. A survey of all 35 harness questions (the 24 tools
  included) found content under the opener in **4 / 4 / 1 / 1** questions at
  390 / 344 / 820 / 1366px — at 1366×768 it covered Step Algebra's "Reset
  work", a control a Chromebook student could not press — and in **0** at every
  width after. Gates: `studentUxPlatform` `opener` and `staged`,
  `workViewPhoneChrome.test.mjs`. Evidence: `pq025-before-…`, `pq025-after-…`.
- **Viewport:** 390px. The opener is absolutely positioned at the top right of
  the question surface: over the workflow's step-chip row (chips 3–4 hidden at
  rest, reachable by scrolling the row) and over the multi-answer heading
  ("Complete Each Pa|rt", `pq007-after-phone-number-pad.png`). **Next:** reserve the button's width at the end of the chip row, or
  place the opener in the task card's header row. **Scope:** tiny.

### PQ-026 · Work View header says "Question Work View" and clips the task — **P3 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup), as recommended:** the header shows the title
  only when there is no task (the dialog keeps its accessible name), and the
  task's clamp is four whole lines instead of 3.2em. 390×844: header 78 →
  64px with the whole task shown (11px of it was hidden); 344×882: 78 → 81px
  with the whole four-line task shown (28px, a line and a half, was hidden);
  820×1180 and 1366×768: 57px (was 57–58). Gates: `studentUxPlatform`
  `staged`, `workViewPhoneChrome.test.mjs`. Evidence: `pq026-before-…`,
  `pq026-after-…`.
- 390px: the 23px title "Question Work View" (a product term; the button the
  student pressed said "Enlarge question") sits above a task clamped to 3.2em,
  which cut "…describe what it does" mid-word. **Next:** drop the title when a
  task is shown and give the task the line. **Scope:** tiny.

### PQ-027 · Work View capability chips look like disabled buttons — **P3 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup), as a caption:** one line of 12px muted text
  under the actions — "In this view: Pan and zoom · Plot and edit points ·
  Your line" — with no background, radius or padding (each label was a
  #e8f0fe chip, 7px radius, 7×9px padding, the width of the buttons above
  it), still hidden on phones. "In this view" rather than "You can": the
  labels tools register mix actions and things ("Sequence table", "Your line:
  y = 2x + 3"). Measured at 820×1180, 1024×768 and 1366×768. Evidence:
  `pq027-before-…`, `pq027-after-…`.
- iPad/desktop rail: "Pan and zoom", "Place and move points" are grey
  button-shaped chips under the real actions. **Next:** style as a caption
  ("You can: pan and zoom, place and move points") or remove. **Scope:** tiny.

### PQ-028 · Expression Meaning reopens on its first row after a reload — **P3 · FIXED**

- The work restores exactly (PQ-006), but the row being edited is not persisted
  by design, so a student mid-way through row 3 comes back to row 1. **Next:**
  open on the first incomplete row. **Scope:** tiny.
- **Reproduced** (1366×768, real wrappers): rows 1–2 complete and row 3 begun;
  after a reload the open row was **"15" (row 1)**, and the same after leaving
  for another question and coming back.
- **Fixed:** the open row is still a selection and still not saved; it is now
  *derived* from the restored answers when the tool opens — the first row, in
  matrix order, with a choice still empty (`firstIncompleteExpressionId`),
  falling back to row 1 when every row is done or there is no work. After: the
  same journey reopens on **"(t − 3)" (row 3)** after a reload and after
  navigating back; a fresh question still opens on row 1. Nothing new is
  persisted.
- **Tests:** `expressionMeaningAdvance.test.mjs` (the helper — no work, mid-row,
  an earlier gap, all done, a blank choice; and the open-row state is derived
  from the restored answers — three mutations, all red);
  `toolDraftSyncSweep.mjs`'s Expression Meaning reload journey now also
  requires the half-done row to reopen (with the old initializer it reports
  "reopened on row 1 of 3").

### PQ-029 · Regression Calculator's button says "Submit workflow" — **P3 · FIXED (Systems Workspace titles left to its owner)**

- "workflow" is platform vocabulary. **Next:** "Submit my regression". **Scope:** tiny.
- **Reproduced:** the button read "Submit workflow" and a fully correct
  submission answered "Workflow complete.". A scan of every rendered string in
  `src/tools/**` and `src/platform/workflow/**` found three more: a composed
  question's Undo tooltip and accessible label, "Undo the last workflow
  response", and three Systems Workspace panel titles ("3×3 substitution
  workflow", "3×3 elimination workflow", "<method> workflow").
- **Fixed:** "Submit my regression", "Regression complete.", and "Undo the
  last answer in these steps". The Systems Workspace titles are **not**
  changed here: that directory is being edited for the assessment checks in
  parallel, so they are left to that work (listed as tolerated, not required,
  in the test). The regression drivers (`regressionCalculatorPhone.mjs`,
  `captureToolResponses.mjs`) press the new label and now honour
  `AUDIT_ORIGIN`; the Enter survey fixture was regenerated (only the label and
  timestamp changed); the captured submission payload is byte-identical.
- **Tests:** `tests/platform/toolStudentWording.test.mjs` — no rendered string
  in a registry tool or composed-question stage uses "workflow" as a word (class
  names such as `workflow-stage` are not words), and the regression button and
  verdict use the student's words. Five mutations, all red (each old string
  restored, the tolerated list emptied, a new "Check my workflow" label).

### PQ-030 · The identity bar's ⭐ is an emoji too — **P3 · FIXED (2026-10-01 cleanup)**

- **Fixed (2026-10-01 cleanup):** `StarIcon.jsx`, an inline SVG in the
  CalculatorIcon manner (PQ-013), decorative, so the chip still reads "120
  Class Points". Reproduced on demand by running Chrome with a fontconfig of
  DejaVu and Liberation only (no font has U+2B50): "□ 120 Class Points"
  before, a drawn star after, at 1366×768, 390×844 and 344×882. Gates:
  `studentUxPlatform` `identity` (the chip holds an svg and no ⭐),
  `studentIdentityPhone.test.mjs`. Evidence: `pq030-before-…`, `pq030-after-…`.
- Rendered "□" on the emoji-less test machine (U+2B50 is Unicode 5.1, so far
  more widely supported than 🧮). **Next:** reuse the CalculatorIcon approach if
  PQ-021 redesigns the bar. **Scope:** tiny.

### PQ-031 · Scroll padding assumes a 140px task card — **P3 · FIXED (2026-10-01 cleanup)**

- **Reproduced and fixed (2026-10-01 cleanup).** Chrome does show it — not
  through Tab, which centres the field, but through MathInput's focus signal,
  which reveals with `scrollIntoView({ block: 'nearest' })`: with the task card
  at 184px, Enter in the first blank walked to the second and left it **30px
  under the card** at 1366×768, 1920×1080 and 820×1180. (The fields' own
  scroll-margin does not help there; Chrome does not apply it to the math
  field in that reveal.) The padding is now `top + var(--mm-sticky-task-height,
  84px) + 56px`, the label allowance the fields' scroll-margin uses: the old
  140px for an 84px card and before the first measurement, and the walked-to
  blank now lands 56px below a 184px card. Gates: `studentUxPlatform`
  `sticky-reveal` (fails with the flat 140px), `studentQaLayoutContracts.test.mjs`.
- `scroll-padding-top: calc(var(--mm-sticky-task-top) + 140px)` guesses the
  task card's height although it is measured (`--mm-sticky-task-height`). With
  the card forced to 158–184px, keyboard focus still never landed a field under
  it in Chrome (Chrome centres focused elements). Safari may align differently.
  **Next:** use the measured height (the `data-work-view-focus` scroll-margin
  already does) the next time this CSS is touched. **Scope:** tiny.

### PQ-032 · Multi-line verdict text in a pill — **P3 · FIXED**

- `ResultPill` has a 999px radius; long feedback ("• Odd multiplicity crosses;
  even multiplicity touches…") wraps into a three-line lozenge on phones.
  **Next:** switch to a 10px radius above ~60 characters. **Scope:** tiny.
- **Reproduced** (a wrong Check in the real wrappers): at 390×844 Complex
  Plane (74 characters) and Parabola Geometry (77) wrapped to two lines and
  Polynomial Workshop (101), Exponential/Log (94) and Sequence Explorer (85) to
  three — 322×60 to 322×84, an effective radius of 30–42px. At 1366×768 the
  same verdicts were two or three lines too (454×66 to 454×92, 33–46px).
- **Fixed:** `ResultPill` takes a 10px radius when its text is longer than 60
  characters or when it actually wraps at the width it is given — measured
  after layout and re-measured by a ResizeObserver, so a verdict that wraps
  only on a phone is a card there and a pill on a Chromebook. A short one-line
  verdict stays a pill. After: all ten long verdicts above are 10px cards at
  both sizes; "• Not yet" is still a pill; squeezed to 60px wide it becomes a
  card, and a pill again when released.
- **Tests:** `tests/platform/verdictShape.test.mjs` — the rule, the rendered
  text length, the wrap measurement and the pill's wiring (five mutations, all
  red: a fixed 999px radius, wrapping ignored, the 60-character boundary moved,
  a three-line wrap threshold, no re-measure on resize).

### PQ-034 · Three click maps still stretch linearly — **P3 · FIXED**

- `IntervalNumberLine`, `RelationMapping`, `GraphStory` map clicks linearly.
  Safe today (no height cap on those SVGs); would break the day one is added.
  **Next:** route them through `clientPointToViewBox`. **Scope:** tiny.
- **Reproduced — and one was already live.** `tests/browser/clickMapLetterbox.mjs`
  taps where the browser itself draws a value (`getScreenCTM`). Capped to 55%
  of its natural height (letterboxed): a tap on the drawn **5** of the number
  line placed **3**; on the drawn **(2, 1)** of the relation plot (522×289 box,
  430×430 drawing) it plotted **(0, 1)**; a sketch stroke from (200, 300) to
  (520, 120) was recorded from (271.8, 298.9) to (448.2, 121.1). No cap was
  needed for the relation plot on a **phone held sideways (844×390)**: the
  landscape layout's `.mathmaster-tool-panel svg { max-height: 62dvh }` makes
  it 520×242 for a 430×430 drawing, and a tap on the drawn (2, 1) plotted
  (0, 1) inside the real QuestionEngine.
- **Fixed:** the three pointer handlers map through `clientPointToViewBox`, as
  the plotting workspace and CoordinatePlane do — exact for `meet`, identical to
  the old stretch whenever the box keeps the drawing's shape. After: the
  number line places 5, the plot (2, 1) at 1366×768 capped and at 844×390, and
  the sketch stroke lands within 2 viewBox units (the plane's 2px CSS border,
  which no plane's mapping subtracts); the uncapped controls are unchanged.
- **Tests:** `tests/platform/clickMapLetterbox.test.mjs` (each handler goes
  through the helper with its own viewBox, converts the helper's point, has no
  stretch, and imports the helper — four mutations, all red);
  `tests/browser/clickMapLetterbox.mjs` (13 checks; 4 red before the fix).

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

### PQ-041 · A phone held sideways cannot scroll the question — **P1 · FIXED (2026-10-01 follow-up)**

Found by repairing `tests/browser/stagedQuestion.mjs` so it opens each step
the way a student does (the whole question in QuestionEngine, in App.jsx's
student screen with its identity bar and navigator; see Tests).

- **Reproduction:** 664×390 and 844×390, any question. On a short landscape
  phone the assignment screen is one screen tall and its question stage clips
  (`overflow: hidden`); the prompt column and the work column are meant to
  scroll inside it. The height rule named the question container but not the
  question engine between it and the stage, so both grew to their content: a
  staged question laid itself out **1150px tall in a 287px stage**, neither
  column scrolled, and a 200px finger drag over the work moved nothing. A
  student saw the top of step 1 and could reach nothing below it except
  through "Enlarge question".
- **Fixed:** `MathToolMobileLayout.css` holds the engine to the stage's height
  as the portrait rule always did. The work column now scrolls (233px tall at
  664×390 over 1097px of work; the same drag moves it 279px). Bounded, two more
  things showed and are fixed with it:
  - the prompt column's action bar (Undo, Reset, Scratchpad, Calculator,
    Submit; five full-width buttons) was pinned to the bottom of a 287px
    column and covered the question above it. It follows the question now, a
    short scroll down its column (`position: static`); Work View carries the
    same actions in its rail.
  - the coordinate plane had no height cap: a blanket `max-height: 100%` for
    every svg in the phone workspace outranked App.css's screen cap and, on a
    box with no set height, capped nothing (303px of plane in a 233px column).
    The rule now leaves `.mathmaster-responsive-canvas` alone, so the plane
    keeps its cap (150px on a 390px-tall screen, the whole parabola and its
    zoom buttons on screen). Portrait phones are unaffected (their planes are
    width-bound well below the cap).
  - the navigator covered the top of the question on a phone narrower than
    769px (664×390, 740×360, 667×375). App.css lets the navigator scroll on a
    short landscape screen only from 769px, and the phone rules are
    portrait-only, so these kept it sticky 44px from the top inside a screen
    that does not scroll: it sat at 82–139 over a question starting at 103,
    covering "Your task" and the attempt strip. The rule now reaches every
    landscape screen up to 560px tall (`(orientation: landscape) and
    (max-height: 560px)`); the navigator sits at 38–95, above the question.
- **After:** every step of the staged question at 664×390 has its question in
  the left column, its answer control on screen on arriving and nothing over
  the question's top. With the reveal of PQ-042 in place and these rules
  undone, the audit reports 23 findings at 664×390 (the question off screen at
  16 steps, three planes 30–36px on screen and over their cap, plot over its
  cap) and, with the navigator rule undone alone, "the top of the question
  opens under" the navigator; 0 now. A finger drag the audit cannot fake was
  checked by hand: it moved nothing before and scrolls the work column now.
  Gates: `stagedQuestion.mjs` (phone-landscape), `landscapeQuestionGrid.test.mjs`,
  `studentJourneyDol2Final.test.mjs` (which screens the navigator rule reaches,
  evaluated as media queries). Evidence: `pq041-before-664x390.png` /
  `pq041-after-664x390.png`.

### PQ-042 · On a phone, "Next step" can open the next step out of view — **P2 · FIXED (2026-10-01 follow-up)**

- **Reproduction:** 390×664, the staged function-characteristics question.
  After a student-initiated step change the desktop page brings the step under
  the pinned task card (`bringActiveStageIntoView`); a phone was left out ("the
  sticky stack is a desktop layout"). But the phone's work scrolls in its own
  box between the task and the action bar (226px here), and Next left that box
  where the old step had it: "Mark every x-intercept" opened with its plane
  scrolled out above the box and only "0 of 2 marked." in view, as did the
  y-intercept and maximum steps; "Where is this function increasing" opened
  with its choices above the box.
- **Fixed:** on a phone the active stage (the step's own controls) is brought
  into whatever scrolls it, as little as possible: a stage in view stays put,
  one below rises until its last control is in, one above or taller than the
  view (a plane) lines up its top; on a phone held sideways the page scrolls,
  under the identity bar. It runs two frames after the tap, because the phone
  container keeps a focused control in view one frame after focus and, run
  first, scrolled the box straight back to the Next button
  (`stageNavigationScroll.js`).
- **After:** the three planes and the choices are on screen on arriving at
  390×664 (4 findings → 0); foldable, tablet, Chromebook and desktop were
  already clean and stay so. Gates: `stagedQuestion.mjs` (phone-portrait),
  `stageNavigationPhoneReveal.test.mjs` (eight cases). Evidence:
  `pq042-before-390x664.png` / `pq042-after-390x664.png`.

### PQ-043 · A composed question with a plotting step is never backed up to the server — **P2 · FIXED (2026-10-01 follow-up)**

- **Found** while placing the staged question's five points through the plot
  step's own controls: the development audit reports `[MathMaster draft sync]
  The server backup will NOT store "…:workflow-responses": forbidden-key at
  plot.isCorrect`.
- **Reproduction:** a composed question with a graph step in the real
  QuestionEngine, with the real background sync merging into a copy of the
  server document and App.jsx's restore on open
  (`tests/browser/composedDraftRestore.html`). The record is refused from the
  moment the graph step's workspace first reports — when the step OPENS, with
  `isCorrect: false` — not only after Check Point Placements: 30 refusals over
  one table → graph → domain → range question. The server copy of the answers
  stays at the last version before the graph step: `{ table }` there, and
  nothing at all for the function-characteristics question, whose plot is step
  1. A second Chromebook with only the server copy got back 1 of 4 steps, and
  0 of 4.
- **Root cause:** WorkflowRunner keeps every step's answer in one draft, and a
  graph step's answer is the plotting workspace's report, `{ isComplete,
  isCorrect, responseKey, parts }`, every part with its own `isCorrect`. That
  verdict is what grades the step (`useStageVerdict`; `gradePlottedPairs` when
  no point can be read) and is finer than anything the grader could rebuild,
  so the device has to keep it — and `sanitizeWorkspaceDraftValue`, rightly,
  will not let a student-readable document hold it (on a DOL, quiz or test it
  would say whether the graph is right before release). One record was serving
  both, so the guard took the whole record off the server: the PR #397 board
  failure (`cardChecks.isCorrect`) in another record.
- **Fixed:** the server copy is a PROJECTION of the device's copy
  (`serverDraftProjection.js`, `workflowDraftProjection.js`). A graph step
  travels without its verdict: no `isCorrect`, no part verdicts, no
  `responseKey` (it repeats the workspace's construction, raw strokes included,
  which travels in its own `…:graph-construction` draft) — only each part's
  plain id, label, completeness and response, marked `rederiveOnOpen` with
  `isComplete: false`. Every other step goes as it is. The sync runs the
  unchanged guard over exactly what it sends, and the development audit judges
  the same value. The device's copy is never touched, so the device that did
  the work grades it exactly as before; and the existing precedence (a server
  entry is restored only where it is newer than the device's own copy and than
  the last attempt) means that device never takes the verdict-less copy over
  its own.
  On another device the step comes back as a step to finish. It is not an
  answer (`hasStageResponse`), so it is never graded — `gradeStage` reports it
  ungraded and incomplete, not wrong — the question cannot be submitted around
  it, and no later step can close it: the function-characteristics plot closes
  once the intercept step is in reach, and a closed step never mounts its
  workspace again. Opening it mounts the workspace, which reports from the
  student's restored construction: the same artifact, verdict included, byte
  for byte. In focus mode a calm notice names the steps to open ("Your graph
  came back from another device. … Open Step 2: Build the graph"); stacked, the
  step is open with the page and re-derives at once. Getting the verdict back
  re-baselines the workflow's Undo instead of becoming an entry Undo could
  never get past. A device still on an older build reads the projected step as
  unfinished (`isComplete: false`): a step to open, never one to mark wrong.
- **After:** nothing refused; the server copy holds every step's answer and no
  verdict-like key anywhere. On a second device the other steps' answers and
  the workspace's construction come back, Submit is off and the graph step is
  ungraded until it is opened; then the graph answer is the first device's
  exactly and the submission grades identically — parts, partial credit and
  response key — on Practice and on a DOL. The same device opened again keeps
  its own copy and grades identically. On the code before the fix the same
  journeys fail at every one of those checks.
  Gates: `composedDraftRestore.mjs` (the model and function-characteristics
  questions on Practice and a DOL, a relation graded by its plotted pairs; in
  CI with the student runtime gates), `workflowDraftProjection.test.mjs` (15),
  `toolDraftSyncContract.test.mjs` (its wiring assertion rewritten to the
  capability: the guard judges exactly the value that is queued). Mutation
  checks, each undone in turn, all red: the sync guarding and queueing the
  device's copy (4 unit, 22 browser), the projection keeping the step's verdict
  or the parts' verdicts (10 unit each) or its completeness (1), a passthrough
  projection (8), a verdict-less answer counted (1) or graded (4 unit, 2
  browser), only a marked answer waiting (1), Undo not re-baselined (1, 2), no
  notice (1, 2), a notice reaching past the navigator (1), the audit judging the
  device's copy (1, 4).
- **Found on the way, not changed here:**
  - *In App.jsx's own order — the question mounts, then the server read lands —
    the second device got nothing back at all*, for any question: PQ-044, fixed
    in its own commits.
  - *A finished composed question opened again could not be submitted until
    an answer changed* — **fixed since in fd739ea2.** QuestionEngine cleared
    its answer state in a mount effect, which React runs after the children's,
    so WorkflowRunner's first report was wiped, and WorkflowRunner reports
    again only when a response changes. QuestionEngine now resets only when the
    question changes (`tests/browser/composedReopenSubmit.mjs`), and the gate's
    same-device journey submits the reopened question as it stands.
  - *Verdict-like fields the guard does not name:*
    - a table step's `sourceConsistent` / `sourceChecked` (checked against the
      AUTHORED function when the question has no equation step, so on a DOL it
      says whether the table is right), and beside them that function itself,
      `sourceFunctionSpec` — **no longer in the server copy** (follow-up to
      this fix). Nothing grades from them; the practice-only messages that use
      them (the plotting step's magnet, "Your table and function do not agree
      yet") now work the check out where it is shown, from the cells and the
      question (`tableSourceCheck.js`), and a table that comes back on another
      Chromebook has it worked out again before the first render, by the same
      code (a graph step built from the table names its own draft after it),
      so its answers — and what is submitted — are byte for byte the first
      device's (`workflowDraftProjection.test.mjs`; `composedDraftRestore.mjs`
      checks the server copy and the submitted response key, stacked and in
      focus mode; 6 mutations, all red).
    - the graph construction's `markerPlacements.*.locationCorrect` (whether a
      graph-end marker was dropped at the true end, on a DOL too) — **left as
      it is**, because it is not a stored copy of something the grader works
      out: grading reads it first (`placement.locationCorrect === true ||` a
      distance check in graph units), and it is the judgment made when the marker
      was dropped, within 82 *screen pixels* of the true end on that device's
      plane. Another Chromebook's plane is another size, so it cannot be worked
      out again the same way; dropping it from the server copy would change
      the credit for the same marker after a restore. Closing it means grading
      the drop in graph units when it is made — a grading change, not a
      backup change. It is in the device's own storage as well.
  - The whole tool draft sweep finds no other refused record: every registry
    tool's records pass, and the QuestionEngine families of the draft
    certification, driven with their scenes' edits and every Check, pass too
    (Step Algebra's `pendingMove.analysisBefore.solution`, fixed separately,
    is not reached by those edits).

### PQ-044 · Opening a question on another Chromebook throws the saved work away — **P1 · FIXED (2026-10-01 follow-up)**

- **Found** proving PQ-043 in App.jsx's own order — the question mounts, then
  the server read lands and the question is remounted: the second device got
  nothing back (0 of 4 steps), where applying the server copy before the
  question rendered (restoreQuestionDrafts' documented contract, which App.jsx
  never followed) had passed.
- **Reproduction, in the real App:** the teacher-workflow harness (App.jsx with
  in-memory Firebase fakes; `?draftReadMs=` makes the server read as slow as
  school Wi-Fi, `?offline=1` takes it away). Device A types `7` in one question
  and `−2/3` in the next, and stops. Device B, a fresh browser with only the
  server copy, signs in and opens the assignment. On `main` (9edd1d04) and on
  this branch before the fix alike, B shows empty boxes, and 2.5 s later the
  server copy of the question B opened is `{}`, saved after A's
  `{"m":"-\frac23"}`: A's work is gone for every device. The same with a 0 ms
  read, a 400 ms read, a cold or a warm question chunk — whenever the question
  mounts before the read lands, which in App.jsx it always can. And in every
  family: in the draft-certification harness, opening any of the 16 families'
  questions stamps drafts "now" (the eight QuestionEngine families their work
  drafts, re-stamped on every return and reload; the registry tools the
  question's coach-panel state).
- **Root cause:** every draft write was stamped `savedAt = now`, and `savedAt`
  is what every copy is ordered by — the server merge keeps the newer copy of
  each key, a restore writes the server's copy only where it is newer than
  this device's (`selectRestorableDraftEntries`), and a draft older than the
  last submitted attempt is history. Every workspace writes its draft back
  when it mounts (useLocalDraftState's and useUndoHistory's effect, Step
  Algebra's and the relation solver's state effects, a composed question's
  steps reporting), so opening a question made whatever it showed the newest
  version of the student's work: (1) the restore found the device's copy newer
  and restored nothing into the question on screen; (2) the background save
  carried that copy to the server, over the real work. App.jsx's effect order
  decides only which writes are sent: children's mount effects run before
  App's effect subscribes the sync, but the remount that follows a restore
  (and every later question change) writes back with the sync subscribed.
- **Fixed — only a student's edit moves a draft forward in time**
  (`questionDraftStorage.js`):
  - Each write says whether it is the student's edit. An edit is stamped now.
    Anything else keeps the time of the last edit the draft carries — or 0,
    "never edited", on a Chromebook that never saw this work — so it can
    never look newer than real work, here or on the server. The value is
    stored either way: reload, question change and reopen on the same device
    restore exactly what they did. (Expiry still runs 45 days from the last
    time the device wrote the draft, through a new `touchedAt`; an envelope
    written before it expires from `savedAt`, as before.)
  - Who says: the draft hooks (`useLocalDraftState`, `useUndoHistory`) write
    their value back as not an edit, and their setters are edits once the
    student has touched the page — a trusted keyboard, pointer or input event —
    since the hook loaded its draft (a caller may pass `{ edit }`). A registry
    tool's field (`usePersistentToolState`) measures from when that field
    mounted, because the parsed record is cached across mounts. A composed
    question's step measures from when the step appeared (WorkflowRunner's
    `StageBody`): every step shares one draft, and in focus mode a step mounts
    on the click that opens it. Anything else is inferred: a write after input
    since this page read the draft (Step Algebra and the relation solver, whose
    state effects are their only writer, are judged this way, unchanged). A
    reset and a submission's re-stamp are edits by definition.
  - A write that is not an edit never puts back an older copy: if a restore,
    or this student in another tab, wrote the draft after the page read it, it
    is dropped until the page reads again (a restore remounts the question).
  - The background save never stamps anything (`workspaceDraftSync.js`). An
    edit goes at its own time. A write that is not an edit goes only to give
    the server an edit it lacks (one made offline, or just before the page
    closed), so it waits for the assignment's read (`noteServerCopy`) and goes
    only if the server holds nothing for that key at that time or later; a
    copy derived from what the server holds can never replace it.
  - App.jsx reads the server copy again when the device comes back online, and
    when the page comes back after at least 15 s out of sight (a closed lid;
    long enough to have used another Chromebook), so a device that opened
    offline, or slept while the student worked elsewhere, catches up.
  - No wait on the first render: the question opens from the device at once,
    and when the read lands with anything newer it is remounted, as it always
    was. Nothing the student does waits on the network; offline, the device is
    local-first, and since what it opened with carries no edit time, none of it
    can reach the server when it reconnects.
- **After** (`tests/browser/teacherWorkflow/draftCrossDeviceJourneys.mjs`, the
  real App; before → after on the code before this fix):
  - *fresh device, quick read and a 2 s read:* the question on screen showed
    `["", ""]` → A's `["−2/3", ""]` (the other question, not yet mounted when
    the read landed, came back in both); the server copy after B merely opened
    the two questions: A's `{"m":"−2/3"}` replaced by `{}` and every key
    re-stamped → exactly A's, unchanged.
  - *A's own server copy:* also held the coach panel's state, written on mount
    → only the two answers A typed.
  - *offline, then back online:* a fresh device shows its own empty boxes, and
    back online stays empty → shows A's work; the server copy is untouched.
  - *A works, B opens and edits, A comes back (reopened):* B's edit saved `{"b":
    "4"}` alone (A's slope gone) → `{"m":"−2/3","b":"4"}`, newer than A's; A
    came back to its own older copy `["−2/3", ""]` → B's `["−2/3", "4"]`, and
    opening it changed nothing on the server; A's next edit is the newest and
    keeps B's intercept. B, left open and woken after A's edit: its own older
    `["", "4"]` → A's newest `["−1/2", "4"]`.
  - *canonical attempts still beat drafts:* reopening the submitted question
    re-stamped its pre-submission draft after the submission → it keeps the
    edit's time; a fresh device restored that draft over the submission → does
    not.
  - *every certified family* (`tests/browser/draftEditTime.mjs`, the draft
    certification's harness): opening stamped every draft, and coming back or
    reloading re-stamped them (32 failures over the 16 families) → no draft is
    stamped by opening, every draft the student's edit changed carries the
    edit's time, and it keeps that time through navigation and reload.
  - *a composed question* (`composedDraftRestore.mjs`, now run with the server
    copy arriving after the question as well as before it): in App.jsx's order
    B got 0 of 4 steps and the journey could not open the graph step → every
    check passes in both orders, and bringing the graph step back is not an
    edit (the answers keep A's time and the server copy stays A's).
- **Precedence, every direction:** per draft key the newest student edit wins;
  a device's own newer edit is never replaced; a server edit newer than the
  device's last edit replaces it however recently the device opened the
  question; a draft older than the question's last submitted attempt is not
  restored. Unchanged in code (`selectRestorableDraftEntries`) for the entries
  this build saves — what changed is that the times now mean what that rule
  assumes; entries an older build saved are narrower (the rollout, below).
- **Gates:** `draftEditTime.test.mjs` (24: the storage rules, what a restore
  decides, the background save, two Chromebooks and one server, and the wiring
  in the hooks, WorkflowRunner and App.jsx); the five source contracts that
  pinned the old write signatures, rewritten to the same capability
  (`studentAssignmentFocusAndPendingWork`, `studentDraftDurability`,
  `studentWorkRecovery`, `toolDraftPersistence`, `toolDraftSyncContract`); and
  the three browser gates above — the journeys in CI beside the teacher
  journeys, `draftEditTime` and `composedDraftRestore` with the student runtime
  gates. Mutation checks, each undone in turn, all red: 28 in the unit tests
  (non-edits stamped now; inference never or always an edit; a script's event
  counted as the student; an older copy put back over a restore or another
  tab; a read not remembered; expiry from `savedAt` alone; a reset not an edit;
  each hook's write-back left to inference or its setter never an edit; a tool
  field never an edit, measured from its first load, a submission not stamped,
  a coalesced edit demoted; every step report an edit, or the step's answer
  dropped; the sync offering an unedited draft, not waiting for the read,
  replacing what the server holds, stamping with its own clock, or not
  learning from its own saves; App not telling the sync, not reading again
  online or on return, or skipping an empty server; the canonical check
  removed) — and the 11 of them a browser can see, red in the browser too.
- **The rollout — an edit-time marker** (`workspaceDraftSchema.mjs`, "the
  edit-time marker"). Until every Chromebook runs this build, server copies are
  also saved by the build before it, whose time may be when a question was
  merely opened; nothing in such an entry says which. Measured before the
  marker: A (this build) types `−2/3`; B (the build before) merely opens the
  question, and the server copy becomes `{}`, saved later; A coming back showed
  `["", ""]` — the restore took the newer server copy over A's own, the last
  copy of the work — where the old build kept `["−2/3", ""]` (its own mount
  write re-dated it). So this build says it:
  - Every entry whose time is a student's edit carries `savedAtIsEdit: true`:
    every edit this build saves, and a copy offered again (an edit made
    offline) when its own time was an edit's. The local envelope keeps the same
    flag — set by an edit and by restoring a marked entry, kept by every write
    that is not an edit — so a copy an older build dated (here, or restored from
    an unmarked entry) goes back unmarked: the marker never claims an opening's
    time is an edit's.
  - Stored, merged and read back with its entry: the copy that wins the merge
    brings its marker, or its lack of one. An unmarked entry is stored exactly
    as an older build stores one (no field), so the two mean the same thing.
  - A **marked** entry follows the precedence below. An **unmarked** (legacy)
    entry replaces a device's copy only where that device has nothing dated of
    its own for the draft — a fresh device, or one where it was never edited —
    which is what the older build did there. A device that holds a dated copy
    keeps it, as the older build's devices did (opening re-dated it). That is
    narrower than "no edit of its own": a copy that came from the server copy
    is kept too, because replacing it would be worse than the older build when
    the legacy entry is an empty question opened elsewhere.
  - Old readers keep working: the schema version is unchanged (`1`, which the
    rules require); Firestore's rules check top-level fields only; an older
    build reads entries by the fields it knows and ignores the new one; the
    server's readers (`workspaceDraftRecovery.mjs`, `responseInspector.mjs`)
    project `key`/`value`/`savedAt` and never see it; the path-admin vendored
    copy is regenerated and checked by `pathAdminCodebaseIsolation.test.mjs`.
  - During the rollout an older build that saves to the same document rewrites
    every entry with the fields it knows, so all markers in that document go:
    those entries then count as legacy — never worse than the build before.
  - A device that keeps its own work over a legacy entry does not send it back
    over it: its copy is the older one, and re-dating it "now" is exactly what
    made an opening outrank work. The server keeps the legacy copy until the
    student's next edit there, which is newer and marked, and wins everywhere.
  - *After* (journeys, the real App; before → after on the code before the
    marker): A coming back after the older build opened the question showed
    `["", ""]` → `["−2/3", ""]`, and its next edit (the intercept) was saved as
    `{"b":"4"}` alone, the slope gone → `{"m":"−2/3","b":"4"}`, marked; a fresh
    device still takes what the server holds (A's other answer `7`, and the
    legacy `{}`), as the older build would; the same empty boxes saved as an
    edit (B cleared the slope, later) do replace A's older work; and B's real
    edit in `directions` — marked — still replaces A's own older edit.
- **Known limits, not changed here:**
  - *The unit is the draft key.* A composed question is ONE record — every
    step's answer in `…:workflow-responses` — and the newest edit to any step
    carries the whole record. So two Chromebooks editing different steps of the
    same question lose one side: B answers step 3 while A, offline and never
    having read B's copy, then answers step 1 — when A reconnects its record is
    the newest and replaces the server's whole, B's step-3 answer included (and
    B gets A's record on its next read). The other way round — A answers step 1
    offline first, B answers step 3 after — A's answer is the older edit: it
    loses to B's record on the server, and on A once A reads it. The code
    before this change did the same per key, with a worse clock: any write
    dated the record — opening the question included — so merely opening it on
    a Chromebook that had an older copy, or none, replaced every step's newer
    answers, with no edit at all. Now only an edit can. Merging per step would
    need each step's own edit time inside the record and a merge that knows a
    workflow's structure (a table step feeds the graph step, a later step is
    built on an earlier answer, so a per-step union can combine answers never
    on one screen together); not done here.
  - *A submitted question on another device* shows what it always did when the
    submitting device had not reopened it: a draft older than the submission is
    not brought back. Reopening it there used to re-stamp the draft after the
    submission, so it came back; now it does not.
- **Practice Mode, the same principle** (post-deadline Practice Mode's progress
  rides the same server copy; App.jsx).
  - *Reproduction* (journey `practice`, the real App): the student practises on
    one device (the Warm-Up, correct: saved `{"0":"correct/1",…}`). Another
    opens Practice Mode with the server out of reach — and back without the
    browser noticing (Wi-Fi up, the school's connection down: no `online`
    event), so the read that failed is not tried again while the background
    save keeps trying and gets through. The server's practice became every
    question `unattempted/0`, and the next device showed the Warm-Up "not
    attempted". (With the `online` event the read lands first and nothing is
    lost. Over a slow connection the fresh start is saved first and the merged
    copy a few seconds later, so a tab closed between the two loses it too.)
  - *Root cause:* every entry into Practice Mode starts a fresh tracker (every
    question unattempted, the graded variant) and sends it at once, dated
    "now"; the server merge kept whichever whole tracker was saved last
    (`practiceUpdatedAt`). The device merged per question only what it read
    back — when it could read it first. An ordinary assignment's save (no
    practice in it) cleared the saved practice the same way.
  - *Fixed — merged per question on the server too:* the save's transaction
    keeps, per question, the record with more practice progress (later
    variant, then more attempts, then correct, then the later attempt) — the
    rule the device already applied, moved to
    `functions/shared/practiceTrackerMerge.mjs` so both use the one
    implementation. A fresh start or an ordinary assignment's save changes
    nothing, in any order; practice done on two devices is kept from both;
    `practiceUpdatedAt` moves only when progress does. Progress only grows, so
    "more" is "later". The teacher's case review reads this practice summary
    (`caseReviewEvidence.mjs`): same shape, and now it is not erased by an
    opening. An older build's save still replaces the practice whole, as before.
  - *After:* the unreachable device leaves the saved practice
    `{"0":"correct/1",…}` (was all `unattempted/0`) and the next device shows
    the Warm-Up "correct" (was "not attempted"); the `online` case passes before
    and after.
- **Gates for the marker and Practice Mode:** `draftEditTime.test.mjs` (now 30:
  six for the marker — the envelope, a restore, the save, the server copy, the
  restore decision, and an older build opening the question between two of this
  build's devices), `practiceDraftMerge.test.mjs` (6), and two updated
  assertions in `studentWorkRecovery.test.mjs` (a restore test now states which
  entries are marked; the stale-Practice test uses records a student can have —
  a correct answer after two tries — since practice is now merged by progress).
  Journeys: `legacy` and `practice` added, the marker asserted in `A` and
  `directions` (before → after: 7 of 37 checks failed → 37 of 37; three of the
  seven only ask for the marker). Mutation checks, each undone in turn, all red
  in the unit tests: 11 for the marker (stored, read back, the legacy rule
  removed or made absolute, a write that is not an edit dropping or inventing
  it, a restore not carrying it, the save marking every copy, no edit, a held
  copy, or nothing) and 6 for Practice (the old whole-tracker merge, an
  ordinary save clearing it, an opening dating it, and the per-question rule
  broken three ways). Nine were also run against the journeys: eight red. The
  ninth — the save sending an edit unmarked — cannot be seen in the app,
  because the storage layer already passes the marker with every edit it
  reports; breaking the path itself (the save sending no marker at all) is red
  there.

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

*All seven were done in the 2026-10-01 cleanup (PQ-023 steps 1–2; step 3 waits on a pedagogy check). The list below is kept as it was written; the summary table at the top and the cleanup sections give each one's fix.*

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

## Follow-up: six deferred student-experience findings closed

On `claude/close-pr-407-408-findings-90hfdz` at `3132a221`. Not deployed. Each
item was reproduced in a browser at the viewports its entry names, fixed, and
re-driven; the entries above (PQ-022, PQ-023, PQ-028, PQ-029, PQ-032, PQ-034)
carry the numbers.

| Item | What a student sees now | Commits |
| --- | --- | --- |
| PQ-022 | "Not quite. You have 2 attempts remaining on this version." appears under the tool's own "Not yet", 59–62px below Check, instead of 147–403px below it, off screen | `d6282f81`, `54030097` |
| PQ-023 | One "How to do this (3 steps)" fold that opens with the tool's description; on a phone the tool's name is a small label beside "Enlarge question"; the first answer box is 56–75px higher on a phone | `7622fe3c`, `4bc8f2ea` |
| PQ-028 | Expression Meaning reopens on the row they were working on | `b8a7aca2` |
| PQ-029 | "Submit my regression"; "Regression complete."; a composed question's Undo tooltip says "Undo the last answer in these steps" | `4d976395` |
| PQ-032 | A sentence-long verdict is a 10px-cornered card, not a lozenge | `3120650b` |
| PQ-034 | A tap on the number line, the relation plot or the story sketch lands where it was made, also on a phone held sideways | `570e3aeb` |

**What a teacher will notice:** nothing changes in grading, attempts, records or
policy. On a DOL, quiz or test, nothing about correctness or attempts appears in
the tool or below it before feedback is released — unchanged, and now driven by
a browser gate. The relation plot no longer records a different point from the
one a student tapped on a phone held sideways.

**Gates (this follow-up's head):**

| Gate | Result |
| --- | --- |
| `npm run test:platform` | **7486 / 7487** — the one failure is pre-existing at `3132a221`: `calculatorPanelWiringV3` pins `import 'mathlive'`, and `2b53096f` moved CalculatorPanel to `mathliveRuntime.js` |
| `node --test tests/tools/*.test.mjs` | **253 / 253** |
| `npm run lint` | exit 0; the only warning in a touched file is `WorkflowRunner.jsx:444` (`inputColumn`), identical at `3132a221` |
| `npm run build` | exit 0 (the usual >500 kB chunk notice) |
| `tests/browser/toolAttemptOutcome.mjs` (new) | **39 / 39** (13 red before the fix) |
| `tests/browser/clickMapLetterbox.mjs` (new) | **13 / 13** (4 red before the fix) |
| `toolPolicyGates.mjs` · `composedOutcomePolicy.mjs` | 39 / 39 · 21 / 21 |
| `enterContractSurvey.mjs` · `mathEntryContract.mjs` | pass (fixture regenerated: only the regression label and timestamp changed) · 17 / 17 |
| `toolOpenAudit.mjs` chromebook / phone / tablet / phone-landscape | all four pass |
| `workViewMatrix.mjs` · `studentUxPlatform.mjs` · `linearMultipleRepresentations.mjs` | pass · 9 / 9 · no findings |
| `toolDraftSyncSweep.mjs` · `regressionCalculatorPhone.mjs` | pass (and the new reopen-row check) · pass |
| `captureToolResponses.mjs` | **12 / 12** captures after the repair below; before it, 8 of its 11 scripts could not drive their tool — **identically at `3132a221`** |

Every new or changed assertion was broken once and went red: 50 mutations
across the six items, 49 red; the one survivor is a browser-level mutation
explained under PQ-022 (its node contract kills it).

**Evidence** (`docs/qa/platform-quirks-audit/`): `pq022-before-phone-390x844.png`
/ `pq022-after-phone-390x844.png` / `pq022-after-chromebook-1366x768.png`,
`pq023-before-phone-390x844.png` / `pq023-after-phone-390x844.png`,
`pq032-before-chromebook-1366x768.png` / `pq032-after-chromebook-1366x768.png`.

**`captureToolResponses.mjs`, repaired.** Its scripts found controls by
position and by old wording. Three failed only on "the first Submit Answer",
now the Work View rail's hidden copy; the others met tools that had changed —
`algebra` is the balance workspace since PR #47 (`4b65b4ee`), the relation
tool's Yes/No select is four reasons, the number line's switches read
"● Closed" / "○ Open", and `stepAlgebra` has no Apply button. The scripts now
go by role and accessible name, and `graphing2`, which never had a script, is
plotted from the keyboard: **12 / 12** captures, byte-identical on two runs.
Nine payloads are unchanged; Function Investigation differs only in where the
student let go of each arrow (`droppedPoint`, not graded here). Two showed
the server marking real work wrong, both dating from PR #47. `algebra` sent
`{ value: " x = 4|{}" }`, which the grader could never accept. The relation
tool sends `isFunction: "yes-definition"`, which the server read as "no", so
"Is it a function?" was marked wrong on every function and right on every
non-function, whatever the student chose, in My Math Path and Live Challenge.
Both are fixed in the cleanup branch. `algebra` now sends the equation the
workspace ended on (`{ finalEquation: " x = 4" }`), graded by the value it
isolates. The tool and the grader share one rule for the function question
(`functions/shared/relationFunctionChoice.mjs`), and a bare yes / no is still
read. Their true captures are committed.

**Systems Workspace: every mode a Path issues is captured.** The contract
grades three Systems Workspace modes the one `systemsWorkspace` capture did
not cover: 3×3 by RREF technology (A2.3B) and inequalities, read from the
region (A2.3G) or graphed (A.3D, A2.3F). Every such family in the shipped
bank is issued once its numbers are drawn: the 3×3 matrix family, the 7
read-the-region families and the 19 graph-it families.
Each now has a capture, a wrong-answer case and an unanswered case:
**15 / 15** captures, byte-identical on two runs, all graded correct and none
refused. The modes with no capture are the ones a Path never issues, and the
contract test pins that: algebraic 2×2 and 3×3 (the 3×3 interpretation
`ec2c1fe0` changed), three planes, linear-quadratic, the 2×2 matrix and
student-built inequalities (B-24). A student-built question that carries a
test point is issued without its build flags, so the student gets the
read-the-region workspace. The Data Modeling capture changed only where a
judgment now opens unanswered: `causation`, `modelChoice` and
`predictionType` arrive as `""` instead of the lab's old defaults. The
correlation question asks none of them, so its verdict is unchanged.

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

### 2026-10-01 cleanup: PQ-020, PQ-021, PQ-025, PQ-026, PQ-027, PQ-030, PQ-031, PQ-037

On the cleanup branch at `50838f98` plus these commits (first on `4e4b6a84`),
against a dev server with HMR off and its own dependency cache, on a machine
shared with other browser runs (load average 4–12 on 4 cores). Re-run after
integration at `c8279796`, all green: `test:platform` 7678 / 7678, tools
259 / 259, the 13 journeys, the certification on all seven devices
(161 / 161), the opener survey (nothing covered at 344, 390, 820 or 1366px),
lint and build.

| Gate | Result |
| --- | --- |
| `npm run test:platform` | **7576 / 7576**; `node --test tests/tools/*.test.mjs` **259 / 259**; new: `workViewPhoneChrome` (9), `studentIdentityPhone` (2), `numberEntry` (+1); rewritten against behaviour: `studentQaLayoutContracts` (scroll padding), `workViewStage3A` (the caption), `workViewCapabilities` (the record gained `shortHeight`, with a comment) |
| `npm run lint` | exit 0; no new warning in a touched file (`WorkflowRunner.jsx:445` is older) |
| `npm run build` | exit 0 (the usual >500 kB chunk warning) |
| `tests/browser/studentUxPlatform.mjs` | **13 / 13** journeys (four new: `identity`, `opener`, `staged`, `sticky-reveal`) |
| `tests/browser/linearMultipleRepresentations.mjs` | 13 journeys, no findings |
| `tests/browser/workViewCertification.mjs`, one device per process | **7 / 7 devices, 161 / 161 scenes**, rotation included. Touch devices need the harness fix in this branch: a `<select>`'s native picker blocked `page.screenshot` for 30 s (same on the parent head) |
| the same at 344×882, 740×360, 820×1180 | 23 / 23, 21 / 23, 23 / 23 — the two at 740×360 are the seven-action rail of Graphing 2 and Transformations Lab, identical before this change (PQ-020) |
| `workViewMatrix.mjs`, `assignmentMobile.mjs`, `composedOutcomePolicy.mjs`, `workViewTerminalTransition.mjs`, `gradeCenterMobile.mjs` | all pass, no findings |
| `stagedQuestion.mjs` | 54 "answer control not visible without scrolling" findings on every device, the same 54 on the parent head; its fixture (0) was last recorded 2026-09-23 and the gate is not in CI — repaired in the follow-up below |

**Mutation checks.** 28 at source level (each fix undone in turn, the
matching node test goes red) and 7 in the browser (each fix undone, its
journey fails: `staged` ×3, `identity` ×2, `opener`, `sticky-reveal`). The first
version of `staged` did not catch PQ-037 — with the keypad left open every row
was scrolled into an already-shrunk step — so it now presses Done and scrolls
the next row into view before tapping it, as a student does.

### 2026-10-01 follow-up: the staged-question audit, PQ-041, PQ-042, the keypad and the rail

On `b0562e55` plus these commits, same scratch server.

**The audit, repaired.** `tests/browser/stagedQuestion.mjs` measured two
artifacts: its "answer control" was the first `math-field, textarea, input,
svg…, button` in the stage, which had become the zero-size button in the
closed Work View header (control "not visible" even at 1920×1080), and
`stagedQuestionMain.jsx` mounted WorkflowRunner alone in a bare
`.mathmaster-question-container`, so on a 390px phone the plotting stage kept
the desktop two-column grid and drew a 98×70px plane. Now:

- the whole question is mounted in QuestionEngine inside App.jsx's student
  screen — identity bar, a navigator with App.jsx's markup that folds as
  App.jsx's does (`shouldCompactAssignmentNavigation`), assignment
  screen/shell/stage — so the phone layout, the Work View host and the
  seventeen-step focus mode are the real ones;
- each step is reached as a student reaches it: step 1 when the question
  opens; step 2 after the five points are placed through the plot step's own
  controls and checked; every later step by "Next step" from the one before,
  with the earlier answers in the question's draft;
- the control is chosen by kind (the plane, the choices, the field), rendered
  and inside the active step, and counts as on screen only where it can be
  seen: in the window, inside every scroller around it, under nothing;
- new checks: the step counter reads the step meant; a marking plane is at
  least 240px wide and within App.css's cap; nothing covers the question's top
  when it opens. Exit 1 on any finding; in CI with the student runtime gates
  (path filter `tests/browser/stagedQuestion*`, permissions still read-only).
  The fixture stays `[]`: the audit is genuinely empty now.

On the code before this follow-up the repaired audit found **4** findings at
390×664 (PQ-042) and **23** at 664×390 (PQ-041; 31 with an unfolded
navigator), **0** at 344×882, 820×1180, 1366×640 and 1920×1080. Now **0** on
all six. Noted on every run, not failed: on arriving at a marking step 224 of
the 234px plane is on screen at 390×664 and **254 of 400px at 1366×640**.

| Gate | Result |
| --- | --- |
| `npm run test:platform` | **7693 / 7693** (+15: `stageNavigationPhoneReveal` 8, `landscapeQuestionGrid` +3, `workViewPhoneChrome` +4; the short-landscape test in `studentJourneyDol2Final` now evaluates which screens the rule reaches) |
| `node --test tests/tools/*.test.mjs` | **259 / 259** |
| `npm run lint` | exit 0; 423 warnings before and after, none in a touched file |
| `npm run build` | exit 0 |
| `stagedQuestion.mjs` | 6 screens × 17 steps, **no findings** |
| `studentUxPlatform.mjs` | **14 / 14** journeys (new: `keypad-short`) |
| `workViewCertification.mjs`, one device per process | **8 / 8 devices, 184 / 184 scenes** (new device: `android-landscape`, 740×360, also in CI's matrix; it was 21 / 23 there) |
| `clickMapLetterbox`, `assignmentMobile`, `workViewMatrix`, `composedOutcomePolicy`, `workViewTerminalTransition`, `toolAttemptOutcome`, `assessmentLeakGates`, `renderStability`, `graphPointCheck`, `relationPlotGrading`, `toolPolicyGates`, `undoTyping`, `mathEntryContract`, `errorRecovery`, `duplicateTabs`, `linearMultipleRepresentations` | all pass, no findings |

**Mutation checks.** 15 at source level and 13 in the browser, each change
undone in turn: all red but one. The audit itself: the old control selector
put back ("the measured control is not part of this step" on every step) and
the bare mount put back ("a 102×72px plane is too small to mark", the question
off screen). PQ-042: no phone branch, or the reveal run at once instead of two
frames on (both: three planes "0px of 234px seen"), a tall step aligned by its
bottom, the identity bar ignored, the desktop reveal run on a phone. PQ-041:
the engine out of the height rule, the action bar pinned again, the plane cap
switched off ("303px tall, over its 150px cap"), the navigator pinned on a
narrow phone ("the top of the question opens under" it). Keypad: ignored by
the layout, a right-docked keypad counted, Work View not told it moved, a
change of short alone ignored (the journey: "the chrome did not fold", 28px).
Rail: the gutters back (certification: "1 controls are clipped" for both
tools), the header padding back (unit test red; the certification misses it,
because the seventh action is then 1px over the edge and its clipping check
allows 1px). One assertion was added after a mutation survived: the identity
bar case of the phone reveal.

**Still open, measured, not changed:**

- **1366×640 Chromebook, marking a feature:** the plane honours its cap (the
  smaller of 70% of the screen and the screen less 240px: 400px), but what
  sits above and below it on arriving — the pinned task card, the step heading,
  the action bar — is ~385px, not 240, so 254px of it is on screen and the
  x-axis is below the fold. Fitting it to the measured chrome would make it
  ~250px tall on that screen — a product decision; the audit notes it on every
  run.
- **PQ-043:** fixed since (see its entry): the server copy of a composed
  question's answers carries a graph step without its verdict, and the step
  works it out again where it is opened.
- **PQ-044:** fixed since (see its entry): opening a question no longer makes
  what it shows newer than the student's saved work, so a second Chromebook
  gets the work into the question on screen and never overwrites it; entries an
  older build saved during the rollout cannot take a device's own work away
  (the edit-time marker); and opening Practice Mode no longer erases the
  practice saved from another Chromebook.

## Evidence

`docs/qa/platform-quirks-audit/`:

| File | Shows |
| --- | --- |
| `pq001-before-phone-390x664-enlarge.png` / `pq001-after-…` | Enlarge on a phone: point list vs the plane (PQ-001) |
| `pq002-before-ipad-820x1180-enlarge.png` / `pq002-after-…` | iPad Work View: 256×182 plane beside the list vs 502×357 (PQ-002) |
| `pq-landscape-phone-before-844x390.png` / `…-after-…` | Landscape phone: blank right column vs the tool beside the task (PQ-015) |
| `pq-calculator-icon-before-phone-bar.png` / `…-after-phone-bar.png` / `…-after-work-view.png` | "□" vs the drawn calculator (PQ-013) |
| `pq-open-landscape-844x390-enlarge.png` | Landscape Work View's 150px stage body (PQ-020, when it was deferred) |
| `pq007-after-phone-number-pad.png` | The slope box on a phone: "Write a single number.", the number pad and "Needed for this answer: a⁄b" (PQ-007) |
| `pq036-dol-point-check.png` | A DOL plotting stage answering "Revise: P1, P2, P3, P4, P5." (PQ-036, deferred) |
| `pq023-phone-first-screen-inverse-composition.png` | A phone's first screen: identity, navigator, task, tries, tool header and two help rows before any mathematics (PQ-023, deferred) |
| `pq020-before-844x390-work-view.png` / `pq020-after-…` | A staged plotting step on a phone held sideways: 150px body, plane half off screen vs 265px, whole plane, instruction in the header, heading in the step row (PQ-020) |
| `pq021-before-344x882-identity.png` / `pq021-after-…` | The identity bar at 344px: three lines (86px) vs one (38px) (PQ-021) |
| `pq030-before-390x844-no-emoji-font.png` / `pq030-after-…` | Without an emoji font: "□ 120 Class Points" vs the drawn star (PQ-030) |
| `pq025-before-390x844-step-chips.png` / `pq025-after-…` | "Enlarge question" over step chips 3–4 vs beside the chip row (PQ-025) |
| `pq025-before-1366x768-step-algebra.png` / `pq025-after-…` | Chromebook: the opener over Step Algebra's "Reset work" vs the toolbar ending before it (PQ-025) |
| `pq026-before-344x882-header.png` / `pq026-after-…` | "Question Work View" over a task cut mid-line vs the whole task (PQ-026) |
| `pq027-before-1366x768-rail.png` / `pq027-after-…` | Capability chips under the actions vs one caption (PQ-027) |
| `pq037-before-390x844-row7-keypad.png` / `pq037-after-…` | Typing into row 7 with the keypad up: the box off screen vs above the keys (PQ-037) |
| `pq037-keypad-before-390x664.png` / `pq037-keypad-after-…` | A small phone typing with the keypad up: a 28px step with the box half shown vs the folded chrome and a 158px step (PQ-037 follow-up) |
| `pq020-rail-before-740x360.png` / `pq020-rail-after-…` | Graphing 2's rail at 740×360: "Start over" below the edge vs all seven actions on screen (PQ-020 follow-up) |
| `pq041-before-664x390.png` / `pq041-after-…` | A phone held sideways after Next to "Mark every x-intercept": no question, no plane vs both (PQ-041) |
| `pq042-before-390x664.png` / `pq042-after-…` | A phone after Next to "Mark every x-intercept": "0 of 2 marked." and no plane vs the plane (PQ-042) |

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
