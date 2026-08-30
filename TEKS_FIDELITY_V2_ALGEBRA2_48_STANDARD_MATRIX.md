# Algebra II TEKS Fidelity V2 — 48-Standard Decision Matrix

## Audit anchor

- Branch: `audit/teks-fidelity-v2-algebra2-certified`
- Certified Algebra I base: `780b9e6fbf5cf6d7bdfba8417a1fb392b4369572`
- Algebra II canonical authoring source: `drafts/algebra2.json`
- Current bank: **48 standards × 5 families = 240 families**
- Verdict totals: **15 KEEP · 15 ENHANCE · 18 REBUILD**
- This matrix was produced against the certified Algebra I Path/runtime capabilities, not the stale earlier Algebra II branches.
- Source-of-truth reconciliation completed before this matrix: the stronger shipping A2.2B inverse-reflection family was copied back into the canonical draft.
- No bulk Algebra II promotion or Firestore deployment has started.

## Rubric

- **KEEP** — the five-family set performs the defining TEKS action; only certification, metadata, representation, or modest polish is needed.
- **ENHANCE** — substantial aligned mathematics exists, but one or more families/representations/actions must be replaced or strengthened.
- **REBUILD** — the defining TEKS verb/action is missing or too weak to support mastery evidence.


## A2.2 — Functions and inverses

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.2A** | **REBUILD** | Seven named parent functions must be graphed and analyzed; the legacy bank has only one true graph-construction family and omits cubic/logarithmic graph evidence. | Rebuild around authentic functionInvestigations covering all seven parents and applicable attributes. |
| **A2.2B** | **ENHANCE** | The shipping inverse-reflection family is strong, but only one family performs the full graph + reflect + write-inverse act; the table family is weak. | Preserve inverse reflection; add another nonlinear graph/write inverse family and a real table-to-inverse family. |
| **A2.2C** | **ENHANCE** | Inverse relationships and restrictions are present, but graph/reflection evidence and log-exp analysis are thin. | Add function/inverse graph comparison across y=x and deepen exponential/logarithmic inverse analysis. |
| **A2.2D** | **ENHANCE** | Composition is present, but many items only evaluate one composition instead of verifying both directions with domain restrictions. | Make f(g(x)) and g(f(x)) plus domain restrictions the dominant evidence; add real table/mapping composition. |

## A2.3 — Systems of equations and inequalities

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.3A** | **REBUILD** | The TEKS verb is formulate, but the legacy families mostly recognize/select systems rather than write them. | Require students to write all equations for 3-variable and linear-quadratic systems from context/table/graph/verbal data. |
| **A2.3B** | **REBUILD** | Solving triples is present, but Gaussian elimination and matrix-technology evidence are not authentic; current SystemsWorkspace matrix mode is only 2×2 and not Path-secure. | Build a server-authoritative 3×3 Gaussian/matrix workflow, then balance substitution, elimination, matrix technology, context, and error analysis. |
| **A2.3C** | **REBUILD** | Only a minority actually solve the line-quadratic system; one asks only x-values and several become recognition/counting tasks. | Require complete ordered-pair solution sets for two-, one-, and no-real-intersection cases with substitution/error analysis. |
| **A2.3D** | **KEEP** | Checking both equations, context-invalid roots, domain restrictions, and reasonableness misconceptions directly match the standard. | Keep math; render promised stimuli and normalize DOK/difficulty. |
| **A2.3E** | **REBUILD** | The standard says formulate systems of inequalities, but the current set is recognition-heavy and does not require writing the full system. | Require all inequalities to be written, including strict/inclusive boundaries and contextual nonnegativity/capacity constraints. |
| **A2.3F** | **REBUILD** | Current work mostly reasons about feasible regions instead of constructing the full solution set. | Reuse the certified systemsWorkspace inequality-construction contract: construct every boundary, boundary style, shading, and overlap. |
| **A2.3G** | **KEEP** | Feasible-point testing and possible-solution reasoning directly measure membership in a system solution set. | Keep core math; add real graph/table stimuli where claimed and correct DOK inflation. |

## A2.4 — Quadratic and square-root functions/equations

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.4A** | **REBUILD** | Only one family truly writes a quadratic from three points; the rest identify components or choose a supplied equation. | Make full quadratic-equation construction from three points the recurring act across table, graph, ordered-pair, and error-analysis forms. |
| **A2.4B** | **REBUILD** | The standard requires writing a parabola equation from attributes; current items mostly choose equations or identify one attribute. | Require complete equations from vertex/focus/directrix/axis/opening data in vertical and horizontal cases. |
| **A2.4C** | **ENHANCE** | One authentic square-root graph exists and transformation concepts are present, but most evidence is detached recognition. | Increase connected graph-construction/comparison evidence for scale, reflection, horizontal and vertical translation. |
| **A2.4D** | **REBUILD** | Only one family actually rewrites standard form into vertex form; others report an attribute or start in vertex form. | Require completing-the-square/standard-to-vertex transformation and then use the result to identify vertex, axis, extrema, and graph features. |
| **A2.4E** | **REBUILD** | The standard explicitly requires technology to formulate quadratic and square-root equations from tables; current items simulate/recognize models and the secure data lab has no square-root fit mode. | Add secure square-root technology fitting; require students to enter fitted quadratic and square-root equations from data. |
| **A2.4F** | **KEEP** | The bank genuinely solves quadratic equations and square-root equations, including two-root quadratics, formula use, context, and a squaring misconception. | Keep math; fix representation/DOK metadata and preserve complete solution sets. |
| **A2.4G** | **KEEP** | Extraneous-candidate identification, substitution checks, radical domain, and the squaring misconception directly align. | Keep; strengthen one full solve-and-check sequence but no wholesale rewrite. |
| **A2.4H** | **KEEP** | Students solve inside/outside quadratic inequalities in interval notation and on a number line with sign reasoning. | Keep; reduce inflated DOK labels and ensure the sign-table stimulus is genuinely displayed. |

## A2.5 — Exponential and logarithmic functions

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.5A** | **ENHANCE** | A logarithmic graph is constructed and asymptote concepts are sound, but exponential/log transformation effects are mostly recognition. | Add transformed exponential and logarithmic graph construction/comparison, including reflection and vertical scale. |
| **A2.5B** | **REBUILD** | The TEKS verb is formulate; growth, decay, recursive, and logarithmic-model families mostly ask students to choose a model. | Require students to write exponential/logarithmic models from contexts and convert recursive exponential relationships to explicit equations. |
| **A2.5C** | **REBUILD** | The standard says rewrite exponential ↔ logarithmic equations; every legacy family is choice-based recognition. | Require written equivalent equations in both directions with base/argument/exponent misconception analysis. |
| **A2.5D** | **KEEP** | Actual exponential and logarithmic equation solving is present across same-base, model, and single-log forms. | Keep math; replace fake table labeling and normalize DOK. |
| **A2.5E** | **KEEP** | Domain restrictions, substitution checks, context reasonableness, and logarithmic-domain misconceptions directly measure reasonableness. | Keep; tighten the context family so every item is explicitly tied to validating a logarithmic solution. |

## A2.6 — Other functions, rational equations, and variation

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.6A** | **ENHANCE** | The cube-root graph family is authentic, but cubic transformation evidence is mostly choice/evaluation and the two parent families are not equally represented graphically. | Add cubic graph transformation evidence and compare positive/negative scale and translations for both cubic and cube root. |
| **A2.6B** | **KEEP** | The bank genuinely solves cube-root equations in basic, scaled, and contextual forms with a correct operation misconception. | Keep math; normalize DOK labels. |
| **A2.6C** | **ENHANCE** | One authentic absolute-value construction exists; reflection/range/shift evidence is mostly detached recognition. | Add transformed graph construction/comparison for negative scale, stretch/compression, and translations. |
| **A2.6D** | **ENHANCE** | Two families genuinely formulate absolute-value equations, while the rest are recognition/reverse tasks. | Preserve the writing families and replace at least two recognition families with context/number-line/table equation construction. |
| **A2.6E** | **KEEP** | Students solve two-case, scaled, no-solution, context, and one-case-error absolute-value equations. | Keep; correct DOK inflation. |
| **A2.6F** | **KEEP** | Interval solving, number-line construction, contextual tolerance, impossible bounds, and AND/OR misconceptions are all aligned. | Keep; correct DOK inflation. |
| **A2.6G** | **ENHANCE** | One reciprocal graph construction is authentic; most transformation evidence is choice-based. | Add transformed reciprocal graph construction/comparison and connect signs/shifts directly to asymptotes and branches. |
| **A2.6H** | **REBUILD** | The standard says formulate rational equations from real situations, but the bank overwhelmingly asks students to choose a supplied model/expression. | Require written rational equations for work, rate, mixture/concentration, and other contexts. |
| **A2.6I** | **KEEP** | The bank genuinely solves rational equations across basic, shifted, and contextual forms with denominator-error analysis. | Keep; improve method variety and DOK honesty. |
| **A2.6J** | **KEEP** | Excluded values, contextual impossibilities, original restrictions, and final checks directly measure solution reasonableness. | Keep; render the claimed table stimulus honestly. |
| **A2.6K** | **ENHANCE** | Domain/range restrictions and interval/number-line work are sound, but the standard explicitly requires interval, inequality, and set notation and real asymptotic evidence. | Add a reciprocal graph family and require equivalent domain/range statements in all three notations. |
| **A2.6L** | **ENHANCE** | Solving/evaluating inverse variation is solid, but equation formulation is mostly recognition rather than writing. | Require students to write inverse-variation equations from context/table before solving them. |

## A2.7 — Algebraic operations and representations

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.7A** | **KEEP** | Addition, subtraction, multiplication, i² correction, and reverse reasoning all operate on complex numbers directly. | Keep; relabel fake table/multiple-representation metadata and reduce DOK inflation. |
| **A2.7B** | **ENHANCE** | Three families perform the required polynomial operations, but two drift to model selection/degree recognition. | Replace the drift families with higher-degree/contextual complete polynomial operations while preserving expression grading. |
| **A2.7C** | **REBUILD** | Only one family determines a quotient; the bank overuses remainder/factor ideas and lacks required degree-4 and quadratic-divisor breadth. | Require full quotients for degree 3/4 dividends divided by degree 1/2 divisors, with long/synthetic-style reasoning and error analysis. |
| **A2.7D** | **REBUILD** | Current families usually start from supplied zeros or ask factor-theorem recognition; they rarely determine factors algebraically from the polynomial itself. | Require algebraic factor discovery for degree-3/4 polynomials, including rational-root testing and division to complete factorization. |
| **A2.7E** | **ENHANCE** | Sum/difference of cubes and grouping are genuinely factored, but degree-4 and linear-plus-quadratic factor breadth is thin. | Keep strong factoring families; add degree-4/grouping and complete linear/quadratic factorization evidence. |
| **A2.7F** | **REBUILD** | The set undercovers unlike denominators and complete quotient simplification; several families are unusually trivial or only rewrite the division. | Rebuild a balanced add/subtract/multiply/divide rational-expression set with restrictions and full simplification. |
| **A2.7G** | **KEEP** | Students rewrite radicals/rational exponents and simplify/rationalize equivalent forms, with a relevant misconception. | Keep; correct fake representation and DOK metadata. |
| **A2.7H** | **KEEP** | The bank genuinely solves rational-exponent equations and checks the inverse operation misconception. | Keep; correct DOK inflation and ensure real-solution restrictions are explicit. |
| **A2.7I** | **ENHANCE** | Interval and inequality/set forms are present, but range evidence is thin and the standard requires domain and range across interval, inequality, and set notation. | Require both domain and range and rotate all three notation systems with real graph/number-line stimuli. |

## A2.8 — Data modeling and regression

| Standard | Verdict | Why | Required direction |
| --- | --- | --- | --- |
| **A2.8A** | **ENHANCE** | Linear/quadratic/exponential model selection is covered, but mostly through perfect-pattern recognition rather than substantive data analysis. | Use noisier data and residual/model-fit evidence so students justify model choice rather than spot a first-difference/common-ratio pattern. |
| **A2.8B** | **REBUILD** | The standard requires using regression technology to write models; the legacy questions often reveal the pattern/coefficient structure or use choices instead of actual regression. | Use the secure Data Modeling Lab for linear, quadratic, and exponential regression and require students to enter the fitted functions. |
| **A2.8C** | **REBUILD** | Most families merely substitute into supplied models; critical judgments and decisions from data are too thin. | Build data-driven prediction, interpolation/extrapolation, competing-model decisions, reasonableness, and uncertainty judgments across all three model families. |

## Capability dependencies that must be solved honestly

### A2.3B — 3×3 Gaussian elimination / matrix technology

The current `systemsWorkspace` has a browser-side **2×2** matrix mode, but the secure Path contract supports only linear 2×2 and inequality modes. Algebra II A2.3B requires three linear equations in three variables plus Gaussian elimination/matrix technology. A secure 3×3 row-operation or matrix workflow is required before matrix evidence can count toward Path mastery.

### A2.4E — square-root technology fitting

The certified Data Modeling Lab securely grades linear, quadratic, and exponential fitted models. It does **not** currently fit square-root models. A2.4E explicitly requires quadratic **and square-root** equations from table data using technology, so a secure square-root fit mode (or equivalent technology workspace) is required.

### Capabilities already inherited from certified Algebra I

- secure two-variable inequality graph construction;
- secure function graph construction and inverse reflection;
- secure linear/quadratic/exponential regression model entry;
- secure fixed-target predictions;
- secure line construction;
- expression/equation equivalence improvements and form-preserving grading.

## Authoring order

1. Rebuild capability-dependent seams first where they unblock multiple families: 3×3 matrix/Gaussian and square-root fit.
2. Stage **A2.2A–A2.3G** in order, preserving strong A2.2B inverse-reflection work.
3. Continue standard-by-standard through A2.4–A2.8.
4. Every standard receives exactly five V2 families and a generated-instance certification gate.
5. Do not replace canonical/shipping Algebra II content until the complete 48-standard candidate passes the full platform suite.
