# TEKS Fidelity V2 — Path Tool Adapter Finding

Status: architecture finding; no shipping Path contract or student bank changed.

## Important correction to the initial audit assumption

Several remaining Algebra I REBUILD standards do **not** require inventing new student tools. The repository already contains richer assignment/tool experiences that cover the missing mathematical acts. The gap is that secure My Math Path issuance does not currently expose the full capability of those tools through its Path question contract.

## Existing tools that should be reused

### Data Modeling Lab

Files:
- `src/tools/dataModeling/DataModelingLab.jsx`
- `src/tools/dataModeling/dataModelingMath.js`

Existing capability includes:
- scatter plots
- manually fitting a line by slope/intercept
- residual plots and residual tables
- correlation coefficient and direction/strength interpretation
- association vs causation
- linear regression
- quadratic regression
- exponential regression
- model-family comparison using residual metrics
- prediction
- interpolation vs extrapolation

This is enough instructional machinery to support the central technology acts in:
- **A.4A** correlation coefficient / interpretation with technology
- **A.4C** linear model fitting and prediction
- **A.8B** quadratic model fitting and prediction
- **A.9E** exponential model fitting and prediction

The Fidelity V2 action should therefore be: make the existing Data Modeling Lab Path-eligible with a secure server-authoritative grading contract and mode-specific Path payloads. Do not build a duplicate regression tool.

### Systems Workspace — inequalities mode

Files:
- `src/tools/systemsWorkspace/SystemsWorkspace.jsx`
- `src/tools/systemsWorkspace/systemsMath.js`

Existing `InequalityMode` already:
- draws multiple linear boundaries
- computes/shades their feasible-region overlap
- displays a test point
- checks whether the test point satisfies every inequality
- requires the student to supply another feasible point
- grades both pieces

This covers the central graph-region reasoning needed by **A.3H** much better than the current shipping Path bank.

A one-inequality version/adaptation can also provide the authentic graphing act needed for **A.3D**, rather than using a one-dimensional number line.

The Fidelity V2 action should therefore be: expose `systemsWorkspace` inequalities mode through the Path tool contract, including secure expected metadata and sanitization. Do not build a second region-shading tool.

### Graphing2

`src/tools/graphing2/Graphing2.jsx` is a strong line-construction tool. It supports slope-intercept, two-point, point-slope, standard-form, vertical, and horizontal line construction by student-plotted points. It does **not** shade inequalities, so it should not be stretched into A.3D/A.3H.

It can, however, help finish graph-representation gaps in standards such as A.2C/A.2I when a student must construct a line from given information.

### Constraint Function Builder

`src/tools/constraintFunctionBuilder/ConstraintFunctionBuilder.jsx` already supports open construction of linear, quadratic, exponential, absolute-value, and vertical-line relations under mathematical constraints, including discrete/continuous domains. It is a strong candidate for future transfer/design families, but it is not a substitute for graphing inequality regions.

## Architecture decision

The next runtime phase should be **Path Tool Adapter V2**, not new tool development.

Minimum adapter work:
1. Add Path-safe payload contracts for `dataModeling` and `systemsWorkspace` inequality modes.
2. Extend server-side `buildIssuePlan` / grading definitions so those payloads remain authoritative and answers do not leak to the browser.
3. Extend Path sanitization so only display/input configuration reaches the client.
4. Route the sanitized payload through the existing tool registry/component rather than duplicating UI.
5. Add Path grading tests for partial/full scores and tool submissions.
6. Add generated-template tests so parameterized data sets and inequality systems remain valid over repeated draws.
7. Only after those adapters are green should A.4A/A.4C/A.8B/A.9E/A.3D/A.3H be staged as Fidelity V2 replacement families.

## Why this matters

The platform already paid the complexity cost of building good interactive math tools. Building parallel Path-only versions would create two definitions of regression, feasible regions, graphing behavior, accessibility, and grading. Fidelity V2 should instead make the **question family** select and configure the existing instructional tool through one secure Path contract.

That also supports the broader architecture goal: assignments, My Path, warm-ups, DOLs, and future CCMR work should consume the same high-quality family/tool system rather than each maintaining a separate meaning of a good question.