# Algebra I M2 T2 Lessons 2–3: student walkthrough

Both assignments from PR #488, done as an Algebra I student in a real browser, following
[`ALGEBRA1_M2T2_STUDENT_WALKTHROUGH_BRIEF.md`](ALGEBRA1_M2T2_STUDENT_WALKTHROUGH_BRIEF.md).

**Headline:**
- **P0 — phones:** a student can't press **Check** on any Graphing item. The graph panel stays pinned on screen and covers the button.
- **P1 — graph previews:** the preview choices never drew anything; fixed here.
- **P1 — read aloud:** f(x − 7) and f(x) − 4 sounded the same; fixed here.
- **P1 — perpendicular figures:** L3's "rotated 90°" figures draw the two lines meeting at about 30°.
- **P1 — Transformations Lab feedback:** it misses the lesson's central idea.

Everything else grades right.

## 1. Environment

| | |
| --- | --- |
| Branch | `claude/m2t2-student-walkthrough`, on PR #488's `claude/cool-gates-1vqc2r` at `d6d33cd0` |
| What ran | The harness `tests/browser/algebra1Module2Topic2.html` (Vite on :5197, own `npm ci`): both lessons compiled through the teacher import chain and mounted in the real `QuestionEngine`. **A harness, not a signed-in session.** |
| Browser | Google Chrome (full, not headless shell), driven with Playwright. Every answer went through rendered controls: mouse clicks and touch taps on the grid, typing in MathLive fields, choice buttons, Check/Submit, Hint, Read aloud, Reset (with its confirmation), Clear/Start over, and a page reload. `window.__m2t2` was used only to change question and to read what was graded. |
| Viewports | 1366×768 (both lessons, every question); 820×1180 touch (L2 Warm-Up + Practice); 390×844 touch (L2 Warm-Up + Practice, plus L2 CW 1); 1920×1080 (L3 spot check) |
| Baseline | `check-teacher-import` 0 errors / 0 warnings for both; `algebra1Module2Topic2Lessons.test.mjs` 19/19; `algebra1Module2Topic2.mjs` 116 question views, all rendered. Its one finding was a `/favicon.ico` 404: full Chrome requests a favicon, the headless shell does not (P3, harness). |

## 2. Journeys

| Journey | Viewport | What the student did | Result |
| --- | --- | --- | --- |
| L2 whole lesson | 1366×768 | WU 1 → DOL 3 in order. Classic mistakes on CW 1, CW 3, CW 5, PR 4, PR 6, PR 7, PR 10, PR 11 and DOL 1 (below). Hint ×3 on CW 10, Read aloud on CW 3, CW 5, PR 1, PR 5 and PR 11, a reload mid-PR 3. | Every right answer graded right, every wrong one wrong. Findings P1-4, P1-5, P1-6, P1-8 and several P2s. |
| L3 whole lesson | 1366×768 | WU 1 → DOL 3 in order. Classic mistakes on WU 1, WU 3, CW 1, CW 4, CW 5, CW 6, CW 8, CW 10, CW 11, PR 1, PR 6, PR 8 and PR 12; Reset with its confirmation on CW 5. | Grading right throughout. Findings P1-1, P1-2, P1-3, P1-7. |
| L2 Warm-Up + Practice | 820×1180 touch | Tapped WU 1, PR 1, PR 9 and PR 12 to completion; screenshot of every question | All graded right; no horizontal overflow |
| L2 Warm-Up + Practice + CW 1 | 390×844 touch | Same taps | **P0-1**: WU 1's Check button can't be reached. The lab items (PR 1, PR 9) and PR 12 completed. Grid starts 909–953 px down. |
| L3 spot check | 1920×1080 | WU 1, CW 1, CW 6, PR 6, PR 9 | No overflow; same findings as at 1366 |
| Exit tickets | 1366×768 | All six DOLs | No Check, no verdict, no Hint on the multi-part DOLs. Enter never submitted. One submission recorded per Submit. The lab DOL keeps its supports (P1-9). |

The literal order:
1. **L2:** WU 1–3, CW 1 (up-3 mistake → reversed order → in order), CW 2–10, PR 1, 2, 4, 5, 6, 3 (with the reload), 7–13, DOL 1–3.
2. **L3:** WU 1–3, CW 1–11, PR 1, 5, 2, 3, 4, 8, 10, 11, 12, 6, 7, 9, DOL 1–3.
3. **Touch passes.**
4. **The 1920 spot check.**

## 3. Findings

### P0

**P0-1 — On a phone, Graphing items can't be checked.**
- *Symptom:* At 390×844, the "Check construction" button on L2 WU 1 is drawn under the graph.
  - A tap at the button's centre lands on the grid (`elementFromPoint` → the plane's `<rect>`).
  - Playwright's tap retried for 30 s and reported "svg … intercepts pointer events".
  - The same item works at 820 and 1366.
  - Affected: every Graphing (`graphing2`) item. Here that is L2 WU 1 and L3 CW 8, CW 9 and PR 6.
  - The Transformations Lab is not affected, because its Check button sits inside the graph panel.
- *Where:* `src/components/student/MathToolMobileLayout.css:775-789`. At ≤768 px portrait, the first `.mathmaster-tool-panel` holding an `svg[role=application]` becomes `position: sticky` with `max-height: 46dvh` (388 px here). Graphing's second panel ("Your construction", with Check) is 269 px tall, shorter than the sticky graph, so at every scroll position the graph covers it.
- *Why it matters:* The student cannot submit the item at all on a phone.
- *Suggested fix:* Only pin the reference panel while an editor in the second panel has focus. That is the rule `WorkViewShell.css:268` already uses for Work View. Alternatively, keep the second panel's action row clear of the sticky region with a sticky-bottom action row.
- *Not fixed here:* the rule is shared mobile layout that the Work View browser matrix certifies, so the fix belongs in its own PR. Screenshot: `l2-phone-wu1-check-covered-by-sticky-graph.png`.
- *Fixed after this walkthrough:* the pin is gone, and the graph scrolls with its controls as it does in Work View. `tests/browser/phoneToolPanelReach.mjs` taps each Graphing item's Check by touch at 390×844 and 360×640, and runs in the student-runtime gate. Screenshot: `l2-phone-wu1-check-reachable-after-fix.png`.

### P1

**P1-1 — Graph-preview choices drew nothing — fixed in this PR.**
- *Symptom:* On L3 CW 6, CW 7 and PR 7 ("Select a choice to see it drawn"), picking an option drew nothing, and the live region said **"Showing c on the graph."**
- *Where:* `src/platform/workflow/WorkflowRunner.jsx` `ChoicePreviewGraph` drew `previewFigures(value)`. A teacher-import choice is `{ id, label }`, and the step stores the **id**, while `choicePreviewProblems` validates the **labels**. So the import passed and the screen stayed blank.
- *Why it matters:* The scaffold the lesson was built around (watch "x = 4" be vertical, decide) did not exist.
- *Fix:* `choicePreviewLabel(stage, value)` in `functions/shared/toolMath/workflow/choicePreview.mjs`, used by the component. Tests in `tests/platform/choicePreview.test.mjs` fail without it. Screenshots: `l3-laptop-cw6-preview-draws-nothing.png` → `l3-laptop-cw6-preview-fixed.png`.

**P1-2 — PR 7's given line was not drawn — fixed in this PR.**
- *Symptom:* The prompt says "The graph shows y = −(1/2)x + 4 and the point (1, −1)". Only the point was shown.
- *Where:* `ChoicePreviewGraph` drew only a string `graph.model`. This step authors the line as structured `graph.functions`.
- *Fix:* `previewGivenEvaluators()` draws both forms; tested. Screenshots: `l3-laptop-pr7-given-line-missing.png` → `l3-laptop-pr7-preview-fixed.png`.

**P1-3 — Read aloud made opposite transformations sound the same — fixed in this PR for f(x − 7) and j(x).**
- *Symptom:*
  - PR 1 "Graph g(x) = f(x − 7)" and PR 5 "Graph g(x) = f(x) − 4" were read "g of x equals f of x minus 7" and "… f of x minus 4".
  - The inside/outside distinction this lesson teaches was inaudible.
  - CW 5 read j(x) = 2x − 1 as "**j times the quantity x** equals 2x minus 1".
- *Where:* `src/platform/language/speechText.js`. The function rule spoke any argument as "f of …", and `j` was missing from `FUNCTION_LETTERS`.
- *Fix:*
  - An argument of more than one term is now "f of **the quantity** x minus 7" (and "f de la cantidad …" in Spanish).
  - A single signed term stays "f of negative 3".
  - `j` is a function letter. Point-slope `m(x − 6)` is still a product.
  - Tests in `tests/platform/accessibleMathSpeech.test.mjs` fail without the fix.
- *Still open:* L2 CW 9's c(x) and d(x) and PR 13's m(x) and n(x) are still read as products ("c times the quantity x"). c, m and n are deliberately products elsewhere. See R-5.

**P1-4 — L3's "90° rotation" figures don't show a right angle.**
- *Symptom:*
  - On L3 CW 1, line B (slope 1/3) is drawn at 3.1° and its "90° rotation" B′ (slope −3) at −26.2°. **They meet at about 30° on screen** (`l3-laptop-cw1-right-angle-at-30-degrees.png`).
  - The y-axis runs −30 to 40, so "read the slope of B′ from the graph" is also hard.
  - CW 2 is the same: y is re-framed to −30…30.
- *Where:* The author set a square window (x and y both −9…9). `fitStaticGraphViewport` (`src/graphSpecUtils.js:298`) widens y to keep the steep line in frame, and `GraphDisplay`'s plot area is 524 × 334, not square.
- *Why it matters:* The lesson says "rotate 90° to get a perpendicular line", and the picture contradicts it.
- *Why it is not fixed in the content:*
  - Locking an equal-unit window (`lockViewport`, x : y = 1.57) does draw a true right angle.
  - But Pre-Flight then warns that the steep line is "mostly outside the visible y-range". With equal units, one line of any perpendicular pair steeper than 1 always is.
  - The lesson test rightly requires zero warnings, so this needs R-1.

**P1-5 — The lab scores the right points 20% when they are plotted out of order (hypothesis 1).**
- *Symptom:* On L2 CW 1, the five correct image points plotted from S5 to S1 scored **20%**, with "1 of 5 defining points are in the correct transformed locations. Use x/b + h for x and ay + k for y." Nothing mentions order.
- *Why it matters:* A student who did the mathematics right is told 4 of 5 points are wrong. Only the small P1–P5 labels hint at the order (`l2-laptop-cw1-correct-points-reversed.png`).
- *Suggested fix:* When the plotted set equals the target set, say "You found every image point; P1 must be S1's image — plot them in order, or drag to swap". See R-4.

**P1-6 — The lab's feedback misses the lesson's key idea.**
- *Symptom:*
  - On CW 1, moving every point up 3 (the classic mistake) draws exactly t(x)'s line through the wrong points.
  - It is graded 0/5, which is the lesson's intent (`l2-laptop-cw1-up3-mistake.png`).
  - But the feedback is "0 of 5 … Use x/b + h for x and ay + k for y." Nothing says "your line is right; each point should move LEFT 3 from its own S".
  - The formula uses b and h, which the item never defines. The always-open "Transformation bridge" covers quadratic, log and reciprocal families.
- *Suggested fix:* Detect "same line, wrong correspondence" and say so in Algebra I words. See R-4.

**P1-7 — L3 CW 3 printed an answer in a later label — fixed in this PR (content).**
- *Symptom:* Part 2 asks "The slope of line q is m₂ = …" with −a/b among the choices. Part 3's label read "So m₁ · m₂ = (b/a)(−a/b) = ?".
- *Fix:* The label is now "So m₁ · m₂ = ?". Answer unchanged, and the lesson test stays 19/19.

**P1-8 — A right equation in the wrong form gets no reason (hypothesis 7).**
- *Symptom:*
  - On L3 CW 1, `y − 5 = −3(x − 0)` (the right line, in point-slope form) got only "Focus on: Equation of line B′ in slope-intercept form."
  - CW 11's `−1 = y` got "Focus on: A horizontal line through (2, −1)."
  - Meanwhile `y = 3 − 2x` (PR 4) and `y = x/3` (PR 3) were accepted.
- *Why it matters:* The student can't tell "wrong line" from "wrong form", and the strictness looks arbitrary: swapped terms are accepted, swapped sides refused.
- *Suggested fix:* "This is the right line, in point-slope form. Write it as y = mx + b." Treat `−1 = y` like `y = −1`. See R-3.

**P1-9 — The lab's exit ticket keeps its method supports.**
- *Symptom:*
  - L2 DOL 1 keeps "How to do this (3 steps)" ("Map each point using x/b + h and ay + k").
  - It also keeps the open Transformation bridge.
  - Its submit button still says **"Check graph"**.
  - The multi-part DOLs hide Hint, Vocabulary and Read aloud.
- *Suggested fix:* The DOL policy should hide tool method panels and label the action "Submit". See R-10.

### P2

- **Grids are not square.** The Graphing and lab grids are about 23.8 × 14.8 px per unit at 1366 (30 × 18.5 on the lab). f(x) = x is drawn at about 32°, and every slope looks flatter than it is. This is the root of P1-4, and it makes PR 7's preview a poor visual check: the correct perpendicular line meets the given one at about 68° on screen.
- **Hypothesis 8, phone.**
  - The grid starts 909–953 px down: **953 on L2 CW 1**, more than one 844 px screen.
  - The sticky task card, tries counter and grade-weight banner take about 380 px of the screen, and the bottom toolbar about 140 (`l2-phone-wu1-header-takes-half-the-screen.png`).
  - The Support Tools row slides under the "3 of 3 tries left" banner.
  - The grid is 290 × 197 px for −10…10, about 10 px per unit vertically, so precise taps rely on "slide to aim".
- **MathLive pulls a bracket into a fraction.** Typing `y-2=-1/2(x-6)` produced −1/(2(x − 6)). A letter ends the denominator (`-9/5x+18` was fine) but "(" does not. This lesson's students write fraction-slope point-slope constantly.
- **L2 CW 9's table (hypothesis 9).** It reads x | f(x) | c(x) | **input of d** | d(x), and nothing explains that a row maps (x, f(x)) to (input of d, d(x)). "input of d" is set in a different font from the math headers. A column-group header or two tables would fix it (`l2-laptop-cw9-input-of-d-table.png`).
- **Graph-sort thumbnails.** L2 PR 8 and L3 PR 9 tick labels are about 5 px at 1366 (`l2-laptop-pr8-tiny-tick-labels.png`). PR 9 does not draw the reference line y = 2x + 1.
- **Graph-sort buttons.** A choice shows only as a background colour, with no `aria-pressed`. Clicking the chosen category again silently deselects it.
- **Names reused within the lesson.** b(x) is "j shifted right 2" in L2 CW 6 and "inputs × 1/2" in CW 10. PR 13 names functions m(x) and n(x), then uses m for slope and n for distance.
- **Horizontal/vertical feedback.** L3 CW 8: drawing x = −2 for y = −2 gets "the y-intercept is usually easiest", not "your line is vertical; y = −2 is horizontal".
- **Input types differ.** L2 CW 6 uses plain text inputs for "Simplify" while CW 3 and CW 5 use math fields for the same kind of answer.
- **Stretched static graphs.** L2 WU 2's graph is stretched to y −50…30, flattening y = 3x − 8, and WU 3's to 20.
- **PR 10's point map** draws g(x) dashed, which narrows "where does (2, 2) land" to a point on that line.

### P3

- **Feedback punctuation:** "Focus on: Write t(x) in terms of f(x)., Simplify: t(x) =." has doubled punctuation.
- **Placeholder:** "for exampl…" is truncated in narrow expression fields.
- **Lab labels:** they crowd the origin ("S2" on "0"), and the CORRECT watermark sits over the grid.
- **Sort wording:** text-only sort cards are called "FIGURE n", and the step says "Match each figure".
- **Read aloud:** it reads the task only, not the answer choices.
- **Harness, favicon:** the page declares no favicon, so the baseline script reports a 404 in full Chrome.
- **Harness, attempts:** it passes `questionRecord={null}`, so tries never count down (`QuestionEngine.jsx:414` takes them from the record). An exit ticket also accepted a second submission. Single submission is therefore *not verified* here; see §8.

## 4. Answer acceptance

| Typed | Expected | Where | Accepted? |
| --- | --- | --- | --- |
| `(8/3,0)` typed straight through | (8/3, 0) | L2 WU 2 | yes ("," leaves the fraction) |
| `(7.5,0)` | (15/2, 0) | L2 WU 3 | yes |
| `-2/3` | −2/3 | L2 WU 3 | yes |
| `−8/5`, `−0.8`, `0.8`, `8/5`, `−2.5`, `−5/4`, `1.25`, `5/2` | the c(x) and d(x) table | L2 CW 9 | all yes |
| `4-x` | −x + 4 | L2 PR 13 | yes |
| `0.625`, `−1.6` | 5/8, −8/5 | L3 WU 2 | yes |
| `−0.1` (Unicode minus) | −1/10 | L3 WU 3 | yes (MathLive normalises it) |
| `y=-0.5x+8` | y = −(1/2)x + 8 | L3 CW 2 | yes |
| `y=x/3` | y = (1/3)x | L3 PR 3 | yes |
| `y=3-2x` | y = −2x + 3 | L3 PR 4 | yes |
| `y=-9/5x+18` typed straight through | y = −(9/5)x + 18 | L3 PR 5 | yes |
| `y-5=-3(x-0)` | y = −3x + 5 | L3 CW 1 | **no**, with no form message (P1-8) |
| `-1=y` | y = −1 | L3 CW 11 | **no**, with no form message (P1-8) |
| `y-2=-1/2(x-6)` | (point-slope) | L3 PR 1 | became −1/(2(x − 6)) in the field (P2) |

## 5. The student experience

- **L2 Warm-Up (10 min).**
  - Graphing g(x) = 3x − 8 and reading its features is quick.
  - The live "Your line: y = 3x − 8" readout before checking is a good self-check.
  - "Focus on: Range" names the wrong part without giving it away.
  - Estimate: under 10 minutes.
- **L2 Classwork (30 min).**
  - The lab makes "same line, different points" *visible*: the up-3 and left-3 segments sit on one line. But the feedback never says so (P1-6).
  - The Transformation bridge is a wall of a·f(b(x − h)) + k beside a question about f(x) = x moved left 3.
  - CW 9's ten-cell table is the slowest item, about 5 minutes, and its "input of d" column needs a second read.
  - Estimate: 30–35 minutes, if the student does not get stuck on CW 1's feedback.
- **L2 Practice (38 min).**
  - Six quick lab items, then the describe and sort items.
  - The ×½-inside mistake on PR 7 got a precise "Focus on" for exactly those two parts.
  - The point map's "The y-coordinate is right. The x-coordinate is not: only h moves a point horizontally." is the best feedback in the lesson.
  - Estimate: 30–40 minutes.
- **L2 DOL (12 min).**
  - Clean on the multi-part items.
  - The lab DOL still offers its method (P1-9).
- **L3 Warm-Up (12 min).**
  - The rotation answers are typed beside a static graph. Fine, but there's no rotation to *see* (hypothesis 5).
- **L3 Classwork (30 min).**
  - CW 1's lines that "meet at a right angle" visibly don't (P1-4). A careful student will doubt the theorem.
  - The CW 3 proof chain is good once the label leak is fixed.
  - The graph previews were dead before this PR's fix (P1-1).
  - CW 8 and CW 9 are quick.
- **L3 Practice (36 min).**
  - PR 1–5 are three-part writing items. The bare "Focus on" after a right line in point-slope form will cost real students retries (P1-8).
  - PR 6's prompt gives the slope away (hypothesis 4).
  - Estimate: 35–45 minutes. This section is the most likely to run long.
- **L3 DOL (12 min).** Clean.

## 6. Platform upgrades, ranked

| # | Concept | What a student would see | Files | Size | Answers |
| --- | --- | --- | --- | --- | --- |
| **R-1** | Perpendicular slopes, every graph | Equal-unit planes: a right angle looks like one and slopes look their size. An `equalUnits` option, on by default for line figures. Pre-Flight's "mostly outside the visible range" rule exempts lines in a locked equal-unit window. | `GraphDisplay.jsx`, `CoordinatePlane`, `graphSpecUtils.js` `fitStaticGraphViewport`, semantic validator | M | P1-4, P2 grids, hyp. 6, hyp. 10 |
| **R-2** | Every phone tool | The pinned reference never covers the answer panel's actions, and the header compacts on a phone. | `MathToolMobileLayout.css`, graphing2 layout | S–M | P0-1, hyp. 8 |
| **R-3** | Writing equations | "Right line, wrong form — write it as y = mx + b"; `−1 = y` treated like `y = −1`. | shared equation grader and feedback | S–M | P1-8, hyp. 7 |
| **R-4** | Transformations | Lab feedback that knows "every point found, out of order" and "same line, wrong correspondence"; S→P arrows on check; Algebra I wording unless the item uses a, b, h and k. | Transformations Lab feedback and review | M | P1-5, P1-6, hyp. 1, hyp. 2 |
| **R-5** | Function notation | Names defined in the prompt ("c(x) changes …") are read as functions for that question. | `speechText.js` (+ prompt context) | S | P1-3 remainder |
| **R-6** | Transformations | Linear in the lab's describe, match and identify modes: slide h and k and watch left 3 land on up 3. | `transformationsLabReview.js` `READABLE_FAMILIES` | M | hyp. 3 |
| **R-7** | Perpendicular slopes | Graphing 2 reference-line mode: the given line is drawn and the slope is not printed. | Graphing 2 | M | hyp. 4 |
| **R-8** | Perpendicular slopes | A "rotate 90° about this point" interaction with a right-angle marker. | new tool mode | L | hyp. 5 |
| **R-9** | Perpendicular slopes | Authorable per-axis scale with a "fix the scale" toggle, for "Things Aren't Always What They Seem". | builds on R-1 | M | hyp. 6 |
| **R-10** | Every tool exit ticket | DOL hides tool method panels and labels the action "Submit". | tool panels' DOL policy | S | P1-9 |
| **R-11** | Equations | A fraction does not pull a following bracket into its denominator. | MathLive configuration | M | P2 |
| **R-12** | QA | The walkthrough harness passes a simulated question record, so attempts and single DOL submission can be tested. | `tests/browser/algebra1Module2Topic2Main.jsx` | S | §8 |

Hypothesis 10:
- **Is it too easy?** No. All four of PR 7's options pass through (1, −1), so previewing does not give away the answer. The student still has to judge the right angle.
- **Does it work as a visual check?** Not until R-1. On a non-square grid the correct line looks about 68° off the given one.

## 7. Evidence

Screenshots in `docs/qa/screenshots/m2t2/`:
- `l2-laptop-wu2-focus-on-range.png`
- `l2-laptop-cw1-up3-mistake.png`
- `l2-laptop-cw1-correct-points-reversed.png`
- `l2-laptop-cw9-input-of-d-table.png`
- `l2-laptop-pr8-tiny-tick-labels.png`
- `l3-laptop-cw1-right-angle-at-30-degrees.png`
- `l3-laptop-cw6-preview-draws-nothing.png`
- `l3-laptop-cw6-preview-fixed.png`
- `l3-laptop-pr7-given-line-missing.png`
- `l3-laptop-pr7-preview-fixed.png`
- `l2-phone-wu1-check-covered-by-sticky-graph.png`
- `l2-phone-wu1-header-takes-half-the-screen.png`
- `l2-phone-cw1-grid-below-first-screen.png`
- `l2-ipad-pr1-top.png`

## 8. Not verified

- **No real session:** no signed-in student and no Firebase. Drafts, attempts and grades went to the harness, not the server.
- **Attempts:** attempt counting, "N tries left", and single DOL submission all come from the server's question record. The harness passes none (P3), so they are not verified here.
- **Devices:** no physical iPad or phone. Touch was Chrome's emulation.
- **Not exercised:** Classroom posting, the teacher view, the Scratchpad, the Calculator, and Enlarge.
- **Timing:** these are estimates. The walk was scripted, so times are not a student's.

## Ride-along changes in this PR

1. **L3 CW 3** (content): the product's label no longer prints m₂.
2. **Graph-preview choices** draw the selected label and the given line: `choicePreview.mjs`, `WorkflowRunner.jsx`, tests.
3. **Read aloud:** "f of the quantity x minus 7", and j(x) as a function: `speechText.js`, tests.
