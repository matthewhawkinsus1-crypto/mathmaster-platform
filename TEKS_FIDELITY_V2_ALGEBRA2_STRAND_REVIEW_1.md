# Algebra II TEKS Fidelity V2 — Strand Review 1

Scope: **A2.2A–A2.3G**

This review compares the registered Algebra II TEKS descriptions in `functions/shared/texasStandards.mjs` with the five current production families per standard in the reconciled `drafts/algebra2.json`.

Verdicts use the same rubric as Algebra I:

- **KEEP** — the five-family set genuinely measures the standard; only certification/metadata polish is needed.
- **ENHANCE** — the core mathematics is useful and substantially aligned, but one or more families/representations need targeted replacement.
- **REBUILD** — the current set does not perform the defining TEKS action strongly enough to support mastery evidence.

## A2.2 — Attributes of Functions and Their Inverses

| Standard | Verdict | What currently works | Fidelity problem | Required direction |
| --- | --- | --- | --- | --- |
| **A2.2A** Graph square root, reciprocal, cubic, cube root, exponential, absolute value, and logarithmic parent functions and analyze applicable attributes | **REBUILD** | Square-root domain, absolute-value range, a real cube-root graph, reciprocal asymptotes, and exponential intercept concepts are present. | Only **1/5** families actually graphs a function. Cubic and logarithmic graph evidence are absent. The exponential family declares `table` without a table. The breadth of the standard is reduced to isolated attributes instead of graph + attributes across the named parent families. | Rebuild around authentic graph investigations spanning all named parent functions. Use a deliberate five-family rotation that covers the seven parent families across repeated sessions, with domain/range/intercepts/symmetry/asymptotes/extrema only where applicable. |
| **A2.2B** Graph and write the inverse of a function using inverse notation | **ENHANCE** | Linear inverse equation writing is real. The reconciled familyVersion 3 inverse-reflection workspace is strong: plot points, reflect across y=x, sketch the inverse, and write the inverse equation. Quadratic restriction and cubic inverse concepts are useful. | Only one family performs the complete graph-and-write act. The “table” family has no actual table stimulus. Several families stop at one inverse value/choice instead of writing an inverse. | Preserve the full inverse-reflection family. Add at least one additional non-linear graph/write family and a real table-to-inverse representation. Keep domain restriction work as supporting evidence. |
| **A2.2C** Analyze relationships between functions and inverses, including quadratic/square-root and logarithmic/exponential pairs and domain restrictions | **ENHANCE** | Quadratic/square-root restriction, inverse mapping, point reflection, and exponential/log inverse relationship are all represented. | The exponential/log item is only an input-output reversal statement; it does not deeply analyze the logarithmic/exponential pair. Several declared representations are not actually rendered. Graph/reflection evidence is thin. | Preserve the conceptual set but replace weak representation labels with real stimuli and add a graph/relationship family comparing a function and inverse across y=x. Strengthen exponential/log inverse analysis. |
| **A2.2D** Use composition, including necessary domain restrictions, to determine whether functions are inverses | **ENHANCE** | Composition is present, including a square/square-root domain-restriction family and an inverse-check misconception. | The bank often merely evaluates a composition. It rarely requires **both** f(g(x)) and g(f(x)), and the “table” families have no actual tables. Domain restrictions are concentrated in one family. | Make inverse verification the dominant act: compute both compositions where needed, state the domain on which identity is obtained, and add real table/mapping composition evidence. |

## A2.3 — Systems of Equations and Inequalities

| Standard | Verdict | What currently works | Fidelity problem | Required direction |
| --- | --- | --- | --- | --- |
| **A2.3A** Formulate systems including three linear equations in three variables and linear-quadratic systems | **REBUILD** | Three-variable contexts and line/quadratic contexts are mathematically relevant. | **0/5** families require students to write the system. Every family is multiple choice. “Formulate” is being measured as recognition, not construction. Some table/graph representations are labels without full stimuli. | Rebuild so students write all equations in a three-variable system and write both equations of line/quadratic systems from context, table, graph, and verbal information. |
| **A2.3B** Solve three linear equations in three variables using Gaussian elimination, matrices/technology, and substitution | **REBUILD — capability dependency** | Several families require all three numeric solution values. One family explicitly names elimination; context solving and an elimination misconception exist. | The required method breadth is not authentic. There is no Gaussian-elimination workspace, no matrix row-operation evidence, and the “matrix” family merely asks students to recognize a candidate triple. The current secure Path contract does not support a matrix/Gaussian mode. | Add a server-authoritative matrix/Gaussian Path contract or dedicated matrix workspace. Then rebuild a method-balanced set: substitution/triangular, Gaussian elimination, matrix technology, context, and error analysis. |
| **A2.3C** Solve algebraically a system with one linear and one quadratic equation | **REBUILD** | Two-intersection and tangent mathematics are generated correctly; some families check candidate intersections. | Only two families actually solve. The two-intersection family asks only for the two **x-values**, not the complete ordered-pair solution set. Three families become counting/recognition/reverse-construction tasks. | Rebuild around complete algebraic solution sets, tangent/one-solution and no-real-intersection cases, substitution reasoning, and genuine error analysis. |
| **A2.3D** Determine reasonableness of solutions to line-quadratic systems | **KEEP** | Checking both equations, rejecting context-invalid roots, comparing line/quadratic values, domain restrictions, and a genuine “checked only one equation” misconception are all directly aligned. | Some representation labels (especially table) are not rendered as real representations; DOK is mechanically high in later families. | Keep the mathematics. Add real table stimulus where claimed, correct DOK/difficulty independently, and strengthen one contextual reasonableness explanation. |
| **A2.3E** Formulate systems of at least two linear inequalities in two variables | **REBUILD** | Context constraints, non-negativity/caps, strict-boundary language, and shaded-side concepts are useful prerequisites. | **0/5** families require writing a system of inequalities. Every response is multiple choice. The defining verb “formulate” is missing. | Rebuild with multi-part inequality writing from context/table/graph/verbal constraints. Students must produce all inequalities, including non-negativity or capacity constraints where appropriate. |
| **A2.3F** Solve systems of two or more linear inequalities in two variables | **REBUILD** | Test-point logic, boundary inclusion, shaded-side misconceptions, and overlap language are related. | No family constructs or presents the full solution region. Students mostly choose statements about a region. This is the same failure Algebra I A.3H had before the secure inequality-construction adapter. | Reuse the server-graded inequality construction contract developed in the Algebra I Fidelity V2 lane once that capability is available on this branch. Require students to construct every boundary and the overlap region. |
| **A2.3G** Determine possible solutions in the solution set of systems of two or more linear inequalities | **KEEP** | Feasible-point testing, rejecting an infeasible point, integer-solution counting, and capacity reasoning directly measure whether a point belongs to a solution set. | “Table” and “graph” labels are not consistently backed by actual stimuli; later DOK labels are inflated. | Keep the core mathematics. Render the promised table/graph evidence and certify DOK honestly. |

## Decision summary for this batch

- **KEEP: 2** — A2.3D, A2.3G
- **ENHANCE: 3** — A2.2B, A2.2C, A2.2D
- **REBUILD: 6** — A2.2A, A2.3A, A2.3B, A2.3C, A2.3E, A2.3F

## Architecture/capability dependencies exposed

### Matrix / Gaussian elimination

A2.3B cannot be certified merely by authoring better text questions. Algebra II needs a server-authoritative matrix/Gaussian grading contract before matrix technology can count as mastery evidence.

### Systems of inequalities

A2.3F should reuse—not duplicate—the secure inequality-construction contract built during the Algebra I Fidelity V2 work. The Algebra II audit branch was intentionally created from `main`, so that capability must arrive through a reviewed merge/cherry-pick rather than being silently copied.

### Inverse reflection

A2.2B already has a strong secure inverse-reflection workflow in the shipping seed. The source-of-truth reconciliation explicitly protects that family from being lost.

## Next review batch

Proceed to **A2.4A–A2.5E**:

- quadratic/square-root construction, transformations, technology fitting, equations and inequalities;
- exponential/log transformations, modeling, conversion, solving, and reasonableness.

Pay particular attention to writing/formulation verbs, technology requirements, extraneous-root checking, and logarithmic domain/reasonableness.
