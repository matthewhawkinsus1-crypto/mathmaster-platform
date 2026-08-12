# Algebra II Honors Lessons 1–4 — Student Experience Audit

**Scope:** 6 assignments, 113 questions total. Lesson 1 and Lesson 2 are each split across two days; Lessons 3 and 4 are one day each.

## Audit standard

Each item was reviewed as a student task, not merely as valid JSON. The pass checked: what is visibly rendered; what the student can click/type/drag; whether all required symbols are reachable; graph bounds and endpoint semantics; mathematical typography; whether the prompt matches the actual tool; whether later workflow stages depend on earlier student work; section transitions; and whether the item remains faithful to the supplied lesson.

**Important limitation:** this is a question-by-question renderer/contract/source audit with executable compiler/semantic checks and targeted logic tests. It is not a pixel-by-pixel browser regression run because the uploaded project copy does not contain a complete usable npm dependency installation. Before production deployment, run `npm ci` and `npm run build` in Cloud Shell.

## Overall result

- All **113** fixed V5 intents compile through the current authoring compiler.
- Assignment validation: **0 errors**.
- Semantic/student-experience validation: **0 errors, 0 warnings** after the repairs in this audit.
- All changed `.js` files pass `node --check`; all changed `.jsx` files pass TypeScript JSX transpilation syntax checks.
- Targeted logic tests pass for MathLive interval notation (`\infty`, `\cup`, `\left/\right`), restricted-domain open endpoints, workflow choice grading, and case-insensitive function names such as `M(x)` and `V(t)`.
- Warm-Up, Classwork, Practice, and DOL roles are preserved and the student client now visibly groups/names them.

## Student-facing defects found and repaired

- **Interval notation controls + grading:** The interval tool now shows `(` `)` `[` `]` `−∞` `∞` `∪` immediately, and the parser accepts the LaTeX MathLive actually emits.
- **Restricted-domain endpoints:** V5 `minClosed` / `maxClosed` are now honored by graph-domain logic; a requested open endpoint is no longer silently closed.
- **Graph-analysis notation entry:** Interval/set/inequality toolbars are visible without requiring students to discover “Show math tools.” Empty increasing/decreasing/sign intervals have an always-available “Does not exist” control.
- **Mobile/context function entry:** Function-rule stages expose useful function keys and keep a device keyboard available for arbitrary letters. `M(x)` / `V(t)` are accepted case-insensitively and can be checked against equivalent `y=...` forms.
- **Staged modeling flow:** Equation → table → graph → domain/range → continuity stages now respect the student’s earlier work rather than behaving like unrelated boxes.
- **Chocolate-bar source fidelity:** The model is again discrete over all whole-number sales counts, not artificially truncated to five values.
- **Shower source fidelity:** The model now has nonnegative time/volume with no invented 10-minute cap.
- **Relation coordinate plotting:** When V5 asks for both a mapping and a coordinate plot, the relation tool now actually lets the student plot every ordered pair and grades that plot.
- **Inverse/composition mode leakage:** Inverse questions no longer show an unrelated second function/composition panel; composition questions no longer show unrelated inverse panels. Authored evaluation inputs stay fixed unless explicitly made editable.
- **Inverse graph visibility:** Inverse graph bounds expand to include the authored point and its swapped inverse point.
- **Polynomial area-model semantics:** Area cells show the monomial part and explicitly ask for the signed coefficient, matching the coefficient-only grader.
- **Transformation descriptions:** “Describe” mode now requires magnitude as well as direction: `|a|`, `|h|`, and `|k|` are assessed.
- **Math typography:** Inverse notation and answer choices are rendered as math; supported `$...$` prompt math is recognized by the validator rather than falsely warned as raw markup.
- **Section awareness:** Student navigation and the current-question banner identify Warm-Up, Classwork, Practice, and DOL instead of flattening the whole assignment into anonymous question numbers.

## Source-fidelity notes

- Lesson 1 source’s chocolate-bar model uses `f(x)=2x`, whole-number inputs starting at 0, nonnegative even outputs, and a discrete graph. The fixed assignment now preserves that rather than cutting the situation off at `x=4`.
- Lesson 1 source’s shower model uses `V(x)=1.8x` with nonnegative real time and nonnegative volume. The fixed assignment now preserves the unbounded nonnegative domain/range.
- Lesson 2 remains centered on parent-function recognition/attributes followed by transformations.
- Lesson 3 remains centered on inverse relations and inverse linear functions.
- Lesson 4 remains centered on operations, composition, and inverse verification by composition.

## Question-by-question audit

### Algebra II Honors — Lesson 1 Day 1: Interval Notation, Domain, and Range

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Interactive number line + interval-notation math input<br>_Prompt:_ Graph −4 ≤ x < 3 on the number line, then write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 2 | Warm-Up | Interactive number line + interval-notation math input<br>_Prompt:_ Graph x > 2 on the number line, then write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 3 | Warm-Up | Interactive number line + interval-notation math input<br>_Prompt:_ Graph x ≤ −5 or x > 1 on the number line, then write the compound interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 4 | Classwork | Interactive number line + interval-notation math input<br>_Prompt:_ Graph −3 ≤ x < 5 and write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 5 | Classwork | Interactive number line + interval-notation math input<br>_Prompt:_ Graph x < −2 or x ≥ 4 and write the compound interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 6 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = 2x − 1 restricted to −3 ≤ x < 4. State the domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control; open right endpoint at x=4 is preserved in the graph and answer key |
| 7 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = −(x − 1)² + 4. State the domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 8 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = √(x + 2) + 1. State the domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 9 | Classwork | Mapping arrows + domain/range + function decision<br>_Prompt:_ Build the mapping for the relation {(-3, 4), (0, 1), (2, 4), (5, -2)}. Then state the domain and range and decide whe… | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 10 | Practice | Interactive number line + interval-notation math input<br>_Prompt:_ Graph −1 < x ≤ 6 and write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 11 | Practice | Interactive number line + interval-notation math input<br>_Prompt:_ Graph x ≤ −4 or x ≥ 3 and write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 12 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = \|x − 2\| − 3. State its domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 13 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = 1/(x + 1). State its domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 14 | Practice | Mapping arrows + domain/range<br>_Prompt:_ Build the mapping for {(−2, 5), (1, 0), (4, 5), (6, −3)} and state its domain and range. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 15 | DOL | Interactive number line + interval-notation math input<br>_Prompt:_ Graph x < −1 or 2 ≤ x ≤ 5, then write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 16 | DOL | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = (x + 2)² − 5. State the domain and range in interval notation. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 17 | DOL | Mapping arrows + domain/range + function decision<br>_Prompt:_ For the relation {(−1, 3), (2, 0), (4, 3), (7, −2)}, state the domain and range and decide whether it is a function. | **PASS** | No student-facing mismatch found in the audited renderer contract. |

### Algebra II Honors — Lesson 1 Day 2: Function Attributes and Relations

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = \|x + 1\| − 2. State the domain and range. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 2 | Warm-Up | Interactive number line + interval-notation math input<br>_Prompt:_ Graph −2 ≤ x < 4 and write the interval in interval notation. | **FIXED → PASS** | ∞/−∞/∪/bracket controls are visible and MathLive notation now grades correctly |
| 3 | Warm-Up | Mapping arrows + domain/range<br>_Prompt:_ Build the mapping for {(−2, 1), (0, 3), (2, 5)} and state the domain and range. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 4 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = (x − 2)² − 4. State where the function is increasing and where it is decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 5 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = −(x − 1)² + 4. State where the function is positive and where it is negative. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 6 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = \|x + 2\| − 3. State where the function is increasing, decreasing, positive, and negative. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 7 | Classwork | Coordinate plot + mapping arrows + domain/range + function decision<br>_Prompt:_ Represent {(−3, 2), (0, 5), (0, −1), (4, 2)} with a mapping and a coordinate plot. State the domain and range, then d… | **FIXED → PASS** | coordinate plotting is now a real student action instead of a prompt promise the tool ignored |
| 8 | Classwork | Staged workflow: table → coordinatePlot → domain → range → classification<br>_Prompt:_ Complete the table for f(x) = 0.5x + 1 over x ∈ {−2, 0, 2, 4}, plot only those points, state the domain and range, an… | **FIXED → PASS** | dependent stages now unlock in order and notation/function inputs expose the required controls |
| 9 | Classwork | relationshipModel<br>_Prompt:_ Build a model for the money collected from selling chocolate bars. | **FIXED → PASS** | restored source-faithful infinite discrete domain/range; student selects the appropriate infinite discrete sets |
| 10 | Classwork | relationshipModel<br>_Prompt:_ Build a model for the water released by the shower head. | **FIXED → PASS** | removed artificial 10-minute cap; source-faithful domain/range are [0,∞) |
| 11 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = −2\|x − 1\| + 6. State where the function is increasing and decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 12 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = (x + 3)² − 9. State where the function is positive and where it is negative. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 13 | Practice | Mapping arrows + domain/range + function decision<br>_Prompt:_ Represent {(−2, 4), (1, 1), (3, −2), (5, 1)} with a mapping and decide whether it is a function. State the domain and… | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 14 | Practice | Staged workflow: table → coordinatePlot → range → classification<br>_Prompt:_ Complete the table for f(x) = −x + 4 over x ∈ {0, 1, 2, 3, 4}, plot the points, state the range, and classify the rel… | **FIXED → PASS** | dependent stages now unlock in order and notation/function inputs expose the required controls |
| 15 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A taxi fare is modeled by C(t) = 3t + 5 for any real travel time t from 0 to 20 minutes. Complete the attributes. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 16 | DOL | Rendered function graph + interval-analysis responses<br>_Prompt:_ For f(x) = −(x − 2)² + 9, state the intervals where the function is increasing, decreasing, positive, and negative. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 17 | DOL | Mapping arrows + domain/range + function decision<br>_Prompt:_ Represent {(−1, 2), (2, 5), (2, −3), (6, 1)} with a mapping. State the domain and range and decide whether it is a fu… | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 18 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A tank is filled at 4 gallons per minute for exactly 12 minutes. Let V(t)=4t for 0 ≤ t ≤ 12. Complete the attributes. | **PASS** | No student-facing mismatch found in the audited renderer contract. |

### Algebra II Honors — Lesson 2 Day 1: Parent Functions and Key Attributes

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = \|x\|. State the domain and range. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 2 | Warm-Up | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x) = x². State where the function is increasing and where it is decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 3 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ For f(x)=2x+1, identify the domain and range. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 4 | Classwork | Rendered function graph + interval responses + clickable graph feature(s)<br>_Prompt:_ Analyze the parent function f(x)=\|x\|. State the domain, range, vertex, and minimum point. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 5 | Classwork | Rendered function graph + interval responses + clickable graph feature(s)<br>_Prompt:_ Analyze the parent function f(x)=√x. State the domain, range, x-intercept, and y-intercept. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 6 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Analyze the parent function f(x)=x³. State the domain, range, and where it is increasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 7 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Analyze the parent function f(x)=∛x. State the domain, range, and where it is increasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 8 | Classwork | Rendered function graph + interval-analysis responses<br>_Prompt:_ Analyze the reciprocal parent function f(x)=1/x. State the domain, range, where it is positive, and where it is negat… | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 9 | Classwork | Rendered function graph + interval responses + clickable graph feature(s)<br>_Prompt:_ Analyze the exponential parent function f(x)=2ˣ. State the domain, range, y-intercept, and where it is increasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 10 | Classwork | Rendered function graph + interval responses + clickable graph feature(s)<br>_Prompt:_ Analyze the logarithmic parent function f(x)=log₂(x). State the domain, range, x-intercept, and where it is increasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 11 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Connect each parent function to its asymptotic behavior. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 12 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Identify the family and key attributes of f(x)=√x. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 13 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Identify the family and key attributes of f(x)=1/x. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 14 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x)=−√x. State the domain, range, and whether the function is increasing or decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 15 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x)=(1/2)ˣ. State the domain, range, and whether the function is increasing or decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 16 | Practice | Rendered function graph + interval-analysis responses<br>_Prompt:_ Use the graph of f(x)=log₁⁄₂(x). State the domain, range, and whether the function is increasing or decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 17 | DOL | Rendered function graph + interval-analysis responses<br>_Prompt:_ Analyze f(x)=1/x. State its domain, range, and intervals where it is decreasing. | **FIXED → PASS** | interval/set/inequality controls are visible immediately; empty intervals have a consistent “Does not exist” control |
| 18 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Identify the parent function from its equation and one defining attribute. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 19 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ For f(x)=2ˣ and g(x)=log₂(x), identify the matching asymptotes. | **PASS** | No student-facing mismatch found in the audited renderer contract. |

### Algebra II Honors — Lesson 2 Day 2: Transformations of Parent Functions

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review the parent function f(x)=\|x\|. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 2 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review the parent function f(x)=√x. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 3 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review f(x)=2ˣ. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 4 | Classwork | Transformation graph → identify a, h, k<br>_Prompt:_ Read the transformed absolute-value graph and determine the values of a, h, and k. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 5 | Classwork | Transformation graph → describe direction and magnitude<br>_Prompt:_ Describe every vertical reflection, vertical scale, horizontal translation, and vertical translation in the transform… | **FIXED → PASS** | student now gives scale factor and shift amounts, not only direction/category |
| 6 | Classwork | Parent/transformed graphs → map an ordered pair<br>_Prompt:_ Map the parent-function point (1, 1) through the cubic transformation y = 2(x − 1)³ − 1. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 7 | Classwork | Adjust a, h, k until graph matches target<br>_Prompt:_ Adjust a, h, and k until your exponential graph matches the target transformation. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 8 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Use the model g(x)=A·f(B(x−C))+D. Describe g(x)=f(x+3). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 9 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe the horizontal transformation g(x)=f(2x). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 10 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe g(x)=f(−x). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 11 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe every transformation in g(x)=−2f(x−1)+3. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 12 | Practice | Transformation graph → identify a, h, k<br>_Prompt:_ Read the transformed reciprocal graph and determine a, h, and k. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 13 | Practice | Transformation graph → describe direction and magnitude<br>_Prompt:_ Describe every transformation shown by the transformed exponential graph. | **FIXED → PASS** | student now gives scale factor and shift amounts, not only direction/category |
| 14 | Practice | Parent/transformed graphs → map an ordered pair<br>_Prompt:_ Map the parent-function point (4, 2) through y = 0.5√(x − 3) + 2. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 15 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe g(x)=f(x−5)−2. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 16 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe g(x)=f(−2x)+1. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 17 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Compare g(x)=3f(x+2)−4 to f(x). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 18 | DOL | Transformation graph → identify a, h, k<br>_Prompt:_ Read the transformed cube-root graph and determine a, h, and k. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 19 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Describe g(x)=−f(3(x+2))+4. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 20 | DOL | Parent/transformed graphs → map an ordered pair<br>_Prompt:_ Map the parent-function point (0, 1) through $y=-3*2^(x-2)+1$. | **FIXED → PASS** | equation is rendered as formatted math instead of raw exponent syntax |

### Algebra II Honors — Lesson 3: Inverse Linear Functions

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review ordered pairs and function notation. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 2 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review the graph relationship y=x. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 3 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ For f(x)=3x+2, identify its domain and range. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 4 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse relation of {(−3, 26), (2, 11), (6, −1), (−1, 20)}. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 5 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Use the inverse property. If f(6)=2, complete the statement about f⁻¹. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 6 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=3x−7. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 7 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=−4x+12. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 8 | Classwork | Inverse graph/workspace<br>_Prompt:_ Use the inverse workspace to undo f(x)=2x+3 and observe how the graphs of f and f⁻¹ reflect across y=x. | **FIXED → PASS** | workspace now shows only the authored inverse/composition mode and does not expose unrelated panels; inverse graph auto-expands so (4,11) and (11,4) are visible |
| 9 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=12−9x. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 10 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Carter earns a base salary of $2200 per month plus 5% of his monthly sales. His earnings are E(s)=2200+0.05s. Use the… | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 11 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse relation of {(4, 8), (−6, 6), (3, 3), (0, −8)}. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 12 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=5x+10. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 13 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=−2x−6. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 14 | Practice | Inverse graph/workspace<br>_Prompt:_ Use the inverse workspace to undo f(x)=−3x+9 and connect a point on f to its swapped point on f⁻¹. | **FIXED → PASS** | workspace now shows only the authored inverse/composition mode and does not expose unrelated panels |
| 15 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A mechanic charges a $40 inspection fee plus $65 per half-hour of repair labor. Let C(h)=40+65h, where h is the numbe… | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 16 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A linear function and its inverse intersect at a point on y=x. If the point is (5,5), what must both functions do there? | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 17 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse relation of {(−2, 5), (1, 7), (4, 0)}. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 18 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Find the inverse of f(x)=4x−9. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |
| 19 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A subscription cost is C(m)=15m+25, where m is months and C is total dollars. Use the inverse relationship. | **FIXED → PASS** | inverse notation/choice mathematics render through math display instead of raw f^-1/plain dropdowns |

### Algebra II Honors — Lesson 4: Operations on Functions and Composition

| Q | Section | Interaction student receives | Result | Audit note |
|---:|---|---|---|---|
| 1 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Review inverses. For f(x)=2x+5, identify f⁻¹(x) and one check. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 2 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ If f(2)=7 and g(2)=−3, evaluate two pointwise operations. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 3 | Warm-Up | Math/number response fields and/or selectable answer cards<br>_Prompt:_ If g(4)=2 and f(2)=9, evaluate the composition f(g(4)). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 4 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=3x²+7x and g(x)=2x²−x−1, find the sum and difference of the functions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 5 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=3x²−2x+1 and g(x)=x−4, identify the product (f·g)(x). | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 6 | Classwork | Polynomial area model with coefficient-entry cells<br>_Prompt:_ Let f(x)=2x+3 and g(x)=x−4. Use the area model to multiply the two function rules and combine like terms. | **FIXED → PASS** | cells visibly ask for signed coefficients while showing the variable part, matching the grader |
| 7 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=3x²−2x+1 and g(x)=x−4, write the quotient function and its domain restriction. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 8 | Classwork | Two function machines + composition comparison<br>_Prompt:_ Follow the value through both function machines and compare the two composition orders for f(x)=2x+3 and g(x)=x−4. | **FIXED → PASS** | workspace now shows only the authored inverse/composition mode and does not expose unrelated panels |
| 9 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ For f(x)=3x²−x+4 and g(x)=2x−1, find both compositions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 10 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ A $100 retirement deduction and a 4% state tax can be applied in different orders to a $1500 paycheck. Let r(x)=x−100… | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 11 | Classwork | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Determine whether f(x)=3x−6 and g(x)=(x+6)/3 are inverses by examining both compositions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 12 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=2x²+5x+2 and g(x)=3x²+3x−4, find the sum and difference. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 13 | Practice | Polynomial area model with coefficient-entry cells<br>_Prompt:_ Let f(x)=x+5 and g(x)=2x−3. Use the area model to multiply the two function rules. | **FIXED → PASS** | cells visibly ask for signed coefficients while showing the variable part, matching the grader |
| 14 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=2x²+3x−1 and g(x)=x+2, write the quotient and identify the excluded input. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 15 | Practice | Two function machines + composition comparison<br>_Prompt:_ Compare the composition orders for f(x)=−x+6 and g(x)=3x+1 at x=2. | **FIXED → PASS** | workspace now shows only the authored inverse/composition mode and does not expose unrelated panels; authored x=2 is fixed instead of silently editable |
| 16 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ For f(x)=x²+2x+3 and g(x)=x+5, find both compositions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 17 | Practice | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Determine whether f(x)=0.5x+4 and g(x)=2x−8 are inverses. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 18 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=x²−2x+3 and g(x)=2x+1, find both compositions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 19 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Given f(x)=x+4 and g(x)=x−4, evaluate the product and quotient descriptions. | **PASS** | No student-facing mismatch found in the audited renderer contract. |
| 20 | DOL | Math/number response fields and/or selectable answer cards<br>_Prompt:_ Determine whether f(x)=4x+1 and g(x)=(x−1)/4 are inverses. | **PASS** | No student-facing mismatch found in the audited renderer contract. |

## Release recommendation

The six assignments are now suitable for a teacher preview/import pass against the updated platform. I would still require one real-browser smoke test after `npm ci && npm run build`: open at least one item from every interaction family on the deployed preview, especially interval notation, graph analysis, relation plotting, contextual workflow, inverse/composition, transformations, and polynomial area model. That final smoke test is for browser/layout integration—not because a known question-level blocker remains in this audit.