# Systems Workspace 2.0 inequality engine contract

`src/tools/systemsWorkspace/linearInequalityEngine.js` is the viewport-independent
math boundary for systems of linear inequalities. It deliberately does not draw
the completed graph or change the current student interaction.

## Authored constraint shape

New questions may author standard form directly:

```json
{ "A": 2, "B": -3, "C": 6, "relation": ">" }
```

This means `2x - 3y + 6 > 0`. Relations are `<`, `<=`, `>`, and `>=` (Unicode
`≤` and `≥` are normalized too). `A` and `B` may not both be zero.

Existing `{ "m": 2, "b": -1, "relation": ">" }` constraints remain valid and
mean `y > 2x - 1`. No existing assignment JSON needs migration.

The optional student-work contract is:

```json
{
  "type": "systemsWorkspace",
  "mode": "inequalities",
  "studentBuild": {
    "boundary": true,
    "lineStyle": true,
    "shading": true
  },
  "reasoning": {
    "testPoint": true,
    "boundaryProbe": true,
    "classifyRegion": true,
    "vertices": true
  }
}
```

Every flag defaults to `false`, so these capabilities are opt-in. The legacy
`interaction`, `ask`, `testPoint`, and slope-intercept fields continue to work.

## Exports for the student UI

- `normalizeLinearInequality(input)` returns canonical `{ A, B, C, relation }`.
- `getBoundaryMetadata(input)` returns the canonical boundary equation,
  `vertical`/`horizontal`/`general` orientation, `solid`/`dashed` line style,
  boundary inclusion, and the satisfying coefficient-sign half-plane.
- `evaluatePoint(input, x, y)` returns `inside`, `outside`,
  `onBoundaryIncluded`, or `onBoundaryExcluded`.
- `isPointInInequality(input, x, y)` is the compatibility boolean adapter.
- `findFeasiblePoint(constraints)` returns a witness or `null`; a witness is
  never fabricated for an empty system.
- `classifyFeasibleRegion(constraints)` returns `bounded`, `unbounded`, or
  `empty`, independently of the displayed graph viewport.
- `boundaryIntersections(constraints)` returns each nonparallel boundary pair,
  its coordinate, `includedInSolution`, and an exclusion reason when needed.
- `analyzeInequalitySystem(constraints)` returns the normalized constraints,
  boundary metadata, classification, witness, and intersections together.
- `normalizeSystemsWorkspaceInequalityConfig(question)` supplies stable false
  defaults for all optional student-build/reasoning flags.

The existing `systemsMath.js` re-exports this API. Its
`satisfiesLinearInequality` and viewport-only `feasibleRegionPolygon` adapters
now accept both coefficient formats, preserving old consumers.

## UI integration notes

The UI should use boundary metadata rather than infer line style or orientation
from slope-intercept fields. In particular, vertical lines cannot be represented
by an infinite slope. Region classification must come from
`classifyFeasibleRegion`, never from whether a viewport-clipped polygon touches
the canvas edge. Intersections on dashed boundaries remain useful geometric
coordinates even though `includedInSolution` is false.

The engine computes the answer model only. The student UI remains responsible
for collecting boundary, style, shading, point-test, classification, and vertex
work; it must not pre-populate that work from `analyzeInequalitySystem`.

## Current limitation

The engine handles finite numeric coefficients in two variables. It does not
parse free-form algebra strings such as `"2x - 3y > -6"`; authoring/import code
must map those strings to numeric `A`, `B`, `C`, and `relation` fields.
