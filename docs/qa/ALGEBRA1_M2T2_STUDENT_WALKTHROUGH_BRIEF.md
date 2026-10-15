# Student walkthrough brief — Algebra I Module 2 Topic 2, Lessons 2 and 3

**For:** a Claude Code session on Linux with Chromium + Playwright (the cloud
container has both: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, Playwright at
`/opt/node22/lib/node_modules/playwright`).
**Assignments under test** (each one 90-minute lesson in four sections):

| File | Lesson | TEKS | Questions (WU / CW / PR / DOL) |
| --- | --- | --- | --- |
| `teacher-import-jsons/algebra1-module2-topic2/L2_Vertical_and_Horizontal_Transformations_of_Linear_Functions.json` | Vertical and Horizontal Transformations of Linear Functions | A.3E (A.3C, A.2A) | 3 / 10 / 13 / 3 |
| `teacher-import-jsons/algebra1-module2-topic2/L3_Slopes_of_Perpendicular_Lines_and_Horizontal_Vertical_Lines.json` | Slopes of Perpendicular Lines and Horizontal & Vertical Lines | A.2F, A.2G (A.2E, A.3A) | 3 / 11 / 12 / 3 |

Source material: the district's Bluebonnet lesson slides *AlgI M2 T2 L2* and
*L3* (2025). Every activity in the slides has a home in the assignment —
Getting Started → Warm-Up, Activities 2.1–2.2 / 3.1–3.2 → Classwork,
Activity 2.3 / 3.3 + Talk the Talk → Practice, and an exit ticket → DOL.

## Your mission

Do both assignments **as an Algebra I student would**, start to finish, in a
real browser. Then think like the platform's product engineer: **what would
make MathMaster present these two concepts better?** The deliverable is a
findings report and a ranked list of platform upgrades — not edits to the
assignment JSON to hide what you find.

Two things you are judging, kept apart:

1. **Does the platform work?** Anything that loses work, grades a right answer
   wrong (or a wrong one right), blocks progress, leaks an answer, or breaks a
   layout is a finding with a severity.
2. **Does the platform teach this well?** Where did a tool make the idea
   clearer than the paper slide — and where did it get in the way, hide the
   idea, or do the thinking for the student? Those are upgrade ideas.

## Set up (offline — no Firebase, no real students)

```bash
npm ci                                                   # once
npx vite --host 127.0.0.1 --port 5197 --strictPort &     # dev server
AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra1Module2Topic2.mjs   # baseline: every question renders
```

The harness page is `http://127.0.0.1:5197/tests/browser/algebra1Module2Topic2.html`:

| Query | Meaning |
| --- | --- |
| `?lesson=l2` / `?lesson=l3` | which lesson (L2 is the default) |
| `?q=l2-cw-1` | open on one question |
| `?run=<name>` | a fresh student — drafts are per run, so use a new name per journey |

It mounts the assignment **compiled through the teacher import chain**
(parse → Pre-Flight review → Pre-Flight model → validate → rebuild sections) in
the real `QuestionEngine`, exactly as `tests/browser/linearMultipleRepresentationsMain.jsx`
does. `window.__m2t2` is read-only: `ids()`, `go(id)`, `question(id)`,
`drafts()`, `grades()`, `preflight()`. Use it to navigate and to *read* what
was saved or graded — **never to write state**. Everything a student does must
go through rendered controls: clicking/tapping the grid, dragging points,
typing in MathLive fields, choosing options, pressing Check/Submit, using
Hint, Undo, Reset, Enlarge, the Scratchpad and the Calculator.

Before you start, check the assignment compiles the same way here:

```bash
node scripts/check-teacher-import.mjs teacher-import-jsons/algebra1-module2-topic2/*.json --verbose
node --test tests/platform/algebra1Module2Topic2Lessons.test.mjs
```

## How to walk it

Work every question in order, the way a student in a 90-minute block would —
then go back and do the things real students do:

- **Wrong first, on purpose,** at least once per tool: the classic mistakes for
  these lessons are listed below. Read the feedback as a student: does it say
  *what* is wrong without giving the answer away?
- **Use the supports** — Hint (once, twice, three times), "How to do this",
  Learning goal, Vocabulary, Read aloud, Scratchpad, Calculator.
- **Interrupt yourself:** reload mid-question, switch questions and come back,
  Undo several steps, Reset, Enlarge the graph and work there.
- **Time yourself** per section against the recommended minutes
  (L2: 10 / 30 / 38 / 12, L3: 12 / 30 / 36 / 12). Note any item that would
  clearly take a real student much longer or shorter than intended.
- **Viewports:** the whole of one lesson at 1366×768 (laptop); Warm-Up +
  Practice of the other at 820×1180 touch (iPad) and 390×844 touch (phone);
  spot-check 1920×1080 (a laptop zoomed out).
- **DOL:** confirm there is no Check, no verdict, no hint, Enter never submits,
  and exactly one submission.

### Classic student mistakes to try

| Lesson | Mistake | Where |
| --- | --- | --- |
| L2 | f(x + 3) moves **right** 3 | `l2-cw-3`, `l2-pr-6`, `l2-pr-11`, `l2-dol-1` |
| L2 | For "left 3", move every point **up** 3 (same line, wrong corresponding points) | `l2-cw-1` — the lab should mark it wrong; does the student understand why? |
| L2 | f((1/2)x) is a **compression** by 1/2 | `l2-pr-4`, `l2-pr-7` |
| L2 | j(x + 4) = 2x + 4 (forgetting to distribute) | `l2-cw-5` |
| L2 | Plot P1…P3 out of order | any `plotTransform` item |
| L3 | Perpendicular slope of 4 is −4 (opposite, not reciprocal) or 1/4 (reciprocal, not opposite) | `l3-cw-4`, `l3-pr-12` |
| L3 | Slope of a vertical line is 0; of a horizontal line "undefined" | `l3-cw-10`, `l3-pr-8` |
| L3 | x = 4 for a horizontal line through (4, 4) | `l3-cw-6` |
| L3 | Answer in point-slope form where slope-intercept is asked; `-1 = y` for `y = -1` | `l3-pr-1`…`l3-pr-5`, `l3-cw-11` |
| L3 | Using the given line's slope instead of the perpendicular one when graphing | `l3-pr-6` |

## Hypotheses to confirm or refute

These came up while authoring. Each is a question for you, not a conclusion —
verify it in the browser and report what you actually saw.

1. **The Transformations Lab grades plotted points in plotting order** (P1 must
   be S1's image). Is that obvious to a student, and is "3 of 5 defining points
   are in the correct transformed locations" enough to recover from plotting
   out of order?
2. **The lab draws the source as a segment through S1…Sn, not a line**, and
   draws the student's P points as a segment too. Does a student see "the graph
   of f(x) = x" and "the graph of t(x)"? Would an option to extend both to full
   lines (with arrows and labels) teach translation-vs-correspondence better?
3. **Linear `describe`, `match` and `identify` modes are off-limits** for these
   lessons: the lab's solution review has no linear family
   (`src/tools/shared/reviews/transformationsLabReview.js` `READABLE_FAMILIES`),
   and `tests/tools/transformationsLabSolutionReview.test.mjs` pins that. The
   lesson's best exploration — slide a, h, k and watch "left 3" and "up 3" land
   on the same line — therefore isn't in the assignment. How much would adding
   linear to the review be worth?
4. **Graphing 2 always prints its target** ("Graph the line through (−2, 4)
   with slope −0.5"). There is no "perpendicular to this reference line" mode
   that draws the reference line and hides the slope, so `l3-pr-6` states the
   slope in its prompt. What would a reference-line mode look like?
5. **There is no rotation tool.** The Getting Started rotation of segment AB
   (`l3-wu-1`) is typed ordered pairs beside a static graph. Is a drag/rotate
   (or "rotate 90° about this point") interaction worth building for the
   perpendicular-slope proof?
6. **Unequal axis scales cannot be shown.** The slides' "Things Aren't Always
   What They Seem" depends on a graph whose x-axis counts by 2s; `l3-pr-10`
   describes that sketch and shows the true, equal-scale picture instead. Would
   an authorable per-axis scale (with a "fix the scale" toggle) teach it better?
7. **Equation entry is form-strict**: `y = 5 − (1/2)x` is accepted for
   `y = −(1/2)x + 5`, point-slope is refused where slope-intercept is asked,
   and `−1 = y` is refused for `y = −1`. Is the refusal message clear about
   *form* versus *value*?
8. **On a 390×844 phone the grid starts below the first screen** — about
   950 px down on `l2-cw-1` — after the task card, Learning goal, tries counter
   and the "Grade weight ×1.5" banner (the harness's question nav adds some of
   that; the real player has its own header). How many scrolls does a student
   need before touching the grid, and is the grid big enough to tap a point
   precisely once they get there?
9. **`l2-cw-9`'s table** puts c(x)'s and d(x)'s columns side by side (as the
   slide does). Is "input of d" clear, or does the table need two tables / a
   column-group header?
10. **Graph-preview choices** (`l3-cw-6`, `l3-cw-7`, `l3-pr-7`) draw the chosen
    line. Does previewing make `l3-pr-7` (perpendicular through a point) too
    easy, or is it exactly the visual check this lesson wants?

## What to deliver

Write `docs/qa/algebra1-m2t2-student-walkthrough.md`, modelled on
`docs/qa/linear-multiple-representations-pr397-student-qa.md`:

1. **Environment** — branch, commit, viewport list, "harness, not a signed-in
   session".
2. **Journeys** — a table: journey · viewport · what the student did · result,
   and the literal order you worked in.
3. **Findings P0–P3** (P0 = cannot finish, loses work, or grades wrongly;
   P1 = misleads or blocks a typical student; P2 = friction; P3 = polish). Each
   P0/P1 gets Symptom / Where (file:line) / Why it matters / Suggested fix.
4. **Answer acceptance** — every answer you typed in a non-obvious form and
   whether it was accepted (fractions, decimals, `\frac`, Unicode minus,
   rearranged equations).
5. **The student experience** — per section: what felt intuitive, what was
   confusing, what needed guessing or extra scrolling, time taken vs. the
   recommended minutes.
6. **Platform upgrades, ranked** — R-1, R-2, … each with: the concept it serves
   (transformations / perpendicular slopes / horizontal-vertical lines), what a
   student would see, the files it touches, a rough size (S/M/L), and which
   hypothesis above it answers. Put the ones that would improve *many* lessons
   first.
7. **Evidence** — screenshots in `docs/qa/screenshots/m2t2/`, named
   `<lesson>-<viewport>-<question>-<what>.png`, referenced from the findings.
8. **Not verified** — anything you could not check (real Firebase session,
   physical iPad, Classroom posting).

Rules for the PR you open:

- Follow `AGENTS.md` — especially "the failure that will most likely stop you"
  and "assertions must be able to fail".
- **Do not edit the assignment JSON to make a finding go away.** If a question
  itself is wrong (bad key, misleading wording), fix it in its own commit, say
  why, and keep `tests/platform/algebra1Module2Topic2Lessons.test.mjs` green.
- Small, certain platform fixes may ride along, each with a test that fails
  without it. Anything bigger goes in the R-list, not the diff.
- Run the gate before pushing: `npm run test:platform`, `npm run test:authoring-v5`,
  `npm run lint`, `npm run build`, `npm run build:firebase`, and the harness.
- Delete `tests/browser/artifacts/` output from the commit (it is git-ignored);
  only curated screenshots go in `docs/qa/screenshots/m2t2/`.

## Prompt to start the session

> Read `docs/qa/ALGEBRA1_M2T2_STUDENT_WALKTHROUGH_BRIEF.md` and `AGENTS.md`.
> Then do both Algebra I Module 2 Topic 2 assignments as a student in Chromium,
> exactly as the brief describes, and write
> `docs/qa/algebra1-m2t2-student-walkthrough.md` with your findings and a ranked
> list of platform upgrades for presenting these concepts. Open a PR with the
> report and screenshots.

## Answer key (generated from the compiled assignments)

For checking the platform's verdicts — not for skipping the thinking. Do each
question yourself first.

#### L2

| Question | Tool | Key |
| --- | --- | --- |
| `l2-wu-1` | graphing2/slopeIntercept | y = 3x + -8 |
| `l2-wu-2` | multiAnswer | domain: `All real numbers` · range: `All real numbers` · xint: `(8/3, 0)` · yint: `(0, -8)` · slope: `3` · behavior: `Increasing` |
| `l2-wu-3` | multiAnswer | domain: `All real numbers` · range: `All real numbers` · xint: `(15/2, 0)` · yint: `(0, 5)` · slope: `-2/3` · behavior: `Decreasing` |
| `l2-cw-1` | transformationsLab/plotTransform | (-5, -2) → (-4, -1) → (-3, 0) → (-2, 1) → (-1, 2) (P1…Pn in order) |
| `l2-cw-2` | transformationsLab/plotTransform | (-2, 1) → (-1, 2) → (0, 3) → (1, 4) → (2, 5) (P1…Pn in order) |
| `l2-cw-3` | multiAnswer | hInputs: `Input values (x)` · vOutputs: `Output values (y)` · tTerms: `f(x + 3)` · wTerms: `f(x) + 3` · tSimplified: `x+3` · compare: `They are the same line.` |
| `l2-cw-4` | transformationsLab/plotTransform | (-5, -3) → (-4, -1) → (-3, 1) → (-2, 3) (P1…Pn in order) |
| `l2-cw-5` | multiAnswer | qTerms: `j(x) + 4` · rTerms: `j(x + 4)` · qSimplified: `2x+3` · rSimplified: `2x+7` · same: `No, they are parallel lines.` · upEquivalent: `8` |
| `l2-cw-6` | multiAnswer | bSimplified: `2x-5` · vSimplified: `2x-3` · same: `No — they are parallel lines 2 units apart.` · rule: `Only when the slope is 1` |
| `l2-cw-7` | transformationsLab/plotTransform | (-2, -4) → (-1, -2) → (0, 0) → (1, 2) → (2, 4) (P1…Pn in order) |
| `l2-cw-8` | transformationsLab/plotTransform | (-1, -2) → (-0.5, -1) → (0, 0) → (0.5, 1) → (1, 2) (P1…Pn in order) |
| `l2-cw-9` | table | 0:cx=-8/5, 1:cx=-4/5, 2:cx=0, 3:cx=4/5, 4:cx=8/5, 0:dx=-5/2, 1:dx=-5/4, 2:dx=0, 3:dx=5/4, 4:dx=5/2 |
| `l2-cw-10` | multiAnswer | abSame: `They are the same line, y = 2x.` · cdSame: `They are the same line, y = (4/5)x.` · factor: `1/n` · twoJ: `4x-2` · jTwoX: `4x-1` · holds: `linear functions whose graphs pass through the origin` |
| `l2-pr-1` | transformationsLab/plotTransform | (5, -2) → (7, 0) → (9, 2) (P1…Pn in order) |
| `l2-pr-2` | transformationsLab/plotTransform | (-2, -6) → (0, 0) → (2, 6) (P1…Pn in order) |
| `l2-pr-3` | transformationsLab/plotTransform | (-2, 0) → (0, 2) → (2, 4) (P1…Pn in order) |
| `l2-pr-4` | transformationsLab/plotTransform | (-4, -2) → (0, 0) → (4, 2) (P1…Pn in order) |
| `l2-pr-5` | transformationsLab/plotTransform | (-2, -6) → (0, -4) → (2, -2) (P1…Pn in order) |
| `l2-pr-6` | transformationsLab/plotTransform | (-7, -2) → (-5, 0) → (-3, 2) (P1…Pn in order) |
| `l2-pr-7` | multiAnswer | p1kind: `Right` · p1amt: `7` · p2kind: `Vertical stretch` · p2amt: `3` · p4kind: `Horizontal stretch` · p4amt: `2` · p6kind: `Left` · p6amt: `5` |
| `l2-pr-8` | figureMatch | 1*x + 8 → f(x) + 8; 2*x → 2f(x); 0.5*x → (1/2)f(x); 1*x - 7 → f(x − 7) |
| `l2-pr-9` | transformationsLab/plotTransform | (-2, 4) → (0, 0) → (2, -4) (P1…Pn in order) |
| `l2-pr-10` | transformationsLab/pointMap | (3, 7) |
| `l2-pr-11` | multiAnswer | correct: `No — +3 inside the parentheses moves the line left 3.` · vertical: `Up 3` · simplified: `x+3` |
| `l2-pr-12` | multiAnswer | gTerms: `f(x − 4) + 1` · gSimplified: `x-3` · hTerms: `3f(x) − 2` · hSimplified: `3x-2` |
| `l2-pr-13` | multiAnswer | mSimplified: `-x+4` · nSimplified: `-x+4` · same: `They are the same line.` · general: `A vertical shift of m·n units (up if m·n > 0, down if m·n < 0)` |
| `l2-dol-1` | transformationsLab/plotTransform | (-4, -2) → (-2, 0) → (0, 2) (P1…Pn in order) |
| `l2-dol-2` | multiAnswer | describe: `Right 2` · simplified: `3x-5` · vertical: `Down 6` |
| `l2-dol-3` | multiAnswer | changes: `input values (x-coordinates)` · sameAs4f: `f(4x)` · leftN: `moving it up n units` |

#### L3

| Question | Tool | Key |
| --- | --- | --- |
| `l3-wu-1` | multiAnswer | b90: `(-5, 8)` · b180: `(-8, -5)` · b270: `(5, -8)` |
| `l3-wu-2` | multiAnswer | ab: `5/8` · ab90: `-8/5` · ab180: `5/8` · ab270: `-8/5` · pattern90: `the negative reciprocal` · pattern180: `the same` |
| `l3-wu-3` | multiAnswer | r1: `1/3` · r2: `-1/10` · r3: `5` · r4: `-4/5` · nr: `-3/2` |
| `l3-cw-1` | multiAnswer | mB: `1/3` · mB2: `-3` · product: `-1` · eqB2: `y=-3x+5` · perpendicular: `Yes — they meet at a right angle.` |
| `l3-cw-2` | multiAnswer | mC: `-1/2` · mC2: `2` · product: `-1` · eqC: `y=-1/2x+8` · eqC2: `y=2x-7` |
| `l3-cw-3` | multiAnswer | D: `(b, −a)` · m2: `−a/b` · product: `-1` · theorem: `negative reciprocals` |
| `l3-cw-4` | multiAnswer | k1: `-3/2` · k2: `5/4` · k3: `1/3` · k4: `-1` · k5: `6` · k6: `-1/5` |
| `l3-cw-5` | figureMatch | m₁ = 2 and m₂ = −1/2 → Perpendicular; m₁ = 3/4 and m₂ = −4/3 → Perpendicular; m₁ = −5 and m₂ = 1/5 → Perpendicular; m₁ = 2/3 and m₂ = 2/3 → Parallel; m₁ = −1/4 and m₂ = −0.25 → Parallel; m₁ = 2 and m₂ = 1/2 → Neither; m₁ = −3/4 and m₂ = 3/4 → Neither; m₁ = 0 and m₂ is undefined → Perpendicular |
| `l3-cw-6` | graphChoicePreview | y = 4 |
| `l3-cw-7` | graphChoicePreview | x = 4 |
| `l3-cw-8` | graphing2/verticalHorizontal | y = -2 |
| `l3-cw-9` | graphing2/verticalHorizontal | x = 3 |
| `l3-cw-10` | multiAnswer | dyH: `0` · slopeH: `0` · dxV: `0` · slopeV: `undefined` · allV: `Always true` · allH: `Always true` · VH: `perpendicular` |
| `l3-cw-11` | multiAnswer | h: `y=-1` · v: `x=2` · perpX5: `y=0` · perpYm2: `x=5` |
| `l3-pr-1` | multiAnswer | m: `-1/2` · b: `5` · eq: `y=-1/2x+5` |
| `l3-pr-2` | multiAnswer | m: `4/3` · b: `-12` · eq: `y=4/3x-12` |
| `l3-pr-3` | multiAnswer | given: `-3` · m: `1/3` · eq: `y=1/3x` |
| `l3-pr-4` | multiAnswer | given: `1/2` · m: `-2` · eq: `y=-2x+3` |
| `l3-pr-5` | multiAnswer | given: `5/9` · m: `-9/5` · eq: `y=-9/5x+18` |
| `l3-pr-6` | graphing2/pointSlope | through (-2, 4), slope -0.5 |
| `l3-pr-7` | graphChoicePreview | y = 2x − 3 |
| `l3-pr-8` | multiAnswer | perpY: `y=3` · parY: `x=-4` · slopePerpY: `0` · slopeParY: `undefined` |
| `l3-pr-9` | figureMatch | 2*x - 4 → Parallel to y = 2x + 1; -0.5*x + 3 → Perpendicular to y = 2x + 1; 0.5*x + 1 → Neither; 2y = −x + 8 → Perpendicular to y = 2x + 1; x − 2y = 6 → Neither; y − 1 = 2(x + 3) → Parallel to y = 2x + 1; y = −2x + 1 → Neither |
| `l3-pr-10` | multiAnswer | ma: `1/2` · md: `-1/2` · product: `-1/4` · who: `Jackson — the product of the slopes is not −1.` |
| `l3-pr-11` | multiAnswer | AB: `1/2` · BC: `-2` · CD: `1/2` · DA: `-2` · rect: `Yes — opposite sides are parallel and adjacent sides are perpendicular.` |
| `l3-pr-12` | multiAnswer | correct: `No — she took the opposite but forgot the reciprocal.` · m: `-1/4` · eq: `y=-1/4x` |
| `l3-dol-1` | multiAnswer | m: `1/2` · eq: `y=1/2x-1` |
| `l3-dol-2` | multiAnswer | h: `y=-2` · v: `x=3` · slopeV: `undefined` |
| `l3-dol-3` | multiAnswer | given: `1/2` · eq: `y=-2x+8` |
