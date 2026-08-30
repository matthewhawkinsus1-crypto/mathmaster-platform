# Algebra II Fidelity V2 — Continuation Checkpoint

Last updated: 2026-08-30

## Branch

`audit/teks-fidelity-v2-algebra2-current`

This branch starts from the certified Algebra I checkpoint. Do not use the older `audit/teks-fidelity-v2-algebra2` branch because it predates the completed Path adapter work.

## Course bank

- Source bank: `drafts/algebra2.json`
- Standards: 48
- Legacy families: 240 (5 per standard)

## Completed

### A2.2A — REBUILD — STAGED

Official construct: graph the required Algebra II parent functions and, when applicable, analyze key attributes.

Fidelity V2 status:
- 5 Path families
- deterministic sub-variants supported server-side
- covers all seven required parent types:
  - square root
  - reciprocal
  - cubic
  - cube root
  - exponential
  - absolute value
  - logarithmic
- logarithmic coverage includes bases 2, 10, and e
- student must construct graphs, not merely recognize attributes
- graph work is connected to domain/range/intercept/symmetry/asymptote analysis
- secure Path eligibility is checked on generated instances

Files:
- `drafts/fidelity-v2/algebra2/A2.2A.json`
- `tests/platform/algebra2FidelityV2Staged.test.mjs`
- deterministic Path sub-variant support added in `functions/shared/pathQuestionGeneration.mjs`
- sub-variant regression tests added in `tests/platform/pathQuestionGeneration.test.mjs`

## FIRST UNFINISHED STANDARD

### A2.2B

Resume here.

Do not re-audit A2.2A unless its certification test fails.

## Working rules

For each standard:
1. Read the exact TEKS verb/construct.
2. Compare only that standard's five legacy families.
3. Decide KEEP / ENHANCE / REBUILD.
4. Fix the student action, representation, DOK/difficulty truthfulness, generator integrity, and secure grading.
5. Stage exactly five Fidelity V2 families.
6. Add/extend the generated-instance certification gate.
7. Advance immediately to the next standard.

Do not reopen completed standards unless a failing test names them.

## Master sequence

1. Complete all 48 Algebra II standards.
2. Finish remaining Grade 6/7/8 TEKS Fidelity V2 banks.
3. Audit/upgrade remaining CCMR banks.
4. Upgrade Path student experience, access, navigation, and visual progression.
