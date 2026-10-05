# Systems Workspace — student experience streamline

Branch `claude/stoic-clarke-8i8nzg`, from `main` at `96d1011` (PR #437 merged).
Not deployed.

The Systems of Inequalities graphing workflow was used as a student, measured,
redesigned and measured again. **The interface was streamlined, not the
mathematics**: every constraint is still rewritten (where asked), its boundary
plotted from the student's own taps, its line style chosen, its side shaded,
each step checked, the regions combined by the student and the region reasoned
about — and the shared grader, the Path contract and the DOL/quiz/test policy
are unchanged.

## How it was driven

- **Studio harness** (new, committed): `tests/browser/systemsWorkspaceStudio.html`
  mounts every Systems Workspace mode in the real `QuestionEngine` — per-question
  draft key, the activity role's feedback policy (`?role=practice|dol|quiz|test`),
  light or dark (`?theme=dark`). The fixtures are the authored shapes the
  workspace accepts: rewrite + build + reasoning, slope-intercept build, x = c /
  y = c, a bounded triangle with vertices, a modelling context, and My Math Path's
  construct (A2.3F) and analyze (A2.3G) forms, plus the non-inequality modes.
- **The real app**: the teacher-workflow harness (in-memory Firebase), signed in
  as a student, with a systems lesson (`tests/browser/teacherWorkflow/fixture.js`,
  `?questions=systems`): warm-up x = c / y = c, a rewrite question, the build
  question, a Path construct question, a linear system and a DOL build.
- **Before** is `main` at `96d1011`, served beside the branch from a worktree and
  driven by the same scripts.
- Viewports: 1366×768 Chromebook, 1920×1080 desktop, 1180×820 and 820×1180 iPad,
  844×390 and 390×844 phone (touch), light and dark.

Limit: a real browser on the real question runtime and the real app shell, not a
signed-in session against Firebase. Nothing was written to a project.

## Measured

The Classwork build question — graph y ≥ x + 1 and y < −0.5x + 6, classify the
region — done by a student who knows the mathematics, start to "Check my work".
"Student scrolling" is the distance the student scrolls to reach the next
control or bring the graph back before a tap; "graph off screen" counts the taps
for which the graph was not fully visible when it was needed.

| Viewport | Actions | Student scrolling | Graph off screen when a tap was needed |
| --- | --- | --- | --- |
| 1366×768 Chromebook | 27 → **18** | 6,230 px → **0** | 3 → **0** |
| 1920×1080 desktop | 27 → **18** | 5,728 px → **0** | 3 → **0** |
| 1180×820 iPad landscape | 27 → **18** | 4,982 px → **0** | 3 → **0** |
| 820×1180 iPad portrait | 27 → **18** | 24,496 px → **0** (668 px scrolled *for* the student as steps open) | 6 → **0** |
| 844×390 phone landscape | 27 → **18** | 11,036 px → **204** | 6 → **0** |
| 390×844 phone | 27 → **18** | 5,332 px → **530** | 0 → 0 |

- Constraint 1 alone: 11 → **7** actions. The six graph taps are the same before
  and after (the student plots the same points); the nine clicks that went are
  the arming buttons, the default method select twice and finding constraint 2.
- On first load (Chromebook): 19 → **13** controls on screen; page height
  1,456 → 1,071 px; at the end 2,226 → 916 px.
- In the **real app** on a 390×844 phone, the old layout pinned the graph over
  the whole ~300 px question scroller and **"Check boundary" could not be pressed
  at all**. Now the graph pins only when a step still fits beside or under it;
  the journey completes and grades Correct on all seven real-app viewports.
- The rewrite question's page is 2,123 → 1,323 px tall at 1366×768.

## Problems found

1. **The graph had to be armed.** "Place point 1 on graph", "Place point 2 on
   graph", "Tap the side of the graph to shade": three presses per constraint
   before the graph did anything; a tap without one did nothing and said nothing.
2. **Everything at once.** Every step of every open constraint — method select,
   both place buttons, read-only coordinates, solid/dashed, three Check buttons —
   was on screen together, all the same blue, before any of it could be used.
3. **Enter → scroll → click → scroll back.** On a Chromebook the Check buttons
   sat below the graph's fold; the student scrolled down to check and back up to
   tap. The graph was off screen for 3 of the taps it was needed for (6 on an
   iPad in portrait, with 24,000 px of scrolling).
4. **Finding the next step.** Finishing constraint 1 changed nothing on screen;
   the student had to find constraint 2's header.
5. **Labels that did not match the prompt**: "y ≥ 1x + 1", "y ≥ 0x + 0", a hyphen
   for a minus — beside a prompt that said "y ≥ x + 1".
6. **The third constraint was the solution's green.** A three-inequality system
   drew constraint 3 in the feasible region's colour.
7. **Live ticks.** After one Check, dragging a point turned the step's ✓ on and
   off live, with no second Check.
8. **The rewrite step** opened the relation solver with "Other operations"
   (square root, absolute value, completing the square) expanded for a linear
   rewrite, under an explanation box about the solver.
9. **Plotting directions said twice**: four lines of gesture help under the
   graph, repeating what the step said.
10. **Path's construct/analyze forms**: "Choose…" selects for every two-way
    choice (Solid / Dashed, Above / Below, Yes / No), typed coordinates with no
    way to plot them from the graph, nested boxes.
11. **Dark mode**: a black focus box on the graph after a mouse tap; the plane's
    point labels in fixed dark ink.

## Design decisions

- **One step at a time** (`inequalityBuildFlow.js`, pure, tested in node). The
  question's work is an ordered list of positions — model, each constraint's
  enabled steps, combine, the asked reasoning. One is open; finished steps are
  one-line summaries the student can reopen ("Change"). The flow never decides
  whether work is right: "done" is handed to it by the existing gate.
- **A tap means what the open step needs**: the next boundary point, the side to
  shade, the student's test point, a vertex. No arming. A third boundary tap
  never silently replaces a point; it says how to move one.
- **A passing Check moves on; a failing Check stays.** Focus goes to the step it
  opens. Where outcomes are withheld a Check moves on when the step is
  *finished* — never because it is right — and a finished step stays open until
  its Check is pressed.
- **The graph is a pinned stage**, beside the steps (two columns) or above them
  (one column), sized to the viewport. Whether it pins is *measured*
  (`data-pin`): only when the step being worked on still fits beside or under it.
- **Steps of one constraint open in order** (a line is styled and shaded after
  it exists); **constraints are independent** (stuck on one, work on another);
  combine opens when every constraint is done; reasoning after combining.
- **A Check belongs to the work it was about**: a step edited after its Check
  is not checked until the student checks it again, and its feedback line goes.
- **Global vs mode-specific.** Mode-specific: the student-build flow. Shared by
  the inequality modes: the layout, one-tap choices, the constraint palette, the
  formatter. Global and opt-in: CoordinatePlane's keyboard-only help, the relation
  solver's "Other operations" default (default unchanged), a mouse-only focus
  ring. The other modes (linear, linear-quadratic, matrix, 2×2/3×3 algebraic,
  spatial) were walked and already keep the graph and the task together; they get
  only the shared formatter and palette.

## What deliberately did not change

- Every step's own Check; nothing auto-checks. The method choice is the
  student's. The staged first-miss feedback. Hints and their reporting.
- The work record the shared grader reads, the grader itself, the Path contract
  (the captured construct/analyze responses are byte-identical), the DOL / quiz /
  test policy (`resolveInequalityBuildGate`), the vertex magnet rule.
- Every persisted draft field; drafts saved before this change restore (a step
  checked before check-signatures existed still counts as checked).
- Undo, Work View capabilities, Path's typed-coordinate construct form (taps now
  fill the boxes too).

## Educational safeguards

- Nothing is drawn, placed or chosen for the student: a boundary exists only from
  the student's taps (or typed constant); a provided boundary appears only after
  the student's rewrite is verified; shading only from the student's tap; the
  overlap only after "Combine", from the student's own constraints.
- No label is derived from the hidden expected constraints (tested).
- The overlap is hatched in the theme's ink, never green, and has no outline —
  an outline showed through the gaps of a dashed edge as a solid line.
- Where outcomes are withheld: no verdict text, no ✓, the same path through the
  steps for right and wrong work (browser-gated), no magnet to true corners, the
  student's own test point probed against the student's own lines.

## Responsive behaviour

- ≥ 901 px: two columns, graph 1.3 : steps 1 (steps wider during a rewrite).
- ≤ 900 px: one column, graph pinned above the steps when a step still fits
  under it; controls brought into view land below the graph (scroll-margin).
- Phone landscape: two columns with a short graph; phone portrait: a 32 dvh
  graph. Work View: the stage fills the enlarged view and its header names the
  step the graph is waiting for.
- Container queries compact the step headers in narrow columns.

## Performance

- Lazy `SystemsWorkspace` chunk: JS 51.6 → 58.1 KB gzip, CSS 4.9 → 6.8 KB gzip
  (only loaded for a systems question).
- Per interaction, 4× CPU throttle, dev build: a graph tap's script time 227 →
  221 ms (median of 7); Event Timing duration of a tap ≈ 136 → 144 ms and of a
  Check ≈ 176 → 192 ms (8 ms granularity) — within noise, while the journey
  needs nine fewer interactions. DOM nodes 525 → 470. Opening a question writes
  no draft (unchanged).

## Testing

- `npm run test:platform`: 8,828 / 8,828 on current `main` (new: `inequalityBuildFlow.test.mjs`,
  `systemsWorkspaceFormat.test.mjs`; source contracts rewritten to behaviour per
  the source-contract playbook, each rewritten assertion mutation-checked).
- `node --test tests/tools/*.test.mjs`: 1,176 / 1,176.
- Browser: `tests/browser/systemsWorkspaceStudio.mjs` (new, in CI): Chromebook
  and phone journeys, reload, keyboard plotting, the rewrite, Work View, light
  and dark contrast — 59 / 59. `assessmentLeakGates.mjs` 119 / 119.
  `unansweredChoiceGates.mjs` 83 / 83 (inequality fixtures rewritten for the
  one-tap choices).
- `npm run lint`, `npm run build`, `npm run audit:theme-colors`: clean.

## Screenshots

Before is `main`; after is this branch. All at 1366×768 unless noted.

| | Before | After |
| --- | --- | --- |
| First load | ![](systems-workspace-streamline/before-01-initial.png) | ![](systems-workspace-streamline/after-01-initial.png) |
| Constraint 1, boundary | ![](systems-workspace-streamline/before-02-constraint-1.png) | ![](systems-workspace-streamline/after-02-constraint-1.png) |
| Constraint 1 done | ![](systems-workspace-streamline/before-03-constraint-1-done.png) | ![](systems-workspace-streamline/after-03-constraint-2-active.png) |
| Constraint 2 | ![](systems-workspace-streamline/before-04-constraint-2.png) | ![](systems-workspace-streamline/after-04-constraint-2-done.png) |
| Overlap and region | ![](systems-workspace-streamline/before-05-combined.png) | ![](systems-workspace-streamline/after-05-combined.png) |
| Dark | ![](systems-workspace-streamline/before-06-dark.png) | ![](systems-workspace-streamline/after-06-dark.png) |
| Real app, Chromebook | ![](systems-workspace-streamline/before-07-app-chromebook.png) | ![](systems-workspace-streamline/after-07-app-chromebook.png) |
| iPad portrait 820×1180 | ![](systems-workspace-streamline/before-08-ipad-portrait.png) | ![](systems-workspace-streamline/after-08-ipad-portrait.png) |
| Phone 390×844 | ![](systems-workspace-streamline/before-09-phone.png) | ![](systems-workspace-streamline/after-09-phone.png) |
| Real app, phone | ![](systems-workspace-streamline/before-10-app-phone.png) | ![](systems-workspace-streamline/after-10-app-phone.png) |
| Rewrite (full page) | ![](systems-workspace-streamline/before-11-rewrite.png) | ![](systems-workspace-streamline/after-11-rewrite.png) |
| Path construct (A2.3F) | ![](systems-workspace-streamline/before-12-construct.png) | ![](systems-workspace-streamline/after-12-construct.png) |
| Work View | ![](systems-workspace-streamline/before-13-work-view.png) | ![](systems-workspace-streamline/after-13-work-view.png) |

## Remaining issues (not fixed here)

- **Real-app phone chrome.** The assignment shell leaves the question's own
  scroller about 300 px tall on a 390×844 phone, so the graph cannot pin there
  and the student scrolls between graph and step. Platform-level (assignment
  navigator, task card, action bar), not this tool's.
- **CoordinatePlane point labels** use a fixed dark ink that disappears on the
  dark graph, platform-wide. This mode draws its own themed labels; other tools
  still use the plane's.
- **The relation solver** inside the rewrite step keeps its own cancellation
  paragraph and toolbar, shared with the absolute-value lessons.
- **Graph labels on phones** (tick numbers) are small; a plane-level setting.
- The linear / matrix modes' "How to do this" steps read as unrecorded hints;
  untouched here.
