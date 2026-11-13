# Algebra I and Algebra I Honors — District DOL #4 Review

Two Assignment V5 teacher imports prepare students for DeSoto ISD's DOL #4, which they take in Eduphoria. Algebra I and Algebra I Honors share one SY26-27 blueprint of 13 items, so both reviews cover the same 13 questions, in the blueprint's order. Each review is one Practice section. The DOL itself is not in MathMaster.

| File | For | Questions |
|---|---|---|
| `Algebra1_DOL4_Review.json` | Algebra I classes | 13, one for each blueprint item |
| `Algebra1_DOL4_Review_Honors.json` | Algebra I Honors classes | The same 13, then three Honors questions |

## The blueprint

| TEKS | Type | Items | Weight | What the DOL asks |
|---|---|---|---|---|
| A.2A* | Readiness | 2 | 7% | Domain and range of a linear function, in math problems and in real-world situations (continuous and discrete), written as inequalities |
| A.2C* | Readiness | 3 | 7% | Write linear equations from a table, a graph and a verbal description |
| A.3C* | Readiness | 2 | 15% | Graph linear functions and find their key features: x-intercept, y-intercept, zeros and slope |
| A.5A | Readiness | 3 | 15% | Solve linear equations, with the distributive property and with variables on both sides |
| A.3E | Supporting | 1 | 7% | Effects of af(x), f(x) + d, f(x − c) and f(bx) on the graph of f(x) = x |
| A.4C* | Supporting | 1 | 7% | Fit a linear function to data, with and without technology, and make predictions |
| A.12C* | Supporting | 1 | 7% | Find terms of an arithmetic sequence given recursively in function form |

\* Spiraled because of earlier DOL results.

## Teacher setup

1. Import `Algebra1_DOL4_Review.json` for Algebra I classes and `Algebra1_DOL4_Review_Honors.json` for Algebra I Honors classes. Pre-Flight shows each one ready, with no errors or warnings. Its only notes say that the teacher-written hints and worked solutions have no Spanish version.
2. For an Honors class, Pre-Flight builds the Honors version. Questions 15 and 16 are audited items from MathMaster's CCMR bank, so the Honors file already meets the 15% CCMR share, and Pre-Flight keeps every question.
   - Do not assign the regular file to an Honors class. Pre-Flight would replace questions 9 and 10 with SAT equation items, and A.5A would lose its special cases and its real-world equation.
3. Students get 3 tries on each question, with hints and immediate feedback. In the Honors file, question 15 is multiple choice, so it has one try, and it shows a reason for the option the student picked.
4. Questions 8 and 9 are Question Families: each student gets their own equations and can ask for a new one. In the Honors file, questions 14–16 also give each student their own numbers.

## What is in it

| # | TEKS | Tool | What the student does |
|---|---|---|---|
| 1 | A.2A | Function characteristics | Reads a segment of f(x) = −2x + 3 with a closed left end and an open right end, and writes the domain and range as inequalities: −2 ≤ x < 3 and −3 < y ≤ 7 |
| 2 | A.2A | Relationship model | Builds the arcade-card model step by step: quantities, f(x) = 20 − 4x, a table, discrete or continuous, a graph, then the domain {0, 1, 2, 3, 4, 5} and the range {0, 4, 8, 12, 16, 20} |
| 3 | A.2C | Linear Table Workbench | Proves the rate is constant with three intervals of a table whose x-values step by 4, then writes y = −(3/2)x + 2 |
| 4 | A.2C | Multiple Representations board (Process Mode) | Finds the rate of change on a draining-pool graph by rise over run, says what the slope and y-intercept mean, and writes y = −(2/3)x + 6 |
| 5 | A.2C | Relationship model | Turns a plumber's $65 fee plus $45 an hour into y = 45x + 65, then fills a table from that equation |
| 6 | A.3C | Multiple Representations board (Process Mode) | Finds the x-intercept (5, 0), the zero, the y-intercept (0, −2) and the slope 2/5 of 2x − 5y = 10, then graphs it from its intercepts |
| 7 | A.3C, with A.2A | Function characteristics | On a descending hot-air balloon's graph, finds the x-intercept (12, 0), the zero 12 and the y-intercept (0, 1200), then the reasonable domain 0 ≤ x ≤ 12 and range 0 ≤ y ≤ 1200 |
| 8 | A.5A | Step Algebra (family) | Solves its own equation with parentheses and the variable on both sides, one step at a time |
| 9 | A.5A | Step Algebra (family) | Solves its own equation, which may have one solution, no solution or every real number, and says which |
| 10 | A.5A | Step Algebra | Solves 25 + 0.10t = 15 + 0.15t to find when two phone plans cost the same: t = 200 |
| 11 | A.3E | Graph sort | Matches four graphs to 3f(x), f(x) + 6, f(x − 4) and f((1/4)x) |
| 12 | A.4C | Data Modeling Lab | Fits a line to hot-cocoa sales by hand, runs linear regression, and predicts about 64 cups at 52°F |
| 13 | A.12C | Sequence Explorer | Builds the terms of f(1) = 23, f(n) = f(n − 1) − 6, plots them, names the common difference and finds f(9) = −25 |

Every question has three hints, a "Let's back up" step, advice for the next try after a first and a second miss, a worked solution with steps, and a "Watch out" line. All 13 count the same, as on the DOL.

Question 7 also asks for a domain and range, so the review practises A.2A in a continuous real-world situation as well as in a math problem (1) and a discrete one (2).

## The Honors file

It adds three questions after the blueprint's 13:

| # | Source | What the student does |
|---|---|---|
| 14 | MathMaster's vetted no-AI Honors extension (`honors.linear.multipleRepresentations.rateFromReading`, the battery story) | On one Multiple Representations board (DOK 3), recovers a phone battery's starting charge from a fractional rate and a later reading, then builds every representation, interprets the slope and both intercepts, and chooses the domain. It covers A.2C, A.3C, A.2A, A.2B and A.3B, and counts as two questions. |
| 15 | Digital SAT challenge, `mm_sat_A_3E_challenge_3_horizontal-vs-vertical-equivalence_v21` | For f(x) = mx + b and g(x) = f(x − h), finds the k that makes g(x) = f(x) + k: a line moved sideways is the same line moved up or down (A.3E) |
| 16 | Digital SAT challenge, `mm_sat_A_4C_ch3_parameter_prediction_v21` | Recovers a fitted model's slope from one of its predictions, then predicts at a new x (A.4C) |

- **The story.** The battery story is one the review does not already tell. Question 4 drains a pool, which the recipe's tank story would repeat, and the Honors DOL #3 review used the candle.
- **Why the extension is built from questions 4 and 6.** Pre-Flight picks an extension by the concept most of an assignment's questions share. A DOL review has no single concept. In this one, four concepts tie at two questions each, and the first, reading a graph's domain and range, has no vetted extension. The vetted linear extensions build on the Multiple Representations board, which questions 4 and 6 use.
- **The SAT items.** Items 15 and 16 keep the bank's prompt, answer, generator and provenance. The builder adds the supports every question here has: a "Let's back up" step, a "Watch out" line where the bank has none, and the worked solution in plain text. The bank writes solutions in `$…$` LaTeX, which outside a prompt reaches the student as markup. Item 15 also gets a reason for each option. The bank has no item aligned to A.12C alone, so the audited items are on A.3E and A.4C.

## Why the hints never give an answer

Questions 8 and 9 deal a different equation to each student. MathMaster hides any hint that states the answer, and for a family question that is decided version by version: a hint that says "no solution" would be hidden from every student whose equation has no solution. The hints, back-up steps and advice for questions 8 and 9 describe what to look for instead, so all three hints show on every version. The tests check this on 30 versions of each.

## Verification

- **Both files**
  - `node scripts/check-teacher-import.mjs teacher-import-jsons/algebra1-dol4/*.json` reports each file valid, with 0 errors and 0 warnings. For the Honors file it also reports "ready for an Honors class", with all four depth areas and 2 of 2 audited CCMR items.
- **Regular review**
  - `tests/platform/algebra1Dol4Review.test.mjs` works out every key from what the student is shown, then grades right and wrong work with the server's graders.
  - It solves question 10 one step at a time through the workspace's own step checks; the 0.5t slip is refused.
  - It checks 30 versions of questions 8 and 9 against an independent equation oracle. All three cases come up in question 9.
  - It reads question 4's graph back from the rendered board: every marked point sits where gridlines cross.
- **Honors review**
  - `tests/platform/algebra1Dol4HonorsReview.test.mjs` checks that the committed file is exactly what the builder makes, and that questions 1–13 are the regular file's, unchanged.
  - It checks that an Honors class gets the file as it is, with nothing replaced, and that the regular file would lose questions 9 and 10.
  - It seats a class of 30. Each student gets their own version of the extension, worked out from the numbers in the story and marked by the server.
  - For every student's version of items 15 and 16, it works out the key from the numbers the student reads.

## Regenerating the Honors file

The regular file is the source. Edit it, or the builder, then run:

```bash
node scripts/content/build-algebra1-dol4-honors.mjs
```

The builder copies questions 1–13 and builds question 14 with the recipe. It converts items 15 and 16 with the platform's own `functions/lib/ccmrAssignmentBank.js`, using the DOL #3 builder's `honorsCcmrQuestion`, and adds their supports. The Honors test fails if the committed file is not exactly what the builder makes.

## Spanish

The hints, worked examples and "Try a similar one" steps that MathMaster writes itself for these tools are in its Spanish pack. This change adds the few sentences the review's tools newly produce, such as intercepts asked together with a domain and range, and a line fitted to five points. Spanish readers see those sentences in Spanish once Hosting is deployed with this change. The teacher-written hints and worked solutions are in English only, which Pre-Flight lists as a note.
