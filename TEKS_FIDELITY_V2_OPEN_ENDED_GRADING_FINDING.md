# TEKS Fidelity V2 — Open-ended grading finding

## Confirmed finding

The shared `answerEquivalence.mjs` layer is strong for determining whether a student response is mathematically equivalent to an AUTHORED expected answer. It normalizes MathLive forms, numeric/fraction forms, inequalities, finite sets, form-preserving equations/expressions, inverse-function equations, expanded polynomial equations, and linear-equation equivalence.

That does **not** solve a different problem exposed by the Algebra I audit: prompts whose correct answer is a SET OF INFINITELY MANY DIFFERENT mathematical objects satisfying a condition.

Examples in current Algebra I authoring include:
- A.2G: any vertical line other than `x=-1`.
- A.2B/A.3E: any line with a required intercept and a negative slope.
- A.3F: any line parallel to `y=3x-4` but with a different intercept.
- A.3H: any inequality that includes one specified point and excludes another.
- A.6B: any quadratic with a specified vertex and any negative leading coefficient.

For these tasks, equivalence to one expected example is not the same as satisfying the prompt. Example whitelists can cover a few correct responses but cannot enumerate the solution space.

## Required Fidelity V2 rule

A question that intentionally permits a family of correct answers must use one of these approaches:

1. **Predicate/constraint grading** (preferred): parse the student's equation/inequality and verify the mathematical conditions in the prompt; or
2. **Constrain the prompt to a unique answer** when the instructional goal does not require open construction.

Do not expand `accepted` with dozens of examples. That only hides the modeling defect.

## DOK implication

Open-endedness alone is not evidence of DOK 3. A task such as "write any negative-slope line through (0,-3)" may require only two direct parameter choices. Fidelity V2 should reserve DOK 3 for tasks requiring strategic coordination of constraints, justification, transfer, comparison, or non-routine decision making.

## Release gate proposal

Add an audit rule that flags authored prompts/reviews containing language such as `any ... works`, `for example`, `any negative`, `any ... except`, or multiple accepted structurally different equations when no explicit predicate/constraint grader is attached.

This should become a cross-course gate, because the same authoring pattern can occur in Algebra II and lower-grade construction tasks.