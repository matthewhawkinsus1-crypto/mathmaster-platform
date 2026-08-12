# MathMaster Missing Math Tools — Batch B v2

## Scope

This pass deepens the second high-value Algebra II tool batch while preserving the existing Tool Contract architecture and leaving `App.jsx`, authentication, Firebase, Google Classroom, and assignment lifecycle code untouched.

### Deepened tools

1. **Polynomial Workshop v2**
2. **Sign & Solution Analyzer v2**
3. **Parabola Geometry Lab v2**

The tools remain independently testable from `tools-lab.html` through `npm run dev:tools` when dependencies are installed.

---

## 1. Polynomial Workshop v2

`src/tools/polynomialWorkshop/PolynomialWorkshop.jsx`

New reusable math engine:

`src/tools/polynomialWorkshop/polynomialMath.js`

### Supported modes

- `factorZero` — Factor Theorem / evaluate P(r)
- `multiplyArea` — 2×2 area model for binomial multiplication
- `factorQuadratic` — sum/product factoring for monic quadratics
- `division` — coefficient-based polynomial long division with quotient/remainder
- `graphConnection` — zeros, multiplicity, crossing/touching behavior, and end behavior
- `rationalFeatures` — cancellation reasoning for holes, zeros, and vertical asymptotes

### Math helpers added

- polynomial multiplication
- polynomial long division
- integer factor-pair search for monic quadratics
- root/multiplicity → polynomial coefficient construction
- multiplicity crossing/touching classification
- degree/leading-coefficient end behavior
- rational cancellation feature map
- unordered numeric multiset comparison

This makes the Polynomial Workshop a reusable Algebra II workspace instead of a single Factor Theorem interaction.

---

## 2. Sign & Solution Analyzer v2

`src/tools/signSolutionAnalyzer/SignSolutionAnalyzer.jsx`

New reusable math engine:

`src/tools/signSolutionAnalyzer/signSolutionMath.js`

### Supported modes

- `polynomial` — polynomial inequalities from factored form
- `rational` — rational inequalities with denominator exclusions
- `radicalCheck` — candidate verification / extraneous-solution checking

### Key behavior

- builds ordered critical points
- distinguishes numerator zeros from denominator exclusions
- respects odd/even multiplicity sign changes
- evaluates test-interval sign
- handles strict vs inclusive inequality endpoints
- never closes an endpoint that is excluded from the domain
- validates radical candidates in the original equation rather than trusting squared-equation candidates

The solution preview in the Tool Lab is a QA aid. Production assessment policy can hide solution previews.

---

## 3. Parabola Geometry Lab v2

`src/tools/parabolaGeometry/ParabolaGeometryLab.jsx`

New reusable math engine:

`src/tools/parabolaGeometry/parabolaGeometryMath.js`

### Supported modes

- `features` — focus, directrix, latus rectum, opening direction
- `equidistance` — verify the geometric definition of a parabola
- `fromGeometry` — recover vertex and signed p from focus/directrix data
- `equation` — connect p to the 4p standard-form coefficient and opening direction

### Geometry support

- vertical and horizontal parabolas
- signed p
- focus/directrix calculation
- axis of symmetry
- latus rectum endpoints and length
- point-to-focus vs point-to-directrix distance comparison
- focus/directrix → vertex/p reconstruction
- standard equation parameterization

This provides a genuine focus/directrix geometry workspace rather than only a vertex-form graph.

---

## Schema hardening

`src/tools/toolSchemas.js` now validates the new Batch B modes and blocks unsafe configurations including:

- unknown Batch B modes
- zero polynomial divisors
- malformed binomial area-model definitions
- rational feature tasks without denominator roots
- rational sign-chart tasks without denominator factors
- invalid inequality relation symbols
- radical-check tasks missing equation/candidate definitions
- invalid parabola orientation
- focus/directrix reconstruction without valid geometry
- p = 0 for parameterized parabola tasks

---

## Tool Lab updates

`src/dev/MathToolsLab.jsx` now opens on Polynomial Workshop and advertises Batch B v2. Its QA examples demonstrate:

- multiplicity / end behavior
- rational sign-chart domain exclusions
- focus/directrix geometry

Batch A v2 functionality remains present and unchanged.

---

## Sample JSON

`SAMPLE_BATCH_B_DEEP_DIVE.json` contains 13 validated configurations covering every Batch B mode.

---

## Testing

Permanent tests were added at:

`tests/tools/batchBDeepening.test.mjs`

They cover polynomial arithmetic, factoring, graph behavior, rational cancellation, polynomial/rational sign logic, extraneous-solution checking, vertical/horizontal parabola geometry, equidistance, focus/directrix reconstruction, and schema rejection cases.

See `docs/handoffs/MISSING_MATH_TOOLS_BATCH_B_V2_VALIDATION_REPORT.txt` for the full validation result.

---

## Integration boundary

This pass intentionally does **not** wire these tools into the current main `App.jsx` because the project is still reconciling its canonical application/auth branch. The tools are kept contract-compliant and isolated so they can be registered in the final canonical `QuestionEngine` without rewriting their mathematics.

The next planned deepening batch is:

- Sequence Explorer
- Complex Plane Lab
- Exponential ↔ Log Bridge

