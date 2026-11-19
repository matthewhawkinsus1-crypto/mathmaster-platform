# Algebra I and Algebra I Honors — District DOL #4 Makeup

Two Assignment V5 teacher imports for students who did not pass DOL #4 (SY26-27), which they took in Eduphoria. Algebra I and Algebra I Honors take the same DOL #4, so both makeups test the same 13 skills. Each makeup is one Practice section.

| File | For | Questions |
|---|---|---|
| `Algebra1_DOL4_Makeup.json` | Algebra I classes | 13, a parallel form of the DOL |
| `Algebra1_DOL4_Makeup_Honors.json` | Algebra I Honors classes | The same 13, then three Honors questions |

Both files go in the **Algebra I/DOL Makeups** folder, next to the DOL #2 makeup.

## A parallel form, not a copy

Makeup question *n* tests the skill of DOL question *n*, in the same order. Each one has new numbers and, where the DOL has a story, a new story. A student who remembers the DOL's answers gets none of these right by recalling them. Each makeup question asks the student to produce the mathematics in a tool instead of choosing from four answers.

| # | TEKS | On the DOL | On the makeup | Answer |
|---|---|---|---|---|
| 1 | A.3B | Rate of change and y-intercept from a table | Rate of change from three pairs of rows, then y = mx + b, in the Linear Table Workbench | rate 5/2, y-intercept −3, y = (5/2)x − 3 |
| 2 | A.5A | (2/3)(m − 9) = (1/3)(m − 27) | Solve (3/5)(n − 10) = (2/5)(n − 20) step by step | n = −10 |
| 3 | A.2A | Range of pages left to read | Domain and range of candy bars left to sell, as inequalities | 0 ≤ x ≤ 12, 0 ≤ y ≤ 360 |
| 4 | A.3C | Choose the graph with slope 2/3 and y-intercept 4 | Graph the line with slope 3/4 and y-intercept −2 | through (0, −2) and (4, 1) |
| 5 | A.3E | g(x) = f(x) − 3: the move and the y-intercepts | g(x) = f(x) + 5: the move, both y-intercepts, and how they compare | up 5; f: 0, g: 5; 5 units greater |
| 6 | A.5A | 3(v + 2) = 2(v − 9) | Solve 4(w + 3) = 3(w − 5) step by step | w = −27 |
| 7 | A.2A | Domain of a kayak payment table | Domain and range of a bike payment table, as sets | whole numbers 0–5; {0, 1, 2, 3, 4, 5}; {0, 30, 60, 90, 120, 150} |
| 8 | A.12C | First 4 terms of aₙ = aₙ₋₁ + 2.8, a₁ = 9 | First 4 terms of aₙ = aₙ₋₁ + 1.7, a₁ = 6.5, plotted, in the Sequence Explorer | 6.5, 8.2, 9.9, 11.6; arithmetic, difference 1.7 |
| 9 | A.2B | Choose the point-slope equation of a graphed line | Slope, point-slope and slope-intercept form of the line through the marked points (−6, 1) and (6, 4) | 1/4; y − 1 = (1/4)(x + 6); y = (1/4)x + 5/2 |
| 10 | A.3C | y-intercept read from a graph | x- and y-intercepts read from a graph | (5, 0) and (0, −2) |
| 11 | A.5A | (4/3)z + 6 = −4((1/6)z + 9) | Solve (3/2)z + 8 = −2((1/4)z + 6) step by step | z = −10 |
| 12 | A.2C | Rental truck: flat fee and cost per mile from two customers | Moving van: 30 miles for $64 and 120 miles for $118, on the Multiple Representations board | $0.60 a mile, $46 fee, y = 0.6x + 46 |
| 13 | A.4C | Choose the function that best models hourly customers | Fit a line by hand, run linear regression on 7 hours of customers, predict hour 8, in the Data Modeling Lab | y ≈ −42.04x + 454.57; about 118 customers |

Every question has three hints, a "Let's back up" step, a worked solution and a "Watch out" line naming the mistake the DOL's distractors were built on. All 13 count the same, as on the DOL. Students get 3 tries on each question, with immediate feedback.

### The Honors makeup

Questions 1–13 are the regular makeup's, unchanged. Then:

| # | Source | What the student does |
|---|---|---|
| 14 | MathMaster's vetted no-AI Honors extension (`honors.linear.multipleRepresentations.rateFromReading`, the tank story) | On one Multiple Representations board (DOK 3), recovers the tank's starting amount from a fractional rate and a later reading, builds every representation, interprets the slope and both intercepts, and chooses the domain. It covers A.2A, A.2B, A.2C, A.3B and A.3C, five of the DOL's standards, and counts as two questions. |
| 15 | Digital SAT challenge, `mm_sat_A_3E_challenge_2_parameter-pass-through-point_v21` | Finds k when g(x) = f(x) + k passes through a given point (A.3E, one step past question 5) |
| 16 | Digital SAT challenge, `mm_sat_A_5A_challenge_2_equal_cost_v21` | Finds the hour at which two rental plans cost the same (A.5A, after questions 2, 6, 11 and 12) |

Questions 14–16 give each student their own numbers. The DOL #3 Honors review told the candle story, so this one tells the tank story.

## Teacher setup

1. Import `Algebra1_DOL4_Makeup.json` for Algebra I classes and `Algebra1_DOL4_Makeup_Honors.json` for Algebra I Honors classes. Pre-Flight shows each one ready, with no errors or warnings.
2. An assignment goes to a whole class. Excuse the students who passed DOL #4 from it, so only the students who need the makeup have it to do.
3. **Do not assign the regular file to an Honors class.** For an Honors class Pre-Flight replaces about 15% of Practice with audited exam items, starting from the end, and on the regular file that swaps out makeup questions 11 and 12, so those students would not make up those two DOL questions. The Honors file already has its audited items (15 and 16), so Pre-Flight keeps every question.
4. MathMaster does not write the makeup score back to Eduphoria. Record it there following your campus's makeup policy.

## Before importing: what must be deployed

The makeups use only tools that are already live for DOL #3: the Linear Table Workbench, Step Algebra, Function Characteristics, the graphing tool, the Sequence Explorer, the Multiple Representations board and the Data Modeling Lab. No Functions or rules change. If Hosting predates PR #518, deploy it first (see the DOL #3 README); check with `node scripts/release-firebase.mjs --whats-live`.

## Verification

- **Regular makeup**
  - Pre-Flight is valid with 0 errors and 0 warnings.
  - `tests/platform/algebra1Dol4Makeup.test.mjs` works out every key from what the student is shown: it solves each equation from its text, finds each line from its rows or points, and runs the regression itself. It grades right and wrong work (each DOL distractor among them) with the server's graders, and checks the TEKS order, the supports and the worked solutions.
- **Honors makeup**
  - Pre-Flight is valid with 0 errors and 0 warnings, and the Honors version is READY: all four depth checks pass, 2 of 2 audited CCMR items are in place, and nothing is replaced.
  - `tests/platform/algebra1Dol4MakeupHonors.test.mjs` deals a class of 30 thirty versions of the extension, works out each line from the story's numbers, and has the server mark a complete board right and a board with one wrong card wrong. It works out each student's key for items 15 and 16 from their prompt, and fails if the Honors file is not exactly what the builder makes.

## Regenerating the Honors file

The regular file is the source. Edit it, then run:

```bash
node scripts/content/build-algebra1-dol4-makeup-honors.mjs
```
