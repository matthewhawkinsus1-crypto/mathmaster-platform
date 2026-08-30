> **Audit status note (superseded for shipping-bank verdicts):** This review was produced from the older Algebra I authoring modules before the audit confirmed that those 245 source families have **0/245 code+slug overlap** with the 245-family shipping Adaptive V2 seed. Keep this file as pedagogical/source-history evidence only. The authoritative current-bank verdict is `TEKS_FIDELITY_V2_ALGEBRA1_49_STANDARD_MATRIX.md`.

# TEKS Fidelity V2 — Algebra I Strand Review 2

Scope: systems/data, quadratics, and exponentials. Read-only audit; no student bank changes in this commit.

## Overall finding

These strands confirm the pattern seen earlier: the Algebra I bank is not an ASVAB-style invalid bank. It contains substantial representation variety, misconception-aware feedback, graph/table/context work, and purposeful DOK/difficulty spread. The dominant Fidelity V2 need is ENHANCE, with targeted correctness/grading repairs rather than wholesale replacement.

## Systems and data

### Strong evidence / KEEP-quality families
- A.3F includes an actual two-line graph workspace, table interpretation, classification, error analysis, and reverse construction.
- A.3G connects graphical estimation to exact algebra and includes discrete-context reporting.
- A.4A distinguishes direction from strength of correlation and explicitly warns that near-zero r only rules out a linear relationship.
- A.4B uses confounding/causation reasoning rather than treating correlation as causation.

### ENHANCE / VERIFY
1. Open-ended reverse-design grading recurs here. A.3E asks for any falling line through (0,-3), A.3F asks for any parallel distinct line, and A.3H asks for any inequality that admits one point and excludes another. The source enumerates a finite accepted list even though infinitely many answers are mathematically valid. Verify condition/equivalence grading at runtime; if absent, replace whitelist semantics with mathematical predicates.
2. A.3F and A.3G are pedagogically connected in prose, but Path should eventually make the progression visible: graph/estimate -> classify -> verify algebraically -> interpret in context.
3. Systems-of-inequalities content has conceptual boundary/overlap/context work, but Fidelity V2 should ensure students actually graph/shade a system, not only identify/test regions. If no active graph-interaction family exists in the compiled bank for A.3H, add one.
4. Data standards should be sampled for repeated stock contexts. Authentic data reasoning benefits from multiple datasets, scatterplot shapes, nonlinear counterexamples, and study-design situations rather than only changing numbers.

Verdict: systems/data = ENHANCE, with several KEEP-quality families.

## Quadratics

### Strong evidence / KEEP-quality families
- A.6A distinguishes unrestricted algebraic domain from context-restricted domain/range and uses table, number-line, symbolic, and projectile contexts.
- A.6B includes vertex/point construction, form conversion, an actual graph workspace, error analysis, and reverse design.
- A.6C begins from zeros/factors and includes graph representation, giving the strand real form-to-feature translation rather than five procedural clones.

### ENHANCE / VERIFY
1. Reverse-design grading issue recurs in A.6B: any negative a with vertex (-1,8) is valid, but the authoring source lists only a few accepted equations. This needs predicate/equivalence grading or a constrained prompt.
2. Quadratic progression should become explicit metadata: features/domain-range -> vertex form -> zeros/factored form -> standard form -> graph -> solve/interpret. Families currently contain many of these ingredients but Path does not expose the conceptual journey.
3. DOK 3 reverse-design items must be reviewed for strategic demand. If the only decision is "choose any negative coefficient," the task may be open-ended without truly being DOK 3. Increase constraints when needed so multiple conditions must be coordinated.
4. Generator durability should vary vertices, zeros, scale factors, opening direction, context bounds, and representation—not merely coefficients inside one fixed skeleton.

Verdict: quadratics = ENHANCE, not rebuild.

## Exponentials

### Strong evidence / KEEP-quality families
- A.9A uses number-line range, asymptote reasoning, tables, context-restricted domain, and reverse matching.
- A.9B correctly separates growth/decay factor from percent change and uses table interpretation and misconception analysis.
- A.9C models repeated percentage change and explicitly contrasts multiplicative growth with linear/additive errors.

### ENHANCE / VERIFY
1. Ensure students graph exponential ordered pairs/functions in at least one active family and connect table -> graph -> equation -> asymptote/domain/range. The current strand has these representations, but the Path sequence should intentionally connect them.
2. Add/verify comparison families that force students to distinguish linear vs exponential from tables, contexts, and graphs, not just from equation syntax.
3. Repeated-session durability should vary growth vs decay, percent vs factor language, initial values, time units, asymptote shifts/reflections, and discrete vs continuous contexts.
4. Audit DOK 3 labels: reverse matching from four equations can be good reasoning but is not automatically DOK 3. DOK should depend on the reasoning structure, not the presence of a reverse prompt.

Verdict: exponentials = ENHANCE, with many KEEP-quality families.

## Cross-strand defects now confirmed as Fidelity V2 priorities

1. **Open-ended whitelist risk** — multiple standards ask for any valid equation/inequality but enumerate only examples in `accepted`. This must be verified against runtime mathematical grading before release.
2. **Open-ended != DOK 3** — several reverse-design tasks appear to earn DOK 3 largely because there are multiple valid answers. Fidelity V2 should require coordination of constraints, justification, transfer, or strategy for DOK 3.
3. **Progression metadata is missing** — strong individual families exist, but My Path cannot yet show the student a coherent representation/concept progression.
4. **Repeat-session durability needs explicit testing** — generator existence is not enough; generated instances must preserve mathematical variety and avoid recognizable task clones.
5. **Interactive representation coverage should be required where appropriate** — standards about graphs, systems, sequences, quadratics, and exponentials should include genuine graph/table manipulation rather than only questions *about* those representations.

## Current course-level direction

Do not rebuild Algebra I wholesale. Preserve strong families, repair correctness/grading risks, strengthen weak DOK 3 tasks, add missing interactive/connected representations, and formalize progression metadata. The likely course-level result is a Fidelity V2 enhancement release rather than a replacement bank.