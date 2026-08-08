# MathMaster Missing Math Tools Development Suite

This development package implements the missing Algebra I / Algebra II interactive tool layer discussed in the MathMaster roadmap without changing the current login, Firebase, Google Classroom, or App routing.

## Included tools

1. Data Modeling Lab — scatter plots, regression, residuals, association/causation.
2. Inverse & Composition Lab — composition machine and inverse reflection.
3. Systems Workspace 2.0 — system graphing, solution classification; contract reserved for inequalities, nonlinear systems, matrices.
4. Parabola Geometry Lab — vertex/focus/directrix geometry.
5. Polynomial Workshop — evaluation, factor theorem, synthetic division; extensible to tiles/area models.
6. Sign & Solution Analyzer — critical values, sign intervals, inequality reasoning.
7. Sequence Explorer — arithmetic/geometric analysis, explicit/recursive rule bridge, missing terms, finite sums, and discrete growth comparison.
8. Complex Plane Lab — plotting, magnitude/conjugate geometry, operations, division, powers, rotations by powers of i, and complex quadratic roots.
9. Exponential ↔ Log Bridge — equivalent forms, exponential/log equation solving, transformed inverse graphs, domain/asymptote swaps, and inverse-composition checks.
10. Transformations Lab — reusable a/h/k controls, parameter identification, point mapping, transformation descriptions, and family-specific defining features.
11. Representation Match — equation/table/context matching, mismatch analysis, table auditing, and equation-to-graph matching.
12. Function Investigation 2.0 — family-specific defining features, domain/range, intercepts, behavior, rational asymptotes, and same-input comparisons.
13. Graphing 2.0 — two-point construction from slope-intercept, through-points, point-slope, standard, and vertical/horizontal line conditions.
14. Step Algebra 2.0 — balanced symbolic operation workflow and step history.
15. Solution Review 2.0 — shared, tool-specific review surface.

## Isolation rule

These tools intentionally do not contain SPED/504/EB, assignment-role, Google Classroom, authentication, Firebase, mastery, or My Math Path branching. They accept mathematical question data and emit attempt events through `onAction`.

## Tool Lab

Run the alternate Vite page `tools-lab.html` to review all tools without touching the main MathMaster App. The added script is:

`npm run dev:tools`

No current App.jsx or main.jsx behavior was changed.

## Next integration step

After the canonical auth-enabled branch is selected, connect the registry to the canonical Question Engine / Tool Wrapper. Do not replace the current app with this development package merely to access the Tool Lab.
