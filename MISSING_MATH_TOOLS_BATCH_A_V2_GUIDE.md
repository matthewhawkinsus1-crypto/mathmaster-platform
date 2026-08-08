# MathMaster Missing Math Tools — Batch A v2

This pass deepens the three highest-priority missing tools without wiring them into `App.jsx`, authentication, Firestore, Google Classroom, or assignment policy.

## 1. Data Modeling Lab

File: `src/tools/dataModeling/DataModelingLab.jsx`
Math service: `src/tools/dataModeling/dataModelingMath.js`

Supported modes:
- `full`
- `lineFit`
- `association`
- `prediction`
- `modelCompare`

New capabilities:
- student-created linear model
- linear regression reference
- residual table and residual plot
- MAE/RMSE comparison
- linear, quadratic, and exponential candidate models
- correlation direction/strength reasoning
- association vs causation
- interpolation vs extrapolation
- prediction tolerance and partial-credit scoring

Example:
```json
{
  "toolId": "dataModelingLab",
  "mode": "full",
  "points": [[1,2],[2,3],[3,5],[4,5],[5,7],[6,8],[7,10]],
  "expectedModel": "linear",
  "predictionX": 8,
  "causationSupported": false
}
```

## 2. Systems Workspace 2.0

File: `src/tools/systemsWorkspace/SystemsWorkspace.jsx`
Math service: `src/tools/systemsWorkspace/systemsMath.js`

Supported modes:
- `linear`
- `inequalities`
- `linearQuadratic`
- `matrix`

New capabilities:
- one / none / infinitely-many linear-system classification
- feasible-region construction using polygon clipping
- point feasibility checks
- linear–quadratic intersection solving
- order-independent intersection-pair grading
- 2x2 augmented-matrix solving
- determinant-based unique-solution reasoning

Example:
```json
{
  "toolId": "systemsWorkspace",
  "mode": "inequalities",
  "inequalities": [
    {"m": 1, "b": 1, "relation": ">="},
    {"m": -0.5, "b": 6, "relation": "<="}
  ],
  "testPoint": {"x": 2, "y": 4}
}
```

## 3. Inverse & Composition Lab

File: `src/tools/inverseComposition/InverseCompositionLab.jsx`
Math service: `src/tools/inverseComposition/inverseCompositionMath.js`

Supported modes:
- `full`
- `composition`
- `inverse`
- `restriction`

New capabilities:
- `f(g(x))` and `g(f(x))`
- inverse point-swapping / reflection across `y = x`
- linear inverse
- restricted quadratic inverse
- exponential inverse
- logarithmic inverse
- square-root inverse support
- one-sided domain enforcement for quadratic inverse families
- partial-credit scoring across composition, inverse, and restriction evidence

Example:
```json
{
  "toolId": "inverseCompositionLab",
  "mode": "restriction",
  "f": {
    "type": "quadratic",
    "a": 1,
    "h": 2,
    "k": -1,
    "inverseBranch": "right",
    "domain": {"min": 2}
  },
  "g": {"type": "linear", "a": -1, "h": 0, "k": 4},
  "x": 5
}
```

## Validation

- Batch A math/schema automated tests: included in `tests/tools/batchADeepening.test.mjs`
- Tool schema validator now guards unsupported Batch A modes and invalid inverse/log/quadratic configurations.
- The full `src` tree is syntax-parsed with TypeScript's JSX parser in no-emit mode.
- Relative imports are checked for missing files.

## Integration policy

These tools remain intentionally isolated. They consume `questionData` and emit attempt events through the existing tool contract. They do not directly inspect student SPED/504 status, activity role, Firebase identity, Google Classroom, or My Math Path state.
