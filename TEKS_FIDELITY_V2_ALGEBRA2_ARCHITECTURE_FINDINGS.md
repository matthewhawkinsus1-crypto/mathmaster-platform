# Algebra II TEKS Fidelity V2 — Architecture Findings

## Audit lane

Branch: `audit/teks-fidelity-v2-algebra2`

This lane starts from `main` and is independent from the Algebra I draft PR. No Algebra II content is deployed by this audit.

## Shipping bank shape

Algebra II contains:

- 48 content standards;
- exactly 5 families per standard;
- 240 question families total.

The registered content standards run from A2.2A through A2.8C.

## Source-of-truth finding

Three 240-family copies existed:

- `drafts/algebra2.json`
- `seed/pathQuestionBank/algebra2_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/algebra2_pathQuestionBank_seed.json`

All 240 ids were shared across all three copies. The two installed seeds were identical to each other.

The draft differed in exactly one family:

`mm_A2_2B_gen2_inverse-point-graph`

The installed seed version was newer and stronger. It had familyVersion 3 and the secure inverse-reflection workflow added in August 2026:

- reflect both plotted points across y=x;
- draw the inverse on the same coordinate plane;
- require the inverse sketch;
- require the inverse equation.

The draft still contained the earlier familyVersion 2 form that only asked for one inverse point.

## Resolution

The stronger shipping A2.2B family was reconciled back into `drafts/algebra2.json`.

After that reconciliation, `drafts/algebra2.json` is the declared Algebra II Fidelity V2 authoring source of truth.

The two installed seed files are mirrors and must be rebuilt from that draft, not edited independently.

The older executable modules under `seed/pathQuestionBank/authoring/algebra2*.mjs` are not automatically authoritative. They must not be used to regenerate shipping content unless a later audit explicitly proves equivalence to the canonical draft.

## Guardrails added

- `scripts/build-algebra2-fidelity-v2-bank.mjs`
  - checks 240 families / 48 standards / five families each;
  - checks both installed mirrors against the draft;
  - rebuilds mirrors from the draft.

- `tests/platform/algebra2FidelityV2Source.test.mjs`
  - protects 48 × 5 coverage;
  - protects mirror equality;
  - protects the full A2.2B inverse-reflection workflow from regression.

## Next audit step

Do not bulk-rewrite Algebra II.

The next step is the same semantic-fidelity pass used for Algebra I:

1. compare each TEKS description to what the five families actually make a student do;
2. classify each standard KEEP / ENHANCE / REBUILD;
3. separate DOK from difficulty;
4. identify missing representations and fake representation labels;
5. identify writing/modeling standards whose questions only ask for components;
6. identify technology standards that never use technology;
7. identify Path capability gaps before authoring around them;
8. stage replacements standard-by-standard and keep the shipping bank untouched until the full candidate is certified.
