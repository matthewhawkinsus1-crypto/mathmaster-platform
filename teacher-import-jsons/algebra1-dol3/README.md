# Algebra I and Algebra I Honors — District DOL #3 Review

Two Assignment V5 teacher imports prepare students for DeSoto ISD's DOL #3, which they take in Eduphoria. Algebra I and Algebra I Honors share one SY26-27 blueprint of 13 items, so both reviews cover the same 13 questions. Each review is one Practice section. The DOL itself is not in MathMaster.

| File | For | Questions |
|---|---|---|
| `Algebra1_DOL3_Review.json` | Algebra I classes | 13, one for each blueprint item |
| `Algebra1_DOL3_Review_Honors.json` | Algebra I Honors classes | The same 13, then three Honors questions |

## Before importing: deploy Hosting

Both reviews rely on tool upgrades merged with them in PR #518:

- axis and column labels on the Data Modeling Lab, Linear Table Workbench and Multiple Representations board
- table cards on the Open Sort Board
- the sequence support family
- worked solutions on the open sort

On an older build, Cards C and D of question 12 show no table, and the axis labels are dropped. Check what is live with `node scripts/release-firebase.mjs --whats-live`. If Hosting predates #518, deploy it first:

```bash
npm run build
npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Or plan the release with `node scripts/release-firebase.mjs`. Never use a raw `firebase deploy --only hosting`.

## Teacher setup

1. Import `Algebra1_DOL3_Review.json` for Algebra I classes and `Algebra1_DOL3_Review_Honors.json` for Algebra I Honors classes. Pre-Flight shows each one ready, with no errors or warnings.
2. For an Honors class, Pre-Flight builds the Honors version. Questions 15 and 16 are audited TSIA2 items from MathMaster's CCMR bank, so the Honors file already meets the 15% CCMR share, and Pre-Flight keeps every question.
   - Do not assign the regular file to an Honors class. Pre-Flight would replace question 12 (the function sort) and question 13 (the recursive sequence) with exam items. The item it chooses for question 13 does not practise sequences.
3. Students get 3 tries on each question, with hints and immediate feedback. In the Honors file, questions 14–16 give each student their own numbers.

## What is in it

| # | TEKS | What the student does |
|---|---|---|
| 1 | A.2A | Reads a battery graph and writes the domain and range as inequalities |
| 2 | A.2A | Builds the popcorn model step by step: quantities, f(x) = 6x, a table, discrete or continuous, a graph, then domain and range |
| 3 | A.2C | Proves the rate is constant with three intervals, then writes y = mx + b from a table |
| 4 | A.2C | Turns a rideshare situation into an equation and a graph, and interprets it (Process Mode board) |
| 5 | A.3B | Finds the rate for three pairs of rows of a kayak-rental table and decides whether it is constant |
| 6 | A.3B | Finds rise over run on a walking graph, says what it means, and writes the equation |
| 7 | A.3C | Finds the intercepts, zero and slope of 3x − 4y = 24, then graphs it from its intercepts |
| 8 | A.3C | Finds the x-intercept, zero and y-intercept on a draining-tank graph |
| 9 | A.2B | Writes the line through two points in slope, point-slope, slope-intercept and standard form |
| 10 | A.4B | Sorts cards into causation and association only, and names and explains each group |
| 11 | A.4C | Fits a line by hand, runs linear regression, and predicts at 3.5 hours |
| 12 | A.12A | Sorts relations given in words, tables, graphs and equations into functions and non-functions |
| 13 | A.12C | Builds the terms of f(1) = −7, f(n) = f(n − 1) + 4, plots them, and names the common difference |

Every question has three hints, a "Let's back up" step, a worked solution with steps, and a "Watch out" line. All 13 count the same, as on the DOL.

The Honors file adds three questions:

| # | Source | What the student does |
|---|---|---|
| 14 | MathMaster's vetted no-AI Honors extension (`honors.linear.multipleRepresentations.rateFromReading`, the candle story) | On one Multiple Representations board (DOK 3), recovers the candle's starting height from a fractional rate and a later reading, then builds every representation, interprets the slope and both intercepts, and chooses the domain. It covers A.2C, A.3B, A.3C, A.2A and A.2B, and counts as two questions. |
| 15 | TSIA2, `mm_tsia2_psr_analysis_8_v21` | Decides what observational data can show: association, not causation (A.4B, A.4C) |
| 16 | TSIA2, `mm_tsia2_psr_analysis_6_v21` | Judges a claim about a whole population made from one sample (A.4B, A.4C) |

The candle story is the one the regular review does not already tell: question 1 is about a phone battery and question 8 about a tank. Items 15 and 16 are the bank's own items, used exactly as the bank converts them. They are the audited items on this review's TEKS that import without a Pre-Flight warning.

## Verification

- **Regular review**
  - Pre-Flight is valid with 0 errors and 0 warnings.
  - `tests/platform/algebra1Dol3Review.test.mjs` works out every key from what the student is shown. It grades right and wrong work with the server's graders and checks the blueprint counts, the supports and the worked solutions.
- **Honors review**
  - Pre-Flight is valid with 0 errors and 0 warnings.
  - The Honors candidate is READY: all four depth checks pass, 2 of 2 CCMR items are in place, and nothing is replaced.
  - `tests/platform/algebra1Dol3HonorsReview.test.mjs` gives a class of 30 thirty different versions of the extension. It works out each version's line from the numbers in its story, and has the server mark a complete board right and a board with one wrong card wrong. It also checks that questions 1–13 are the regular file's, unchanged.

## Regenerating the Honors file

The regular file is the source. Edit it, or the builder, then run:

```bash
node scripts/content/build-algebra1-dol3-honors.mjs
```

The builder copies questions 1–13 and builds question 14 with the recipe. It converts items 15 and 16 with the platform's own `functions/lib/ccmrAssignmentBank.js`. The Honors test fails if the committed file is not exactly what the builder makes.

## Known follow-ups (not changed here)

- The Sequence Explorer writes terms as aₙ, while the DOL uses f(n). Question 13's prompt explains the mapping.
- Items 15 and 16 have no "Watch out" line (`solutionReview.commonError`), and Pre-Flight lists that as advice. They are the bank's items and are not edited here.
- On the regular review, the CCMR swap for an Honors class matches question 13 (A.12C, a recursive sequence) to an ACT function-evaluation item tagged A.12C. The bank's semantic-fit check does not yet tell sequences apart from function evaluation. The Honors file avoids this, but any other A.12C lesson assigned to an Honors class would not.
