# Student walkthrough brief — Algebra II Module 1 Topic 2 Lesson 3, Solving Systems with Matrices

**For:** a Claude Code session on Linux with Chromium + Playwright (the cloud
container has both: `PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers`, Playwright at
`/opt/node22/lib/node_modules/playwright`).
**Assignment under test** (one 90-minute lesson in four sections):

| File | Lesson | TEKS | Questions (WU / CW / PR / DOL) | Minutes |
| --- | --- | --- | --- | --- |
| `teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json` | Solving Systems with Matrices | A2.3B (modeling items A2.3A) | 3 / 10 / 12 / 3 | 10 / 32 / 36 / 12 |

Source material: the district's lesson pages *Module 1 · Topic 2 · Lesson 3,
Solving Systems with Matrices* (pages 119–140). The book paces it as two
45-minute sessions, so it is one 90-minute assignment here:

| Book | Assignment |
| --- | --- |
| Getting Started — Track What Sold (Q1–7) | WU 1 (read the two arrays, money totals, least sold), WU 2 (add them) |
| "Recall … the multiplicative inverse is 1/n" (p. 126) | WU 3 |
| 3.1 Q1–2 shoe inventories (dimensions, aᵢⱼ, b₄₂ vs b₂₄) | CW 1, CW 2 |
| 3.1 Q3–7 sprinters (matrix multiplication), Joey's outer dimensions | CW 3, CW 4 |
| 3.1 Q8 A (2 × 4) · B (4 × 2) | PR 1 |
| 3.1 Q9 Jackson's reciprocal "inverse"; Q10 inverses with technology | CW 5, CW 6 |
| 3.2 Q1 worked example, Q2 write matrix equations, Q3 Nicky's error | CW 7, PR 4, CW 8 |
| 3.2 worked example X = A⁻¹B, Q7a | CW 9 |
| 3.2 Q4–5 Nia's singular matrix (many solutions) | CW 10 |
| 3.2 Q7b, 7c, 7d | PR 8, PR 6, PR 7 |
| 3.2 Q6 third equation for none / many | PR 9 |
| Talk the Talk — fruit baskets | PR 10 (modeling: the system is hidden) |
| Assignment Q1a, Q1b (inverses), Q2 (A⁻¹ and solve), Q4 theater tickets | PR 3, PR 2, PR 5, PR 11 |
| ACT-style transfer (Honors CCMR share) | PR 12 |
| Exit ticket | DOL 1 (multiply), DOL 2 (solve), DOL 3 (singular) |

Not carried over: the book's "describe in words" prompts (Q4 method, Q6/Q7
"which report is easier", Talk the Talk Q2 "is it always easier") — they are
class discussion. The Assignment's Prepare items (one-variable equations)
belong to the next lesson.

## The new platform pieces this lesson rides on

The platform had no matrix support beyond the Systems Workspace's 3 × 4 RREF
view, so this branch adds:

- **Matrix Lab** (`src/tools/matrixLab/`, tool id `matrixLab`), five views:
  `locate` (dimensions; tap aᵢⱼ; write the notation for an element described in
  words), `operate` (is A·B defined, its size, fill it row × column with the row
  and column lit up, judge inverses), `equation` (write A · X = B from a system
  not yet in standard form), `solve` (write A · X = B, use the calculator,
  report one / none / many and x, y, z; optional A⁻¹; modeling items hide the
  system) and `completeSystem` (write a third equation for no solution /
  infinitely many).
- **A matrix calculator** inside the lab ("technology" in A2.3B): only the
  commands a question allows (`[A]·[B]`, `[A]+[B]`, `[A]⁻¹`, `[A]⁻¹·[B]`),
  exact fractions with a ▸Dec view, and the calculator's own errors
  (`ERR: SINGULAR MATRIX`, `ERR: DIMENSION MISMATCH`). In a solve question it
  holds the A and B **the student wrote**, never a hidden key.
- **Exact grading** (`functions/shared/toolMath/matrixLab/`,
  `functions/shared/serverGrading/tools/matrixLab.mjs`): BigInt rationals; a row
  of A·X = B counts when it is a nonzero multiple of one of the equations in
  standard form (any order); decimals are accepted for a value without a short
  decimal when they carry ≥ 3 places and round correctly (3.3333 for 10/3, never
  3.3; 14.75 for 59/4, never 14.8).
- **Matrices in any question's prompt** (`matrices`, `matrixLayout`;
  `src/components/common/MatrixGrid.jsx`, `QuestionVisual.jsx`), on the
  printable worksheet, and in the answer-key PDF.
- A fix to the prompt splitter: "$20, $25, and $50" used to typeset as math.

## Your mission

Do the assignment **as an Algebra II Honors student would**, start to finish,
in a real browser. Then think like the platform's product engineer: **what
would make MathMaster present matrices and matrix equations better?** The
deliverable is a findings report and a ranked list of platform upgrades — not
edits to the assignment JSON to hide what you find.

Two things you are judging, kept apart:

1. **Does the platform work?** Anything that loses work, grades a right answer
   wrong (or a wrong one right), blocks progress, leaks an answer, or breaks a
   layout is a finding with a severity.
2. **Does the platform teach this well?** Where did the Matrix Lab make the
   idea clearer than the paper page — and where did it get in the way, hide the
   idea, or do the thinking for the student? Those are upgrade ideas.

## Set up (offline — no Firebase, no real students)

```bash
npm ci && (cd functions && npm ci)                       # once
npx vite --host 127.0.0.1 --port 5197 --strictPort &     # dev server
AUDIT_ORIGIN=http://127.0.0.1:5197 node tests/browser/algebra2MatricesLesson.mjs   # baseline: every question renders
```

The baseline opens all 28 questions at 1366×768 and at 390×844 by touch and
fails on an error card, a page error, sideways scroll, or a matrix squeezed
or cut off. It does not solve anything.

The harness page is `http://127.0.0.1:5197/tests/browser/algebra2MatricesLesson.html`:

| Query | Meaning |
| --- | --- |
| `?q=l3m-cw-3` | open on one question |
| `?run=<name>` | a fresh student — drafts are per run, so use a new name per journey |

It mounts the assignment **compiled through the teacher import chain**
(parse → Pre-Flight review → Pre-Flight model → validate → rebuild sections) in
the real `QuestionEngine`. `window.__matrices` is read-only: `ids()`, `go(id)`,
`question(id)`, `drafts()`, `grades()`, `preflight()`. Use it to navigate and
to *read* what was saved or graded — **never to write state**. Everything a
student does must go through rendered controls: tapping matrix cells, typing in
cells, Yes/No, the calculator buttons, ▸Frac/▸Dec, the solution-type buttons,
Check, Hint, Undo, Reset, Enlarge, the Scratchpad and the Calculator.

Before you start, check the assignment compiles the same way here:

```bash
node scripts/check-teacher-import.mjs teacher-import-jsons/algebra2-honors-module1/T2_L3_Solving_Systems_with_Matrices.json --verbose
node --test tests/platform/algebra2MatricesLesson.test.mjs tests/tools/matrixLabSharedGrading.test.mjs
```

Pre-Flight reports one warning on purpose: PR 12 is ACT-style practice the
lesson authored, not an item drawn from the audited CCMR bank.

## How to walk it

Work every question in order, the way a student in a 90-minute block would —
then go back and do the things real students do:

- **Wrong first, on purpose,** at least once per Matrix Lab view: the classic
  mistakes are listed below. Read the feedback as a student: does it say *what*
  is wrong without giving the answer away?
- **Use the supports** — Hint (once, twice, three times), "How to do this",
  Learning goal, guided notes, Vocabulary, Read aloud, Scratchpad, Calculator.
- **Interrupt yourself:** reload mid-question (are typed cells, taps, Yes/No
  and the solution type all still there?), switch questions and come back, Undo
  several steps, Reset, Enlarge and work there.
- **Time yourself** per section against 10 / 32 / 36 / 12 minutes. Note any
  item that would clearly take a real student much longer or shorter.
- **Viewports:** the whole lesson at 1366×768 (laptop); Warm-Up + Practice at
  820×1180 touch (iPad) and 390×844 touch (phone); spot-check 1920×1080.
- **DOL:** confirm there is no Check verdict, no hint, Enter never submits, and
  exactly one submission. The calculator *is* available on DOL 2–3 (A2.3B is
  "technology with matrices") — note whether that feels right.

### Classic student mistakes to try

| Mistake | Where |
| --- | --- |
| Dimensions as columns × rows (5 × 4 for a 4 × 5 matrix) | `l3m-cw-1`, `l3m-cw-2` |
| Transposed element: b₁₃ for b₃₁, b₂₄ for b₄₂ | `l3m-cw-2` |
| Multiply element by element, or row × row | `l3m-cw-3`, `l3m-pr-1`, `l3m-dol-1` |
| Call (3 × 2)·(3 × 2) defined "because the sizes match"; give a product the inner dimensions | `l3m-cw-4`, `l3m-pr-12` |
| Predict the wrong product size in step 1 (the fill grid follows the prediction) | `l3m-cw-3`, `l3m-pr-1` |
| Jackson: the inverse is the element-wise reciprocal; say "yes, inverses" | `l3m-cw-5` |
| Nicky: copy coefficients as printed, without moving terms to standard form | `l3m-cw-8` (as given), `l3m-pr-4`, `l3m-dol-2` |
| A missing variable left blank or written as 1 instead of 0 | `l3m-cw-9`, `l3m-pr-5`, `l3m-pr-7` |
| Move a term across = without changing its sign (−x + 2y = 12 + z) | `l3m-pr-4` |
| Read ERR: SINGULAR MATRIX as "no solution" every time | `l3m-cw-10` (many), `l3m-pr-8`, `l3m-dol-3` (none) |
| Round too early: 14.8 for 59/4, 3.3 for 10/3 | `l3m-pr-7`, `l3m-pr-5` |
| Model "twice as many large as small" as x = 2z; "same number" as y + z = 0 | `l3m-pr-10`, `l3m-pr-11` |
| Write the answer itself as the model (x = 15, y = 35, z = 30 as A = I) | `l3m-pr-10` — the lab must refuse it |
| Third equation that is independent, or 0x + 0y + 0z = 0 | `l3m-pr-9` |

## Hypotheses to confirm or refute

These came up while authoring. Each is a question for you, not a conclusion —
verify it in the browser and report what you actually saw.

1. **The calculator may do too much.** In a solve question `[A]⁻¹·[B]` prints
   X once A and B are right. Is the student still doing the A2.3B thinking
   (writing A · X = B, interpreting the result), or is it button pressing?
   Would requiring `[A]⁻¹` before `[A]⁻¹·[B]`, or recording A⁻¹ more often,
   teach X = A⁻¹B better?
2. **The fill grid follows the student's predicted size.** Predict 4 × 5 for
   the sprinters and you get a 4 × 5 grid. Is that a good consequence, or just
   confusing? Does the feedback ("Dimensions of A · B") say enough?
3. **The row × column expansion** ("Row 2 of A · column 1 of B = 0(10) +
   2(8) + …") appears only with `showExpansion` (CW 3, CW 5). Is it the right
   scaffold, and should Practice have a fading version?
4. **Copying a 3 × 3 product from the calculator** (CW 6, PR 3) to judge
   inverses is busywork. Would "judge only, after running [G]·[H]" be better
   evidence?
5. **After a tap, the locate view names the cell** ("row 3 (E), column 4 (12):
   the value there is 7"). Does that give CW 1 away, or is it exactly the
   reading the lesson wants?
6. **Modeling rows are accepted in any order and any nonzero multiple, but not
   as combinations** (substituting z = 2x into the count to get 3x + y = 80 is
   refused). Find any reasonable student formulation that is refused, and say
   how common you think it is.
7. **Singular systems need a reason, not a button.** The lab says "ERR:
   SINGULAR MATRIX — This matrix has no inverse." and the hints point at
   comparing rows. Is a "compare two rows" helper (pick two rows, see the
   ratio, check the constants) worth building?
8. **Phone layout.** On 390×844 the 3 × 3 builder, the variable matrix and B
   wrap; the calculator follows. How many scrolls from the prompt to Check?
   Are the 56 px cells comfortable to tap and type in? Matrix cells use a text
   keyboard (the iPhone decimal pad has no minus or slash) — is that right?
9. **Read aloud and screen readers.** A read-only matrix is drawn as a grid
   for sight and as a hidden table ("Matrix A, 4 by 5", headed rows and
   columns) for assistive technology. What does Read aloud actually say for
   WU 1 and CW 3?
10. **The work bar overlays the top of the lab** in full-page screenshots
    (Undo, Reset, Scratchpad, Calculator, Hint). Is anything ever covered
    while working, at any viewport?

## What to deliver

Write `docs/qa/algebra2-matrices-student-walkthrough.md`, modelled on
`docs/qa/algebra1-m2t2-student-walkthrough.md`:

1. **Environment** — branch, commit, viewport list, "harness, not a signed-in
   session".
2. **Journeys** — a table: journey · viewport · what the student did · result,
   and the literal order you worked in.
3. **Findings P0–P3** (P0 = cannot finish, loses work, or grades wrongly;
   P1 = misleads or blocks a typical student; P2 = friction; P3 = polish). Each
   P0/P1 gets Symptom / Where (file:line) / Why it matters / Suggested fix.
4. **Answer acceptance** — every answer you typed in a non-obvious form and
   whether it was accepted (fractions, decimals, `\frac`, Unicode minus, `+4`,
   `2,086.25`, rows multiplied through, rows reordered).
5. **The student experience** — per section: what felt intuitive, what was
   confusing, what needed guessing or extra scrolling, time taken vs. the
   recommended minutes.
6. **Platform upgrades, ranked** — R-1, R-2, … each with: the concept it serves
   (matrix structure / multiplication / inverses / matrix equations / singular
   systems / modeling), what a student would see, the files it touches, a rough
   size (S/M/L), and which hypothesis above it answers. Put the ones that would
   improve *many* lessons first.
7. **Evidence** — screenshots in `docs/qa/screenshots/matrices/`, named
   `<viewport>-<question>-<what>.png`, referenced from the findings.
8. **Not verified** — anything you could not check (real Firebase session,
   physical iPad, Classroom posting, the printed worksheet PDF).

Rules for the PR you open:

- Follow `AGENTS.md` — especially "the failure that will most likely stop you"
  and "assertions must be able to fail".
- **Do not edit the assignment JSON to make a finding go away.** If a question
  itself is wrong (bad key, misleading wording), fix it in its own commit, say
  why, and keep `tests/platform/algebra2MatricesLesson.test.mjs` green.
- Small, certain platform fixes may ride along, each with a test that fails
  without it. Anything bigger goes in the R-list, not the diff.
- Run the gate before pushing: `npm run test:platform`, `npm run test:authoring-v5`,
  `npm run lint`, `npm run build`, `npm run build:firebase`, and the harness.
- Delete `tests/browser/artifacts/` output from the commit (it is git-ignored);
  only curated screenshots go in `docs/qa/screenshots/matrices/`.

## Prompt to start the session

> Read `docs/qa/ALGEBRA2_MATRICES_STUDENT_WALKTHROUGH_BRIEF.md` and `AGENTS.md`.
> Then do the Algebra II Solving Systems with Matrices assignment as a student
> in Chromium, exactly as the brief describes, and write
> `docs/qa/algebra2-matrices-student-walkthrough.md` with your findings and a
> ranked list of platform upgrades for presenting these concepts. Open a PR
> with the report and screenshots.

## Answer key (generated from the compiled assignment)

For checking the platform's verdicts — not for skipping the thinking. Do each
question yourself first. Equivalent forms are accepted as described above (any
nonzero multiple of a row, rows in any order, exact values or correctly rounded
long decimals).

| Question | Tool | Key |
| --- | --- | --- |
| `l3m-wu-1` | multiAnswer | same: `Yes — the same numbers, organized in rows and columns` · grocery25: `8050` · gas50: `44900` · least: `$20 grocery cards` |
| `l3m-wu-2` | matrixLab/operate | Nov + Dec is defined: 3 × 2 · Total = [726, 241; 960, 322; 898, 403] |
| `l3m-wu-3` | multiAnswer | inv5: `1/5` · invFrac: `-3/2` · product: `1` · none: `0` |
| `l3m-cw-1` | matrixLab/locate | Dimensions of A: 4 × 5 · a₃₄ = 7 · a₄₅ = 2 · a₂₁ = 5 |
| `l3m-cw-2` | matrixLab/locate | Dimensions of B: 5 × 4 · The number of pairs of size 10E shoes: b₃₁ = 1 · The number of pairs of size 11EE shoes: b₄₂ = 3 · The number of pairs of size 13D shoes: b₂₄ = 6 |
| `l3m-cw-3` | matrixLab/operate | A · B is defined: 4 × 1 · Results = [38; 24; 34; 34] |
| `l3m-cw-4` | figureMatch | (2 × 3)·(3 × 4), (2 × 4)·(4 × 4), (2 × 5)·(5 × 4) → 2 × 4; (4 × 1)·(1 × 4), (4 × 3)·(3 × 4) → 4 × 4; (3 × 2)·(3 × 2), (4 × 2)·(4 × 2), (2 × 2)·(4 × 4) → not defined |
| `l3m-cw-5` | matrixLab/operate | R · S is defined: 2 × 2 · RS = [7/6, −1/3; 53/6, 7] · R and S are not inverses |
| `l3m-cw-6` | matrixLab/operate | G · H is defined: 3 × 3 · GH = [1, 0, 0; 0, 1, 0; 0, −3, −3] · G and H are not inverses |
| `l3m-cw-7` | matrixLab/equation | A = [2, −1, −2; 3, 1, −2; −2, −1, 1] · B = [3; 11; −8] |
| `l3m-cw-8` | matrixLab/equation | A = [2, −4, −5; −1, −5, 3; 3, −5, −3] · B = [−1; 0; 14] |
| `l3m-cw-9` | matrixLab/solve | A = [2, −3, 0; 0, 1, 1; 1, 2, 4] · B = [7; −5; −17] · Solution: x = 5, y = 1, z = −6 |
| `l3m-cw-10` | matrixLab/solve | A = [1, 2, −1; 2, −2, −1; 3, 6, −3] · B = [1; 2; 3] · The coefficient matrix is singular: infinitely many solutions |
| `l3m-pr-1` | matrixLab/operate | A · B is defined: 2 × 2 · AB = [8, −23; 16, 17] |
| `l3m-pr-2` | matrixLab/operate | A · B is defined: 2 × 2 · AB = [1, 0; 0, 1] · A and B are inverses |
| `l3m-pr-3` | matrixLab/operate | M · N is defined: 3 × 3 · MN = [0, −1, −1; −3, 1, 1; −2, −1, 0] · M and N are not inverses |
| `l3m-pr-4` | matrixLab/equation | A = [3, 2, 2; 5, 4, 0; −1, 2, −1] · B = [4; 0; 12] |
| `l3m-pr-5` | matrixLab/solve | A = [2, 0, 2; 5, 3, 0; 0, 3, −4] · B = [2; 4; 4] · A⁻¹ = [−2, 1, −1; 10/3, −4/3, 5/3; 5/2, −1, 1] · Solution: x = −4, y = 8, z = 5 |
| `l3m-pr-6` | matrixLab/solve | A = [1, −4, 3; 2, 3, −5; 4, 1, −1] · B = [−7; 19; 17] · Solution: x = 7/2, y = 3/2, z = −3/2 |
| `l3m-pr-7` | matrixLab/solve | A = [2, 0, −3; 2, 1, −5; 0, 3, −4] · B = [4; −1; 2] · Solution: x = 59/4, y = 12, z = 17/2 |
| `l3m-pr-8` | matrixLab/solve | A = [5, 1, 3; −1, −2, −1; 2, 4, 2] · B = [9; −16; −30] · The coefficient matrix is singular: no solution |
| `l3m-pr-9` | matrixLab/completeSystem | No solution (one example): 10x − 6y + 2z = −7 · Infinitely many (one example): 10x − 6y + 2z = −8 |
| `l3m-pr-10` | matrixLab/solve | A = [1, 1, 1; 63/4, 25, 65/2; 2, 0, −1] · B = [80; 8345/4; 0] · Solution: x = 15, y = 35, z = 30 |
| `l3m-pr-11` | matrixLab/solve | A = [1, 1, 1; 0, 1, −1; 7/2, 5, 17/2] · B = [82; 0; 495] · Solution: x = 18, y = 32, z = 32 |
| `l3m-pr-12-ccmr` | multiAnswer | entry21: `−6` · dimsCD: `3 × 4` · dimsDC: `DC is not defined` |
| `l3m-dol-1` | matrixLab/operate | P · Q is defined: 2 × 2 · PQ = [2, 7; 2, −5] |
| `l3m-dol-2` | matrixLab/solve | A = [1, 2, 1; 3, −1, −1; 2, −1, 3] · B = [3; 4; 14] · Solution: x = 2, y = −1, z = 3 |
| `l3m-dol-3` | matrixLab/solve | A = [1, −2, 3; 2, 1, −1; −3, 6, −9] · B = [4; 1; 12] · The coefficient matrix is singular: no solution |
