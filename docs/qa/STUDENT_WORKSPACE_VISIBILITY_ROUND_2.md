# Student workspace visibility — round 2 (2026-09-24)

Branch: `qa/student-workspace-visibility-round-2` · Account: Claude QA Student (Period 1)
Production build tested: `d6a959f` (PR #356 merged). Screenshots: `.playwright-mcp/r2/` (not committed).

The duplicated display name is test data, not a defect.

## Assignments / questions completed

| Assignment | Question | Tool | Viewport | Result | Notes |
| --- | --- | --- | --- | --- | --- |
| Alg I M2 T1 L6 | Warm-Up Q1–3 | Controlled Sort | 1536×900 | closed for the period (review only) | issue #1 |
| Alg I M2 T1 L6 | Classwork Q1 | Analyze the Function (intercepts) | 1536×900, Work View | Correct (x = 3, y = −45) | issue #2 found here |
| Alg I M2 T1 L6 | Classwork Q2 | Graphing — factored linear form | 1536×900, Work View | Correct ((3,0),(5,30)) | healthy; plane 590×390 in Work View |
| Alg I M2 T1 L6 | Classwork Q3 | Connect the Line (RepresentationMatch) | 1536×900, page + Work View | Correct | issues #3, #4 |
| Alg II H L1 (systems) | Practice Q1 | Systems → substitution → Step Algebra | 1536×900 Work View, local build | Correct | issue #5; retest of #2 |
| Alg I M2 T1 L6 | Practice Q1 | Linear Table Workbench | 1536×900 Work View, local | Correct (y = −0.25x + 5) | retest of #4 (task once, sentence-case chips) |
| Alg II H L1 (systems) | Practice Q2 | Systems → substitution (resumed from round 1) → Step Algebra ×2 → verify | 1536×900 page, local | Correct ((20/9, −23/9)) | issues #6–#11 |
| Alg I M2 T1 L6 | Practice Q2 | Linear Table Workbench | 390×844 Work View (+ idle test 1536×900) | Correct (not constant) | #12–#16 |
| Alg I M2 T1 L6 | Practice Q3 | Multi-part (table, choice, expression) | 820×1180 | Correct (2.5, Yes, 2.5p, 187.5) | healthy |
| Alg I M2 T1 L6 | Practice Q4 | Multi-part with table | 1180×820 | Correct (0.75, 6, No, 0.75t + 6, 18) | #17 |
| Alg I M2 T1 L6 | Practice Q5 | Multi-part with graph | 1536×900 | Correct (30, 75, 41.25, not realistic) | #18 |
| Alg I M2 T1 L6 | Practice Q6 | Step Algebra rewrite → factored form (Factor to primes) | 1536×900 Work View | Correct (y = 15(x − 3)) | healthy; reveal verified in Work View |
| Alg I M2 T1 L6 | Practice Q7 | Expression Meaning (matrix) | 1536×900 | Correct | #19 |
| Alg I M2 T1 L6 | Practice Q8 | Compare the Functions | 1536×900 | Correct | content: f/g labels vs F/G task |
| Alg I M2 T1 L6 | Practice Q9 | Connect the Line (new full-width layout) | 1536×900 | Correct | #21 |
| Alg I M2 T1 L6 | Practice Q10 | Representation Bridge (capstone: intervals, general, factored, graph, meanings) | 1536×900 Work View | Correct — Practice complete 10/10 | healthy |
| Alg I M2 T1 L6 | DOL Q1–3 | Linear Table Workbench | 1536×900 | DOL timer ended — review only | lock reason now at top (#1) |
| Alg II H L1 (systems) | Practice Q3 | Elimination, dependent (0 = 0) | 1536×900 page + Work View | Correct | #22, #23, #24 |
| Alg II H L1 (systems) | Practice Q4 | Elimination, inconsistent (0 = 12) | 1536×900 | Correct | #24 retest (stages revealed, Check clear of bar) |
| Alg II H L1 (systems) | Practice Q5 | Elimination, scale both (×2, ×3) | 1536×900 | Correct ((2, 3)) | healthy |
| Alg II H L1 (systems) | Practice Q6 | Substitution with decimals (alloy) | 390×844 Work View → 1536×900 | Correct (w = 60, s = 140) | #25, #26, #27 |
| Alg II H L1 (systems) | Practice Q7 | Substitution + distribute −3 | 1536×900 | Correct ((3, −1)) | #28 |
| Alg II H L1 (systems) | Practice Q8 | Multiple choice (exponential) | 1536×900 (after idle timeout) | Correct (5) — Practice complete | #29; idle modal verified in the wild |
| Alg II H L1 (systems) | Classwork Q2 | Substitution | 1536×900 | Correct ((3, 3)) | healthy |
| Alg II H L1 (systems) | Classwork Q3 | Elimination (plane/wind) | 820×1180 | Correct (p = 120, w = 20) | healthy on tablet portrait |
| Alg II H L1 (systems) | Classwork Q5 | Elimination, inconsistent | 1536×900 | Correct — Classwork complete | |

## Confirmed issues

| # | Severity | Issue | Viewport | Screenshot | Root cause | Fix | Retest |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2 | Major (Work View) | After a correct answer inside Work View (and after any manual close) the page jumped to scrollY 0 — the assignment header — with feedback and Next Question ~1600px below | 1536×900 | `05-cw1-checked.png`, `09-cw2-after.png` | Pinning the tool (`position: fixed`) removed it from the flow, the document shrank and the browser clamped scrollY; focusing Close without `preventScroll` scrolled 400 → 5; on close, scroll anchoring moved the restored position by the tool height (400 → 940) | `workViewScrollHold.js` + `EnlargeableFigure`: placeholder holds the tool's height while pinned; Close focused with `preventScroll`; scroll restored on close and again next frame | Local: manual open/close 400 → 400. Correct answer in Work View now lands on the work + "Correct" (scrollY 964, Next Question 136px below the fold) instead of the header. `33-sys-after-check.png` |
| 3 | Major (layout) | Connect the Line: 12 cards squeezed into a 540px column (3 narrow columns, graph thumbnails unreadable), "Check groups" below the fold in Work View, while the other half showed reference text identical on every question | 1536×900 page + Work View | `10-cw3.png`, `11-cw3-workview.png` | Even `ToolGrid` 2-column split with the static "Representation reasoning" panel | Card sets use a full-width stack, reference panel below; graph cards span two columns (container query, only where ≥520px) | Build verified; live retest pending — Lesson 6 CW3 already complete (Enlarge disabled on terminal questions) |
| 4 | Moderate (Work View) | Registered-tool Work View showed the task twice (header + instruction banner) and rail chips "numeric Controls", "table Data" | 1536×900 Work View | `11-cw3-workview.png` | `RegisteredToolWorkView` put the prompt in `instruction.content`; label was a bare camelCase split | No instruction content from the wrapper (tools that know their step publish their own); sentence-case labels | Unit-tested; live retest pending |
| 5 | Major (math display) | Substituting y = 2x into 3x + 4y = 11: step chip read 3x + 4(2x) = 11 but the balance board showed **3x + 4x(2)** | 1536×900 Work View | `18-sys-p1-solve.png` | `cleanImplicitMultiplicationLatex`: `4·2·x` → `4(2)·x` → "(group)·B moves B in front" → `4x(2)` | A grouped number, like a grouped fraction, is a coefficient: letter stays after it → `4(2)x` | `substitutedProductNotation.test.mjs` (fails with fix reverted) |
| 1 | Major (visibility) | Closed Warm-Up: every control disabled under "3 of 3 tries left"; the reason ~1470px below the landing position | 1536×900 | `01-l6-open.png`, `02-warmup-closed-bottom.png` | Attempt strip ignored `assignmentLocked`; the lock message rendered only after the tool | Attempt strip shows the lock message | Local: "This class period has ended. Your Warm-Up is available for review only." at y=326 where the student lands. `34-warmup-locked-after.png` |
| 6 | Moderate (space) | "How to do this" sat alone in a 72px bordered blue box above every tool in assignments | 1536×900 | `35-l6-p1.png` | With the prompt hidden by the sticky task, the tool task card kept its box chrome | Box chrome dropped when the prompt is hidden (72 → 44px); the fold is unchanged | `43-p2-taskcard-after.png` |
| 7 | Major (scrolling) | After "Check my simplification" the page clamped at its bottom; the equation sat under the sticky task card while feedback said "Continue from the equation shown" | 1536×900 | `45-sys2-simpl.png` | Removing the simplify panel shrank the page; nothing brought the board back | `workspaceReveal.js`: a committed step centres the equals sign when it is in the top third or behind the action bar (not on phones) | Same flow: equation + feedback visible together. `63-reveal-retest.png` |
| 8 | Moderate (readability) | Solved-value token "20/9" and step chip "x = 20/9" clipped with scrollbar arrows | 1536×900 | `50-simpl-reveal.png` | Inline MathDisplay `overflow: visible hidden` computes to `auto` | Inline math never scrolls (`overflow-y: visible`); block math containing `\frac` gets 0.1/0.4em padding (denominators lost 7px on verify cards) | `51-token-after.png`, `69-verify-frac.png` |
| 9 | Major (scrolling) | Resuming a started systems question landed on the tool header, board 700px below; the back-substitution solver opened behind the action bar; centring put the solver's mode buttons under the task card | 1536×900 | `46-sys2-resumed.png`, `52-backsub2.png`, `54-resume-livework.png` | Question-entry scroll targeted the stage top and cancelled the solver's reveal; isolate/back-sub solvers had no `autoReveal` | Question entry scrolls to the `data-work-view-focus` region with `block: start` and `scroll-margin-top` = sticky nav + measured task card (`--mm-sticky-task-height`); all three embedded solvers reveal | Task, solver controls and board on screen together. `55-resume-start.png` |
| 10 | Major (readability) | Operation chip showed "⠿ Pick up − \frac{40}{9}" — raw LaTeX, also read aloud | 1536×900 | `59-sub.png` | Chip printed the math field's LaTeX as text (pick-up button, drag token, placed chip) | Operand typeset with MathDisplay; button named from the parsed operand | `60-chip-after.png` |
| 11 | Moderate (readability) | Verify card "Values substituted: 2 * (20/9) − (−(23/9)) = 7" (round 1: "(2·(1)) = 2·(1)") | 1536×900 | `67-verify-placed.png` | Machine string rendered as ASCII-math | `substitutedEquationLatex` → 2(20/9) − (−23/9) = 7 in both systems modes | `68-verify-notation.png`, `systemsVerifyCardNotation.test.mjs` |
| 12 | Major (a11y / timing) | Idle overlay rendered behind an open Work View (z 9999 vs 2147483000): timer paused, student never told | 1536×900 Work View | `72-idle-workview.png` | z-index below Work View | Overlay above Work View; `alertdialog`, labelled, button focused (Enter resumes), 44px | `77-idle-desktop.png`; phone/tablet portrait+landscape `78-idle-*.png` |
| 13 | Major (timing) | Once on top, the overlay dismissed itself instantly | desktop | trace: `overlay true` then gone | Browser synthetic `mousemove` (content appears under a resting cursor) counted as activity | Only a pointer that actually moved counts (`lastPointerRef`); touch, pointerdown and wheel now count as activity too | Overlay stays until dismissed; Enter resumes on same question, Work View open, unsaved Δx intact |
| 14 | Major (phone) | Enlarge button covered the tool title on phones and "About this tool" on desktop (unclickable) | 390×844, 1536×900 | `80-phone-p2.png` | Absolutely positioned opener over the header's right end | Header reserves 176px for the opener | About uncovered at 1536/820/390/360; `81-phone.png` |
| 15 | Moderate (phone) | Work bar wrapped to 2 rows (105px) at 390px; Work View controls likewise (107px) | 390×844 | `80-phone-p2.png`, `83-phone-wv-interval.png` | Inline pills 446px wide | Flex row; "Reset" for "Reset Question" (accessible name unchanged; `shortLabel` for Work View actions) | 61px / 57px; workspace 709px in Work View. 360px still wraps |
| 16 | **Blocker (phone)** | Numeric keypad opened BEHIND Work View; 274px blank band reserved for it | 390×844 Work View | `84-phone-wv-recorded.png` | Keypad z 13000 < Work View | Keypad lifted above Work View (below calculator/idle) | `86-phone-keypad.png` |
| 16b | **Blocker (phone)** | After a correct answer "Next Question" was at y=939 of 844, clipped by the fixed-height question container — unreachable | 390×844 | `89-phone-after-check.png` | Continuation card renders after a 100dvh `overflow: hidden` container | Action bar carries "Next question →" / "Continue to <section> →" once the question is finished (phone bottom bar, desktop sticky bar) | `90-bar-next-phone.png`, desktop 846px in view |
| 17 | Major (scrolling, tablet) | Multi-part: data table centred with ~370px blank either side, fields below the fold; answering slid the table under the task | 1180×820 | `94-tabletland-p4.png` | Table and fields stacked | Container query ≥900px: table beside fields, sticky under the task | `95-multipart-tl.png`, `96-multipart-last.png` (task, table, last field, Submit together) |
| 18 | Moderate (scrolling) | Focused answer field's label ("E(2)") landed under the sticky task card | 1536×900 | `98-p5-field.png` | Field scroll ignores sticky stack | `scroll-margin-top` = sticky nav + task + 56px on inputs in assignments | build + test |
| 19 | Major (scrolling) | Expression Meaning: choose row in matrix above, answer below — scroll up/down ×6 | 1536×900 | `111-p7-filled.png`, `112-p7-matrix.png` | Panel stayed on the completed row | Completing a row opens the next incomplete one in place | Page stayed at ~965 for all five rows |
| 20 | Major (scrolling, intermittent) | Question landing at scrollY 78/92/93 with the tool 600px below | 1536×900 | `110-p7.png` | Page briefly short between questions; scroll clamped; nothing re-aimed | For 1.5s after a question change the stage growing re-aims unless the student scrolls/types/touches | 3 consecutive transitions land at stage top 142 |
| 21 | Moderate (readability) | Connect the Line graph thumbnails: y labels stacked; short cards stretched beside graph cards | 1536×900 | `117-p9-grouped.png` | 220×140 plane proportions; grid stretch | 320×240 proportions; `align-items: start` | `119-graph-card.png` |
| 22 | Moderate (layout) | Systems step trail (7 steps, 700px) scrolled sideways in a 612px panel, hiding Back-substitute and Verify | 1536×900 | `127-sys-p.png` | `overflow-x: auto` strip | Trail wraps | `128-elim.png` |
| 23 | Major (layout) | Elimination Prepare/Combine, substitution, back-substitution and verify cards squeezed into 620px beside a 380px givens column | 1536×900 | `129-elim-wv.png`, `185-p6-verify.png` | Strip layout applied only while an embedded solver was active | Strip layout from the moment a variable is chosen, either method (620 → 995px) | `131-elim-strip-wv.png`, `186-verify-strip.png` |
| 24 | Major (scrolling) | Each new elimination stage (scaled equation, cancellation, combine) opened below the fold with nothing to say so | 1536×900 Work View | `137-scaled-checked.png` | No reveal on appear | Callback ref scrolls new stages to `nearest` (not on resume); `scroll-margin-bottom: 96px` clears the action bar | `145-p4-cancel-stage.png`, `146-p4-combine-stage.png` |
| 25 | **Blocker (phone)** | Step Algebra board in phone Work View showed "LEFT SIDE = RIGHT SIDE" with no terms | 390×844 Work View | `164-p6-isolate.png`, `169-p6-repro.png` | MathLive `<math-span>` renders on its own IntersectionObserver; not-yet-rendered spans have zero width and that observer never reported them | `ensureMathElementRenders`: second observer + 400ms check renders on-screen, still-empty math; off-screen stays lazy | `170-p6-fixed.png` (w + s = 200) |
| 26 | Moderate (phone) | Phone operation palette labels cut to "Subt…", "Multi…", "Divi…" | 390×844 | `164-p6-isolate.png` | App.css `!important` pinned rail tiles to 44px inside 58px columns | Palette tiles fill their column; label wraps to two lines | `171-palette.png` |
| 27 | Major (phone) | Nested padding left the systems balance board 267px of 390; mode buttons one per row | 390×844 Work View | `165-p6-board.png` | 4 nested layers padded 11–14px each side | Thin insets in phone Work View only | 317px; `172-phone-wv-trim.png` |
| 28 | Moderate (a11y) | Choice radios announced "Mathematical expression" / "$5$" | any | — | Radios unnamed; MathDisplay default label | Named by choice text without TeX delimiters | radios: 11, 24, 5, 8 |

## Inactivity timeout

- The overlay fires after 120s without activity, only while the tab is visible (a background tab never idles — the
  production tab sat 40+ minutes without it; state preserved).
- Before this round: behind Work View (invisible, #12); once visible it self-dismissed (#13); unlabelled div with no
  focus; phone reading/scrolling did not count as activity.
- After: visible above Work View at desktop, phone portrait/landscape, tablet portrait/landscape; resume button
  focused and on screen without scrolling; Enter/click resumes; same question, Work View still open, unsaved input
  intact, nothing submitted, not returned to the dashboard.

## Unresolved

- **Decision needed — lesson bundles filed as "Finished".** Lesson 6 (4 of 19 done, Practice 1/10, DOL 0/3)
  moved to the collapsed "Finished" dashboard group once Classwork reached 100. `studentDashboardModel.isDone`
  treats any bundle with a Classwork section as `notesClasswork`, finished at Classwork 100.
  `practicePassDashboardCompletion.test.mjs` pins this deliberately ("Practice was never part of it"), so it was
  not changed here. Recommendation: a bundle is finished only when its graded non-Classwork questions are also
  terminal (a 10-line change in `isDone`, drafted and reverted).
- Intermittent landing at scrollY 78/92 (graph below the fold) after switching sections; not reproducible on demand.
- After a correct answer the Next Question button sits ~100px below the fold (feedback visible; Enter continues).
- Back-substitution token is announced "from the isolated equation"; operation-chip names use the parsed form
  "((40) / (9))"; ordered pair renders −(23/9); cancelled fractions sometimes fade without the strike line.

- **#1 (Major, visibility): closed Warm-Up.** Start/Continue drop the student on Warm-Up Q1, closed for the
  class period. The tool renders fully but every control is disabled, "3 of 3 tries left" sits at the top, and the
  only explanation ("This class period has ended. Your Warm-Up is available for review only.") is at y≈1765 —
  ~1470px below the landing position. `01-l6-open.png`, `02-warmup-closed-bottom.png`.
- Still present from round 1: back-substitution into y = 2x never asks for y (pair shown as (1, 2(1)));
  verify cards read "(2·(1)) = 2·(1)" with \cdot and doubled parentheses; "Combine like terms" stays on after
  success; "Nothing is simplified for the student"; `11~ x` in the accessibility tree.
- Work View rail: non-actionable capability chips ("Method, targets, and the final solution") still take rail space.
- Graph card accessibility: Connect the Line graph cards are announced only as "Coordinate plane" — a
  screen-reader student cannot tell the two lines apart.
- Question landing position after clicking the continuation button once measured scrollY 78 (graph below the
  fold) instead of 294; not reproducible on direct navigation.

- Tablet portrait: the section navigator wraps DOL onto a second row (~50px).
- After finishing Classwork, the action bar offers "Continue to Practice →" when Practice is already complete.
- Cancellation workspace aria-label still says "matching factors" for additive steps; term aria-labels are
  program syntax ("4 * x"); substitution token "Pick up the expression 3 from the isolated equation" for a solved value.
- Intermittent: the page jumped ~350px up once or twice after placing a ÷ operation (not reproducible on demand;
  subsequent ÷ placements were stable). The commit-time reveal (#7) recovers it on the next step.
- Phone portrait keeps ~200px for the task panel above the tool; Work View header clips long tasks to 3 lines
  (full text via "Task").

## Automated gate

`npm run test:platform` 6266/6268 — the two failures are pre-existing on `main` (googleapis module missing;
clock-dependent Warm-Up test). `tests/tools` 179/179, `test:authoring-v5` 677/677, lint exit 0, `build` and
`build:firebase` OK. `test:rules` not run (no Java). New assertions were mutation-checked where noted in commits.
