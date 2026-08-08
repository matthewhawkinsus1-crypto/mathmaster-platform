# MathMaster Missing Math Tools — Batch D v2

## Scope

Batch D deepens the fourth isolated math-tool group while preserving the existing Tool Contract architecture. It does not modify `App.jsx`, authentication, Firebase, Google Classroom, assignment lifecycle wiring, or My Math Path.

### Deepened tools

1. **Transformations Lab v2**
2. **Representation Match v2**
3. **Function Investigation 2.0**
4. **Graphing 2.0**

The tools remain available through the standalone Tool Lab (`tools-lab.html`) and continue to emit attempt events through the existing `onAction` contract.

---

## 1. Transformations Lab v2

Primary component:

`src/tools/transformations/TransformationsLab.jsx`

Reusable math engine:

`src/tools/transformations/transformationsMath.js`

### Supported modes

- `match` — adjust a/h/k to make a student graph match a target transformation
- `identify` — recover a/h/k from a transformed graph
- `pointMap` — map a parent-function point using (x, y) → (x + h, ay + k)
- `describe` — classify reflection, vertical stretch/compression, and translation direction
- `anchor` — locate the defining family-specific feature after transformation

### Function families

- linear
- quadratic
- absolute value
- cubic
- cube root
- square root
- exponential
- logarithmic
- rational

Defining features are family-specific: vertices for quadratic/absolute value, endpoints for square root, inflection points for cubic/cube root, reference points for exponential/logarithmic functions, and the non-plotted asymptote intersection for rational functions.

---

## 2. Representation Match v2

Primary component:

`src/tools/representationMatch/RepresentationMatch.jsx`

Reusable math engine:

`src/tools/representationMatch/representationMath.js`

### Supported modes

- `completeSet` — match equation, table, and context to one relationship
- `findMismatch` — identify which representation came from a different relationship
- `tableAudit` — identify a row that does not satisfy the represented function
- `graphMatch` — connect an equation to the correct graph

The engine keeps relationship identity explicit rather than parsing display text, and table auditing checks actual function values. The instructional surface treats equations, tables, contexts, and graphs as coordinated views rather than privileging one representation.

---

## 3. Function Investigation 2.0

Primary component:

`src/tools/functionInvestigation2/FunctionInvestigation2.jsx`

Reusable math engine:

`src/tools/functionInvestigation2/functionInvestigationMath.js`

### Supported modes

- `features` — identify a family-specific defining point/center and applicable asymptotes
- `domainRange` — connect natural domain/range restrictions to function structure
- `intercepts` — determine x- and y-intercepts, including nonexistent intercepts
- `behavior` — classify family-appropriate increasing/decreasing or minimum/maximum behavior
- `compare` — compare two functions at the same input

### Important correction preserved

Function Investigation does **not** assume a fixed “third graph point” is a key point. The engine derives the meaningful feature from the actual family:

- linear → y-intercept
- quadratic / absolute value → vertex
- square root → endpoint
- cubic / cube root → inflection point
- exponential / logarithmic → family reference point
- rational → asymptote intersection, explicitly marked as not on the graph

This also prevents the rational asymptote intersection from being graded as an ordinary plotted point.

---

## 4. Graphing 2.0

Primary component:

`src/tools/graphing2/Graphing2.jsx`

Reusable math engine:

`src/tools/graphing2/graphingMath.js`

### Supported modes

- `slopeIntercept` — construct a line from y = mx + b information
- `throughPoints` — construct the unique line through two supplied points
- `pointSlope` — construct from a point and slope
- `standardForm` — convert Ax + By = C structure into a graph construction
- `verticalHorizontal` — correctly construct vertical and horizontal lines

Graphing 2.0 preserves the two plotted student points as evidence, derives the student line from those points, supports vertical lines, and awards partial evidence credit when only one plotted point satisfies the target line.

---

## Schema hardening

`src/tools/toolSchemas.js` validates all 19 Batch D configurations and rejects unsafe or ambiguous definitions including:

- unsupported Batch D modes or function families
- zero transformation scale where the requested family would degenerate
- invalid exponential/logarithmic bases
- missing or malformed point-map data
- representation sets with invalid/duplicate ids
- mismatch tasks that contain zero or multiple mismatched sources
- malformed table-audit rows
- graph choices without valid graph specifications
- function comparisons without two valid functions and a finite comparison input
- duplicate through-points
- invalid point-slope definitions
- degenerate standard-form lines where A and B are both zero
- malformed vertical/horizontal line tasks

---

## Tool Lab updates

`src/dev/MathToolsLab.jsx` now opens on Transformations Lab v2 and advertises Batch D. Its Batch D QA examples demonstrate:

- exponential point mapping
- representation mismatch analysis
- square-root domain/range reasoning
- standard-form line construction

Batches A, B, and C remain present.

---

## Sample JSON and testing

`SAMPLE_BATCH_D_DEEP_DIVE.json` contains 19 validated configurations covering every Batch D mode.

Permanent tests:

`tests/tools/batchDDeepening.test.mjs`

The permanent math-tool suite now contains 56 tests. Batch D tests cover transformation mapping/descriptors/anchors; representation matching/table auditing; function-specific features/domain/range/intercepts/behavior/comparison; line conversion/construction evidence; and schema accept/reject cases.

See `MISSING_MATH_TOOLS_BATCH_D_V2_VALIDATION_REPORT.txt` for final verification.

---

## Integration boundary

This pass intentionally does **not** wire the tools into the current main `App.jsx`. The tools remain isolated from login/authentication, Firebase, Google Classroom, and assignment lifecycle code while the canonical platform branch is preserved.

After Batch D, all tools in the planned A–D deepening sequence are complete. Step Algebra 2.0 and Solution Review 2.0 remain the two baseline tools that have not received a dedicated deepening batch; Phase 3A (Daily Instruction / Activity Policy Engine) also remains the next major core-platform milestone from the original roadmap.
