# TEKS Fidelity V2 — Open-ended grading finding

## Corrected scope

This finding applies to the **older Algebra I authoring modules**, not to the current shipping Adaptive V2 Algebra I seed.

The audit initially inspected those older modules and found prompts that intentionally permit infinitely many correct mathematical objects (for example, “write any parallel line with a different intercept”). After the source-of-truth cross-check, the shipping seed was scanned separately and does **not** presently use that open-solution pattern as a material part of its 245 active families.

Therefore:

- **Do not count this as a current shipping-bank defect.**
- Keep it as an **authoring-rule requirement** before those older ideas are reused or before Fidelity V2 introduces new open-construction families.

## Why the rule still matters

The shared `answerEquivalence.mjs` layer correctly handles equivalence to an authored expected answer. That is different from verifying whether a response satisfies a set of mathematical constraints when infinitely many distinct answers are valid.

Examples from the older source design include:
- any vertical line except one specified vertical line;
- any negative-slope line through a specified intercept;
- any line parallel to a given line with a different intercept;
- any inequality that includes one point and excludes another;
- any quadratic with a specified vertex and any negative leading coefficient.

For these, a finite `accepted` list is not a complete grader.

## Fidelity V2 authoring rule

If a future production family intentionally permits a set of distinct correct constructions, use one of:

1. **Predicate/constraint grading** — parse the student response and verify the conditions in the prompt; or
2. **A uniquely constrained prompt** — when open construction is not the instructional goal.

Do **not** solve this by expanding `accepted` with many examples.

## DOK rule

Open-endedness alone is not evidence of DOK 3. A family earns DOK 3 through strategic coordination of constraints, transfer, justification, comparison, or non-routine reasoning—not because several answers are possible.

## Proposed future gate

Flag a production family when:
- the prompt/review says “any … works,” “for example,” “any value except,” or equivalent language;
- the response is equation/expression/inequality;
- and no declared predicate/constraint grading contract exists.

Status: **future authoring safeguard, not current Algebra I shipping defect.**
