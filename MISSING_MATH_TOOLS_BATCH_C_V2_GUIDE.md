# MathMaster Missing Math Tools — Batch C v2

## Scope

Batch C deepens the third isolated math-tool group while preserving the existing Tool Contract architecture. It does not modify `App.jsx`, authentication, Firebase, Google Classroom, assignment lifecycle wiring, or My Math Path.

### Deepened tools

1. **Sequence Explorer v2**
2. **Complex Plane Lab v2**
3. **Exponential ↔ Log Bridge v2**

The tools remain available through the standalone Tool Lab (`tools-lab.html`) and emit attempt events through the existing `onAction` contract.

---

## 1. Sequence Explorer v2

Primary component:

`src/tools/sequenceExplorer/SequenceExplorer.jsx`

Reusable math engine:

`src/tools/sequenceExplorer/sequenceMath.js`

### Supported modes

- `analyze` — identify arithmetic/geometric family, common difference/ratio, and a target term
- `ruleBridge` — connect explicit and recursive representations of the same sequence
- `missingTerm` — recover a missing term while preserving the common additive/multiplicative structure
- `partialSum` — connect a finite sequence to the series formed by summing its first n terms
- `compare` — compare arithmetic and/or geometric growth at the same term index

### Math helpers added

- normalized arithmetic/geometric sequence specifications
- nth-term evaluation and discrete sequence generation
- sequence-family inference from observed terms
- common difference/ratio extraction
- next-term recurrence behavior
- arithmetic and geometric finite sums, including ratio = 1
- explicit/recursive rule descriptors
- same-index sequence comparison

The visual workspace keeps the domain discrete and links tables, plotted points, rule structure, and growth reasoning.

---

## 2. Complex Plane Lab v2

Primary component:

`src/tools/complexPlane/ComplexPlaneLab.jsx`

Reusable math engine:

`src/tools/complexPlane/complexMath.js`

### Supported modes

- `features` — point/vector interpretation, magnitude, conjugate, and reflection across the real axis
- `operations` — add, subtract, or multiply two complex numbers
- `division` — divide by multiplying through by the denominator conjugate
- `powers` — evaluate integer powers and connect |zⁿ| to |z|ⁿ
- `rotation` — interpret multiplication by powers of i as quarter-turn rotations
- `quadraticRoots` — extend the quadratic formula to conjugate complex root pairs

### Math helpers added

- addition, subtraction, multiplication, and division
- conjugate, magnitude, and argument
- integer powers, including valid negative powers
- quarter-turn normalization and rotation by powers of i
- real/complex quadratic roots
- order-independent complex root-set comparison
- student-friendly complex-number formatting

The lab treats complex numbers as geometric points/vectors instead of only final symbolic answers.

---

## 3. Exponential ↔ Log Bridge v2

Primary component:

`src/tools/exponentialLog/ExponentialLogBridge.jsx`

Reusable math engine:

`src/tools/exponentialLog/exponentialLogMath.js`

### Supported modes

- `equivalentForms` — rewrite bˣ = y as log_b(y) = x and back
- `solveExponential` — use logarithms to expose and solve a linear exponent
- `solveLogarithmic` — rewrite a logarithmic equation exponentially and enforce a positive log argument
- `inverse` — reflect transformed exponential/log pairs, including domain/range and asymptote swaps
- `composition` — verify f⁻¹(f(x)) = x and f(f⁻¹(y)) = y on valid domains

### Math helpers added

- logarithm-base validation and evaluation
- exponential/log equivalent-form conversion
- linear-exponent exponential solving
- linear-argument logarithmic solving
- transformed exponential evaluation
- transformed logarithmic inverse evaluation
- inverse domain/range/asymptote descriptors
- reflected inverse points
- both inverse-composition directions

This directly implements the earlier roadmap goal of making exponential/log inverse relationships conceptual and visual, including the domain restrictions that make inverse reasoning valid.

---

## Schema hardening

`src/tools/toolSchemas.js` now validates every Batch C mode and blocks unsafe configurations including:

- unsupported Sequence Explorer modes or sequence kinds
- nonpositive term indices and oversized display counts
- missing comparison sequence specifications
- malformed complex coordinates
- zero/near-zero complex divisors
- noninteger or excessive complex powers
- invalid quarter-turn definitions
- degenerate quadratic-root tasks
- invalid logarithm bases
- zero/near-zero linear coefficients in exponential/log equations
- nonpositive right-hand sides for the real exponential-solving mode
- transformed exponential specs with zero vertical scale
- composition inputs outside the inverse/logarithm domain

---

## Tool Lab updates

`src/dev/MathToolsLab.jsx` now opens on Sequence Explorer and advertises Batch C v2. Its Batch C QA examples demonstrate:

- arithmetic vs geometric growth comparison
- multiplication by i as a complex-plane rotation
- transformed exponential/log inverse graphs and domain/asymptote behavior

Batch A and Batch B v2 functionality remains present.

---

## Sample JSON

`SAMPLE_BATCH_C_DEEP_DIVE.json` contains 16 validated configurations covering every Batch C mode.

---

## Testing

Permanent tests:

`tests/tools/batchCDeepening.test.mjs`

They cover sequence nth terms, inference, explicit/recursive structure, finite sums and comparisons; complex arithmetic, division, powers, rotations and roots; exponential/log translations, equation solving, inverse features and composition; plus Batch C schema accept/reject cases.

See `MISSING_MATH_TOOLS_BATCH_C_V2_VALIDATION_REPORT.txt` for the final validation result.

---

## Integration boundary

This pass intentionally does **not** wire the tools into the current main `App.jsx`. That keeps the math development independent from the canonical authentication/application branch while the platform branch is being reconciled.

The next planned missing-tools deepening batch is:

- Transformations Lab
- Representation Match
- Function Investigation 2.0
- Graphing 2.0

