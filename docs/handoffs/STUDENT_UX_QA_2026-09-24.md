# Student UX deep dive — live QA progress (2026-09-24)

Branch: `qa/claude-student-ux-deep-dive` · Account: Claude QA Student (098765, Period 1)
Production build tested: `9deb4ec` · Local retest: `vite preview` of this branch, same account.

Assignment: *Algebra II Honors — Lesson 1: Solving 2×2 Systems by Substitution and
Elimination* (18 questions). The student record's class is **AI QA — Algebra I
Regular**, which is why My Math Path and the recommendations show Algebra 1 work.

The duplicated display name ("Claude QA Student Claude QA Student") is test data —
the same text in first and last name. Not a bug; deliberately not touched.

## Student journeys completed

| Question | Tool | Route | Result |
| --- | --- | --- | --- |
| Classwork Q1 | Systems → substitution → Step Algebra | isolate y, wrong drop into own equation, correct drop, combine (wrong then right), −12 both sides, cancel, ÷ −2, back-substitute, verify | Correct |
| Classwork Q4 | Systems → elimination | subtract without scaling (rejected), ×2 on Eq 2 (wrong right side, then right), subtract, mark cancellation, ÷ −7, back-substitute into Eq 2, simplify 5(1), −5, verify | Correct |
| Practice Q2 | Systems → substitution, exact values | *alternate route*: +y both sides then −7 (y isolated on the right) → distribute −3 → products → combine → −21 | In progress (state restores) |
| Warm-Up | — | closed for the class period | review only |

Also exercised: question switching, return, page refresh (restores), resume card,
calculator, tap-to-place and drag-to-place, 390×844, 360×740, 820×1180, 1180×820.

## Fixed in this branch (all browser-retested locally)

| # | Severity | Issue | Root cause | Fix |
| --- | --- | --- | --- | --- |
| 1 | Major (persistence) | Unfinished work never reached the server; `studentWorkspaceDrafts` read/write → permission-denied, retried every 2.5 s forever | Save is a read-then-write transaction; the read rule checked `resource.data.studentId`, and a draft that does not exist yet has no `resource` | `firestore.rules`: a missing draft is readable when its id names the student. **Needs `firestore:rules` deploy.** Emulator tests added (not run here: no Java) |
| 2 | Major (math) | Calculator: 6 ÷ 3 + 1 = **1.5**, 40 ÷ 9 − 7 = **20** | After ÷ built a stacked fraction, every later key stayed in the denominator | `calculatorKeypadFlow.js`: an operator after a filled denominator leaves the fraction; digits, negative divisors and `(` grouping unchanged |
| 3 | Major (math) | For −3(2x) the prompt read "3 × 2 =" and **rejected the correct −6** ("Check the sign") | Term sign was split off and hidden from the product | `algebraArithmeticModel.js`: the term's sign is folded into its first factor → "(−3) × 2 =", expects −6 |
| 4 | Major (display) | Cancellation mode showed only "− + −" with tiny scrollbars — the terms were invisible | Each term's MathDisplay is a scroll container; flex items shrank to ~17 px | Terms never shrink; the cancellation row may wrap inside its box (verified desktop, iPad portrait, phone) |
| 5 | Major (layout) | Systems solver got 165 px per equation side; givens column 300 px wide with ~750 px blank under it | Two-column grid kept a fixed side column while the solver was active | While solving, givens become a one-row strip above the solver: workflow 677 → 995 px, side 165 → 344 px, givens 217 → 102 px tall |
| 6 | Major (mobile) | Phone: Calculator button below the screen | Assignment screen sized `100dvh` beneath a 38–52 px sticky identity bar | Screen/shell height subtract `--mm-student-identity-stack-offset` (portrait and short landscape) |
| 7 | Major (desktop) | "Subtract what?" field and its Pick up chip hidden under the sticky Undo/Calculator bar; dragging from there selected toolbar text | Programmatic focus used `preventScroll` and nothing revealed the field | After focus-signal focus on non-mobile, `scrollIntoView({block:'nearest'})` + `scroll-margin-bottom: 120px` |
| 8 | Moderate (layout) | Section tabs half hidden under the identity bar; "Hide task" under the navigator; TEKS/CCMR chips floating over tool buttons | Sticky offsets were constants (8 px, 118 px) | Navigator offset by the identity bar; task card starts at the navigator's *measured* height (`stickyHeightRef`); Hide task sits on the card; chips scroll with the page. Workspace band 514 → 534 px at 1536×900 with no overlaps |
| 9 | Moderate (math wording) | "Draw through matching **factors**" for +12 and −12 | One message for every operation | "opposite terms" after + / −, "matching factors" after × / ÷ |
| 11 | Major (Work View) | Work View opened at the top of the surface; the balance board began ~620 px down at 1536×900 | The shell never positioned the surface; focus went to Close | Tools mark their live region with `data-work-view-focus`; on open the shell scrolls it up unless already visible. Systems marks its embedded solver |
| 10 | Polish (a11y) | Side announced "Place **undefined** 5 on both sides" | Label kept after the tile was spent | Side is a button only while an operation is armed |

## Workspace visibility measurements (same question, systems substitution → solve)

| Viewport | Before | After |
| --- | --- | --- |
| 1536×900 page | sticky chrome to y=321, workspace band 514 px, chips over controls, section tabs clipped | chrome to y=301, band 534 px, no overlaps |
| 1536×900 equation side | 165 px, terms clipped | 344 px, all terms visible |
| 1536×900 Work View | board at y=622–952 (below fold) | board 384–714, task in header |
| 1180×820 Work View | — | whole board visible on open |
| 820×1180 page | −9x clipped in cancellation box | wraps to 2 lines, all visible; anchor follows the taller navigator |
| 390×844 page | document 896 px tall, Calculator off-screen | document 844 px, Calculator visible, no horizontal scroll |
| 360×740 page | — | Calculator visible, no horizontal scroll |
| 390×844 Work View | — | solver scrolled up; board still partly below the action row |

## Automated tests

- `npm run test:platform`: 6232/6234. The two failures are **pre-existing on
  `origin/main`** (verified with this branch's changes stashed):
  - `classroomScheduledPublication.test.mjs` — environmental: `Cannot find module 'googleapis'`.
  - `studentDashboardModel.test.mjs` › *an active Warm-Up is surfaced…* — fails on main too (appears clock-dependent).
- New: `calculatorDivisionKeypadFlow`, `algebraArithmeticTermSign`,
  `algebraTermRowNoSqueeze`, `stepAlgebraSideTapLabel`,
  `studentQaLayoutContracts`, `studentWorkspaceVisibility`. Every new
  assertion was mutation-checked (fix reverted → red).
- Rewritten against behaviour (pinned source text): `pathToolAccessibility`
  (tab target follows the armed operation), `stepAlgebraBalanceBoardV2`
  (focus-signal effect focuses the field), `stepAlgebraDirectCancellationUI`
  (operation-aware wording).
- `npm run lint` exit 0 (warnings only, none in changed files). `npm run build` OK.
- `npm run test:rules` — **not run: no Java in this environment.**
- `npm run certify:capabilities` (merge tier). The journeys import Playwright
  from `/opt/node22/...`, absent here; run with `PLAYWRIGHT_MODULE` pointing at
  a local shim that launches the installed Chrome. Full run: 30/36 PASS; the 6
  red rows came from two scripts timing out while cold/under load
  (`algebraicSubstitutionHandoff` page boot, `stepAlgebraStructureTools`
  `solveRegression`). Re-run in isolation on this branch, both **pass**
  (9/9 handoff journeys; structure tools with no findings). Work View, Work
  Persistence, 3×3 Substitution and host parity pass in the full run.

## Found, not fixed (next session)

Workspace visibility (the current mission):
- Sticky chrome still costs ~300 px of a 900 px desktop viewport (identity 38 +
  navigator 143 + task card ~110). The navigator carries four lines of grade
  text (section score, current grade, answered) — candidates for a compact row.
- Phone portrait: the tool gets ~400 of 844 px; the action bar wraps to two
  rows (~100 px). One row of icon+short labels would return ~45 px.
- Cancellation box on desktop wraps −9x + 21 − 21 onto two lines although
  the side has room for one (the box's `width: min(96%, 520px)` resolves
  against a max-content parent).
- `SubstitutionReductionMode` (3-variable reduction) has the same fixed
  `220–280px` side column while solving — same fix pattern as #5, untested here.
- Work View: the 240 px side rail carries four buttons and two non-actionable
  capability chips, then blank space; on a phone the solver's own header
  (Solve for x, support chips, four tool buttons) still pushes the balance
  board partly under the action row. "About this tool" has no route from the
  Work View Help drawer (it is hidden with the tool header on phones).
- Only other tools with a Work View focus region would benefit from the new
  `data-work-view-focus` hook; graphing, regression and statistics tools were
  not in this assignment and were not exercised.

Mathematics / workflow:
- Back-substitution into an equation whose variable is already isolated skips
  the solve step: the pair shown is **(5, −4(5) + 12)** and the student never
  computes y = −8; verify cards read "(−4·(5) + 12) = −4·(5) + 12".
- Substitution silently drops the grouping: 2x + (−4x + 12) = 2 arrives in the
  solver as 2x − 4x + 12 = 2.
- Elimination (production 9deb4ec): after marking cancellation the software
  computed 3y − 10y and 11 − 18 itself. `main` already contains #354 *Make
  students calculate the elimination combination* — re-check after deploy.
- "Simplify arithmetic" asks for a number only; typing −6x is rejected with
  "Enter one number".
- Combine-like-terms stays on after success, hiding the +/− rails until toggled.
- Elimination "Prepare ✓ Eq.1 · 1 Eq.2 · 1" shows complete before a target is chosen.
- Spacing artefact: "−2 x" (LaTeX `~` in the term source).
- Right side of ÷ −2 renders as −(10/−2) instead of (−10)/(−2).
- Calculator answers in decimals (−2.5556) even with a fraction key.

Copy / dashboard:
- Student-facing "Nothing is simplified for **the student**" and "Support 3 ·
  Standard" (shared with the teacher's level picker — needs a copy decision).
- "turn it into the substitution **token**" (jargon).
- Warm-Up closed for the period shows "1 of 1 try left", "review only",
  "submitted automatically when time ends" and "Recorded" together.
- Class Points: permission-denied on every load (card stays "Temporarily unavailable").
- Page title "Vite + React"; two Log Out buttons; Tests & Exams has no navigator;
  My Math Path has a second "Home" in its own nav; Grades shows "View Results" on
  a not-started assignment.
- Practice Q8 (exponential equation, TEKS 6.2A) sits in a systems lesson.
- Section tabs use `role="listitem"` on buttons; term aria-labels are program
  syntax ("2 * x"); math renders expose three text copies to screen readers.
- The URL never changes, so refresh/back return to the dashboard (resume card helps).

Environment notes: Playwright's instant typing can land the first keystroke in
the previously focused MathLive field and race Enter-to-check; at human pace
(≥50 ms) neither reproduces — not treated as bugs.

## Screenshots

`.playwright-mcp/qa/` (not committed): `before`/`exp`/`after-*` pairs for each fix,
e.g. `32-left-clipped.png` → `after-17-cancel-*.png`, `14-sub-substitute.png` →
`after-12-sticky-stack.png`, `91-mobile-workflow.png` → `after-15-pixel-portrait.png`.
