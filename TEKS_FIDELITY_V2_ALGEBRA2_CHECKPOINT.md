# Algebra II Fidelity V2 — Durable Continuation Checkpoint

Last updated: 2026-08-30

## Certified base

Algebra I exact certified SHA:

`780b9e6fbf5cf6d7bdfba8417a1fb392b4369572`

That SHA passed:
- Full Platform Test Suite (2,780 tests + build + lint)
- Algebra I Fidelity V2 Certification
- Correct Answer Acceptance Audit
- Assignment V5 Foundation
- Path Tool Browser Contract

Algebra I contains all 49 standards / 245 V2 families in the canonical draft and shipping seed mirrors. No Firestore/content deployment has been started.

## Active Algebra II lane

- Branch: `audit/teks-fidelity-v2-algebra2-certified`
- Draft PR: #82
- PR base: `audit/teks-fidelity-v2-algebra1`
- Canonical source: `drafts/algebra2.json`
- Legacy bank: 48 content standards × 5 families = 240 families
- Do NOT resume from the stale `audit/teks-fidelity-v2-algebra2` or `audit/teks-fidelity-v2-algebra2-current` branches except as references.

## Frozen 48-standard decision matrix

File: `TEKS_FIDELITY_V2_ALGEBRA2_48_STANDARD_MATRIX.md`

- 18 REBUILD
- 15 ENHANCE
- 15 KEEP

The matrix is the course-wide quality map. Do not weaken its verdicts merely to finish faster.

## Source-of-truth correction already completed

The shipping Algebra II seeds already contained the stronger A2.2B inverse-reflection workflow while `drafts/algebra2.json` was one version behind. The canonical draft has been reconciled to the stronger shipping family before V2 authoring continues.

## Runtime capabilities added for Algebra II

### Deterministic Path sub-variants

Ported surgically into `functions/shared/pathQuestionGeneration.mjs` with replay/security tests.

Purpose: one five-family standard can securely cover more than five deterministic mathematical sub-forms without leaking unused variants. A2.2A uses this to cover all seven required parent functions.

### 3×3 systems / Gaussian elimination

Server:
- `functions/shared/pathSystemsMatrix3Grading.mjs`
- secure `systemsWorkspace` mode `matrix3`
- sequential Gaussian row-operation checkpoints
- full 3×4 technology RREF mode
- classification + x/y/z
- public payload never includes expected checkpoints or solution

Student:
- `src/tools/systemsWorkspace/Matrix3Mode.jsx`
- one authoritative Matrix3 component
- sequential Gaussian checkpoint entry
- complete RREF entry
- classification and final solution

Tests:
- `tests/platform/pathSystemsMatrix3Grading.test.mjs`

This capability is intended to unblock authentic A2.3B once the current CI head passes.

### Square-root technology fit

Current branch contains secure server and student-lab support for `dataModelingLab` mode `squareRootFit`:
- model form y = a sqrt(x-h) + k
- server derives fit from the data
- browser collects a, h, k
- tolerances remain private

Proof-level square-root-fit tests are the current open verification item before A2.4E is called unblocked.

## Staged standards

### A2.2A — REBUILD — STAGED

File: `drafts/fidelity-v2/algebra2/A2.2A.json`

Five V2 families use authentic `functionInvestigation` graph construction and deterministic sub-variants to cover:
- square root
- cube root
- absolute value
- cubic
- reciprocal
- exponential
- logarithmic base 2
- logarithmic base 10
- natural log / base e

Students plot required points, sketch the curve, and analyze applicable domain/range/symmetry/asymptote/intercept attributes.

Certification file:
`tests/platform/algebra2FidelityV2Staged.test.mjs`

## Exact next content action

A2.2B — ENHANCE.

Preserve the strong shipping inverse-reflection graph family. Stage five V2 families that make inverse WRITING the dominant evidence:
1. write a complete linear inverse equation;
2. graph/reflect a linear function across y=x and write the inverse;
3. use an actual table, reverse the pairs, and write the inverse rule;
4. write a cubic/cube-root inverse equation (not choose it);
5. restrict a quadratic branch and write the square-root inverse, with the restriction explicitly graded.

Then continue A2.2C and A2.2D before entering the systems strand.

## Release rule

Do not promote Algebra II to canonical/shipping mirrors and do not merge PR #82 until:
1. all 48 standards have exactly five reviewed V2 families;
2. generated-instance checks pass;
3. secure Path eligibility is proved for tool families;
4. candidate bank passes full platform tests/build/lint;
5. canonical draft + both seed mirrors are identical for the promoted bank.
