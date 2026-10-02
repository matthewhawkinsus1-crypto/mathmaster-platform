# PR #397 — Linear Multiple Representations: student QA and final engineering pass

**Branch:** `feat/linear-multiple-representations-board` · **Reviewer:** Claude (taking over from Gemini) · **Date:** 2026-09-29

This pass did two things: finished the two known engineering issues (A: GIVEN
source fidelity, B: Graph 3 grid vs an authored `snapStep`), and then did the
assignment **as a student** in a real browser — typing into MathLive fields,
clicking and tapping the grid, dragging points, pressing Enter, collapsing,
enlarging, reloading, submitting — at laptop, iPad and phone sizes. That
browser pass found four problems no unit test had caught (two of them would
have lost or blocked student work), all fixed on this PR.

## How to reproduce

```bash
npx vite --host 127.0.0.1 --port 5197 --strictPort &
AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/linearMultipleRepresentations.mjs          # all journeys
AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/linearMultipleRepresentations.mjs dol      # one journey
# PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… when Playwright/Chrome are not at the defaults
```

`tests/browser/linearMultipleRepresentations.html` mounts the **FINAL assignment
compiled through the teacher import + publish chain** (not raw JSON) in the real
`QuestionEngine`. `?gallery=1` adds one question per GIVEN source kind the
assignment does not use. The driver reads back only the saved draft (to prove
what survived a reload) and never injects state.

| Journey | Viewport | What a student does | Result |
| --- | --- | --- | --- |
| `warmups` | 1366×768 | Sorts every card in WU1 and WU2, checks | pass |
| `cw1-free-order` | 1366×768 | CW1 out of order with wrong answers first (below) | pass |
| `fraction-anchor` | 1366×768 | Point-slope through (1, −5/2); Graph 3 on halves | pass |
| `far-anchor` | 1366×768 | Point-slope through (20, 7); Graph 3 window grows | pass |
| `issue-b` | 1366×768 | y = x, authored `snapStep: 1`, y − ½ = x − ½ | pass |
| `given` | 1366×768 | Every GIVEN source kind (10 questions) | pass |
| `ipad-table` | 820×1180 touch | PR1 (table source) by touch | pass |
| `phone-scenario` | 390×844 touch | PR2 candle: keypad entry, meanings, enlarged graph | pass |
| `dol` | 1366×768 | DOL: no verdicts, Enter never submits, one submission | pass |
| `complete` | 1366×768 | CW2, CW3, PR1, PR2 finished and submitted correct | pass |
| `zoom` | 1920×1080 | CW1 at ~70% browser zoom | pass |

CW1 order actually used: **point-slope → table → Graph 2 → y-intercept →
(reload) → Graph 1 in the enlarged view → slope → Graph 3 → slope-intercept →
x-intercept → two points → collapse everything → reopen → submit.**

### Gates

| Gate | Result |
| --- | --- |
| `node --test` PR test files (tools + platform board + FINAL assignment + representationBridge* + draft persistence contract) | 142 / 142 |
| `npm run test:authoring-v5` | 684 / 684 |
| `npm run test:platform` | 6,517 / 6,517 |
| `npm run lint` | 0 errors (warnings are pre-existing) |
| `npm run build`, `npm run build:firebase` | pass |
| `tests/browser/linearMultipleRepresentations.mjs` (11 journeys) | no findings |
| FINAL assignment through the teacher import + publish chain | 0 preflight errors, 0 tool-contract errors |

Assertions added in this pass were each confirmed able to fail by mutating the
code they protect (feedback gating, verdict persistence, open-by-default,
Enter-never-submits all turn the suite red).

---

## The two known engineering issues

### Issue A — the GIVEN representation now looks like what the author wrote

Before this pass the table source showed the words *"Given initial
relationship"* and nothing else, and the candle story rendered through MathLive
as unspaced italic (`Acandleis18inchestallwhenitislit…`). A student had no
starting information on either (screenshots `00-before-table-source.png`,
`00-before-scenario-source.png`).

All GIVEN rendering now comes from one pure function,
`describeGivenRepresentation()` (`linearMultipleRepresentationsMath.js`), with a
thin read-only renderer in the board:

| Source | Shown to the student |
| --- | --- |
| `standardForm` `{A:2,B:-4,C:12}` or `"2x - 4y = 12"` | **2x − 4y = 12** (never the normalised x − 2y = 6; grading still normalises internally) |
| `slopeIntercept` | authored equation verbatim; from m/b as exact fractions (`y = −¾x + 2`) |
| `pointSlope` `{point:[2,-2], m:0.5}` | **y + 2 = ½(x − 2)** around the authored point; authored equation verbatim; zero coordinates stay visible (`x − 0`) |
| `twoPoints` | both authored points, read-only, fractions as written |
| `table` | a read-only x/y T-table of every authored row, exact (`"1/3"` cells are now valid and stack) |
| `graph` | read-only plane with the authored points and line, now with a readable unit grid |
| `scenario` | the story as prose through the shared `MathText` (math inside `$…$` still typesets) |

The GIVEN card is no longer repeated inside the Equations panel, and preflight
now rejects a scenario with no story and a table with a repeated x-value.
Regression tests: one per source kind in `tests/tools/linearMultipleRepresentations.test.mjs`
("ISSUE A …"), plus the browser `given` journey.

### Issue B — "any valid point" stays true under an authored `snapStep`

Each graph now gets **the coarsest grid that contains both the author's grid
and that graph's required points** (rational gcd), `resolveGraphSnapSteps()`:

| Graph | Required points | Example |
| --- | --- | --- |
| 1 | x- and y-intercepts | y = x, snapStep 1 → 1 |
| 2 | y-intercept (the slope step is a whole rise/run) | → 1 |
| 3 | the given or the student's valid anchor | anchor (½, ½) → **½** |

`refineSnapStep(1, ½) = ½`, `refineSnapStep(¼, ½) = ¼`, `refineSnapStep(⅕, ½) = 1/10`,
`refineSnapStep(2, (3, 4)) = 1`. A slope's denominator no longer forces halves
onto every graph (2x − 4y = 12 is back on whole numbers, as `CoordinatePlane`
itself promises). Grids finer than 1/20 fall back to twentieths, which put any
coordinate within 0.025 of a gridline — inside the 0.12 graph tolerance.
`snapStep` may be authored as `"1/3"`. Verified in the browser: (½, ½) and
(1, −5/2) land exactly, and Graphs 1–2 stay on whole numbers.

---

## The FINAL assignment

`docs/assignments/algebra1-linear-multiple-representations-final-v5.json` — the
repo's existing home for FINAL V5 assignments (there is no top-level `qa/`
folder). *Algebra I — Multiple Representations of Linear Equations*, course
`algebra1`, lesson/classwork (`notesClasswork`). Certified by
`tests/platform/linearMultipleRepresentationsFinalAssignment.test.mjs` through
the real import + publish chain, including a complete correct response per
board scoring 100% (the key agrees with the question) and no prompt that
states an answer the board asks for.

| Section | Question | GIVEN | Board |
| --- | --- | --- | --- |
| Warm-Up | WU1 | cards for y = 2x − 4 and y = −x + 3 | card sort: slope-intercept, standard, point-slope, graph, x-intercept |
| | WU2 | savings (+$5/week from $20) and a draining tub (40 gal, −4/min) | card sort: situation, equation, graph, rate, starting value |
| Classwork | CW1 | standard form **2x − 4y = 12** | all 10 cards, three graphs |
| | CW2 | slope-intercept y = −2x + 4 | all 10 cards |
| | CW3 | point-slope y − 2 = −1(x − 3), anchor (3, 2) required on Graph 3 | all 10 cards |
| Practice | PR1 | table (−1, −9), (1, −3), (3, 3), (5, 9) of y = 3x − 6 | 10 cards (table is given) |
| | PR2 | candle: 18 in, burns 2 in/hour | 11 cards + 6 meanings (independent/dependent quantity, slope, y-intercept, x-intercept, domain 0 ≤ x ≤ 9) as choice banks |
| DOL | DOL1 | tank: 24 L, drains 3 L/min | `requiredCards`: slope-intercept, standard, slope, both intercepts, Graph 2 + 3 meanings (domain 0 ≤ x ≤ 8); `submitOnly`, 1 attempt, no hints |

TEKS: A.2A (domains), A.2B, A.2C, A.3A, A.3B, A.3C. Honors/CCMR sourcing runs
only for an Honors destination; this is on-level Algebra I, so it was not
invoked.

---

## Findings

Ranked by effect on learning and on the student's work, not by ease.

### P0 — cannot complete / data loss / wrong grading

**P0-1 · The first Check silently ended the server backup of the whole board.** *Fixed.*
- *Symptom:* none visible — which is the problem. After pressing any Check, a student who switched Chromebooks, cleared storage or had a device replaced lost every equation, table row and graph on the board.
- *Where:* the board persisted `cardChecks: { isCorrect, … }`. `isCorrect` is on `FORBIDDEN_DRAFT_KEYS`, and `workspaceDraftSync` skips the **entire** record when any key is forbidden (`sanitizeWorkspaceDraftValue → 'forbidden-key'`).
- *Why it matters:* local-only work is exactly what the draft sync exists to protect.
- *Fix:* the guard is right, so it was not renamed around. The board now stores only **which work was checked** (`checkedCards`: a fingerprint per card) and recomputes every verdict from the question. A reload looks exactly as the student left it, no grading is in the draft, and the record is ~1 KB. Regression test runs a maximal board record through the real sanitizer and fails on the old shape.
- *Separate PR:* yes, platform — see R-5.

**P0-2 · Two-points and graph source questions could never be published.** *Fixed.*
- *Symptom:* teacher import fails preflight: "twoPoints source requires finite coordinates".
- *Where:* import makes coordinate lists Firestore-safe (`repairKnownFirestoreNestedArrays` rewrites `points: [[x, y]]` to `[{x, y}]`); the PR's validator and derivation only read `[x, y]`. Every earlier test used raw objects, never the import chain.
- *Fix:* `authoredPointPair()` reads both shapes everywhere (validation, derivation, bounds, GIVEN). Test `two-points and graph sources survive Firestore-safe import` runs the real chain.

**P0-3 · A one-attempt DOL could be checked card by card.** *Fixed.*
- *Symptom:* in the DOL, every card had a Check button (the default `feedbackTiming` was guided), graphs and meanings showed a live "✓ Correct" the moment they were right, and the progress strip counted correct answers.
- *Where:* the board ignored the runtime's `showImmediateFeedback` (false for a DOL: feedback `afterAssignmentSubmit`).
- *Fix:* `canCheck = feedbackTiming === 'guided' && showImmediateFeedback`. Without it there are no Check buttons, no verdicts, Enter does not check, and progress reads "Filled in: n of 9". Verified in the `dol` journey. The final DOL also sets `feedbackTiming: "submitOnly"`.

**P0-4 · Enter could submit the entire DOL.** *Fixed.*
- *Symptom:* pressing Enter in a table cell, a meaning field or the domain field submitted the whole board — one attempt — with work half done. In guided mode it pressed "Check Standard Form" instead of checking the card being typed in.
- *Where:* `ToolShell`'s Enter handler clicks the first button whose text starts with check/submit when the focused panel has none.
- *Fix:* the board owns Enter: it checks the card being typed in (if checking is allowed) and never submits. An incomplete board also asks first ("3 parts are still empty: … Keep working / Submit anyway").

**P0-5 · Graph 3 could be graded correct for a parallel line.** *Fixed.*
- *Where:* a student point-slope equation through an off-line point (e.g. y − 5 = ½(x − 2)) became Graph 3's required anchor, so the parallel line through it passed Graph 3.
- *Fix:* `resolveGraph3Anchor()` — one resolver for the card, its Check and the score — adopts a student point only when it is on the line.

### P1 — major confusion or workflow failure

| # | Symptom | Fixed? |
| --- | --- | --- |
| P1-1 | "✓ Correct" stayed after the student changed the answer to a wrong one | yes — a verdict shows only while the card holds the work that was checked |
| P1-2 | `requiredCards` was compiled but ignored, so a DOL had to be the full 17-part board | yes — cards and categories, validated at preflight; the DOL asks for 9 parts |
| P1-3 | Graph 2 and 3 started collapsed, Graph 1 open — an implied order on a "free-order" board | yes — everything starts open |
| P1-4 | Table cells used `inputMode="decimal"`; an iPhone decimal pad has no minus or slash, so −6 or 1/2 could not be typed | yes — text keyboard; platform-wide note R-7 |
| P1-5 | A third tap wiped both plotted points with no way back | yes — a third tap moves the newest point; Start over is undoable |
| P1-6 | Enlarged graph: Check below the fold on a 768px laptop and on a phone | yes — task, points and Check sit beside the plane (laptop) or right under it (phone), plane sized to the screen |
| P1-7 | Typed-too-soon keys land in the previous MathLive field (measured: a finished x-intercept wiped by keys meant for the next card) | partly — board no longer re-renders MathInput listeners on every key (stable Enter handlers, scoring only on submit); platform note R-4 |
| P1-8 | Scenario meanings sat below the three graphs, far from the story they ask about | yes — for a scenario, "What the numbers mean" is directly under the story |

### P2 — meaningful student UX improvement

| # | Symptom | Fixed? |
| --- | --- | --- |
| P2-1 | Developer vocabulary: "Free-Order Mode", "Guided Feedback", "Submit-Only Feedback", "Complete Board Verification", "coherence", "target line" | yes — "Work in any order. Nothing is locked.", "Submit your board", "describes a different line" |
| P2-2 | Collapsed summaries printed raw LaTeX (`m: \frac{1}{2}`) | yes — summaries render the student's work as mathematics |
| P2-3 | Error text showed decimals ("The point (0.3333333333, …)") | yes — exact fractions |
| P2-4 | Graph feedback was one generic sentence | yes — from the construction category: right line but not the method's starting point / right start but check rise and run / plot two different points |
| P2-5 | A yellow notice banner at the TOP of the board announced every check, pushing the page down (layout jump) far from the work | yes — feedback sits under the card's Check; a screen-reader live region carries the announcement |
| P2-6 | The comparison overlay printed y = ½x − 3 — in free order, the answer to a card the student may not have done | yes — no equation in the overlay; points colour-coded by method |
| P2-7 | Consistency feedback listed every disagreeing pair (one wrong card → n−1 lines) | yes — names the part(s) that disagree with the rest |
| P2-8 | Given graph had gridlines every 2 units only, so (3, −1) had to be guessed | yes — unit grid via new opt-in `readableGrid` |
| P2-9 | The 5-line "Press the grid and slide…" paragraph repeated under all three graphs | yes — said once above them (`showPlotHelp` opt-out); platform note R-8 |
| P2-10 | Meaning dropdowns truncated the sentence the student had chosen | yes — wider tracks |
| P2-11 | Graph-card titles squeezed to one word per line by their buttons | yes |
| P2-12 | Points joined as `(2, −2),\ (4, −1)` crashed MathLive's parser (infinite recursion) and rendered blank | yes — each point its own math element; platform note R-3 |
| P2-13 | Every keystroke re-graded all 11 cards (mathjs parses) and re-attached every MathInput's listeners | yes — graded on submit; stable handlers |
| P2-14 | A teacher's attempt record labelled parts `graph1`, `contextDomain` | yes — "Graph 1 (intercepts)", "Reasonable domain" |

### P3 — polish / consistency

| # | Symptom | Fixed? |
| --- | --- | --- |
| P3-1 | Board Check used the default graph tolerance while the score used `question.tolerance` | yes |
| P3-2 | Two plotted points with the same x drew an invalid (NaN) line | yes — drawn as a vertical line |
| P3-3 | Vertical space: 3,306px → 2,565px for CW1 at 1366×768 | yes — balanced columns, toggles in headers |
| P3-4 | Lines drawn past the grid box into the padding (warm-up graph cards, enlarged candle graph) | no — shared plane, R-9 |
| P3-5 | WU cards are wildly different heights, leaving gaps | no — R-10 |

---

## Student walkthrough summary

**What felt intuitive**
- The GIVEN box is the first thing on the board and says, in plain words, "You start with this. You do not need to rebuild it." For every source kind it shows exactly what the author wrote.
- "Work in any order. Nothing is locked." plus every card open from the start: nothing suggested an order, and none of my deliberately out-of-order steps was ever questioned.
- Typing `1/2` builds a stacked fraction; a space leaves it; Enter checks the card I am in and the verdict appears right under that card.
- Graph 3 tells me which point to start from — "Start at your point (2, −2) from your point-slope equation" — and after I wrote y + 5/2 = ½(x − 1) the grid quietly changed to halves so (1, −5/2) was reachable.
- Wrong answers name what to reconsider without doing it: "Your equation uses slope 2. Check the slope of this line."; "Good start at the y-intercept. Now count the rise and run of the slope to your second point."; "The row (1, −2) is not on this line."

**What felt confusing (before this pass)**
- A table-source question with no table. A story I could not read.
- Graph 2 and 3 closed while Graph 1 was open — which one first?
- "Free-Order Mode", "Guided Feedback", "Complete Board Verification".
- Pressing Enter in a table box and seeing the whole board submitted.

**What required unnecessary scrolling**
- Before: CW1 was 3,306px tall at 1366×768; the check notice appeared at the top of the board, far from the card; the enlarged graph hid Check below the fold.
- Still: the platform chrome above the tool (task card, TEKS/CCMR chips, tries, tool header) costs ~480px on a phone before the GIVEN is visible, and the sticky action bar covers the bottom of the screen (R-1).

**What required guessing**
- Before: which point Graph 3 wanted; reading (3, −1) off a given graph with no unit grid; whether a third tap had deleted my work.

**What is noticeably better after this PR**
- Every GIVEN type is real and readable; the DOL is a real one-attempt assessment; a reload restores work *and* checks; two-points and graph questions can be published at all.

## Responsive review

- **Laptop 1366×768.** Two balanced columns (equations + table | key features), three graphs side by side, no overflow. The enlarged graph puts the task, points and Check beside a 600px plane; nothing needs scrolling. The platform action bar covers the bottom 64px of the viewport and can sit on top of a field (R-1).
- **iPad 820×1180, touch.** Same two columns; graphs 2 + 1. Touch plotting landed on the aimed points. No horizontal overflow. The first math field is auto-focused on load, which opens the keypad before the student has read anything (R-2).
- **Phone 390×844, touch.** One column in a sensible order (story → meanings → equations → table → features → graphs). No horizontal overflow (checked element by element). The MathMaster keypad has a minus key; −2 was entered by keypad. The enlarged graph fits task + plane + Check on one screen. The two-row sticky action bar permanently covers ~130px (R-1).
- **Reduced zoom (1920 CSS px).** Clean, but `ToolShell` caps the board at 1180px, so the extra width is unused (R-11).

---

## Platform recommendations (not changed in this PR)

- **R-1 Sticky action bar covers work.** Desktop: 64px over the bottom of a 768px screen, including fields. Phone: two rows, ~130px of 844px, always. Recommend one row on phones, scroll-padding equal to the bar on the question scroller, and hiding it while an on-screen keypad is open.
- **R-2 Auto-focus on touch devices.** `ToolShell` focuses the first answer control on mount even on touch devices, opening the keypad. `shouldFocusAnswerOnOpen` already encodes the right rule; `ToolShell` does not consult it.
- **R-3 `MathDisplay` auto-format.** Values containing LaTeX commands are sometimes classified as ASCII math; `(2, -2),\ (4, -1)` then crashes MathLive ("Maximum call stack size exceeded") and renders blank. Treat any `\command` as LaTeX.
- **R-4 MathLive focus latency.** On a busy main thread focus lands in a clicked field tens of ms late; keys in between go to the previous field (select-all + Backspace wiped a finished answer in this QA). Worth a platform guard (e.g. route keys to the field under the last pointerdown until focus arrives).
- **R-5 Silent draft-sync refusal.** A single forbidden key or an oversized value stops a tool's whole draft from syncing with no signal. Recommend a dev-time warning and a registry-wide test that runs each tool's maximal record through `sanitizeWorkspaceDraftValue` (as this PR now does for its board).
- **R-6 Two Undo concepts.** The platform Undo in the action bar is permanently disabled on this board while each graph has its own Undo. Joining `useMathUndoHistory` (in-memory, per the 16 KB draft lesson) would give one Undo. *Done (PQ-009): one history for the whole board; each graph's Undo is that history filtered to the graph.*
- **R-7 `inputMode="decimal"` for signed values.** Used across tools (e.g. `linearTableWorkbench` slope/rate). An iPhone decimal pad has no minus key.
- **R-8 One plotting help.** The shared plane prints a 5-line gesture paragraph under every interactive plane; a single "How to plot" disclosure per tool would say it once.
- **R-9 Clip lines to the plot area** in `CoordinatePlane` (and the representation-match mini graphs).
- **R-10 Representation-match layout and vocabulary.** Graph cards dwarf text cards and leave gaps; there is no table card kind (Warm-Up 2 could not include one); the heading says "Line A/B" when the task is about situations.
- **R-11 Width at reduced zoom.** `ToolShell` caps at 1180px; teachers who zoom out get no extra room for three graphs.
- **R-12 Student-facing jargon in platform chrome.** "CCMR connection · 4 assessments" and bare TEKS codes are shown to students.
- **R-13 "Show math tools" pill under every field.** Seven per board; on a laptop it doubles each card's height. Consider one tools toggle per panel.
- **R-14 Enter heuristics.** `ToolShell` finds the "primary" button by matching button text against `check|submit|…`, which is what clicked Submit for a DOL table cell. Explicit per-panel primary actions, and never falling back to a whole-shell Submit, would make Enter predictable everywhere.

## Evidence

Screenshots from the final browser run, in `docs/qa/screenshots/pr397-linear-representations/`:

| File | Shows |
| --- | --- |
| `00-before-table-source.png`, `00-before-scenario-source.png` | the table and scenario GIVEN before this pass |
| `01`–`09-given-*.png` | every GIVEN source kind after this pass (standard, slope-intercept, point-slope ×2, A/B/C, two points, table, graph, scenario) |
| `10-cw1-standard-form-board-laptop.png` | the CW1 board at 1366×768 |
| `11-cw1-graph1-enlarged.png` | enlarged Graph 1 with task, points and Check beside the plane |
| `12-cw1-collapsed.png` | every card collapsed, summaries as typeset mathematics |
| `13-cw1-completed-submitted.png` | completed board, comparison overlay, correct submission |
| `14`–`16-graph3-*.png` | Graph 3 from (1, −5/2), from (20, 7), and y − ½ = x − ½ under `snapStep: 1` |
| `17-ipad-table-source.png` | PR1 on an iPad |
| `18-phone-scenario-start.png`, `19-phone-enlarged-graph.png` | PR2 on a phone |
| `20-dol-submitted.png` | the DOL after its one submission |
| `21-warmup-1-sorted.png` | Warm-Up 1 sorted and checked |

## Known limitations

- ~~Graph Undo history is in memory only (histories never go in drafts); after a reload Undo removes the last point.~~ Superseded by PQ-009 (2026-10-01): one Undo history for the whole board. It is device-local, size-capped and never in the synced draft, and its most recent steps survive a reload.
- Student anchors with denominators beyond 1/20 snap to twentieths (plottable within tolerance, not exactly).
- Browser QA ran on Chrome with touch emulation, not on a physical iPhone/iPad. The iPhone keypad point (P1-4) is standard iOS behaviour and was fixed conservatively.
- The harness points MathLive at its package fonts because Vite's dev optimizer loses them; production builds are unaffected.
- `npm run test:rules` was not run: no Firestore rules or collections changed.
