# TEKS Fidelity V2 — Algebra I Audit

Status: **IN PROGRESS — read-only baseline**

Branch: `audit/teks-fidelity-v2-algebra1`

This audit is intentionally separate from the ASVAB rebuild and does not change production content, Firestore, Path releases, or student behavior until the bank has been classified.

## Goal

Move the Algebra I Path bank from "enough valid families to issue a session" to a durable instructional bank that remains mathematically sound, varied, adaptive, and useful across repeated student sessions.

The final disposition for each standard will be one of:

- **KEEP** — already meets Fidelity V2 expectations.
- **ENHANCE** — sound core content, but missing durability, representation, progression, feedback, or adaptive depth.
- **REBUILD** — family design or mathematical validity is not trustworthy enough to preserve.

## Existing strengths confirmed

The existing Path quality layer is a strong starting point. A standard is not considered production-ready merely because five records exist: the current model expects a session's worth of polished families, representation and task-type variety, more than one difficulty band and DOK level, and no duplicate-family signal.

The compiled Algebra I seed also contains true parameterized families. Example: A.2A derives interval endpoints from the same generated parameters used in the prompt, rather than hard-coding a fixed answer. This is the correct architecture and should be preserved.

## New Fidelity V2 dimensions

The current production-quality gate is necessary but not sufficient. Fidelity V2 adds the following dimensions.

### 1. Repeat-session durability

A family should remain useful after a student has seen the same standard multiple times. The audit measures whether a family actually varies the mathematical instance and whether repeated sessions collapse into memorizing a small set of fixed questions.

### 2. Generator integrity

For generated families:

- expected answers must derive from the same parameters shown to the student;
- generated values must not create impossible, trivial, contradictory, or malformed instances;
- answer forms must remain valid over the full parameter range;
- generated multiple-choice items must not produce duplicate/equivalent options.

### 3. Answer-pattern leakage

The audit looks for answer clues that bypass the mathematics, including:

- correct-answer identifiers or metadata exposed in choice ids;
- magnitude/sign/position patterns;
- distractors built mechanically around the key;
- one answer with visibly different formatting or structure.

### 4. Authentic misconception quality

Distractors and feedback should reflect plausible student reasoning, not merely nearby values. Feedback should be specific enough to the family to help a student recover from the actual misconception.

### 5. Representation fidelity

Representation diversity is judged instructionally, not just by metadata labels. A table, graph, equation, context, ordered-pair set, or tool interaction counts only when the student actually has to reason with that representation.

### 6. Concept progression

Standards that naturally form a progression should support it. Five individually valid questions are not enough if the bank never asks students to connect the mathematics across representations.

Example under review: the sequence/function strand. A.12C and A.12D currently include recursive rules, explicit rules, tables, error analysis, and applications, but the authored progression does not yet clearly require a student to move through term number -> value table -> discrete ordered pairs/graph -> recursive rule -> explicit rule. That is a likely **ENHANCE** area rather than an automatic rebuild.

### 7. DOK and difficulty independence

DOK measures cognitive depth; difficulty measures structural complexity. A harder computation is not automatically deeper thinking. The existing `audit-dok-difficulty.mjs` already tests for collapsed metadata and impossible recommendation targets; Fidelity V2 will preserve that distinction while auditing whether the labels match the actual task.

### 8. Student-facing coaching quality

Repeated generic feedback can make many mathematically different families feel identical. Early inspection of the compiled A.2A families shows repeated stock feedback such as "Use the given information to identify the relationship before computing" and a repeated generic support hint. This is not a mathematical defect, but widespread reuse would be an instructional-quality weakness and is now measured separately.

## Baseline probe added

`tests/platform/teksFidelityV2Audit.test.mjs`

The probe is read-only and reports:

- active Algebra I family count;
- standards represented;
- generated vs static families;
- per-standard family count;
- representation/task/DOK/difficulty breadth;
- missing solution reviews, feedback, or hints;
- suspicious taskType/DOK combinations;
- standards dominated by static families;
- standards dominated by repeated generic feedback;
- exposed choice identifiers containing `correct`, `answer`, or `key` markers.

It currently passes as a measurement test and changes no bank content.

## Early findings

1. **Do not rebuild Algebra I wholesale.** The compiled bank already uses parameterized generation and has a meaningful production-quality model. The evidence so far supports a KEEP / ENHANCE / REBUILD audit rather than an ASVAB-style automatic replacement of everything.

2. **The compiled bank must be the source of truth.** Some authoring-source snippets look fixed while the compiled seed contains parameterized generated versions. Fidelity decisions will therefore be made against the actual seed/runtime families, not source appearances alone.

3. **Current production-ready status does not prove repeat-session durability.** This is the clearest missing quality axis and should become a permanent audit, not a one-time review.

4. **Sequence progression deserves a deliberate enhancement review.** The current content includes several useful task types, but the bank should more intentionally connect term number/domain, term-value tables, discrete graphing, and equations.

5. **Generic coaching reuse is visible in the first compiled families inspected.** It is not yet classified as a bank-wide failure; the baseline probe will quantify it before any content is rewritten.

## Next audit pass

The next pass classifies all Algebra I standards using the baseline metrics, then performs manual mathematical review on the highest-risk groups:

1. generator/expected-answer mismatches or weak parameter ranges;
2. standards lacking true representation/task diversity;
3. DOK/difficulty anomalies;
4. static or repeat-session-fragile standards;
5. multiple-choice/distractor families with answer leakage risk;
6. standards where conceptual progression is more important than isolated family variety.

No production deployment or Firestore refresh should occur from this branch during the audit phase.
