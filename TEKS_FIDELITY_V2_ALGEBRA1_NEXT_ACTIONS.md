# Algebra I TEKS Fidelity V2 — Final Candidate Checkpoint

## Current state

The Algebra I Fidelity V2 work remains isolated on `audit/teks-fidelity-v2-algebra1` in draft PR #80.

**No Fidelity V2 content has been promoted into the canonical shipping Algebra I draft, seed mirrors, or Firestore yet.**

The original audit classified the 49 Algebra I standards as:

- KEEP: 12
- ENHANCE: 17
- REBUILD: 20

The candidate has now completed the full follow-through rather than stopping at the 20 rebuilds:

- **49 of 49 standards have explicit Fidelity V2 packages.**
- **245 of 245 candidate families are V2 families — five per standard.**
- All 20 REBUILD standards have replacement families that perform the defining TEKS action.
- All 17 ENHANCE standards have targeted representation/content upgrades.
- All 12 original KEEP standards were still re-certified; A.12C received a substantive enhancement and the other 11 received explicit V2 certification packages with metadata, representation, misconception, or task-honesty fixes as needed.
- The final candidate assembly gate now requires all 49 standards to be staged.

## Major capability work completed during the Algebra I sweep

### Secure Path multiple-choice boundary

Private author choice ids such as `opt-1` are no longer treated as student-visible answer positions. The secure issue boundary emits opaque runtime ids and keeps the private mapping server-side.

### Graph stimuli and graph construction

Path now supports secure read-only graph stimuli for representation-to-equation/inequality/classification tasks and secure Graphing2 line construction.

This supports authentic graph evidence for standards including A.2C, A.2G, A.2H, A.2I, A.3C and A.12A.

### Two-variable inequalities

`systemsWorkspace` now has a server-authoritative inequality-construction contract.

For A.3D/A.3H the student constructs:

- two points per boundary;
- solid/dashed boundary style;
- shaded side;
- both boundaries for a system.

The server independently checks the construction.

### Correlation and regression

`dataModelingLab` now supports secure Path modes for:

- A.4A — calculate and enter correlation coefficient r, then interpret direction/strength;
- A.4C — write a fitted linear function and predict;
- A.8B — write a fitted quadratic function and predict;
- A.9E — write a fitted exponential function and predict, including growth and decay.

The requested prediction input is server-held and cannot be changed by the browser.

### Polynomial expression grading

The secure Path grading layer now accepts mathematically equivalent expanded polynomial expressions while still preserving requested form constraints. That enabled complete A.10A–D polynomial operation responses instead of grading one coefficient.

### Exponential graph fidelity

A.9A and A.9D now include both growth and decay graph evidence.

A.9A connects graph/asymptote evidence to domain and range, including contextual domain and reflected range.

A.9D requires plotted exponential points plus y-intercept and horizontal asymptote for both growth and decay.

### KEEP-standard certification

The final KEEP pass specifically prevents the old “mathematically okay = leave untouched” failure mode.

Examples:

- A.3B now has a real table where table evidence is claimed and no mechanical DOK-3 inflation.
- A.3F/A.5C preserve real systems work and use genuine system-classification misconceptions.
- A.4B keeps the strong association-vs-causation bank with secure choice ids and honest representation labels.
- A.12B now evaluates functions in every family rather than drifting into reverse/inverse solving.
- A.12E is predominantly symbolic literal-equation rearrangement and includes a target variable appearing in multiple terms.

## Final Algebra I gates before promotion

All of these must be green/reviewed before changing the shipping source:

1. Correct Answer Acceptance Audit.
2. Full Platform Test Suite.
3. Assignment V5 Foundation regression.
4. Every staged Fidelity V2 family passes the production template issue gate.
5. Final candidate assembly: 49 standards × 5 families = 245 V2 families.
6. Full candidate verification with existing-id allowance where appropriate.
7. Semantic Fidelity V2 audit on the assembled candidate.
8. Cognitive/DOK audit on the assembled candidate.
9. Generator health and generated-prompt inspection.
10. Manual spot review of graph, systems, regression, literal-equation, sequence and polynomial interactions.
11. Vercel red is only a release blocker if it is code-related. The current recurring Vercel failure has been the deployment build-rate-limit, not a test failure.

## Promotion order once green

1. Assemble the reviewed 245-family Fidelity V2 candidate.
2. Promote that candidate into `drafts/algebra1.json`, the declared Algebra I authoring source of truth.
3. Rebuild both seed mirrors from the canonical draft.
4. Rebuild Path coverage/manifest artifacts required by the importer.
5. Run the complete suite again against the promoted source.
6. Review the final diff.
7. Only then refresh/deploy Algebra I content to Firestore.

## Next bank

**Algebra II is next.**

Do not move directly to CCMR after Algebra I.

The intended sequence is:

1. Algebra I final verification/promotion.
2. Algebra II Fidelity V2 audit and upgrade using the same standard-by-standard rubric.
3. Then the remaining CCMR banks (SAT, ACT, TSIA2, ASVAB and any other active route), preserving each assessment's authentic demands.
4. Then the Path student experience/progression redesign, after the underlying TEKS and CCMR evidence is trustworthy.

The Algebra II audit should start from its actual canonical/shipping source and first produce a decision matrix before any bulk rewriting.
