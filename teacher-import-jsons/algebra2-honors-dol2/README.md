# Algebra II Honors — District DOL #2 Review

`District_DOL2_Absolute_Value_and_3x3_Systems_Review.json` is an Assignment V5 teacher import that prepares Algebra II Honors students for DeSoto ISD's DOL #2, taken in Eduphoria (SY26-27 blueprint, 20 items). It is the review, not the DOL: students work every blueprint standard in MathMaster before they test.

## Before importing: deploy Hosting

The teacher import reads a Question Family key such as `{{k}}` as a number, not a set (`src/assignmentBlueprint.js`, `src/platform/contract/authoringIntentV5Core.js`, on main since commit f0b49bcb). On a build without that change, 17 of this review's answer boxes, three of them in the DOL readiness check, import as set boxes, and students get the set keypad for a single number. Deploy Hosting from a clean checkout of current main after its CI has passed (AGENTS.md, Deploy). It is a frontend change only, with no Functions or rules:

```bash
npm run build
npm run build:firebase
FIREBASE_HOSTING_UPLOAD_CONCURRENCY=4 npm run deploy:hosting
```

Or plan it with `node scripts/release-firebase.mjs`. Never use a raw `firebase deploy --only hosting`.

## Standard and Honors versions

One import serves both. Honors comes from the class, not the file: a class whose course level is Honors in MathMaster gets the Honors version.

- **Give it to Honors classes.** In Review, the Classes step lists the Standard and Honors destinations. For the Honors version it says **"✓ Honors version checked. It already contains audited CCMR Practice that passes MathMaster's checks."** All six Honors checks pass: core TEKS, higher-order reasoning, multiple representations, explanation and justification (the Matrix Lab error analysis), modeling and application, and authentic CCMR Practice. Review is ready to create.
- **Give it to Standard and Honors classes together.** Create writes one Standard and one Honors assignment in one variant group, each with all 40 questions. The Honors copy records that its CCMR is ready. The preview's **Standard version / Honors version** switch shows each one.
- **The versions match on purpose.** The platform's usual Honors version replaces about 15% of Practice with audited exam-style items picked from the bank. For this review, Practice 11–13 are three audited Digital SAT items on the blueprint's own standards (A2.2A, A2.6E, A2.6F). That is 3 of 18 Practice items, so nothing has to be swapped. Without them, the bank fills the slots with items such as an ACT linear equation, a(x − b) = c, which is not on DOL #2.
- **Any class size up to 70.** Every Practice and DOL item has at least 70 versions, so Review reports no shared questions for a roster of up to 70 in either version.

No built-in "Add built-in Honors extension (no AI)" recipe exists yet for these Algebra II concepts (`docs/honors/DETERMINISTIC_HONORS_COVERAGE.md`), so Review explains that it adds none. The Honors version does not need one.

## Teacher setup

1. **Import JSON** and choose the classes. Pre-Flight shows the assignment ready, with no errors or warnings.
2. Suggested flow:
   - Warm-Up and Classwork together in class (everyone gets the same version, for discussion).
   - Practice independently. Each student gets their own numbers, and **Request New Question** deals a fresh version.
   - The DOL readiness check last. It allows one attempt with no hints, and feedback comes after submitting.
3. Warm-Up and DOL Recovery are ready in both versions. Each of their questions generates fresh, server-graded versions from its own Question Family. Pre-Flight states the current rules: DOL Recovery opens after 7 of the last 8 Practice questions are correct and counts up to 90%, and Warm-Up Recovery counts up to 85%.

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

- Pre-Flight: valid, with 0 errors and 0 warnings. Warm-Up and DOL Recovery are ready. The Honors version is READY: all depth checks pass, 3 of 3 CCMR items are in place, and nothing is replaced.
- Before release, every generated version (443,378 across 29 families) was checked against mathematics computed independently of its template.
- `tests/platform/algebra2HonorsDol2Review.test.mjs` re-checks sampled versions of every family on each run. It also checks blueprint coverage, struck content, tools per standard, the Matrix Lab error-analysis item, both versions with no warnings for a class of 70, and Honors and Recovery readiness.
- `tests/browser/teacherWorkflow/dol2ReviewHonorsJourneys.mjs` runs Review and Create in the real app for a Standard and an Honors Algebra II class, on desktop, Chromebook and phone, with the bank answered by the server's own code.
- The import fix is covered by `tests/platform/teacherImportTemplateKeyFields.test.mjs`.

## Regenerating

Edit the builder, not the JSON. To regenerate (with Node on `PATH`):

```bash
python3 scripts/content/build_algebra2_honors_dol2_review.py
```

The builder rewrites the JSON, asserts every static key, and converts the three Digital SAT items with the platform's own `functions/lib/ccmrAssignmentBank.js`.

## Fixed after the first import (a class that already has this review needs a re-import)

- Practice 17 and DOL 7 use the platform family `matrices.solveSystem3x3`. Version 1 wrote a zero constant as "+ 0" (for example, "2x = 0 − y" or "y = 2x + 0") in 4,612 of its 60,694 valid versions (7.6%). The system was always correct. Both questions now pin **version 2**, which leaves the zero out ("2x = −y", "y = 2x"), and writes every other equation exactly as before. Version 1 is unchanged, so a student who already started keeps the version they were given; only a re-import moves a live assignment to version 2.
- Practice 13 is the bank's tolerance item. It used to end "differs from {{target}} by at most {{tol}} millimeters", which read "at most 1 millimeters" when the tolerance was 1. The unit is already given in the first clause ("its length L, in millimeters"), so the trailing word is gone from the bank item and from this file.
- Eight solving cards (Warm-Up 3, Practice 7, 8, 9, 10 and 18, DOL 4 and 5) said only "Solve the equation." or "Solve the inequality." The equation was drawn by the solving workspace alone, and Read aloud says the task, never the workspace, so a student who listens heard no equation. Each card now writes its equation in the task ("Solve -3|2x - 4| + 5 = -1."), as the Classwork cards always did. A class that already has the review needs the file re-imported.

## Known follow-ups (not changed here)

- Assignments imported before the import fix keep a set box wherever a generated number key was read as a set. For example, the Digital SAT item in `algebra2-honors-module1/L1_Absolute_Value_ALEKS_Bridge_20260828.json` keeps one until it is re-imported.
