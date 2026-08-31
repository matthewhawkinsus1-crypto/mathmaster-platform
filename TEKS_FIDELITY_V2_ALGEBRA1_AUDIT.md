# TEKS Fidelity V2 — Algebra I Audit

Status: **COURSE AUDIT COMPLETE ENOUGH FOR STAGED REPAIRS — NOT READY TO MERGE/DEPLOY**

Branch: `audit/teks-fidelity-v2-algebra1`

## Current course result

- Shipping authority audited: `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`
- Canonical Adaptive V2 authoring source for Fidelity V2: `drafts/algebra1.json`
- 49 Algebra I standards
- 245 active generator families
- five families per standard
- **KEEP: 12**
- **ENHANCE: 17**
- **REBUILD: 20**

The full standard-by-standard disposition is in `TEKS_FIDELITY_V2_ALGEBRA1_49_STANDARD_MATRIX.md`.

## Central finding

The Algebra I bank is not an ASVAB-style structural failure. Server-side generation, secure answers, five-family coverage, and issuability are valuable. The primary weakness is **semantic fidelity**: a family can be valid and generative while measuring a nearby skill instead of the action named by the TEKS.

Examples confirmed by the audit:

- writing standards with zero formula/equation/inequality responses;
- A.3D using a one-dimensional number line under a two-variable coordinate-plane graphing standard;
- A.3H lacking an authentic inequality-region graph interaction;
- regression/model-fitting standards using already-given models instead of fitting/writing them;
- polynomial operation standards asking only for one coefficient/root instead of the full operation;
- DOK 3 / errorAnalysis metadata attached to routine one-step work;
- `table` representation labels without an actual table stimulus.

## Executable audit added

- `scripts/audit-algebra1-teks-fidelity-v2.mjs` — compiled-bank mechanical baseline.
- `scripts/audit-algebra1-cognitive-fidelity-v2.mjs` — task-label/DOK contradiction review.
- `scripts/audit-algebra1-semantic-fidelity-v2.mjs` — TEKS-action, representation-honesty, DOK/difficulty coupling, choice-id pattern, and high-confidence semantic checks.
- `tests/platform/teksFidelityV2Audit.test.mjs` — baseline regression coverage.

## Source governance resolved

The Aug. 23 Adaptive V2 migration established `drafts/algebra1.json` as the authoring/source package whose `documents` match the installed Algebra I seed. Fidelity V2 now formalizes that path:

- `scripts/build-algebra1-fidelity-v2-bank.mjs` builds/checks both installed seed mirrors from the draft source.
- `tests/platform/algebra1FidelityV2Source.test.mjs` protects the 49×5 inventory and mirror equality.
- The older seven `seed/pathQuestionBank/authoring/algebra1*.mjs` modules are a separate, non-overlapping generation and are **not** the shipping Fidelity V2 authoring source.

## Staged repair workflow

Shipping content is not edited directly while a standard is being rebuilt.

- staged packages: `drafts/fidelity-v2/algebra1/<TEKS>.json`
- candidate builder: `scripts/build-algebra1-fidelity-v2-candidate.mjs`
- candidate output: `drafts/algebra1.fidelity-v2.candidate.json`
- staged regression tests: `tests/platform/algebra1FidelityV2Staged.test.mjs`

A staged standard must pass the production draft verifier, generated-instance inspection, semantic/cognitive audits, answer-acceptance checks, and the full platform suite before promotion.

## First staged rebuild — A.12D

A.12D is the first candidate because the shipping bank calculates terms/positions but does not consistently perform the TEKS act: **write an nth-term formula from several terms**.

`drafts/fidelity-v2/algebra1/A.12D.json` now contains five new, unpublished families:

1. arithmetic term-number/value table → explicit formula;
2. geometric term-number/value table → explicit formula;
3. geometric decay terms → explicit formula;
4. genuine error analysis of the `n` versus `n-1` mistake;
5. nonconsecutive terms (`f(4)` and `f(9)`) → reconstruct the sequence → explicit formula.

The table families explicitly identify term number `n` as the input/domain, addressing the representation gap that prompted the sequence review. Every family requires the student to write the formula rather than return one coefficient or one term.

## Repair order

### Can be rebuilt with current grading/response architecture
- A.2C, A.2H, A.2I
- A.8A
- A.9C
- A.10A–F
- A.11B
- A.12A, A.12D

### Need interaction architecture before final certification
- A.3D, A.3H — server-graded two-variable inequality-region graphing
- A.4A, A.4C, A.8B, A.9E — Path-eligible data/regression/technology modeling

## Merge/deploy rule

PR #80 remains a development lane. **Do not merge or deploy it yet.** Staged replacement content is deliberately not wired into the shipping draft or Firestore bank until it passes the complete verification path and the interaction-dependent standards are either implemented or blocked from false production certification.
