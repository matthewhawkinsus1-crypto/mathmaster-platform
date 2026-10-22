# Algebra II Honors — District DOL #2 Review

`District_DOL2_Absolute_Value_and_3x3_Systems_Review.json` is an Assignment V5 teacher import that prepares Algebra II Honors students for DeSoto ISD's DOL #2, taken in Eduphoria (SY26-27 blueprint, 20 items). It is the review, not the DOL: students work every blueprint standard in MathMaster before they test.

## Before importing: deploy Hosting

This branch changes how the teacher import reads a Question Family key such as `{{k}}` (`src/assignmentBlueprint.js`, `src/platform/contract/authoringIntentV5Core.js`). On the build that is live now, 17 of this review's answer boxes, three of them in the DOL readiness check, import as set boxes, and students get the set keypad for a single number. Deploy Hosting with this change before importing. It is a frontend change only, with no Functions or rules:

```bash
npm run build
npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Or plan it with `node scripts/release-firebase.mjs`. Never use a raw `firebase deploy --only hosting`.

## Teacher setup

1. **Import JSON** and choose the class. Pre-Flight shows the assignment ready, with no errors or warnings.
2. For an Honors class, Pre-Flight builds the Honors version. Practice 11–13 are audited Digital SAT items on the blueprint's standards, so they already meet the 15% CCMR share and every authored item is kept.
3. Suggested flow:
   - Warm-Up and Classwork together in class (everyone gets the same version, for discussion).
   - Practice independently. Each student gets their own numbers, and **Request New Question** deals a fresh version.
   - The DOL readiness check last. It allows one attempt with no hints, and feedback comes after submitting.
4. Warm-Up and DOL Recovery are ready. Each of their questions generates fresh, server-graded versions from its own Question Family. Pre-Flight states the current rules: DOL Recovery opens after 7 of the last 8 Practice questions are correct and counts up to 90%, and Warm-Up Recovery counts up to 85%.

## What is in it

| Section | Items | Purpose |
|---|---|---|
| Warm-Up | 4 | Retrieval: key attributes, mapping a point, a two-case equation, writing a three-variable system |
| Classwork | 11 | Guided review of every standard, with guided notes, hints, a back-up step and a worked solution |
| Practice | 18 | Independent mastery; every item is a Question Family |
| DOL readiness check | 7 | One DOL-format item per standard |

| Standard | On the DOL | Classwork | Practice | DOL check | Worked in |
|---|---|---|---|---|---|
| A2.2A key attributes of f(x) = \|x\| | 3 | 1, 2 | 1, 2, 11 | 1 | Staged graph analysis; a graph restricted to an interval |
| A2.6C transformations of \|x\| | 3 | 3, 4 | 3, 4 | 2 | Transformations Lab: plot, describe, identify, match |
| A2.6D formulate absolute value equations | 3 | 5 | 5, 6 | 3 | Typed equations from words and from solutions |
| A2.6E solve absolute value equations | 3 | 6 | 7, 8, 12, 18 | 4 | Solving workspace: isolate, split, solve, check (including an extraneous solution) |
| A2.6F solve absolute value inequalities | 3 | 7, 8 | 9, 10, 13 | 5 | Solving workspace, then a number line and interval notation |
| A2.3A formulate 3×3 systems | 2 | 9 | 14, 15 | 6 | Matrix Lab from a word problem (system hidden); typed equations |
| A2.3B solve 3×3 systems | 2 | 10, 11 | 16, 17 | 7 | Systems Workspace (elimination or substitution by hand); Matrix Lab (X = A⁻¹B); error analysis of a matrix equation |

Warm-Up 1–4 cover A2.2A, A2.6C, A2.6E and A2.3A. The blueprint strikes √x, 1/x, x³, ∛x, bˣ, log_b(x), asymptotic behavior, and linear-quadratic systems, so none of them appears in any version. The `lessonNotesPdf` output profile is a two-page study guide covering the same standards.

## Verification

- Pre-Flight: valid, with 0 errors and 0 warnings. Warm-Up and DOL Recovery are ready. The Honors candidate is READY: all four depth checks pass, 3 of 3 CCMR items are in place, and nothing is replaced.
- Before release, every generated version (over 443,000 across 29 families) was checked against mathematics computed independently of its template.
- `tests/platform/algebra2HonorsDol2Review.test.mjs` re-checks sampled versions of every family on each run. It also checks blueprint coverage, struck content, tools per standard, the Matrix Lab error-analysis item, and Honors and Recovery readiness.
- The import fix is covered by `tests/platform/teacherImportTemplateKeyFields.test.mjs`.

## Regenerating

Edit the builder, not the JSON. To regenerate (with Node on `PATH`):

```bash
python3 scripts/content/build_algebra2_honors_dol2_review.py
```

The builder rewrites the JSON, asserts every static key, and converts the three Digital SAT items with the platform's own `functions/lib/ccmrAssignmentBank.js`.

## Known follow-ups (not changed here)

- Practice 17 and DOL 7 use the certified platform family `matrices.solveSystem3x3`. In about 4% of versions it writes a zero constant as "+ 0" (for example, "y = −3x + 0"). The system is still correct.
- Practice 13 is the bank's tolerance item, used verbatim. When its tolerance is 1, it reads "at most 1 millimeters".
- Assignments imported before the import fix keep a set box wherever a generated number key was read as a set. For example, the Digital SAT item in `algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json` keeps one until it is re-imported.
