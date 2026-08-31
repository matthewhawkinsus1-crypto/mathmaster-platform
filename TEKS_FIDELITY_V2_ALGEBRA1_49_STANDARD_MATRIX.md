# Algebra I TEKS Fidelity V2 — 49-Standard Decision Matrix

**Audit authority:** the shipping compiled seed `seed/pathQuestionBank/algebra1_pathQuestionBank_seed.json`. The Adaptive V2 migration established `drafts/algebra1.json` as the matching authoring/source package for that seed, so Fidelity V2 repairs are staged against the draft package and promoted through a controlled builder. The older `seed/pathQuestionBank/authoring/algebra1*.mjs` modules are a separate, non-overlapping generation and are not a source for shipping Fidelity V2 repairs.

**Scope:** 49 Algebra I content standards (A.2A–A.12E), 245 active shipping families, five per standard.

## Decision rubric

- **KEEP** — the mathematics of the current five-family set substantially measures the TEKS. Families may still need the **global Fidelity V2 repairs** below (honest DOK/task metadata, choice-id hardening, feedback, generator review), but the standard does not need a new instructional design.
- **ENHANCE** — the majority of the current mathematics is useful, but one or more central representations/methods/actions are missing or too thin. Preserve the good families and replace/upgrade the weak ones.
- **REBUILD** — the central action named by the TEKS is absent, a required interaction/technology act is replaced by a proxy, or most of the five families measure component facts rather than the standard itself.

## Global findings that apply before any standard can be certified

1. **Task metadata is mechanically inflated.** All 49 standards have one family labelled `errorAnalysis`; only two actually present a mistake/claim/error in the prompt. The other 47 are ordinary solve/find items.
2. **Representation metadata is sometimes fictional.** 25 families are labelled `table`; only seven carry an actual table stimulus.
3. **DOK and difficulty are too tightly coupled.** Across the Algebra I bank the correlation is approximately **0.845**. Thirty-three standards use the identical pattern: procedural D1/B2, representation translation D2/B3, application D2/B3, error analysis D3/B3, reverse reasoning D3/B4.
4. **Open/reverse wording is being used as a DOK shortcut.** A reverse prompt is not automatically DOK 3; many current D3 tasks are one-step parameter recovery.
5. **Multiple-choice IDs leak a universal key pattern.** All 11 Algebra I choice families store `opt-1` as the expected choice. Runtime shuffling moves the option, but the public payload preserves the choice IDs, so an inspected payload can reveal the key pattern.
6. **Source governance is now resolved for Fidelity V2.** `drafts/algebra1.json` is the canonical Adaptive V2 authoring package; both installed Algebra I seeds are mirrors generated from it. The older seven Algebra I source modules remain historical/pedagogical references only.
7. **The current Path tool contract cannot authentically assess several technology/graph standards.** It supports algebra, systems, systemsWorkspace (linear mode), relationMapping, intervalNumberLine, stepAlgebra, functionInvestigation and multiAnswer, but not a full two-variable inequality-region tool or data/regression lab.
8. **Generator stability is not the primary weakness.** The Adaptive V2 migration already established generator/issuability/render stability. The Fidelity V2 problem is semantic: what the task actually measures, whether the representation is real, and whether the cognitive-demand metadata is honest.

---

## A.2 — Writing linear functions, equations, and inequalities

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.2A** Domain/range of linear functions | **ENHANCE** | Generates linear range from domain, reverse domain from range, contextual domain, decreasing range, discrete-domain context. | Strong on numeric interval work but weak on connected table/graph/domain interpretation; D3 labels are inflated. | Preserve range/domain generators. Add a true table/graph family and a discrete ordered-pair/domain family; relabel DOK honestly. |
| **A.2B** Write linear equations from point/slope or two points, in multiple forms | **ENHANCE** | Four of five families require equation responses; point/slope and two-point construction are present. | “Table” label on point-slope family has no table; slope-intercept form dominates; multiple forms are not genuinely assessed. | Preserve equation construction. Add/replace with point-slope and standard-form decisions and one real representation-to-equation family. |
| **A.2C** Write linear equations from table, graph, or verbal description | **REBUILD** | Has a graph workspace, a table-rate task, and context. | **0/5** families require an equation/expression response. Students graph a GIVEN equation, find a slope, or evaluate an output instead of writing the equation from the representation. | Rebuild five families around table → equation, graph → equation, context → equation, representation comparison, and reverse/error reasoning. |
| **A.2D** Write and solve direct-variation equations | **ENHANCE** | Constant of variation, point-to-k, context, missing input/output are covered. | **0/5** families require writing an equation; the bank mostly solves for one component. | Keep solve/interpret families, replace at least two with full direct-variation equation construction from data/context. |
| **A.2E** Parallel line through a point | **ENHANCE** | Parallel slope and through-point construction exist. | Only **2/5** equation responses; several families ask only for slope/intercept. | Keep through-point equation family. Add a graph/ordered-pair construction and a true error-analysis family; reduce component-only items. |
| **A.2F** Perpendicular line through a point | **ENHANCE** | Negative-reciprocal reasoning and through-point construction exist. | Only **1/5** equation response; most families stop at the perpendicular slope or intercept. | Replace component questions so at least three families require a complete line equation in different representations. |
| **A.2G** Horizontal/vertical lines and zero/undefined slope | **ENHANCE** | Real graph interaction for a horizontal line; writes horizontal and vertical equations. | Vertical-line undefined slope is not strongly assessed; “error analysis” and D3 families are simple retrieval. | Preserve graph family and equation writing. Add vertical graph/slope classification and real misconception analysis. |
| **A.2H** Write linear inequalities in two variables from table/graph/verbal description | **REBUILD** | Boundary evaluation and contextual capacity ideas are present. | **0/5** families require an inequality response. No family actually asks students to write the two-variable inequality from a representation. | Rebuild around table → inequality, graph boundary/shading → inequality, verbal constraint → inequality, boundary style, and reverse/error analysis. |
| **A.2I** Write systems of two linear equations from table/graph/verbal description | **REBUILD** | Uses system contexts and intersections. | **0/5** equation responses. Current tasks ask for one coefficient, a total, or an intersection—not the system model. | Rebuild so students write both equations from ticket/mixture/table/graph/verbal situations, with units and variable definitions. |

## A.3 — Graphing and interpreting linear functions/systems

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.3A** Determine slope from table, graph, points, equations | **ENHANCE** | Real graph family, real table family, context, rise/run, missing-coordinate reasoning. | Weak on slope from equations in multiple forms; the D3 “error analysis” is not an error. | Keep graph/table/context families. Replace one with standard-form/point-slope slope extraction and one with genuine error analysis. |
| **A.3B** Calculate and interpret rate of change | **KEEP** | Unit rate, table rate, distance rate, temperature rate, and reverse total-change contexts genuinely target rate. | Metadata/DOK inflation remains, but the mathematical set is faithful. | Keep mathematics; correct task labels/DOK, strengthen interpretation language, and sample generator contexts. |
| **A.3C** Graph linear functions and identify intercepts/zeros/slope | **ENHANCE** | Real graph workspace and intercept/zero reasoning. | Only one family actually graphs; several are single-value evaluations. | Keep graph family; add graph-from-standard-form/point-slope and a multi-feature graph-analysis family. |
| **A.3D** Graph solution set of linear inequalities in **two variables** | **REBUILD** | Has inequality algebra content. | Critical mismatch: one family uses **intervalNumberLine** for a one-variable inequality; other families solve one-variable inequalities or calculate boundary values. | Rebuild around a two-variable inequality graph/shading contract. Do not certify until Path has a server-graded two-variable inequality interaction. |
| **A.3E** Effects of transformations of the linear parent | **KEEP** | Shift, stretch, reflection, context shift, reverse shift all measure transformation effects. | Mostly metadata honesty and lack of a direct graph comparison. | Keep core families; relabel DOK/task and optionally replace one with real before/after graph comparison. |
| **A.3F** Graph systems and determine solutions | **KEEP** | Real systemsWorkspace, symbolic solve, context equality, parallel classification, reverse intercept. | “Error analysis” family is classification, not error analysis; DOK inflation. | Keep core set; correct metadata and add a true graph-reading precision/error family if desired. |
| **A.3G** Estimate graphically solutions of systems in real-world problems | **ENHANCE** | One real systemsWorkspace context; ticket/mixture and break-even contexts are useful. | Most families solve exactly rather than **estimate graphically**; the defining TEKS action is too thin. | Preserve contexts, but make graph estimation the primary act in at least three families and then verify/refine algebraically. |
| **A.3H** Graph solution set of systems of two linear inequalities | **REBUILD** | Feasibility/constraint reasoning is mathematically related. | No graph workspace. Every family is numeric boundary/capacity reasoning. | Rebuild after adding a server-graded system-of-inequalities region tool; include boundary style, overlap, test point, context, and reverse construction. |

## A.4 — Data, correlation, and linear models

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.4A** Calculate and interpret correlation coefficient using technology | **REBUILD** | Interpret positive/negative/near-zero (r), compare strength. | No family calculates (r) from data or uses technology; one family drifts into regression prediction. | Build a Path data/regression interaction or explicitly integrate dataModelingLab; require calculation/technology plus interpretation. |
| **A.4B** Association vs causation | **KEEP** | Confounding, random assignment, observational limits, headline flaw, follow-up evidence are strong and varied. | Global choice-ID leak and metadata pattern apply. | Keep mathematical families; harden choice IDs and verify generated contexts/readability. |
| **A.4C** Write linear functions that fit data and make predictions | **REBUILD** | Prediction, residual, extrapolation concepts are useful supporting skills. | **0/5** families require writing a fitted function; no dataset/regression construction. | Rebuild around scatter/table data → fitted model, residual reasoning, interpolation/extrapolation, and prediction using technology. |

## A.5 — Solving linear equations, inequalities, and systems

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.5A** Solve linear equations incl. distribution and variables on both sides | **KEEP** | Real stepAlgebra family with variables both sides, two-step, context, distribution, reverse parameter. | DOK/task metadata is inflated. | Keep mathematics; add a genuine error-analysis family or relabel; generator health sample. |
| **A.5B** Solve linear inequalities incl. distribution and variables on both sides | **ENHANCE** | Real number-line interaction, context cap, negative-coefficient reversal, one authentic error-analysis family. | Distribution and variables on both sides are not well represented. | Preserve current strong families; replace one/two with distribution and variables-both-sides cases. |
| **A.5C** Solve systems in mathematical/real contexts | **KEEP** | Real systemsWorkspace, symbolic solve, context, identity classification, reverse intercept. | Global DOK/task issue only. | Keep mathematics; repair metadata and add misconception detail where useful. |

## A.6 — Writing/analyzing quadratics

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.6A** Domain/range of quadratics using inequalities | **ENHANCE** | Range from graph/vertex, upward/downward cases, projectile max. | Range dominates; domain is nearly absent. | Keep range families; replace at least one with domain/context restriction and one with domain/range translation across graph/table/inequality. |
| **A.6B** Write quadratic from vertex+point; convert vertex to standard form | **ENHANCE** | Graph vertex, writes one vertex-form equation, solves for (a), expansion reasoning. | Only **1/5** equation response; “convert to standard form” is reduced to asking one coefficient. | Preserve graph/vertex family; require full equation construction and a full-form conversion family. |
| **A.6C** Write quadratic from real solutions and related graphs | **ENHANCE** | Two full equation-writing families from zeros/leading coefficient. | No graph-based construction; remaining families are root/coefficient components. | Keep equation-from-zeros families; add graph → zeros → equation and one context/model family. |

## A.7 — Quadratic graphs, factors, transformations

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.7A** Graph quadratics and identify intercepts, zeros, extrema, vertex, axis | **ENHANCE** | Real graph workspace, axis/vertex/zeros relationships. | Only one actual graph family and no one family coordinates the full attribute set. | Add a multi-attribute graph investigation and graph-from-equation family; preserve existing relationship families. |
| **A.7B** Relationship between linear factors and zeros | **KEEP** | Factors → zeros, zeros → factor information, context root, factor check, missing root all match the concept. | Metadata/DOK inflation only. | Keep mathematics; relabel cognitive demand honestly and strengthen true error analysis. |
| **A.7C** Transformations of quadratic parent | **KEEP** | Real graph, horizontal/vertical translation, reflection, reverse shift. | Growth of difficulty/DOK is formulaic. | Keep mathematics; correct metadata and add coefficient/stretch comparison if generator sampling shows thinness. |

## A.8 — Solving and fitting quadratics

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.8A** Solve quadratics by factoring, square roots, completing square, quadratic formula | **REBUILD** | Factoring and square-root methods appear. | Completing the square and quadratic formula are absent; other families ask root products/recovery rather than solving by the named methods. | Rebuild method-balanced set: factoring, square-root property, completing square, quadratic formula, method selection/error analysis. |
| **A.8B** Write quadratic functions that fit data and make predictions using technology | **REBUILD** | Projectile interpretation is mathematically reasonable but belongs elsewhere. | No data set, regression/fitting, technology, or equation-writing. Current five families are evaluating/reading a supplied model. | Replace the standard set around data → quadratic model → prediction/judgment, using a Path data-modeling contract. |

## A.9 — Exponential functions

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.9A** Domain/range of exponential functions | **ENHANCE** | Real graph/asymptote family, range intervals, context domain, reflected range. | “Decay” naming is misleading in places; domain/range progression is not connected. | Keep core families; add actual decay-domain/range representation and connect graph → asymptote → inequality/interval. |
| **A.9B** Interpret exponential parameters in contexts | **KEEP** | Growth percent, initial value, decay percent, growth factor, reverse initial value are faithful. | DOK/task inflation only. | Keep mathematics; relabel DOK/task and sample contexts for authenticity. |
| **A.9C** Write exponential growth/decay functions | **REBUILD** | Component knowledge of base, growth factor, evaluation, initial value is present. | **0/5** families require an equation/expression response; no full model-writing family and decay writing is essentially absent. | Rebuild around context/table/two-point → full exponential equation, both growth and decay, plus misconception/error reasoning. |
| **A.9D** Graph exponential growth/decay and identify y-intercept/asymptote | **ENHANCE** | Real graph workspace and feature questions. | Generator bases for the graph strand are all (>1); true decay graphs are absent. | Preserve growth graph families; replace at least two with (0<b<1) decay and comparative feature tasks. |
| **A.9E** Write exponential functions that fit data and make predictions using technology | **REBUILD** | Prediction/extrapolation concepts are present. | **0/5** equation/expression responses; no regression/fitting technology; all generator bases are simple growth. | Rebuild around data fitting/regression, growth/decay model writing, prediction and extrapolation judgment. |

## A.10 — Polynomial operations and factoring

The whole A.10 strand shows the same semantic weakness: the TEKS names a **full algebraic operation**, while the shipping families usually ask for one coefficient, one constant, one root, or one factor parameter. Component questions can be useful scaffolds but should not constitute the production standard bank.

| TEKS | Verdict | Main gap | Required V2 action |
|---|---|---|---|
| **A.10A** Add/subtract degree 1/2 polynomials | **REBUILD** | Every family returns a number such as one coefficient/constant; students never produce the resulting polynomial. | Require full polynomial sum/difference in most families, with context/error/reverse variants. |
| **A.10B** Multiply degree 1/2 polynomials | **REBUILD** | Families ask for one coefficient/constant rather than the expanded product; breadth beyond simple binomial products is weak. | Build full-product families across monomial/binomial/quadratic cases and misconception analysis. |
| **A.10C** Polynomial quotients | **REBUILD** | Families ask one quotient coefficient, degree, or leading term; no full quotient process. | Add complete quotient tasks (including appropriate polynomial division/factor cancellation) with exact expression grading. |
| **A.10D** Rewrite polynomial expressions using distributive property | **REBUILD** | Tasks ask for GCF or a single coefficient rather than rewriting the expression. | Require full expand/factor rewrites and equivalence checks, not component retrieval. |
| **A.10E** Factor trinomials incl. perfect-square trinomials | **REBUILD** | Even the “factor” family asks for the larger zero; no family requires the full factored expression. | Rebuild with full factoring responses, non-factorable/structure decisions as appropriate, perfect squares, and reverse/error analysis. |
| **A.10F** Recognize/factor difference of squares | **REBUILD** | Component-number questions dominate; no full factorization response. | Require complete ((a-b)(a+b)) factorization in multiple forms/contexts and recognition/error analysis. |

## A.11 — Radicals and exponents

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.11A** Simplify numerical radical expressions | **ENHANCE** | One full radical simplification family plus square-factor reasoning. | Four families ask for only the extracted coefficient/factor instead of the simplified radical. | Keep the conceptual families as scaffolds, but make full simplified radical responses the majority. |
| **A.11B** Simplify numeric/algebraic expressions using integral **and rational** exponents | **REBUILD** | Product/quotient/power rules and negative exponents appear. | Rational exponents are absent; responses ask only for an exponent number rather than simplified expressions. | Rebuild with full expressions, rational↔radical forms, zero/negative/rational exponents, and exponent-law error analysis. |

## A.12 — Functions, sequences, and literal equations

| TEKS | Verdict | What the shipping bank does well | Fidelity gap | Required V2 action |
|---|---|---|---|---|
| **A.12A** Determine whether relations in verbal/table/graph/symbolic forms define a function | **REBUILD** | One real relationMapping family and repeated-input concept. | Only one family truly performs function classification; no graph representation and several tasks merely count inputs/domain size. The “table” label is not a table. | Rebuild around mapping/table/graph/ordered-pair/verbal function tests, with repeated-input misconceptions and real representation translation. |
| **A.12B** Evaluate functions in function notation | **KEEP** | Linear/quadratic evaluation, contextual inverse-style input, expression input, solve-for-input variety. | One D3 label is inflated; some tasks go beyond pure evaluation. | Keep core mathematics; relabel DOK and ensure expression-input evaluation remains prominent. |
| **A.12C** Identify arithmetic/geometric sequence terms recursively | **KEEP** | Arithmetic recursion, geometric recursion, context, common difference, reverse first term are aligned. | No table/graph progression and fake error-analysis label. | Keep current mathematics; add progression metadata and, if a family is replaced, use a term-number/value table feeding a discrete graph. |
| **A.12D** Write nth-term formulas from several terms | **REBUILD** | Arithmetic/geometric term calculation and reverse position are useful prerequisites. | **0/5** families require an equation/expression response; students never write the nth-term formula from several terms. | Rebuild around terms → table → identify type → write explicit formula → use/compare formula. Include arithmetic and geometric cases. |
| **A.12E** Solve formulas/literal equations for a specified variable | **KEEP** | Multiple formula structures require symbolic rearrangement; context formula and product formulas are present. | D3/error-analysis labels are inflated and some tasks solve numerically instead of rearranging. | Keep core symbolic families; replace one weak numerical family with a genuine multi-instance-variable/error-analysis task. |

---

## Course-level verdict counts

- **KEEP: 12 standards**
  - A.3B, A.3E, A.3F, A.4B, A.5A, A.5C, A.7B, A.7C, A.9B, A.12B, A.12C, A.12E
- **ENHANCE: 17 standards**
  - A.2A, A.2B, A.2D, A.2E, A.2F, A.2G
  - A.3A, A.3C, A.3G
  - A.5B
  - A.6A, A.6B, A.6C
  - A.7A
  - A.9A, A.9D
  - A.11A
- **REBUILD: 20 standards**
  - A.2C, A.2H, A.2I
  - A.3D, A.3H
  - A.4A, A.4C
  - A.8A, A.8B
  - A.9C, A.9E
  - A.10A, A.10B, A.10C, A.10D, A.10E, A.10F
  - A.11B
  - A.12A, A.12D

**Important:** REBUILD does not mean every current family is worthless. It means the **production five-family set for that TEKS must be redesigned** because the defining action of the standard is missing or under-measured. Useful current component questions may be retained as bridge/remediation families outside the five production evidence families.

## Recommended repair order

### Phase 0 — architecture before content
1. Canonical source is `drafts/algebra1.json`; seed mirrors must be generated/checked from it.
2. Fix public multiple-choice IDs so the correct answer cannot be inferred from `opt-1`.
3. Add semantic audit gates for task-label honesty, representation honesty, DOK/difficulty independence, and TEKS-action coverage.
4. Define predicate grading for intentionally open construction tasks.

### Phase 1 — standards that currently make invalid mastery claims
1. **A.3D, A.3H** — graphing two-variable inequalities/systems requires a Path graph-region contract.
2. **A.4A, A.4C, A.8B, A.9E** — technology/data-model standards need a Path data-modeling/regression contract.
3. **A.8A** — missing named solution methods.
4. **A.10A–F** — component-answer bank must become full-operation algebra.
5. **A.11B** — rational exponents absent.
6. **A.12A, A.12D** — function-representation and nth-term-writing actions missing.
7. **A.2C, A.2H, A.2I, A.9C** — writing standards currently do not require writing.

### Phase 2 — ENHANCE standards
Replace one or two weak families per standard, correct representations, create genuine DOK 3 tasks, and add progression metadata.

### Phase 3 — KEEP standards
Preserve mathematics, correct metadata/choice IDs, run generated-prompt and misconception audits, then certify.

## What this means for My Path

Do **not** redesign the student Path around the current metadata yet. Today a node can claim “DOK 3 error analysis” when the student is actually doing a direct one-step calculation. Path should eventually consume **verified progression metadata**, for example:

- representation stage (equation / table / graph / context / verbal)
- instructional act (recognize / construct / translate / solve / justify / critique)
- evidence strength (bridge / direct / transfer)
- DOK (verified independently of difficulty)
- difficulty band
- prerequisite edge
- CCMR crosswalk/assessment context

That makes the Path UI a truthful view of the mathematics rather than a visualization of labels that were mechanically stamped onto the bank.
