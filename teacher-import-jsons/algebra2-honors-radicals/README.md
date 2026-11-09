# Algebra II Honors — Radicals and Rational Exponents, Lessons 1–3

Three Assignment V5 teacher imports built from the district's lesson decks (TEKS A2.7G; Lesson 3 adds A.11B, the laws of exponents). Each is an Honors lesson with four sections: Warm-Up, Classwork, Practice and the Exit Ticket (DOL).

| File | Lesson | Questions (Warm-Up · Classwork · Practice · Exit Ticket) |
|---|---|---|
| `L1_nth_Roots.json` | nth Roots | 3 · 14 · 15 · 3 |
| `L2_Operations_with_Radical_Expressions.json` | Operations with Radical Expressions | 3 · 12 · 15 · 3 |
| `L3_Rational_Exponents.json` | Rational Exponents | 3 · 10 · 15 · 3 |

## Before importing: deploy Hosting

The "Break it down" steps these lessons write for each question reach students only on a build that includes the import-compiler fix shipped with them (`authoringIntentV5Core.js` used to drop `directionSteps`). On an older build, students whose plans give chunked directions get the automatic split of the prompt instead. The slips named on a miss need it too: each is read only in its own answer box (`attemptFeedbackPlan.js`), and an older build reads it against every box, right ones included. Check what is live with `node scripts/release-firebase.mjs --whats-live`. If Hosting is older, deploy it first:

```bash
npm run build
npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Or plan the release with `node scripts/release-firebase.mjs`. Never use a raw `firebase deploy --only hosting`.

## Teacher setup

1. Import each file into an Algebra II Honors class. Pre-Flight shows each one ready, with no errors or warnings.
2. The Honors extension and two audited Digital SAT items from MathMaster's CCMR bank are already in Practice, so Pre-Flight builds the Honors version without replacing anything.
3. Warm-Up and Exit Ticket questions are generated per student and back Recovery: Warm-Up Recovery opens fresh versions, and DOL Recovery unlocks after 7 of the last 8 Practice questions are correct.
4. Students get 3 tries on each Warm-Up, Classwork and Practice question, with hints. The Exit Ticket is one try with no hints.

## What is in each lesson

**Warm-Up — prior knowledge to the objective.** Each Warm-Up was rebuilt to climb to the lesson: powers → perfect powers → √(x²) = |x| (Lesson 1); a Lesson 1 root, like terms → like radicals, and (x + a)(x − a) → conjugates (Lesson 2); integer exponent laws → negative exponents → why b^(1/n) must be the nth root (Lesson 3).

**Classwork** follows every slide example and Check Your Progress, staged so each step is its own graded box. "Simplify" answers are graded by value and form: simplest radical form, with absolute-value bars only where they are needed. Where the order differs from the slides:

- Lesson 1: the numerical radicals (√63 and 3√12, Classwork 3) come before the variable examples, so students find the largest perfect-square factor with numbers first.
- Lesson 2: the four simplest-form rules (Classwork 4) come before the Quotient Property items that ask for simplest form, and the slides' hardest Check Your Progress is Classwork 9, an extension (see the slide notes).

**Practice** has new versions for each student, the Honors extension (DOK 3–4: error analysis, reasoning about the index, tables, comparing without a calculator) and two CCMR items. Lesson 2's Practice opens with its easiest item, the simplest rationalization. In Lesson 3 the band-3 index reduction and calculator items come before the extension, so a student who stops early has met them:

| Lesson | Audited CCMR items |
|---|---|
| 1 | `mm_sat_A2_7G_1_variable-radical-square-factor_v21` (P14), `mm_sat_A2_7G_3_radical-product-variable_v21` (P15) |
| 2 | `mm_sat_A2_7G_challenge_1_combine-variable-radicals_v21` (P13), `mm_sat_A2_7G_challenge_2_radical-quotient-variable_v21` (P14) |
| 3 | `mm_sat_A2_7G_challenge_3_radical-exponent-parameter_v21` (P14), `mm_sat_A_11B_challenge_1_nested_rational_exponents_v21` (P15) |

**Exit Ticket** has three generated questions, each server-graded.

**Supports.** Every question except the audited CCMR items has authored "Break it down" steps. Every Warm-Up, Classwork and Practice question has hints, a "Let's back up" step, a worked solution and a common error, and many have Guided Coach notes. Hint 1 asks a question that points at the next move, and only the last hint shows a step. A predictable slip typed in a box is named in a sentence on a miss: missing absolute value bars ("Your answer is right when x ≥ 0. Try x = −1."), the sign of an odd power or root, an even power of a negative, and the others each question's common error names. The Exit Ticket has none of these, and says nothing about a slip until you release feedback. In the reasoning choices every option is a claim with a reason, each wrong one wrong in one specific way, so the right answer is no longer the longest option. The audited multiple-choice items allow one try, so after it the student sees the reason for the option they chose.

## Slide notes

- Lesson 1: the "Simplify" slide gives √(9x⁴y¹⁰z⁴) = 3x²y⁵z². When y can be negative it is 3x²|y⁵|z². Classwork 10 teaches this.
- Lesson 1: the odd-index Check Your Progress on the slide, ∛(27(x + 2)⁹), is 3(x + 2)³, the example's own answer, so a student could copy it into the box. Classwork 9 asks for ∛(8(x + 2)¹⁵) = 2(x + 2)⁵ instead.
- Lesson 2: the Product Property's Check Your Progress B, ⁴√(625b²⁸k²³) with b any real number, is much harder than Example B: it needs absolute value bars, leaves a radical, and needs k ≥ 0, which only the reason reveals. Classwork 3 asks for ∛(27x⁹y¹⁴), a cube root with every variable positive like Example B, and the slide's item is Classwork 9, an extension after multiplying radicals.
- Lesson 3: the objectives slide is titled "Rational Expressions" instead of Rational Exponents. The Check Your Progress ⁶√(16x²) = ∛(4x) holds only for x ≥ 0; for every real x it is ∛(4|x|). Classwork 8 states the assumption.

## These are not the Bluebonnet lessons

`algebra2-polynomials-radicals(-honors)/3_Radical_Expressions` and `4_Rational_Exponents` cover overlapping content from a different curriculum, in the folder "Algebra II/Radicals & Rational Exponents". These files are the district decks, in "Algebra II/Radicals and Rational Exponents/Lesson 1–3". Assign one set or the other for the same days.

## Changing a lesson

Edit its module in `scripts/content/algebra2HonorsRadicals/`, then run `node scripts/content/build-algebra2-honors-radicals.mjs` and commit the files it writes. `tests/platform/algebra2HonorsRadicalsLessons.test.mjs` fails when a committed file differs from the builder's output, and it checks every key in every generated version, the worked solutions, the supports, and Honors readiness.
