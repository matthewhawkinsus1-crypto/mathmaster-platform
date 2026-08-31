# Algebra I TEKS Fidelity V2 — Corrected Course Findings

## Authority

The authoritative audit target is the shipping compiled seed:
`seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`.

The older seven Algebra I authoring modules are useful only as historical/pedagogical source material. They contain 245 families, but have **0/245 code+slug overlap** with the 245-family shipping Adaptive V2 seed.

## Current conclusion

The shipping bank is structurally healthy but semantically over-certified.

Strengths:
- 245 active families across all 49 content standards, exactly five per standard.
- All 245 are parameterized generators.
- FamilyVersion is consistently 2.
- The shipping seed and Functions mirror are byte-identical.
- Existing generation/issuability work already protects against malformed placeholders, broken arithmetic, and many render failures.

The new Fidelity V2 audit shows that those structural strengths do **not** guarantee TEKS fidelity.

## Course-wide findings

### 1. Metadata diversity is overstated

- 49 families are labelled `errorAnalysis`.
- Only **2/49** actually present a mistake/claim/error for the student to analyze.
- 25 families are labelled `table`.
- Only **7/25** contain an actual table stimulus.
- DOK/difficulty correlation is approximately **0.845**.
- 33 of 49 standards use the same five-role task/DOK/band pattern.

This means the current production-quality labels often describe the intended slot rather than the rendered student task.

### 2. Many writing standards do not make the student write

Standards with **0/5** equation/expression/inequality responses include:
A.2C, A.2D, A.2H, A.2I, A.4C, A.8B, A.9C, A.9E, and A.12D.

The bank often measures a coefficient, slope, root, factor, or output instead of the construction named by the TEKS.

### 3. Several graph/technology standards are assessed through proxies

Most serious:
- A.3D is a two-variable graphing standard but currently uses a one-variable number-line interaction.
- A.3H has no graph-region interaction.
- A.4A/A.4C/A.8B/A.9E require technology/data/model fitting, but the Path contract has no data/regression tool.

### 4. Multiple-choice IDs expose a universal answer-key pattern

All 11 Algebra I multiple-choice families store `opt-1` as the correct id. Option order is shuffled, but the public question preserves each choice id. This is a payload/devtools leakage pattern and should be hardened the same way ASVAB was.

### 5. The bank is not an ASVAB-style total failure

The mathematics is often sound and the generator architecture is useful. The right response is targeted:
- **KEEP 12**
- **ENHANCE 17**
- **REBUILD 20**

See `TEKS_FIDELITY_V2_ALGEBRA1_49_STANDARD_MATRIX.md` for the full decision.

## Corrected note on open-ended grading

The earlier open-ended-whitelist concern came from the **older source modules**, not the shipping Adaptive V2 seed. It remains a future authoring safeguard, but it is not counted as a current shipping defect.

## Direction

Do not redesign My Path around the current DOK/task/representation metadata yet. Repair/certify the content and metadata first, then let Path expose the verified progression.
