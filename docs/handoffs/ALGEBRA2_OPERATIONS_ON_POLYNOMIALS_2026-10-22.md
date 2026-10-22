# Algebra II Honors — Operations on Polynomials (A2.7B)

Branch `claude/a2h-operations-on-polynomials-20261022`, from `main` at `8d69140`.

A Recovery-ready lesson built from the district's "Lesson 1: Operations on
Polynomials" slides (Day 1) and textbook Lesson 5-1, and the three platform
upgrades it needed so the work shows the student's thinking instead of only an
answer a solver could produce.

## The lesson

`teacher-import-jsons/algebra2-honors-module2/L1_Operations_on_Polynomials.json`
— Pre-Flight: valid, 0 errors, 2 informational warnings (the authored SAT-style
item is not from the audited CCMR bank; every item is A2.7B).

| Section | Minutes | Questions |
| --- | --- | --- |
| Warm-Up — Getting Ready to Simplify | 10 | multiply monomials; the opposite of a polynomial and like terms; like terms or not, and why |
| Classwork — Add, Subtract and Multiply Polynomials | 32 | vocabulary sort; degree; Examples A and B in **Add & Subtract**; Check Your Progress typed; error analysis; −y(4y² + 2y − 3) and (a² + 3a − 4)(a + 2) in the **area model**; E-SALES; Check Your Progress typed |
| Practice — Operations on Polynomials | 36 | textbook 9, 29, 34, 11–13, 30, 35; TEKS items 70, 72 (Workshop), 73 (Workshop) and the box volume with the textbook's error-coded choices; painters; INTEREST; bachelor's degrees; Honors (x − y)(x² + 2xy + y²) and (4n − 5)³; an SAT-style item; always / sometimes / never |
| DOL — Operations on Polynomials | 12 | subtract with a missing term (**Add & Subtract**); trinomial × binomial (**area model**); profit = revenue − cost |

The tools carry each worked example; the Check Your Progress right after it is
typed with no tool. The DOL is one try, no hints, feedback after submit.

After the last try, every Warm-Up, Classwork and Practice item walks through
its steps: the tools review their own work, and each typed item has a
`solutionReview` (headline, steps, and the mistake it is built to catch).
Every equation in those steps is checked by evaluating both sides
(`algebra2OperationsOnPolynomialsLesson.test.mjs`). The DOL has no worked
solution, as in every other lesson. Each multi-part item has a "Let's back
up" step, and no hint states an answer (all 87 are shown).

Every Warm-Up and DOL question is bound to a new Recovery family, so both
sections are Recovery-ready on the Standard and the Honors copy from creation.

**Slide typo, not carried over:** Do Now #1 reads y ≥ 2x + 3; its keyed
answer (A) and graph need y ≤ 2x + 3. The Warm-Up is readiness for this lesson
instead (the teacher's choice).

## The upgrades

1. **Simplest form for typed polynomials.** A typed answer is graded by value,
   so 2a³ + 5a − 7 − a³ + 3a − 2 was right for a³ + 8a − 9 and (2a²b)(4a³b)
   for 8a⁵b². An answer field may now say `"answerForm": "simplifiedPolynomial"`:
   the value must match **and** nothing may be left to do (like terms combined,
   products multiplied out, no brackets, lowest-terms coefficients). Opt-in per
   field — no existing question changes. A refused answer with the right value
   is told "Equal, but not simplified: multiply out every product and combine
   like terms." (misconception code `polynomial-not-simplified`, Spanish
   included). Pre-Flight refuses an unknown `answerForm` and a key that is not
   itself simplified.
   `functions/shared/simplifiedPolynomialForm.mjs`, `answerUtils.mjs`.
2. **Polynomial Workshop — the area model of any size.** `leftFactor` /
   `rightFactor` written as polynomials in any letters (`"a^2+3a-4"`, `"-y"`,
   `"x-y"`): one row per term, one column per term, the student types every
   cell's product as one term and the product in simplest form. Every cell is a
   graded part, so a pasted answer earns only its own share (1/7 on a 3 × 2).
   On a phone the grid becomes a list, one product a line. The binomial model
   (`leftBinomial` / `rightBinomial`, coefficient lists) is unchanged, check for
   check, with its work shape.
3. **Polynomial Workshop — Add & Subtract** (`mode: "addSubtract"`,
   `operation`, `firstPolynomial`, `secondPolynomial`; V5 action
   `addSubtractPolynomials` / `subtractPolynomials` / `addPolynomials`). One
   column per kind of term; subtracting, the student writes the opposite of
   EVERY term of the second polynomial, combines each column (a cancelled
   column is a typed 0), then the result. Each step is a graded part, so the
   textbook's "subtracted only the first term" shows exactly where it happened.

Both new shapes have server grading, worked solution reviews, printed
answer-key lines and tool-schema checks; the support family no longer claims
them as the default problem.

**Why not Step Algebra:** its model is an equation (every move on both sides,
done when a variable is isolated), its Distribute takes one factor over one
group, and its Simplify multiplies numbers, not powers. The Workshop got the
process; the simplest-form rules mirror Step Algebra's Simplify
(`writtenTermProblem`).

## Recovery families

`functions/shared/questionFamiliesPolynomials.mjs` — `polynomials.multiplyMonomials`,
`.oppositeAndLikeTerms`, `.likeTermPairs`, `.subtractMissingTerm` (Workshop),
`.multiplyTrinomialBinomial` (Workshop), `.profitModel`. Each recognizes its
lesson question, keeps its DOK and band, and has 127,000+ fresh versions;
certification grades Workshop work through `polynomialWorkshopKeyWork`
(`recoveryCertificationGrading.mjs`). Honors audit: BLOCKED in Algebra II with
the knob that would unblock each; in Algebra I subtracting cubics is NOT
APPROPRIATE and the other five are BLOCKED (aligned to A2.7B).

## First load

The families and the simplest-form reader ride in the student's first load
(+9 KB). Offset by moving teacher-only code into the teacher kit: the DOL
recovery builders (a student keeps `studentRecoverySummary.js`), Test Cycle
records and projection, attendance extension reconciliation, the support-event
store, and the live-attendance event kind split into its own module.
`main` moved the DOL-grant client, return check-ins and extension
reconciliation into the kit at the same time; merged, the kit exports both
sets, and App reads the attendance-history event kind from
`functions/shared/attendanceDay.mjs` so `attendanceHistory.js` leaves the
first load too. `studentHome` 845.7 KB; headroom 1.7 KB under the ratchet.

## Deploy

Shared graders changed (multiAnswer `answerForm`, Workshop modes, Recovery
families), so Functions ship before Hosting:

```bash
node scripts/release-firebase.mjs            # the plan
node scripts/release-firebase.mjs --execute
```

A client older than this build draws an `addSubtract` question as FactorZero;
create the lesson after Hosting is live.

## Verified

- `tests/platform/simplifiedPolynomialForm.test.mjs`,
  `tests/tools/polynomialWorkshopTextPolynomials.test.mjs`,
  `tests/platform/recoveryPolynomialFamilies.test.mjs`,
  `tests/platform/algebra2OperationsOnPolynomialsLesson.test.mjs` (every key
  re-derived by evaluating the original expression), each mutation-checked.
- Browser: `tests/browser/algebra2PolynomialsLesson.mjs` — all 32 questions at
  1366 × 768 and 390 × 844: render, no errors, no sideways scroll, every answer
  box wide enough to type in.
