# Algebra II Honors — Dividing Polynomials (A2.7C)

Branch `claude/determined-hawking-m81z7h`, built on Lesson 1's branch
`claude/a2h-operations-on-polynomials-20261022` (PR #514, merged in up to its
head `2589df75`) and `main` at `39eb065`. **Merge PR #514 first:** this branch
carries its commits, and the division modes read typed polynomials through
its simplest-form reader.

A Recovery-ready lesson built from the district's "Lesson 2: Dividing
Polynomials" slides and textbook Lesson 5-2 (Practice 1–33, Exercises 34–51,
Name the Math and the Extension), and the Polynomial Workshop upgrade it
needed, so that a student shows every step of the division instead of pasting
a quotient a solver or an AI produced.

## The lesson

`teacher-import-jsons/algebra2-honors-module2/L2_Dividing_Polynomials.json`
— Pre-Flight: valid, 0 errors, 0 warnings. 33 questions, all A2.7C, 90 minutes.

| Section | Minutes | Questions |
| --- | --- | --- |
| Warm-Up — Divide, Multiply, Subtract | 10 | the three moves of every round: divide monomials; multiply a polynomial by a monomial (multiplying back); subtract polynomials, including a long-division line whose leading terms cancel |
| Classwork — Long Division and Synthetic Division | 32 | Example 1 (a sum of quotients) and its Check Your Progress, typed; Example 2 and its Check Your Progress in **long division**; the TEKS item (x³ − 4x + 2) ÷ (x + 3), which has no x² term; Example 3, (a² − 5a + 3)(2 − a)⁻¹, in long division, then its test items; Example 4 and its Check Your Progress in **synthetic division**; Example 5, a divisor 2y − 1 (divide through by 2, then put the remainder back over 2y − 1), and its Check Your Progress typed |
| Practice — Dividing Polynomials | 36 | Exercises 12, 15, 18, 19; 3 and 10 in long division (10 divides by 3b + 8); 25 in synthetic division (two missing powers); 7; 49–51; 32 (the box); 33 (physics, synthetic); 34 (the card trick); 43 (Sharon and Jamal); 44–46; 47; Name the Math (synthetic). Honors: Exercise 6, long division by y² + y − 5; Exercises 36 and 41 and the Extension, (x⁴ − 6x² + 8) ÷ (x − √2) |
| DOL — Dividing Polynomials | 12 | divide by a monomial (typed); (2x³ − 5x² + 7) ÷ (x − 3) in **long division**; (x⁴ − 5x² + 3x − 4) ÷ (x + 2) in **synthetic division** |

Every worked example is in the tool and its Check Your Progress follows it. The
DOL is one try, no hints, feedback after submit, and has no worked solution, as
in every other lesson. After the last try, every Warm-Up, Classwork and Practice
item walks through its steps: the Workshop reviews its own division, and each
typed item has a `solutionReview`. Every equation in those steps is checked by
evaluating both sides (`algebra2DividingPolynomialsLesson.test.mjs`). All 90
hints are shown; none states an answer.

**For the teacher to check:**

- **Slide typo, not carried over.** On the Check Your Progress after
  Example 4, (x² + 8x + 7) ÷ (x + 1), choices B and D are both x + 7. The
  lesson asks it in synthetic division, with no choices.
- **Exercise 49's choices** come from the textbook's Diagnose Student Errors
  note (A divides the exponents, D subtracts the coefficients). Check them
  against the printed page.

## The upgrade: Polynomial Workshop long and synthetic division

The Workshop already read typed polynomials in any letter (Lesson 1), and its
coefficient-list `division` view is unchanged. Two modes were added. In both,
`polynomial.dividend` and `polynomial.divisor` are written as polynomials
(`"x^3-4x+2"`, `"x+3"`), up to a degree-6 dividend and a degree-3 divisor:

1. **Long division** (`mode: "longDivision"`, V5 action `longDivision`). One
   round per quotient term, drawn as on paper: the student types the term
   (divide), the product (multiply back), and the difference with the next
   term brought down (subtract), then the quotient and the remainder. A
   working line may hold a missing power with a 0 (`2x^2+0x`); the quotient
   may not. A slip is marked in the round where it happens: changing the
   sign of only the first term when subtracting is wrong in that round's
   difference, and a product typed as `x^2(x+3)` was never multiplied back.
2. **Synthetic division** (`mode: "syntheticDivision"`, V5 action
   `syntheticDivision`). The student types r, the coefficient row with a 0
   for every missing power, every number of the middle and bottom rows, and
   the quotient. For a divisor ax + b they divide through by a first, and
   the remainder goes back over ax + b. The table's 2 for (8y³ − 12y² + 4y +
   10) ÷ (2y + 1) is over y + ½, and over 2y + 1 it is 4. Leaving out the
   zeros, or Exercise 43's r = −3 for x − 3, is marked where it happens.

**Why the answer alone is not enough:** every box is a graded part. On the
DOL, a quotient and remainder pasted from a solver earn 2 of 11 in long
division and 1 of 16 in synthetic division. A deadline never submits the
answer alone as finished work.

Both modes have server grading (`serverGrading/tools/polynomialWorkshop.mjs`),
worked solution reviews, printed answer-key lines, tool-schema checks and
workload units: a long division counts its rounds, a synthetic division its
columns. A question the Workshop cannot draw, such as two letters, a divisor of
higher degree, or past degree 6, is never graded against the student. On a phone
the table and the rounds fit the screen with no sideways scroll.

**Why not a new tool, or Step Algebra:** the division is a polynomial
process, which the Workshop already models (its typed-polynomial reader, its
simplest-form rules and its division view). Step Algebra's model is an
equation, so a new tool would have duplicated the reader.

Smaller changes it needed: `readTypedPolynomial(value, { allowZeroTerms })`
lets a working line keep a 0 placeholder (an answer still may not);
semantic validation no longer treats a typed-polynomial answer of one letter
(`a`) as a category; Recovery certification grades a `quotient` field; the
support family does not claim the two modes.

## Recovery families

`functions/shared/questionFamiliesPolynomialDivision.mjs` — one per Warm-Up
and DOL question:

| Family | Stands in for | Fresh versions |
| --- | --- | --- |
| `polynomials.divideMonomials` | Warm-Up 1 | about 260 million |
| `polynomials.distributeMonomial` | Warm-Up 2 | about 36.6 million |
| `polynomials.subtractForDivision` | Warm-Up 3 | about 714 million |
| `polynomials.divideByMonomial` | DOL 1 | about 44,700 |
| `polynomials.longDivisionLinear` | DOL 2 (Workshop) | about 70,800 |
| `polynomials.syntheticDivision` | DOL 3 (Workshop) | about 1.1 million |

Each recognizes its lesson question with the same DOK and band, and refuses
the other Warm-Up and DOL questions; the two Workshop families keep the
DOL's shape (one missing power, three rounds or a full table, a remainder).
Certification grades the Workshop work through
`polynomialWorkshopKeyWork`. Both sections become Recovery-ready on the
Standard and the Honors copy, and no question changes. The module imports
only the family contract and the simplest-form reader, because the registry
loads in the browser. Honors audit: all six are BLOCKED in Algebra II, each
with the knob that would unblock it. In Algebra I the cubic long division and
the quartic synthetic division are NOT APPROPRIATE, and the other four are
BLOCKED (aligned to A2.7C, so an Algebra I lesson never binds to them).

## First load

The six families put the student's first load 4.2 KB over the ratchet. To
offset them, teacher-only code joins the teacher kit: confirming a feedback
release (`feedbackReleaseHold.js`, `feedbackReleaseControls.js`) and naming
the Classroom topic (`classroomTopicNaming.js`). The support-event kinds and
the live rapid-correct summary also moved, unchanged, into their own modules
(`teacher/supportEventKinds.js`, `teacher/rapidCorrectness.js`;
`studentSupportSignals.js` re-exports them), so the teacher's support signals
leave the first load. `studentHome` is 845.5 KB (main 844.7 KB), 1.8 KB under
the ratchet.

## Deploy

Shared graders changed (the Workshop modes and the Recovery families), so
Functions ship before Hosting, after PR #514:

```bash
node scripts/release-firebase.mjs            # the plan
node scripts/release-firebase.mjs --execute
```

A client older than this build draws a `longDivision` or `syntheticDivision`
question as FactorZero, so create the lesson after Hosting is live.

## Verified

- `tests/tools/polynomialWorkshopDivision.test.mjs`,
  `tests/platform/recoveryPolynomialDivisionFamilies.test.mjs`,
  `tests/platform/algebra2DividingPolynomialsLesson.test.mjs` (every key
  re-derived: dividend = divisor × quotient + remainder), each
  mutation-checked; the first-load tests for the moved modules.
- After merging PR #514's head: `tests/platform/*.test.mjs` 12,573 pass,
  `tests/tools/*.test.mjs` 1,768 pass, `npm run lint`, `npm run build`,
  `npm run build:firebase` and the first-load budget all pass.
- Browser: `tests/browser/algebra2DividingPolynomialsLesson.mjs` — all 33
  questions at 1366 × 768 and 390 × 844: no error, no sideways scroll, the
  question fits the screen, and every answer box is wide enough to type in.
  The long- and
  synthetic-division views are filled with the key work, drawn as on paper,
  and marked right. One wrong product marks only that round's boxes onward.
  70 views, 0 findings.
