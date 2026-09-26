# AI Implementation Handoff — 3×3 Systems + Three Planes + CCMR Fit

Issue: #359
Branch: `fix-3x3-systems-ccmr`
Base: current `main`

Read issue #359 first. Treat it as the acceptance contract.

## Operating expectation

Do not merely make the current screens prettier. Re-evaluate the student workflow. The teacher wants a coherent student experience in which the Systems Workspace owns the full 3×3 journey whenever that is the clearest design.

Challenge existing structure when needed:
- whether a 3×3 student should transition to a different-looking Step Algebra surface;
- whether the same algebra capabilities should instead be embedded seamlessly;
- whether wording such as “token” belongs in student-facing directions;
- whether help/instructions appear at the right time and place;
- whether Work View/enlarge, phone layout, spacing, typography, colors, and interaction density are appropriate;
- whether the platform performs mathematical thinking that should belong to the student.

## First implementation slice

Before broad UI polish, make these contracts true:

1. V5 `solveSystem + equations[]` compiles to Systems Workspace without authored renderer plumbing.
2. 3×3 `method:"elimination"` is accepted and genuinely interactive.
3. 3×3 `method:"studentChoice"` offers both substitution and elimination.
4. `spatialModel.kind:"threePlanes"` produces a real interactive three-plane view.
5. Preflight recognizes that view as visual/rich.
6. CCMR auto-sourcing refuses a same-TEKS/different-construct replacement.

## Elimination flow

The student should:
- pick the variable to eliminate;
- pick the first equation pair;
- provide needed scale factors;
- carry out the combination rather than having the platform calculate it;
- pick a different equation pair and eliminate the same variable;
- obtain a reduced 2×2 system;
- solve that reduced system using the mature 2×2 Systems Workspace;
- back-substitute intentionally;
- verify the triple in all three originals.

Allow multiple valid routes. Do not hard-code one canonical path as the only accepted path.

## Three-plane flow

Use a lightweight implementation within the existing stack. It must be genuinely interactive, not a decorative screenshot.

Support drag/touch rotation, reset view, independent plane visibility, translucent planes, x/y/z axes, and authored solution-point reveal. Day 2 will use the same renderer for unique/no-solution/infinite-solution classification.

## CCMR fit

TEKS match is necessary but not sufficient.

For automatic replacement, include semantic compatibility using available metadata and derivable structure: system dimension, linear vs linear-quadratic, taskType, representation, method, and construct. If no compatible audited item exists, preserve the authored Practice question and report the gap.

For the Day 1 lesson, an A2.3A Digital SAT item about a line and parabola must never replace a 3-variable linear elimination problem.

## Validation

Add focused tests for the exact Day 1 system:

```
2x - y + 2z = 15
-x + y + z = 3
3x - y + 2z = 18
```

Expected solution: `(3,1,5)`.

Run the existing 2×2 and 3×3 systems tests, authoring/compiler tests, CCMR assignment-bank tests, browser/Work View checks, full runnable suite, and production build.

Do not merge merely because unit tests pass if the student experience is visibly fragmented or the interaction gives away work.
