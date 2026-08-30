# Algebra I TEKS Fidelity V2 — Current Checkpoint and Next Actions

## Current checkpoint

The Algebra I audit remains isolated on `audit/teks-fidelity-v2-algebra1` in draft PR #80.

**Nothing in this Fidelity V2 lane has been promoted to the shipping Algebra I draft, seed mirrors, or Firestore.**

The original 49-standard decision matrix remains:

- **KEEP: 12**
- **ENHANCE: 17**
- **REBUILD: 20**

The project has now moved well beyond the original audit-only checkpoint:

- **All 20 REBUILD standards have complete five-family Fidelity V2 replacement packages.**
- Six ENHANCE standards are also staged: **A.2B, A.2D, A.2E, A.2F, A.5B, A.11A**.
- One KEEP standard, **A.12C**, has a staged enhancement because its sequence/table/discrete-graph progression was worth strengthening even though its original mathematics was fundamentally sound.
- Total staged candidate coverage is therefore **27 standards / 135 families**.
- The assembled candidate still remains **245 families across 49 standards** by carrying forward the 22 unstaged standards unchanged.

## Phase 0 architecture — resolved or implemented

### 1. Canonical Algebra I source of truth — RESOLVED

`drafts/algebra1.json` is the declared authoring source of truth.

The shipping mirrors are:

- `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`
- `functions/seeds/pathQuestionBank/algebra1_pathQuestionBank_seed.json`

The older executable `seed/pathQuestionBank/authoring/algebra1*.mjs` modules are explicitly noncanonical for this Fidelity V2 release and must not be used to rebuild the bank.

### 2. Predictable public multiple-choice IDs — IMPLEMENTED, TEST CONFIRMATION PENDING

Private authoring IDs such as `opt-1` are no longer intended to travel to the browser.

The secure Path boundary now:

- derives opaque runtime choice IDs from the concrete issued question;
- keeps the same IDs on a replay of that concrete question;
- gives a different generated question a different choice namespace;
- maps the server's private expected answer to the same opaque ID;
- supports both question-level and field-level choices;
- does not derive the opaque ID from correctness.

Regression tests verify that a browser-submitted opaque ID grades correctly and that submitting the private author ID does not.

### 3. Semantic-honesty gates — IMPLEMENTED AND EXPANDED

The Fidelity V2 gates now check or explicitly inspect:

- real error-analysis tasks rather than metadata-only labels;
- real table stimuli for table representations;
- real graph stimuli or graph-capable tools for graph representations;
- DOK separately from difficulty;
- full equation/inequality/expression construction for writing standards;
- authentic tool-backed regression writing;
- public choice-ID secrecy at the issued-question boundary;
- generated-instance issuability rather than template appearance alone.

### 4. Candidate verification workflow — HARDENED

The full mixed candidate can now be verified without falsely rejecting unchanged published IDs:

`node scripts/verify-path-drafts.mjs drafts/algebra1.fidelity-v2.candidate.json --allow-existing-ids`

Semantic and cognitive audits can inspect the candidate directly with `--bank`, so no shipping path has to be edited just to audit a candidate.

## Path capability work completed for the rebuild standards

### Two-variable inequalities: A.3D and A.3H

`systemsWorkspace` now has a server-authoritative Path construction contract.

Students construct the graph rather than being shown the answer:

- two points per boundary;
- solid versus dashed boundary;
- shade above versus below;
- every boundary graded server-side;
- system overlap produced from the student's own construction.

### Correlation and regression: A.4A, A.4C, A.8B, A.9E

`dataModelingLab` now has secure Path modes for the defining TEKS actions:

- **A.4A:** calculate and enter correlation coefficient `r`, then interpret direction/strength;
- **A.4C:** write a fitted linear function and make the requested prediction;
- **A.8B:** write a fitted quadratic function and make the requested prediction;
- **A.9E:** write a fitted exponential function and predict, including both growth and decay.

The authored prediction input is held server-side and cannot be replaced by the browser with an easier input.

### Full polynomial expressions: A.10A–D

The secure answer-equivalence path now accepts mathematically equivalent **expanded polynomial expressions** while preserving form requirements.

This allows complete polynomial-operation answers to be graded fairly without accepting a factored answer when the task explicitly requires expanded form.

### Read-only graph stimuli: A.2C, A.2H, A.2I, A.12A

Field-graded Path questions can now securely show a graph while still requiring the student to write/classify the mathematics.

The public graph allowlist supports:

- visible plotted points;
- one or more visible lines from point pairs;
- solid/dashed line style;
- visible half-plane shading;
- sampled curve points where appropriate;
- bounds and accessibility labels.

Private equations, grading keys, and hidden author fields are not admitted into the graph payload.

That capability now supports:

- **A.2C:** graph → linear equation;
- **A.2H:** shaded graph → two-variable inequality;
- **A.2I:** two-line graph → system of equations;
- **A.12A:** plotted relation → function classification using the vertical-line test.

## Rebuild status

All 20 standards originally classified REBUILD now have five staged V2 families:

**A.2C, A.2H, A.2I, A.3D, A.3H, A.4A, A.4C, A.8A, A.8B, A.9C, A.9E, A.10A, A.10B, A.10C, A.10D, A.10E, A.10F, A.11B, A.12A, A.12D.**

Do **not** call these production-released until the current whole-branch verification is green and the candidate-bank inspection below is complete.

## Remaining Algebra I content work

### ENHANCE standards not yet staged

Eleven ENHANCE standards still use their original five families and need the same careful review before Algebra I is finalized:

**A.2A, A.2G, A.3A, A.3C, A.3G, A.6A, A.6B, A.6C, A.7A, A.9A, A.9D.**

For each:

1. preserve families whose mathematics genuinely performs the TEKS action;
2. replace only the weak/mislabeled families;
3. add missing representations where they improve the evidence;
4. correct DOK/task metadata rather than mechanically increasing rigor;
5. run generated-instance inspection.

### KEEP certification pass

The KEEP set still needs final generated-instance certification even when its mathematics is retained:

**A.3B, A.3E, A.3F, A.4B, A.5A, A.5C, A.7B, A.7C, A.9B, A.12B, A.12E**.

**A.12C** is already staged as an enhancement and should be certified with that package rather than reverted to its original KEEP version.

## Required whole-bank checkpoint before promotion

Do not rewrite `drafts/algebra1.json` or seed mirrors until all of the following are green/reviewed:

1. current GitHub Correct Answer Acceptance Audit;
2. current Full Platform Test Suite;
3. staged Fidelity V2 issuability test;
4. 27-standard candidate assembly test;
5. build the nonshipping candidate;
6. verify the entire candidate with `--allow-existing-ids`;
7. semantic fidelity audit against the candidate;
8. cognitive/DOK audit against the candidate;
9. generator health / generated-prompt inspection;
10. manual spot inspection of every changed standard, especially graph/data-modeling interactions;
11. confirm any Vercel failure is code-related before treating it as a blocker — the current Vercel red status has been a deployment **build-rate-limit**, not a test verdict.

## Promotion order after Algebra I is truly green

1. Promote the reviewed 245-family candidate into `drafts/algebra1.json`.
2. Rebuild both Algebra I seed mirrors from the canonical draft.
3. Rebuild any Path coverage/manifest artifacts required by the importer.
4. Run the full platform suite again against the promoted source.
5. Review the final diff.
6. Only then consider the Firestore content refresh/deploy.

## What follows Algebra I

Use the same Fidelity V2 method rather than a lighter bulk rewrite:

1. remaining TEKS course banks (Grade 6, Grade 7, Grade 8, Algebra II);
2. CCMR banks (SAT, ACT, TSIA2, ASVAB and any other active CCMR route), preserving each assessment's authentic item demands;
3. then the Path student experience/progression layer, after its content metadata and evidence families can be trusted.

The Path UI should visualize verified progression and authentic student acts—not compensate for weak content underneath it.
