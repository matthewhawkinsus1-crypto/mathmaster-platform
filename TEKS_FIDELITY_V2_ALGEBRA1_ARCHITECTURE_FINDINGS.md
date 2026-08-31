# TEKS Fidelity V2 — Algebra I Architecture Findings

This file records the findings that are **not individual-question authoring problems**. They must be resolved once for the whole Path content system.

## P0 — Two Algebra I sources of truth

The repository currently contains two complete but non-overlapping Algebra I family sets:

- Older authoring modules in `seed/pathQuestionBank/authoring/algebra1*.mjs`: 245 parsed code+slug families.
- Shipping compiled seed `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`: 245 active generated families.

Matching code+slug pairs: **0 / 245**.

The shipping seed and `functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json` mirror are byte-identical, so runtime deployment is internally consistent. The problem is repository governance: `scripts/build-path-bank.mjs` still describes/writes the older authored-module family set.

### Risk

A future maintainer can reasonably run `node scripts/build-path-bank.mjs` believing it regenerates the current course bank. It would instead write a different Algebra I bank. Even if CI does not run that command today, retaining two complete authorities is a regression trap.

### Required decision

Fidelity V2 must establish one canonical source:

1. **Preferred:** move the shipping generator templates into a committed authoring source and make the build deterministically produce both seed mirrors.
2. Retire or archive the older Algebra I source modules so no executable build path can overwrite the certified bank from stale content.
3. Add a mirror/build reproducibility check.

## P0 — Multiple-choice answer ID leakage

Current Algebra I contains 11 multiple-choice families.

Stored grading keys:
- `opt-1`: **11 / 11 correct answers**

The server-side generator correctly shuffles the order of `choices[]`, so “click the first button” does not work. However, `buildSanitizedQuestion` deliberately sends public choice IDs and labels to the browser, and generation does not replace those IDs.

Therefore the correct option is whichever shuffled option has ID `opt-1` for every Algebra I multiple-choice item.

### Required fix

Use the same principle already adopted for ASVAB:
- choice IDs must be opaque and must not encode/predict correctness;
- correct-ID assignment should vary by family/instance or be remapped before public issue;
- server-private grading must retain the mapping.

Add a regression test that inspects the actual sanitized public question and proves that knowing the public choice ID cannot identify the correct answer across the bank.

## P0 — Path interaction contract does not cover all Algebra I TEKS actions

Current server-graded Path contracts include:
- algebra
- system
- systemsWorkspace (linear systems)
- relationMapping
- intervalNumberLine
- stepAlgebra
- functionInvestigation
- multiAnswer

That is enough for many standards but not all 49.

### Missing/insufficient authentic acts

- **A.3D:** graph a linear inequality in two variables. The current bank incorrectly uses `intervalNumberLine`, which assesses a one-variable solution set.
- **A.3H:** graph a system of two linear inequalities and identify the overlap region. No current Path region-shading contract.
- **A.4A:** calculate/interpret correlation coefficient using technology. No Path data/statistics contract.
- **A.4C:** fit a linear model to data using technology. No Path regression/modeling contract.
- **A.8B:** fit a quadratic model to data and make predictions. No Path regression/modeling contract.
- **A.9E:** fit an exponential model to data and make predictions. No Path regression/modeling contract.

### Required fix

Do not substitute typed numeric proxies for an action the TEKS explicitly names.

Either:
1. make the existing assignment/data-modeling tools Path-eligible with server-authoritative grading, or
2. create a Path-specific data/region contract that reuses the same underlying math and UI.

These standards should not produce “mastery” evidence from proxy families until the authentic act is available.

## P1 — Metadata honesty

The current 245-family set looks structurally diverse because every standard has a planned task/DOK pattern. The audit shows that much of that diversity is metadata, not student experience.

- 49 `errorAnalysis` labels; **2** prompts actually present an error/claim/mistake.
- 25 `table` representation labels; **7** families actually contain a table stimulus.
- DOK/difficulty correlation: **~0.845**.
- 33/49 standards use the exact task progression:
  `procedural D1/B2 -> representationTranslation D2/B3 -> application D2/B3 -> errorAnalysis D3/B3 -> reverseReasoning D3/B4`.

### Required rule

A metadata label must be earned by the rendered task:
- `table` requires a rendered table (not coordinates embedded in prose);
- `graph` requires a rendered graph/workspace or graph stimulus;
- `errorAnalysis` requires incorrect reasoning/work/claim for the student to analyze;
- DOK 3 requires strategic reasoning/transfer/justification, not merely a reverse question or larger numbers.

## P1 — Writing standards often do not require writing

A semantic audit of standards whose TEKS explicitly says “write” found:

- A.2C: 0/5 constructed equation/expression responses
- A.2D: 0/5
- A.2H: 0/5
- A.2I: 0/5
- A.4C: 0/5
- A.8B: 0/5
- A.9C: 0/5
- A.9E: 0/5
- A.12D: 0/5

A.2E/A.2F/A.6B/A.6C have some constructed responses, but not enough to cover their complete writing standard.

### Required rule

The production evidence families for a construction standard must require the construction itself in a meaningful share of the bank. Component questions belong as prerequisites/scaffolds, not as substitutes for mastery evidence.

## Recommended implementation sequence

1. Lock the source-of-truth decision.
2. Harden public choice IDs.
3. Add semantic-honesty audit gates.
4. Add predicate grading for genuinely open construction.
5. Add Path contracts for two-variable inequality regions and data/regression modeling.
6. Rebuild the 20 standards in the decision matrix.
7. Enhance the 17 standards.
8. Re-certify the 12 KEEP standards under the stronger gates.
9. Only then redesign My Path progression UI from verified metadata.
