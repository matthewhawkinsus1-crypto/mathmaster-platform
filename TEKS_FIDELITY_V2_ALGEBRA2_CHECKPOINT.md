# Algebra II Fidelity V2 — Continuation Checkpoint

Last updated: 2026-08-30

## Branch

`audit/teks-fidelity-v2-algebra2-current`

This branch starts from the certified Algebra I checkpoint. Do not use the older `audit/teks-fidelity-v2-algebra2` branch because it predates the completed Algebra I Path adapter work.

## Durable resume anchor

- Certified Algebra I base: `780b9e6fbf5cf6d7bdfba8417a1fb392b4369572`
- Algebra I release checkpoint branch head that locked certification: `ddef6dc1260dd718f41e5a4ddad55714fbbb319e`
- Current Algebra II branch head before this logging update: `a3e9dc13b9036cb81bcf674936e114aa4f516fab`
- Current source bank: `drafts/algebra2.json`
- Standards: **48**
- Legacy families: **240** (5 per standard)
- Frozen whole-course decision matrix from the certified Algebra I base: **15 KEEP · 15 ENHANCE · 18 REBUILD**
- No bulk Algebra II promotion or Firestore deployment has started.

## Progress discipline — mandatory

The purpose of this file is to prevent chat interruptions from causing repeated audits.

1. Update this checkpoint **after every completed standard** before opening the next standard.
2. Also update it immediately after any branch-level architecture discovery that changes the plan.
3. A completed standard is not reopened unless a named certification/regression test fails.
4. The **FIRST UNFINISHED STANDARD** section is authoritative for every new chat.
5. When a standard is completed, record:
   - verdict,
   - exact staged file,
   - student action now measured,
   - secure/runtime dependency used or added,
   - certification gate added/extended,
   - next unfinished standard.
6. Do not spend a new chat reconstructing old work. Read this file first, then only the current unfinished standard's source/staged package/tests.

---

## Completed standards

### A2.2A — REBUILD — STAGED

Official construct: graph the required Algebra II parent functions and, when applicable, analyze key attributes.

Fidelity V2 status:
- 5 Path families
- deterministic sub-variants supported server-side
- covers all seven required parent types:
  - square root
  - reciprocal
  - cubic
  - cube root
  - exponential
  - absolute value
  - logarithmic
- logarithmic coverage includes bases 2, 10, and e
- student must construct graphs, not merely recognize attributes
- graph work is connected to domain/range/intercept/symmetry/asymptote analysis
- secure Path eligibility is checked on generated instances

Files:
- `drafts/fidelity-v2/algebra2/A2.2A.json`
- `tests/platform/algebra2FidelityV2Staged.test.mjs`
- deterministic Path sub-variant support in `functions/shared/pathQuestionGeneration.mjs`
- sub-variant regression coverage in `tests/platform/pathQuestionGeneration.test.mjs`

Do **not** re-audit A2.2A unless its certification test fails.

---

## Completed: A2.2B

### A2.2B — ENHANCE — CERTIFIED

Official construct: **Graph and write the inverse of a function using inverse-function notation.**

Certification result:
- five Fidelity V2 families staged;
- graph → reflect across `y=x` → inverse graph → inverse equation is the recurring assessed action;
- secure table → graph workflow is preserved in the public Path payload without leaking private keys;
- nonlinear breadth includes restricted quadratic, square-root, and rational inverse construction;
- generated secure instances self-grade their own correct work through the server contract;
- targeted Algebra II Fidelity V2 Certification run `33315723037`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.2B unless a named regression/certification test fails.

## Completed: A2.2C

### A2.2C — ENHANCE — CERTIFIED

Official construct: **Describe and analyze relationships between functions and their inverses, including quadratic/square root and logarithmic/exponential pairs and required domain restrictions.**

Certification result:
- five Fidelity V2 families staged;
- quadratic/square-root and exponential/logarithmic inverse pairs are both repeatedly assessed;
- left-branch and right-branch quadratic restrictions are both represented;
- domain/range exchange, reflection features, intercept/asymptote exchange, and unrestricted-quadratic error analysis are required;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- public Path payloads strip private answer keys;
- targeted Algebra II Fidelity V2 Certification run `33316108442`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.2C unless a named regression/certification test fails.

## Completed: A2.2D

### A2.2D — REBUILD — CERTIFIED

Official construct: **Use composition of functions, including necessary domain restrictions, to determine whether two functions are inverses.**

Certification result:
- five Fidelity V2 families staged;
- composition is the graded evidence used to decide inverse status in every family;
- at least three families require both $f(g(x))$ and $g(f(x))$;
- right-branch and left-branch quadratic/square-root restrictions are both verified;
- true inverse and non-inverse/counterexample cases are both present;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- public Path payloads strip private answer keys;
- targeted Algebra II Fidelity V2 Certification run `33316271929`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.2D unless a named regression/certification test fails.

## Completed: A2.3A

### A2.3A — REBUILD — CERTIFIED

Official construct: **Formulate systems of equations, including three linear equations in three variables and systems with one linear and one quadratic equation.**

Certification result:
- five Fidelity V2 families staged;
- students author the systems rather than select prewritten models;
- 3×3 linear-system formulation appears repeatedly from context and tables;
- linear/quadratic formulation appears repeatedly from graph/verbal information;
- error analysis requires the corrected system, not only the diagnosis;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- public Path payloads strip private answer keys;
- targeted Algebra II Fidelity V2 Certification run `33316415151`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3A unless a named regression/certification test fails.

## Completed: A2.3B

### A2.3B — ENHANCE — CERTIFIED

Official construct: **Solve systems of three linear equations in three variables using Gaussian elimination, technology with matrices, and substitution.**

Certification result:
- five Fidelity V2 families staged;
- substitution, Gaussian elimination, and matrix technology are all explicitly represented;
- matrix technology is authentic 3×3 RREF, not a disguised 2×2 or answer-choice task;
- Gaussian-elimination families collect intermediate row evidence;
- the substitution family collects actual substituted equations;
- complete error analysis repairs the row operation and still solves x, y, z;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- secure matrix grading recomputes the 3×3 solution server-side and requires the RREF technology action;
- targeted Algebra II Fidelity V2 Certification run `33318007307`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3B unless a named regression/certification test fails.

## Completed: A2.3C

### A2.3C — REBUILD — CERTIFIED

Official construct: **Solve algebraically systems of two equations in two variables consisting of one linear equation and one quadratic equation.**

Certification result:
- five Fidelity V2 families staged;
- every family algebraically reduces the system to a quadratic equation;
- real solutions are completed as ordered pairs, not x-values only;
- two-intersection, tangent/one-intersection, and zero-real-solution systems are all covered;
- factoring, discriminant, and exact quadratic-formula pathways are represented;
- error analysis repairs the algebra and finishes the complete system solutions;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- targeted Algebra II Fidelity V2 Certification run `33318173657`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3C unless a named regression/certification test fails.

## Completed: A2.3D

### A2.3D — REBUILD — CERTIFIED

Official construct: **Determine the reasonableness of solutions to systems consisting of a linear equation and a quadratic equation in two variables.**

Certification result:
- five Fidelity V2 families staged;
- every family uses concrete equation-output/residual evidence rather than recognition-only rules;
- both reasonable and unreasonable exact candidates are represented;
- algebraically valid but contextually unreasonable candidates are represented;
- numerical/rounded candidates are judged against an explicit residual tolerance;
- error analysis performs the omitted check and changes the verdict;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- targeted Algebra II Fidelity V2 Certification run `33318356389`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3D unless a named regression/certification test fails.

## Completed: A2.3E

### A2.3E — REBUILD — CERTIFIED

Official construct: **Formulate systems of at least two linear inequalities in two variables.**

Certification result:
- five Fidelity V2 families staged;
- every family makes the student write at least two inequalities;
- coupled budget/resource constraints, nonnegativity, strict/inclusive boundaries, and region descriptions are represented;
- equivalent algebraic forms of linear inequalities are accepted securely rather than requiring one printed arrangement;
- error analysis diagnoses the bad boundary symbol and still writes the complete corrected system;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- Correct Answer Acceptance Audit after inequality-equivalence wiring: **PASS**;
- targeted Algebra II Fidelity V2 Certification run `33318552461`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3E unless a named regression/certification test fails.

## Completed: A2.3F

### A2.3F — REBUILD — CERTIFIED

Official construct: **Solve systems of two or more linear inequalities in two variables.**

Certification result:
- five Fidelity V2 families staged;
- every family requires secure construction of every boundary and the common solution region;
- two- and three-inequality systems are both represented repeatedly;
- inclusive, strict, and mixed boundary styles are required;
- contextual transfer and union-vs-intersection error repair are included;
- one contextual three-inequality system has no common solution region;
- the workspace now visually distinguishes third/fourth/fifth inequality boundaries rather than reusing one color;
- 200+ generated instances pass production issuability and secure correct-construction self-acceptance;
- spoiled wrong-shading work is rejected by the server;
- targeted Algebra II Fidelity V2 Certification run `33318879330`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3F unless a named regression/certification test fails.

## Completed: A2.3G

### A2.3G — ENHANCE — CERTIFIED

Official construct: **Determine possible solutions in the solution set of systems of two or more linear inequalities in two variables.**

Certification result:
- five Fidelity V2 families staged;
- every family determines whether a marked ordered pair is possible and requires a feasible ordered pair;
- two- and three-inequality systems are both represented;
- feasible and infeasible marked points are both required;
- a point on a strict/dashed boundary is rejected;
- a point on an inclusive/solid boundary is accepted when all other constraints hold;
- contextual transfer and genuine error analysis are included;
- 200+ generated instances pass production issuability and secure Path eligibility;
- opposite marked-point verdicts and infeasible candidate points are rejected by the server;
- targeted Algebra II Fidelity V2 Certification run `33319070766`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.3G unless a named regression/certification test fails.

## Completed: A2.4A

### A2.4A — REBUILD — CERTIFIED

Official construct: **Write a quadratic function given three specified points in the plane.**

Certification result:
- five Fidelity V2 families staged;
- every family visibly provides exactly three specified points and requires the complete quadratic function;
- no family gives away the generated leading coefficient;
- table, ordered-pair, graph, contextual, and error-analysis representations are all present;
- multiple families omit x=0 so c cannot always be read directly;
- multiple families require the three-equation coefficient setup before the final function;
- generated final equations are verified against all three source points;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- public payloads retain all three source points while stripping answer keys;
- targeted Algebra II Fidelity V2 Certification run `33319282779`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4A unless a named regression/certification test fails.

## Completed: A2.4B

### A2.4B — REBUILD — CERTIFIED

Official construct: **Write the equation of a parabola using given attributes, including vertex, focus, directrix, axis of symmetry, and direction of opening.**

Certification result:
- five Fidelity V2 families staged;
- every family requires the complete parabola equation rather than attribute recognition;
- vertical up/down and horizontal right/left orientations are all represented;
- vertex, focus, directrix, axis of symmetry, and opening direction all appear as meaningful evidence;
- one graph family infers the vertex from focus/directrix geometry;
- error analysis repairs orientation reasoning and still writes the corrected equation;
- opt-in polynomial-relation grading accepts algebraically identical parabola equations without weakening unrelated form-specific grading;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- reversed-side equivalent equations are accepted and wrong relations are rejected;
- targeted Algebra II Fidelity V2 Certification run `33319560739`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4B unless a named regression/certification test fails.

## Completed: A2.4C

### A2.4C — REBUILD — CERTIFIED

Official construct: **Determine the effect on the graph of the square root parent function when it is vertically or horizontally scaled, reflected, or translated.**

Certification result:
- five Fidelity V2 families staged;
- full $a\sqrt{b(x-h)}+k$ transformation reasoning is represented without pretending the current interactive tool supports b;
- vertical stretch and vertical compression are both explicit;
- horizontal stretch and reciprocal horizontal compression are both explicit;
- x-axis reflection and horizontal/y-axis reflection effects are both represented;
- endpoint translation and left/right ray direction are required;
- generated point mapping and graph-distance evidence verify the horizontal effects numerically;
- reverse reasoning and complete error analysis are present;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- targeted Algebra II Fidelity V2 Certification run `33319841981`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4C unless a named regression/certification test fails.

## Completed: A2.4D

### A2.4D — REBUILD — CERTIFIED

Official construct: **Transform a quadratic function from standard form to vertex form to identify its attributes.**

Certification result:
- five Fidelity V2 families staged;
- every family explicitly starts from standard form and requires complete vertex form;
- completing-square evidence is collected repeatedly;
- repeated |a|>1 cases require factoring before completing the square;
- positive- and negative-leading-coefficient cases cover minimum/maximum, opening, axis, vertex, and range;
- contextual projectile interpretation and complete factoring-error repair are included;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- independent probe-value checks confirm standard and vertex forms are equivalent;
- the original standard form is deliberately rejected when submitted as the requested vertex-form answer;
- targeted Algebra II Fidelity V2 Certification run `33320130829`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4D unless a named regression/certification test fails.

## Completed: A2.4E

### A2.4E — REBUILD — CERTIFIED

Official construct: **Formulate quadratic and square root equations using technology from a table of data.**

Certification result:
- added a real secure square-root regression/model-fitting technology path to Data Modeling Lab;
- client and server independently compute the same endpoint-anchored full-table square-root regression;
- five Fidelity V2 families staged, all using authentic Data Modeling Lab technology;
- at least two quadratic-regression and two square-root-regression families are present;
- every table has five observations, so the task does not collapse into minimum-point hand fitting;
- every family requires the complete fitted coefficients and a fixed prediction from the fitted model;
- interpolation, extrapolation, contextual transfer, and technology-entry error repair are represented;
- secure server grading rejects materially wrong fitted coefficients and rejects changing the authored prediction target;
- public payloads expose the table/mode/target but not fitted coefficients or private tolerances;
- generated package certification run `33323489643`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4E unless a named regression/certification test fails.

## Completed: A2.4F

### A2.4F — ENHANCE — CERTIFIED

Official construct: **Solve quadratic and square root equations.**

Certification result:
- five Fidelity V2 families staged;
- quadratic solving includes both factoring and an exact quadratic-formula family with a guaranteed non-perfect-square discriminant;
- square-root solving repeatedly requires isolate → square → solve rather than one-step undoing;
- contextual interpretation and complete error repair are included;
- every family finishes the actual solution set rather than stopping at a method-identification step;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- a spoiled final solution is rejected in every family;
- public payloads strip answer keys;
- targeted Algebra II Fidelity V2 Certification run `33323687834`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4F unless a named regression/certification test fails.

## Completed: A2.4G

### A2.4G — REBUILD — CERTIFIED

Official construct: **Identify extraneous solutions of square root equations.**

Certification result:
- five Fidelity V2 families staged;
- every family checks squared-equation candidates against the original unsquared square-root equation;
- repeated families collect concrete original-equation LHS/RHS substitution evidence;
- both one-extraneous and no-extraneous cases are represented;
- one family proves radical-domain membership alone is insufficient;
- contextual transfer and complete error repair are included;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- incorrect extraneous/valid conclusions are rejected;
- public payloads strip answer keys;
- targeted Algebra II Fidelity V2 Certification run `33323859773`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4G unless a named regression/certification test fails.

## Completed: A2.4H

### A2.4H — ENHANCE — CERTIFIED

Official construct: **Solve quadratic inequalities.**

Certification result:
- five Fidelity V2 families staged;
- standard-form, factored, positive-leading, and negative-leading quadratic inequalities are represented;
- strict and inclusive solution sets are both required;
- a secure interval-number-line family constructs both exterior rays and interval notation;
- a no-real-zero case uses discriminant/sign reasoning to produce the all-real solution set;
- error analysis repairs endpoint inclusion and still gives the complete interval;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- incorrect interval/end-point work is rejected;
- public payloads strip answer keys;
- targeted Algebra II Fidelity V2 Certification run `33324732755`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.4H unless a named regression/certification test fails.

## Completed: A2.5A

### A2.5A — REBUILD — CERTIFIED

Official construct: **Determine effects on key attributes of exponential and logarithmic graphs when they are vertically scaled/reflected or translated.**

Certification result:
- five Fidelity V2 families staged;
- both transformed exponential and logarithmic graphs are represented repeatedly;
- secure Function Investigation constructs one transformed exponential graph and one transformed logarithmic graph;
- vertical stretch/compression, x-axis reflection, horizontal/vertical translation, asymptotes, domain/range, anchor points, and increasing/decreasing behavior are all assessed;
- complete error analysis repairs parameter-role confusion and finishes the corrected attribute set;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- generated graph points are independently verified against the function specification;
- incorrect point/attribute work is rejected;
- public payloads strip answer keys;
- replacement Algebra II Fidelity V2 Certification run `33324974453`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.5A unless a named regression/certification test fails.

## Completed: A2.5B

### A2.5B — REBUILD — CERTIFIED

Official construct: **Formulate exponential and logarithmic equations that model real-world situations, including exponential relationships written recursively.**

Certification result:
- five Fidelity V2 families staged;
- students author equations rather than select prewritten models;
- growth and decay contexts both require explicit and recursive exponential forms;
- a table/data family requires inferring the common multiplier before writing both forms;
- an authentic logarithmic ratio-scale real-world model is included;
- error analysis repairs a growth factor and both explicit/recursive equations;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- tabular common ratios and growth/decay factors are independently checked;
- a spoiled model equation is rejected in every family;
- public payloads strip answer keys;
- targeted Algebra II Fidelity V2 Certification run `33325134988`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.5B unless a named regression/certification test fails.

## Completed: A2.5C

### A2.5C — ENHANCE — CERTIFIED

Official construct: **Rewrite exponential equations as corresponding logarithmic equations and logarithmic equations as corresponding exponential equations.**

Certification result:
- five Fidelity V2 families staged;
- every family requires a written equivalent equation instead of multiple-choice recognition;
- exponential→logarithmic and logarithmic→exponential rewrites both occur repeatedly;
- numeric, symbolic-expression, common-log, and natural-log forms are represented;
- one family rewrites the same relationship in both directions;
- error analysis repairs base/argument role confusion and writes the corrected equivalent form;
- 200+ generated instances pass production issuability and secure correct-answer self-acceptance;
- numeric role mappings are independently verified;
- non-equivalent rewrites are rejected;
- public payloads strip answer keys;
- replacement Algebra II Fidelity V2 Certification run `33325302232`: **PASS**;
- student/runtime build in the same run: **PASS**.

Do **not** re-audit A2.5C unless a named regression/certification test fails.

## Active standard

### A2.5D — ENHANCE — STAGED / CERTIFICATION RUNNING

Official construct: **Solve exponential equations of the form y = ab^x and single logarithmic equations having real solutions.**

## FIRST UNFINISHED STANDARD

### A2.5D

Resume here. Do not reopen A2.2A–A2.5C unless a failing gate names them.


### 2026-08-30 — A2.5D audit finding
- Official construct: **solve exponential equations of the form y = ab^x and single logarithmic equations having real solutions**.
- Verdict: **ENHANCE**.
- Legacy strengths:
  - same-base exponential solving is correct;
  - one y=ab^x solve is present;
  - single logarithmic equations and common-log notation are present;
  - the “isolate the exponential first” misconception is identified correctly.
- Legacy limitations:
  - every exponential target is engineered to be an exact integer power of the base, so logarithmic solving is never truly necessary;
  - logarithmic equations are mostly one-step rewrites with easy integer outputs;
  - the error-analysis family asks only what to do first and never completes the solve;
  - context is thin and does not require interpreting the solved exponent as time/period;
  - exact noninteger logarithmic solutions are absent.
- Fidelity V2 requirements:
  - preserve a same-base pathway, but add a genuine y=ab^x case whose solution must be expressed with logarithms;
  - include single-log equations with an affine argument so rewriting to exponential form still requires a linear solve;
  - include common/natural-log notation breadth where appropriate;
  - include a contextual exponential solve with interpretation of the exponent;
  - include complete error analysis that repairs the isolation/log step and still finishes x;
  - keep A2.5D distinct from A2.5E: solve the equation here; reasonableness/domain validation is the next standard's primary action.
- Generic secure equation/expression/number fields are sufficient; no new Path capability is required.


### 2026-08-30 — A2.5D staged and gated
- Staged five A2.5D Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.5D.json` — commit `78074a1609bf8258c64525cd707f2889f86b192d`.
- Package/build run `33325402874`: **PASS**, including student/runtime build.
- Coverage includes:
  - complete same-base exponential solving;
  - a genuine y=ab^x solve whose isolated ratio is deliberately not a power of 2 and therefore requires logarithms;
  - a common-log equation with affine argument that rewrites to exponential form and finishes a linear solve;
  - contextual noninteger exponential time solved exactly with natural logs and interpreted in hours;
  - complete error repair for taking logs before isolating the exponential expression.
- Added A2.5D-specific generated certification — commit `3a1d909beeb2790be8b9f9b20f6b9cfc8ce71658`.
- The gate samples 200+ generated instances, independently verifies non-power ratios/log approximations, validates affine-log solutions and positive log arguments, requires context/error-repair breadth, rejects a wrong final solved value in every family, and checks public answer-key stripping.
- Full A2.5D assertion run `33325432153`: **FAILED at generated issuability for the non-power logarithmic solve**.
- Root cause: the content generator intentionally supports a small safe arithmetic language and does **not** expose `log()`; two families tried to derive rounded logarithmic approximations with `round(log(...),3)`, so the secure generator correctly failed closed as `constraints_unsatisfiable`.
- Removed those generated decimal keys and kept the mathematically stronger exact solutions `ln(ratio)/ln(2)`; the fixed-context family still supplies an independently valid decimal interpretation where the target ratio is constant — commit `ebfc90d7e328e80d5d245f97488c828486edc299`.
- Consolidated two overlapping A2.5D certification blocks into one authoritative gate and updated it to require exact logarithmic solutions rather than unsupported generator-side log arithmetic — commit `14841fd43569c5b982f6a752d4c5fb475af24048`.
- No mathematical requirement was weakened: non-power exponential cases still require logarithms, and the gate independently verifies those ratios are not integer powers of 2.
- Replacement A2.5D certification is triggered.
- FIRST UNFINISHED STANDARD remains **A2.5D** until the replacement run is green.


### 2026-08-30 — A2.5C audit finding
- Official construct: **rewrite exponential equations as corresponding logarithmic equations and logarithmic equations as corresponding exponential equations**.
- Verdict: **ENHANCE**.
- Legacy mathematical role-mapping is sound:
  - exponential base remains logarithmic base;
  - exponential result becomes logarithm argument;
  - exponent becomes logarithm value;
  - both conversion directions are represented.
- The fidelity weakness is the student action:
  - all five legacy families are multiple-choice recognition;
  - none requires the student to actually author the corresponding equation;
  - examples are almost entirely positive-integer numeric triples, so students can pattern-match without transferring the relationship to variables/expressions;
  - common/natural-log notation and symbolic expressions are absent;
  - error analysis identifies a role mistake but does not require writing the corrected equation.
- Fidelity V2 requirements:
  - every family must require a **written rewritten equation**;
  - both directions must occur repeatedly;
  - include numeric role-mapping, variable/expression role-mapping, and common/natural-log notation;
  - include at least one family that rewrites the same relationship in both directions to make the equivalence explicit;
  - do not turn the task into solving for the exponent/input — A2.5D owns equation solving;
  - error analysis must repair the incorrect base/argument/exponent placement and write the corrected equivalent form.
- Generic secure equation fields are sufficient; no new Path capability is required.


### 2026-08-30 — A2.5C staged and gated
- Staged five A2.5C Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.5C.json` — commit `a51e7c2d80105777a7e847ec551437297d85559d`.
- Package/build run `33325233108`: **PASS**, including student/runtime build.
- Coverage includes:
  - student-written numeric exponential → logarithmic rewrite;
  - student-written numeric logarithmic → exponential rewrite;
  - symbolic exponent-expression role mapping without solving;
  - common-log and natural-log rewrites;
  - complete base/argument role-error repair followed by rewriting back in the opposite direction.
- Added A2.5C-specific generated certification — commit `812c9bfaa2e90bff5012c8f02b9e4f2adcfd4132`.
- The gate samples 200+ generated instances, independently verifies numeric role mappings, requires written equation fields rather than multiple-choice recognition, requires both directions repeatedly, checks symbolic/common/natural-log breadth, rejects a non-equivalent rewrite in every family, and checks public answer-key stripping.
- Full A2.5C assertion run `33325264164`: **FAILED only on the certification test's rewrite-direction counter** after the generated/self-grading checks passed.
- Cause: the gate counted exponential→logarithmic families from prompt wording such as “logarithmic equation,” so valid families phrased as “logarithmic form” were not counted even though their authored answer fields were correct.
- Repaired the gate to count rewrite direction from the actual private authored equation keys: `log_`/ `ln(` for exponential→log and `^` for log→exponential — commit `27867ec9d265191ef568dd9918923d6d5e83e4d9`.
- No content requirement was weakened; the gate now measures the equations students actually have to write instead of prose wording.
- Replacement A2.5C certification is triggered.
- FIRST UNFINISHED STANDARD remains **A2.5C** until the replacement run is green.


### 2026-08-30 — A2.5B audit finding
- Official construct: **formulate exponential and logarithmic equations that model real-world situations, including exponential relationships written recursively**.
- Verdict: **REBUILD**.
- Legacy strengths:
  - growth/decay contexts are mathematically correct;
  - a recursive exponential relationship appears;
  - one logarithmic equation is connected to an exponential model.
- Legacy drift:
  - four of five families are multiple-choice recognition rather than formulation;
  - the recursive family converts an already-given recurrence to explicit form instead of formulating the recurrence from a situation/table;
  - the logarithmic family is really an A2.5D-style “solve for time” rewrite, not formulation of a logarithmic real-world model;
  - no family makes the student author both the explicit and recursive forms of the same exponential situation;
  - no authentic logarithmic measurement/modeling context is present.
- Fidelity V2 requirements:
  - students must **write** the model equations, not select a prewritten option;
  - include both growth and decay real-world situations;
  - repeatedly formulate both explicit exponential and recursive forms from the same evidence;
  - include at least one table/data representation where the common ratio must be inferred before writing the model;
  - include authentic logarithmic real-world modeling (for example, a log scale or ratio-based measurement) rather than using logarithms only as a solving trick;
  - include contextual interpretation of parameters/base;
  - include genuine error analysis that repairs a faulty growth/decay factor or recurrence and still writes the complete corrected model.
- Keep A2.5B distinct from A2.5C/D: this standard is model formulation, not conversion practice or equation solving.
- Generic secure equation/number fields are sufficient; no new Path tool capability is required.


### 2026-08-30 — A2.5B staged and gated
- Staged five A2.5B Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.5B.json` — commit `36d8f6c51ca5eb934b7f8c638bf2c2fa4281f26c`.
- Package/build run `33325107421`: **PASS**, including student/runtime build.
- Coverage includes:
  - growth context with student-authored explicit and recursive exponential models;
  - decay context with student-authored explicit and recursive models;
  - table/data family that requires inferring the common multiplier before writing both forms;
  - authentic logarithmic ratio-scale modeling in a real-world measurement context;
  - complete growth-factor error repair that fixes both explicit and recursive models.
- Added A2.5B-specific generated certification — commit `314f162401e54fafb2219121b29f4332b17c77a9`.
- The gate samples 200+ generated instances, validates growth/decay factors, verifies tabular ratios independently, requires repeated explicit+recursive formulation, requires authentic logarithmic modeling, rejects a nonmatching model in every family, and checks public answer-key stripping.
- Full A2.5B assertion run `33325134988`: **PASS**.
- Generated growth/decay/table/log modeling, explicit+recursive formulation, wrong-model rejection, public-key stripping, and student/runtime build all passed.
- A2.5B is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.5C**.


### 2026-08-30 — A2.5A audit finding
- Official construct: **determine effects on key attributes of exponential and logarithmic graphs when they are vertically scaled/reflected or translated**.
- Verdict: **REBUILD**.
- Legacy coverage is too narrow:
  - four of five families are logarithmic, while the exponential side is reduced to a single horizontal-asymptote question;
  - most families identify one attribute or select a description instead of determining several graph effects together;
  - vertical scaling is barely assessed and vertical reflection is effectively absent;
  - horizontal and vertical translations are not systematically connected to domain/range/asymptotes/key points;
  - error analysis corrects only a log-asymptote mix-up and does not repair a transformed graph interpretation.
- Fidelity V2 requirements:
  - exponential **and** logarithmic transformed graphs must both be represented repeatedly;
  - include vertical stretches/compressions and reflections through the sign/magnitude of a;
  - include horizontal and vertical translations through h and k;
  - require key attributes, not vocabulary only:
    - exponential: horizontal asymptote, domain, reflected/translated range, anchor point at x=h, and increasing/decreasing behavior;
    - logarithmic: vertical asymptote, translated domain, range, anchor point at x=h+1, and increasing/decreasing behavior;
  - include actual graph/point construction for at least one exponential and one logarithmic family;
  - include combined transformations where several effects must be determined together;
  - include genuine error analysis that repairs the reflection/translation/attribute reasoning and finishes the corrected attribute set.
- Existing secure `functionInvestigation` supports transformed exponential/logarithmic specs with a/base/h/k, point tasks, and attribute requests. Use it where graph construction is valuable; secure generic multi-response fields are sufficient for the remaining analysis families.


### 2026-08-30 — A2.5A staged and gated
- Staged five A2.5A Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.5A.json` — commit `b896615efeb833658c5eefa85c411b697dd9af48`.
- Package/build run `33324866842`: **PASS**, including student/runtime build.
- Coverage includes:
  - secure construction of a reflected/vertically scaled/translated exponential graph with asymptote, domain, range, and behavior;
  - secure construction of a vertically scaled/translated logarithmic graph with asymptote, domain, range, and behavior;
  - exponential vertical compression plus horizontal/vertical translation and anchor/asymptote/range analysis;
  - logarithmic vertical stretch/reflection plus translated asymptote/domain/range/anchor behavior;
  - complete error repair for parameter-role confusion on a reflected logarithmic graph.
- Added A2.5A-specific generated certification — commit `0fed9f04149a99f4d2f3493058baaad7e0beb167`.
- The gate samples 200+ generated instances, independently checks transformed exponential/logarithmic function features and point placements against the function specification, exercises secure Function Investigation grading, requires repeated exponential/logarithmic/reflection breadth plus compression and error repair, rejects an incorrect point/attribute in every family, and checks public answer-key stripping.
- Full A2.5A assertion run `33324924406`: **FAILED on a real renderability gate before content grading**.
- Cause: the two secure Function Investigation families authored their increasing/decreasing response as analysis `kind: "text"`. The workspace only renders the allowlisted analysis kinds; unrecognized kinds fail closed so students are never graded on a response box they cannot see.
- Reclassified those behavior prompts as the renderable short-answer `kind: "value"` without changing the expected answer or mathematics — commit `6aef1b8b49489213cec27837f7fb72987c71891f`.
- This preserves the fail-closed security contract rather than weakening it.
- Replacement A2.5A certification is triggered.
- FIRST UNFINISHED STANDARD remains **A2.5A** until the replacement run is green.


### 2026-08-30 — A2.4H audit finding
- Official construct: **solve quadratic inequalities**.
- Verdict: **ENHANCE**.
- Legacy strengths worth preserving:
  - family 1 correctly solves an inclusive between-the-roots inequality in interval notation;
  - family 2 correctly solves a strict outside-the-roots inequality;
  - family 3 authentically graphs the solution interval on a number line.
- Legacy gaps:
  - all solving examples use an upward-opening factored quadratic with one negative and one positive integer root;
  - family 4 only asks whether the middle interval belongs, not for the complete solution set;
  - family 5 reverse-engineers an inequality from a desired interval instead of solving one;
  - no downward-opening case, no standard-form case requiring zeros to be found first, and no no-real-zero/all-or-none sign case.
- Fidelity V2 requirements:
  - every family must finish with the complete solution set;
  - cover strict and inclusive inequalities and both between-root and exterior solution sets;
  - include positive and negative leading coefficients;
  - include at least one standard-form quadratic where the student must find the critical zeros before sign analysis;
  - include a no-real-zero case where sign/leading coefficient determine all-real or empty solution set;
  - preserve an authentic number-line construction family;
  - include genuine error analysis that repairs endpoint inclusion/sign-interval reasoning and still gives the full solution set.
- Generic secure interval grading plus the existing secure interval-number-line tool are sufficient; no new Path capability is required.


### 2026-08-30 — A2.4H staged and gated
- Staged five A2.4H Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4H.json` — commit `c33ff122d3318e0a95ef4587ac103b5cdd003d30`.
- Coverage includes:
  - standard-form solving that requires finding the critical zeros before sign analysis;
  - a negative-leading-coefficient strict between-roots case;
  - secure number-line construction of an inclusive exterior solution;
  - a negative-discriminant/no-real-zero case whose complete solution set is all real numbers;
  - endpoint-inclusion error repair that still produces the complete interval.
- Added A2.4H-specific generated certification — commit `a2d697b1b0ed4a55241a1fa4fa5e9b5d4ad798b8`.
- The gate samples 200+ generated instances, checks production issuability and secure self-grading, validates the secure number-line tool and rejects a wrong endpoint style, independently verifies the no-real-zero discriminant condition, requires positive/negative leading-coefficient breadth plus strict/inclusive cases, rejects a spoiled interval answer in every family, and checks public answer-key stripping.


### 2026-08-30 — A2.4G audit finding
- Official construct: **identify extraneous solutions of square root equations**.
- Verdict: **REBUILD**.
- The legacy bank contains two aligned candidate-check ideas, but most families drift away from the actual identification task:
  - family 1 names which generated candidate is extraneous but does not require substitution evidence;
  - family 2 names the surviving root but again does not make the student evaluate the original equation;
  - family 3 graphs the radical domain instead of identifying an extraneous solution;
  - family 4 explains why checking is important but uses an equation whose generated candidate is actually valid;
  - family 5 states the domain condition abstractly instead of checking candidates created by squaring.
- Fidelity V2 requirements:
  - every family must start from candidate solutions produced after squaring a square-root equation;
  - students must check candidates in the **original unsquared equation**, not only against the squared equation or radical domain;
  - repeatedly collect concrete left-side/right-side substitution evidence for each candidate;
  - include both “one candidate is extraneous” and “no candidate is extraneous” cases so students cannot default to always discarding one root;
  - include a case where the extraneous candidate is inside the radical domain but fails because the isolated right side is negative, proving domain membership alone is insufficient;
  - include contextual transfer and genuine error analysis where a student keeps all roots of the squared equation and must repair that conclusion.
- A2.4G stays distinct from A2.4F: A2.4F owns solving the equation; A2.4G owns deciding which squared-equation candidates survive the original equation.
- Generic secure multi-response grading is sufficient; no new Path tool capability is required.


### 2026-08-30 — A2.4G staged
- Staged five A2.4G Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4G.json` — commit `d693824a3eb1d5f340bbc5dd0774f86ca7a96cf4`.
- Coverage includes:
  - direct substitution of both squared-equation candidates into the original radical equation;
  - a no-extraneous case where both candidates actually survive;
  - a case proving radical-domain membership alone is insufficient because the original right side is negative;
  - contextual candidate verification where both candidate times are contextually allowed but one is algebraically extraneous;
  - complete error repair for the misconception that every root of the squared equation is automatically valid.
- Package/build run `33323815028`: **PASS**, including student/runtime build.
- Added A2.4G-specific generated certification — commit `add83900854ba59784796772560728a660cea066`.
- The A2.4G gate samples 200+ generated instances, requires original-equation LHS/RHS substitution evidence, verifies repeated one-extraneous cases plus a no-extraneous case, proves domain membership alone is insufficient, requires context/error-repair breadth, rejects a spoiled extraneous/valid conclusion in every family, and checks public answer-key stripping.
- Full A2.4G assertion run `33323859773`: **PASS**.
- Generated original-equation checks, no-extraneous breadth, domain-insufficient reasoning, context/error repair, secure wrong-outcome rejection, public-key stripping, and student/runtime build all passed.
- A2.4G is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4H**.


### 2026-08-30 — A2.4F audit finding
- Official construct: **solve quadratic and square root equations**.
- Verdict: **ENHANCE**.
- The legacy bank is directionally aligned, unlike several earlier standards:
  - it includes factoring and quadratic-formula quadratic solves;
  - it includes square-root equations, a context, and a squaring error.
- The remaining fidelity problem is **depth and breadth**, not total misalignment:
  - both quadratic families are generated from easy integer roots, so the formula family does not really require the quadratic formula or exact irrational reasoning;
  - square-root families are almost all one-step $\sqrt{x-h}=r$ equations;
  - the context does not add mathematical complexity;
  - error analysis identifies a missed square but does not require repairing a multi-step solve.
- A2.4F must remain distinct from A2.4G:
  - A2.4F owns carrying the equation-solving process through to the solution set;
  - A2.4G will explicitly own **identifying extraneous candidates** created by radical solving.
- Fidelity V2 requirements:
  - at least two genuinely different quadratic-solving pathways, including factoring and an exact quadratic-formula case with an irrational discriminant;
  - at least two square-root families that require isolating the radical and then solving the resulting linear equation after squaring;
  - include a contextual square-root or quadratic solve where the final value is interpreted;
  - include a complete error-repair family that fixes the algebra and finishes the solution;
  - require exact solutions where appropriate rather than decimal-only approximations;
  - do not make every quadratic have obvious integer roots or every radical equation a one-operation undo.
- Generic secure multi-response grading is sufficient; no new Path tool capability is required for A2.4F.


### 2026-08-30 — A2.4F staged
- Staged five A2.4F Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4F.json` — commit `ad324ff312ee5a4cda44ac374550cbf69d73279a`.
- Coverage includes:
  - a complete factoring solve with the factored zero-product equation plus both roots;
  - a true quadratic-formula family whose discriminant is always a non-perfect square and whose final roots stay exact;
  - a multi-step square-root equation that must be isolated, squared, then solved linearly;
  - a contextual square-root model requiring the same complete solve and final time interpretation;
  - error analysis that repairs the mistake of squaring before isolating the radical and still finishes the solution.
- Package/build run `33323628362`: **PASS**, including student/runtime build.
- Added A2.4F-specific generated certification — commit `5854e277a250a85dce6139848da25150813d3fe7`.
- The A2.4F gate samples 200+ generated instances, checks production issuability and secure self-grading, requires repeated quadratic and square-root solves, verifies a non-perfect-square discriminant for the exact quadratic-formula family, requires repeated isolate→square→solve radical evidence, requires context/error-repair coverage, rejects a spoiled final solution in every family, and checks public answer-key stripping.
- Full A2.4F assertion run `33323687834`: **PASS**.
- Generated breadth, exact-formula discrimination, complete radical solve evidence, secure self-grading, wrong-final rejection, public-key stripping, and student/runtime build all passed.
- A2.4F is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4G**.


### 2026-08-30 — A2.4E audit finding
- Official construct: **formulate quadratic and square root equations using technology from a table of data**.
- Verdict: **REBUILD with a real technology capability gap**.
- Legacy drift:
  - the quadratic-table family writes an exact equation but never requires use of regression/modeling technology;
  - the square-root table family is multiple-choice recognition;
  - the “choose family” item identifies quadratic from differences but does not formulate an equation;
  - the context family gives the fitted quadratic in advance and only asks for a prediction;
  - the reverse square-root family uses only two structural points and chooses a prewritten model.
- The existing secure Data Modeling Lab already has authentic **quadratic regression technology** and server recomputation, so A2.4E quadratic work should use it rather than generic answer boxes.
- Capability audit found the missing half of the TEKS: Data Modeling Lab has linear, quadratic, and exponential fit modes but **no square-root regression/model-fitting mode**.
- A2.4E must not be certified by calling hand recognition of an endpoint “technology.”
- Implementation target:
  1. add a deterministic square-root regression/model fit to client and server Data Modeling math;
  2. add a `squareRootFitPrediction` technology mode to Data Modeling Lab;
  3. server-grade fitted $a,h,k$ and a required prediction from the resulting model;
  4. keep the table public while fitted coefficients remain server-computed;
  5. certify client/server fit parity and wrong-coefficient rejection.
### 2026-08-30 — A2.4E square-root technology implemented
- Added deterministic endpoint-anchored square-root regression for $y=a\sqrt{x-h}+k$ in client math — commit `5939db97251b1d56ec47bd2a77ea2a17fa772560`.
  - the table endpoint supplies $(h,k)$;
  - the scale a is fit by least squares using **all remaining observations**, not one hand-picked point.
- Mirrored the fit server-side and added secure `squareRootFitPrediction` grading — commit `1247833becfe115f45f60839cd77ef67cbdbd618`.
  - server recomputes a,h,k from the public table;
  - server grades all three fitted parameters and the requested prediction;
  - private coefficient tolerances do not enter the public payload.
- Correct Answer Acceptance Audit on the secure server change: **PASS**.
- Added square-root coefficient entry/model rendering to Data Modeling Lab — commit `4846c176460d6417fee3ac0bdc7415214431f13a`.
- Added client/server parity, whole-table-fit, secure parameter grading, fixed prediction, and public nonleakage tests — commit `b73c4c41d1ce313e258c0ac50e33ee61e98f5232`.
- Added all Data Modeling capability files/tests to the dedicated Algebra II certification workflow — commit `fb213109ed5fdcfda39dd70b095434a627454dfe`.
- Capability certification run `33320344200`: **FAILED only at production build** after all generated/server parity tests passed.
- Build failure was a JSX syntax error in the new Data Modeling Lab model-summary branch: the square-root/linear ternary expression was missing its closing `}` before the MAE/RMSE line.
- Fixed the JSX without changing any grading or math behavior — commit `9122824194e9f46eb838996a6c925da355b3fd41`.
- Replacement capability certification is triggered; A2.4E remains locked as FIRST UNFINISHED until the build is green.
- Replacement capability certification run `33323282781`: **PASS**, including the full student/runtime build.
- Square-root regression technology is now locked as a real supported capability for A2.4E.
- Staged five A2.4E Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4E.json` — commit `ec00fd6befe3bfa8db693810fba89c8adca20265`.
- Staged coverage includes two quadratic-regression families, two square-root-regression families, and one regression-entry error-repair family. Every family uses Data Modeling Lab technology, every table has five observations, and every family requires both the complete fitted coefficients and a prediction from that fitted model.
- Package/build run `33323381039`: **FAILED at the global staged-package identity gate** before content certification because three newly authored document ids used `_v2-` instead of the required `_v2_` marker.
- Normalized those three A2.4E document ids without changing any math, prompts, grading, or family logic — commit `4b114c29d757cc07169f009c894d706a856b556c`.
- A2.4E generated certification was added in commit `e69de80988066473f67957e3e1f19764857d73e5`; the replacement run will test the full package after the id repair.
- The first generated A2.4E certification run also caught unbound prompt placeholders: three prompts referenced `{{predictionX}}` even though the generator binds the actual fixed targets as literal 3, `{{x25}}`, or `{{x625}}`.
- Rebound those student-visible prompt targets to the actual generated keys/literals — commit `087b0cd4df641608565daeddaecfa5a065eaa886`.
- This was a template-binding defect only; the secure fixed prediction targets and server grading were already correct.
- Full A2.4E generated certification run `33323489643`: **PASS**.
- Production issuability, authentic quadratic/square-root technology use, client/server regression parity, overdetermined-table coverage, secure fitted-coefficient grading, fixed-target enforcement, interpolation/extrapolation breadth, public-key stripping, and student/runtime build all passed.
- A2.4E is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4F**.

- Fidelity V2 content requirements after capability work:
  - at least two quadratic-technology families and at least two square-root-technology families;
  - students must enter the **complete fitted equation/model coefficients**, not choose from equations;
  - tables should include more observations than the minimum needed to determine a model, reinforcing use of technology;
  - include contextual transfer and an error-analysis family comparing an incorrect technology entry/model family with the actual fit.


### 2026-08-30 — A2.4D audit finding
- Official construct: **transform a quadratic function from standard form to vertex form to identify its attributes**.
- Verdict: **REBUILD**.
- The legacy bank separates pieces of the skill instead of requiring the complete transformation:
  - family 1 asks only for the vertex from standard form;
  - family 2 is the one family that actually rewrites standard form into vertex form;
  - family 3 asks only for a minimum and even supplies hidden vertex-form attributes in a table;
  - family 4 starts in vertex form and graphs it, so it skips the required standard→vertex transformation;
  - family 5 identifies a sign convention error without completing the square or finishing the transformed function.
- Fidelity V2 requirements:
  - **every family starts from standard form** and requires the student to produce the complete vertex form;
  - every family must then use that vertex form to identify meaningful attributes rather than treating conversion as an isolated rewrite;
  - repeatedly require vertex and axis of symmetry, and cover minimum/maximum, opening direction, and range;
  - include both positive and negative leading coefficients so minimum and maximum behavior are both real;
  - include repeated cases with $|a|>1$, where students must factor a from the quadratic/linear terms before completing the square;
  - at least two families must collect completing-square evidence before the final vertex form;
  - one genuine error-analysis family must repair a completing-square/factoring mistake, finish vertex form, and identify the corrected attributes.
- The standard is algebraic transformation first; no new graph tool is required. Secure generic equation/number/choice fields are sufficient, and the existing form-preserving equation grader should remain strict enough that simply re-entering the original standard form does not satisfy a vertex-form response.


### 2026-08-30 — A2.4D staged and gated
- Staged five A2.4D Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4D.json` — commit `37fd995d35410853fe03e41a4f79d5a545a7485b`.
- Corrected one coefficient-table family so its minimum/maximum choice key is deterministic instead of relying on a generated conditional string — commit `e0b91b44b91fd43735e91883ebf0f81ba24fb30d`.
- Package/build run `33319993800`: **PASS**, including student/runtime build.
- Coverage includes:
  - positive-leading-coefficient completing-square work with explicit factoring and square-add evidence;
  - negative-leading-coefficient transformation tied to downward opening, maximum, and range;
  - coefficient-table translation from standard form to vertex form and axis/vertex attributes;
  - contextual projectile transformation to maximum time/height;
  - genuine factoring/completing-square error repair that still finishes vertex form and attributes.
- Added A2.4D-specific generated certification — commit `9fe89706c5460b74656a96d35d3268b709dc3881`.
- The A2.4D gate samples 200+ generated instances, independently checks standard-form and vertex-form equivalence at multiple probe values, requires repeated completing-square evidence and repeated |a|>1 factoring, covers positive/negative a, confirms public-key stripping and secure self-grading, and deliberately submits the original standard form into the vertex-form field to require rejection.
- Full A2.4D assertion run `33320051645`: **RUNNING** at this checkpoint.
- Full A2.4D assertion run `33320051645` reached the A2.4D gate and failed only because one prompt said “Transform … to vertex form” without literally saying the supplied expression was **standard form**. The expression itself was standard form, but the gate intentionally requires the starting representation to be explicit to students.
- Strengthened all affected A2.4D prompts to explicitly say they are starting from standard form — commit `d1ccfb9ea261cff0130433c983cb48d1f9fa4760`.
- No mathematical requirement was weakened; the student-facing wording now makes the standard→vertex transition clearer.
- Replacement certification is triggered from the strengthened package.
- Replacement certification run `33320130829`: **PASS**.
- Generated standard→vertex equivalence, completing-square breadth, positive/negative leading-coefficient coverage, strict form rejection, secure self-grading, public-key stripping, and student/runtime build all passed.
- A2.4D is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4E**.


### 2026-08-30 — A2.4C audit finding
- Official construct: **determine the effect on the graph of the square root parent function when it is vertically or horizontally scaled, reflected, or translated**.
- Verdict: **REBUILD**.
- The legacy bank covers only part of the transformation model:
  - family 1 authentically plots a translated/vertically scaled square-root graph, but the current Function Investigation specification has no horizontal-scale parameter;
  - family 2 recognizes translations only;
  - family 3 asks for domain rather than determining transformation effects;
  - family 4 corrects only an outside-negative reflection and never addresses the inside/horizontal reflection;
  - family 5 chooses a prewritten equation from endpoint/vertical scale.
- The missing construct is substantial: **horizontal scaling by the reciprocal inside factor** and horizontal reflection are effectively absent.
- Fidelity V2 will use the full transformation model $y=a\sqrt{b(x-h)}+k$ as reasoning notation:
  - vertical scale factor $|a|$;
  - horizontal scale factor $1/|b|$;
  - reflection across the x-axis when $a<0$;
  - horizontal reflection when $b<0$;
  - horizontal translation h and vertical translation k;
  - endpoint remains $(h,k)$, with the square-root ray extending right for $b>0$ and left for $b<0$.
- Required breadth:
  - explicit vertical and horizontal scaling, including a compression/stretch distinction;
  - both x-axis and horizontal/y-axis reflection effects;
  - translations with correct inside-sign reasoning;
  - graph/point-mapping evidence, symbolic transformation analysis, reverse reasoning, and genuine error analysis;
  - at least one combined transformation where the student determines several effects together rather than answering isolated vocabulary.
- The current interactive Function Investigation tool intentionally models $a\sqrt{x-h}+k$ and does not support b. A2.4C does **not** need a risky tool expansion to be faithful: secure generic multi-response fields plus generated point-mapping/graph stimuli can assess the missing horizontal effects directly. The existing tool may still be used only where its supported a/h/k model is mathematically sufficient.


### 2026-08-30 — A2.4C staged and gated
- Staged five A2.4C Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4C.json` — commit `ce11794df8fec234200612490fb763f6ead7605d`.
- Package/build run `33319744204`: **PASS**, including student/runtime build.
- Coverage now includes:
  - combined symbolic analysis of $a\sqrt{b(x-h)}+k$ with vertical scale, reciprocal horizontal scale, reflections, endpoint, and ray direction;
  - exact parent-point mapping through a negative inside factor, showing horizontal compression/reflection and vertical compression;
  - parent-vs-transformed graph evidence for a true horizontal stretch from $b=0.25$;
  - reverse reasoning from vertical/horizontal scales, both reflections, and endpoint translation to an equation;
  - error analysis correcting both the reciprocal horizontal-scale misconception and the inside-vs-outside reflection misconception.
- No unsupported interactive-tool behavior is claimed; horizontal effects are assessed through secure generic response fields and generated graph/table evidence.
- Added A2.4C-specific generated certification — commit `abbb471f3184eb96814185f087da81b64e909fdf`.
- The A2.4C gate samples 200+ generated instances, runs production issuability and secure self-grading, verifies public-key stripping, independently checks the horizontal-reflection point mapping and horizontal-stretch graph distances, requires vertical stretch/compression and horizontal stretch/compression, and requires reverse reasoning plus genuine error analysis.
- Full A2.4C assertion run `33319791387`: **QUEUED/RUNNING** at this checkpoint.
- Full A2.4C assertion run `33319791387` passed generation, production issuability, secure self-grading, public-key stripping, point-map arithmetic, graph-distance checks, horizontal-reflection/stretch/compression breadth, reverse reasoning, and error analysis. It failed only because the authored point-mapping family demonstrated a vertical factor of 1/2 without literally naming it “vertical compression,” while the certification intentionally requires that vocabulary to be explicit in more than one family.
- Strengthened the point-mapping prompt/labels/solution review to explicitly name both **vertical compression** and **horizontal compression** — commit `039b86e86d29a2c332ec66d9a36adc51695b535a`.
- No mathematical requirement was weakened; the content now makes the intended transformation language more visible to students.
- Replacement certification is triggered from the strengthened package.
- Replacement certification run `33319841981`: **PASS**.
- Generated transformation breadth, secure self-grading, point-map arithmetic, horizontal-stretch graph distances, explicit compression vocabulary, reverse reasoning, error analysis, public-key stripping, and student/runtime build all passed.
- A2.4C is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4D**.


### 2026-08-30 — A2.4B audit finding
- Official construct: **write the equation of a parabola using given attributes, including vertex, focus, directrix, axis of symmetry, and direction of opening**.
- Verdict: **REBUILD**.
- The legacy bank contains correct attribute facts but almost never reaches the TEKS verb:
  - family 1 gives vertex/focus but asks students to choose a prewritten equation;
  - family 2 asks only for focal distance p;
  - family 3 asks only for opening direction;
  - family 4 corrects a directrix but never writes the parabola;
  - family 5 chooses a consistent attribute set instead of writing an equation.
- The legacy bank is also almost entirely **vertical-parabola** work, so horizontal parabolas opening left/right are effectively absent.
- Fidelity V2 requirements:
  - every family must require the student to **write the complete parabola equation** in standard focus/directrix conic form;
  - repeatedly use vertex, focus, directrix, axis, and opening direction as the given evidence rather than as multiple-choice facts;
  - cover both vertical form $(x-h)^2=4p(y-k)$ and horizontal form $(y-k)^2=4p(x-h)$;
  - explicitly cover upward, downward, right-opening, and left-opening parabolas;
  - include at least one family where the vertex must be inferred as the midpoint between focus and directrix;
  - include a table/attribute representation and a genuine error-analysis family;
  - error analysis must diagnose the orientation/sign mistake and still write the corrected complete equation.
- The response remains a secure generic equation field, but A2.4B exposed a grading-fairness issue: a student can write the same parabola relation with the sides reversed or solved for y/x. Those are mathematically the same equation even though they are not the same printed conic arrangement.
- Added **opt-in** polynomial-relation equation equivalence rather than weakening equation grading platform-wide. Only fields explicitly marked `equivalence: "polynomialRelation"` use it; ordinary form-specific algebra questions remain form-sensitive.


### 2026-08-30 — A2.4B staged / relation-grading dependency
- Staged five A2.4B Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4B.json` — commit `107a71f70b69c733977d88d98ea7a34d51d4e500`.
- Package/build run `33319412078`: **PASS**.
- A concurrent audit correctly caught that generic form-preserving grading would reject mathematically identical parabola relations such as reversed sides or a correctly solved-for-variable form.
- Added opt-in `samePolynomialEquationRelation` support — commit `938d3ef4e32e20298c702e2209e8d3644f7de203`.
- Routed explicit response fields through `equivalence: "polynomialRelation"` in the secure generic grader — commit `a134a3655f5c7f41dcb19660764c4f6757079949`.
- Correct Answer Acceptance Audit passed on both relation-grading commits.
- Added dedicated relation-equivalence regression tests — commit `0fd178ed4db65886e5a2fa03a81bf603b59ee789`.
- Added those grading files/tests to the Algebra II certification workflow — commit `26c3ff88196744081d45c88ce191b5c784ad2092`.
- Marked every A2.4B parabola-equation response with the opt-in relation equivalence — commit `dfd6861e5f197ba1afd95d0c9f2465a5fbff6fd3`.
- This preserves the instructional request for standard conic form while avoiding a false-negative grade when a student's equation is algebraically the identical parabola relation.
- FIRST UNFINISHED STANDARD remains **A2.4B**. Next gate must certify the generated geometry, orientation breadth, secure answer acceptance, and public-key stripping before advancing.
- A2.4B generated certification was added in commit `d111f3e2b5d4a8af6c5cd867ce1c887c48065c90`.
- Run `33319519650` reached the A2.4B test and failed only on a certification-status regex that expected the literal word “attribute”; the package status actually spells out `vertex-focus-directrix-axis-and-opening`.
- Corrected the test to require that exact status string — commit `f5ee298a75aea9012e6c39bd78921602ab66262c`.
- No mathematical/content requirement was weakened; the test now names the actual staged certification contract.
- Replacement certification has been triggered.
- Replacement certification run `33319560739`: **PASS**.
- Generated geometry/orientation breadth, relation-aware secure grading, public-key stripping, exact/reversed-answer acceptance, wrong-relation rejection, and student/runtime build all passed.
- A2.4B is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4C**.


### 2026-08-30 — A2.4A audit finding
- Official construct: **write a quadratic function given three specified points in the plane**.
- Verdict: **REBUILD**.
- Only the first legacy family consistently reaches the TEKS verb, and even that family gives away the leading coefficient before the student writes the function.
- Legacy drift:
  - family 1 supplies three points but also supplies $a$, reducing the three-point determination problem to finding fewer unknowns;
  - family 2 uses only one point and asks only for $c$;
  - family 3 adds a stated vertex and asks students to choose a prewritten equation;
  - family 4 diagnoses an omitted term from only part of the coefficient setup and never writes the quadratic;
  - family 5 again chooses a prewritten quadratic instead of authoring one.
- Fidelity V2 requirements:
  - every family must provide **exactly three specified points** as the data that determines the quadratic;
  - every family must require the student to **write the complete quadratic function**, not choose it or identify one coefficient;
  - the leading coefficient must not be supplied as a shortcut;
  - include table, ordered-pair, graph, contextual, and error-analysis representations;
  - include at least one family whose three x-values do **not** include zero, so the student cannot always read $c$ directly;
  - include at least one family that collects the three substitution equations for $a,b,c$ before the final quadratic;
  - error analysis must repair the coefficient setup and finish the complete function.
- Generic secure equation fields are sufficient; no new Path tool contract is required. The existing expanded/form-preserving equation equivalence keeps harmless coefficient/term formatting from marking correct standard-form answers wrong.


### 2026-08-30 — A2.4A staged and gated
- Staged five A2.4A Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.4A.json` — commit `7daff81cf857e6b6e015de5391c20debb69466e7`.
- Package/build run `33319203889`: **PASS**.
- Before certification, caught two student-facing representation issues:
  - the ordered-pair family used the wrong stimulus key (`pairs`) even though the renderer reads `orderedPairs`;
  - the graph family's generated symmetric points could fall outside the authored y-viewport.
- Corrected the ordered-pair stimulus to the renderer's real shape, added a visible three-point table to the error-analysis family, and expanded the graph viewport to contain every generated source point — commit `eb9bff6cbb73b4f8da5339309e4c0b2978ff3556`.
- Post-fix package/build run `33319234997`: **PASS**.
- Coverage now includes:
  - a three-row table with no leading coefficient supplied;
  - a nonzero-x ordered-pair family that requires all three coefficient equations before the function;
  - a graph with exactly three visible labeled points;
  - a contextual three-measurement quadratic model;
  - error analysis that repairs the three-equation coefficient setup and still writes the complete quadratic.
- Added A2.4A-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `55008332f7b5837fc72f24ec957c271a8fc687e2`.
- The A2.4A gate samples 200+ generated instances, requires exactly three visible source points per family, forbids leaking the generated leading coefficient into the givens, verifies the generated final quadratic numerically passes all three points, self-grades the exact generated response through the secure field grader, checks public answer-key stripping, requires repeated no-x=0 families, repeated coefficient-system setup, and complete error repair.
- The initial assertion run `33319277754` was superseded by an overlapping certification commit before its tests started.
- Replacement Algebra II Fidelity V2 Certification run `33319282779`: **PASS**.
- Generated source-point visibility, production issue gate, secure self-grading, three-point equation fit, representation breadth, coefficient-setup breadth, public-key stripping, and student/runtime build all passed.
- A2.4A is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4B**.


### 2026-08-30 — A2.3G audit finding
- Official construct: **determine possible solutions in the solution set of systems of two or more linear inequalities in two variables**.
- Verdict: **ENHANCE**.
- The legacy bank is closer to the TEKS than A2.3E/F because it already reasons about feasible points, but the evidence is too narrow:
  - most families use the same first-quadrant cap model $x\ge0$, $y\ge0$, $x+y\le c$;
  - several ask recognition-only “why is this feasible?” questions;
  - only one family deliberately rejects an infeasible point;
  - strict/inclusive boundary behavior is not tested across a full two- or three-inequality system;
  - students rarely have to produce an actual possible solution of a nontrivial system.
- A2.3G must remain distinct from A2.3F:
  - A2.3F constructs the complete solution region;
  - A2.3G uses a solved/visible system to decide whether a proposed ordered pair is possible and to produce a feasible ordered pair.
- The existing secure `systemsWorkspace` inequality **analyze** mode is the correct interaction:
  - `ask: ["testPoint", "candidate"]` requires a yes/no determination for a marked point and an independently entered feasible ordered pair;
  - the server recomputes whether both points satisfy every inequality;
  - the browser may display the solution region because interpreting that set is the skill being assessed here.
- Fidelity V2 requirements:
  - all five families must use systems of **at least two** inequalities;
  - repeatedly include three-inequality systems;
  - include both feasible and infeasible marked points;
  - include strict-boundary cases where a point on the dashed boundary is correctly rejected;
  - include inclusive-boundary cases where a point on the solid boundary is correctly accepted;
  - include contextual transfer and genuine error analysis;
  - require the student to provide an actual feasible candidate in every family.
- No new Path tool capability is required; reuse the secure inequality analyze contract rather than creating a parallel candidate checker.


### 2026-08-30 — A2.3G staged and gated
- Staged five A2.3G Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3G.json` — commit `5cdcef5489807136e6fb094416412cd82150cc99`.
- Aligned prompts with the actual secure evidence so they require a feasible candidate but do not claim the server enforces “different from the marked point” — commit `26d28edc29f3e46b57a9a4e72329c501a7aa2f33`.
- Package/build certification run `33319030625`: **PASS**, including student/runtime build.
- Coverage includes:
  - an inclusive two-inequality feasible marked point;
  - a point lying exactly on a strict/dashed boundary that must be rejected;
  - a feasible marked point checked against three simultaneous inequalities;
  - a contextual three-constraint marked point that violates one requirement;
  - error analysis where a point on an inclusive boundary is correctly retained.
- Every family uses secure `systemsWorkspace` analyze mode with `ask: ["testPoint", "candidate"]`; A2.3G therefore determines a proposed point's feasibility and requires an actual feasible ordered pair without drifting back into A2.3F graph construction.
- Added A2.3G-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `c7792a0b06096f9163133f5a0292e0734977bb5f`.
- The A2.3G gate samples 200+ generated instances, checks production issuability and secure Path eligibility, independently computes marked-point feasibility from the displayed inequalities, finds a feasible candidate inside the graph bounds, self-grades both pieces through the server contract, flips the marked-point verdict and requires rejection, injects a clearly infeasible candidate and requires rejection, and certifies strict-boundary rejection plus inclusive-boundary acceptance.
- Full A2.3G assertion run `33319070766`: **PASS**.
- Generated content, production issue gate, secure possible-solution grading, strict/inclusive boundary cases, feasible/infeasible marked points, spoiled-verdict rejection, spoiled-candidate rejection, and student/runtime build all passed.
- A2.3G is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.4A**.


### 2026-08-30 — A2.3F audit finding
- Official construct: **solve systems of two or more linear inequalities in two variables**.
- Verdict: **REBUILD**.
- The five legacy families are mostly recognition/interpretation:
  - family 1 tests a single proposed point instead of solving the system;
  - family 2 describes a vertical slice of an overlap rather than constructing the full solution set;
  - family 3 checks boundary inclusion for one inequality only;
  - family 4 names a shading error but does not require the corrected graph;
  - family 5 chooses a prewritten system and therefore drifts back toward A2.3E formulation.
- A2.3F must own **graph construction and solution-region evidence**. A2.3E now owns formulation; A2.3G will own deciding whether particular ordered pairs are possible solutions.
- The existing secure `systemsWorkspace` inequality-construction contract is a good fit and already grades, server-side, two boundary points per inequality, solid/dashed boundary style, and the correct shading direction. It supports any number of nonvertical slope-intercept inequalities and displays only the student's constructed overlap.
- Fidelity V2 requirements:
  - every family must require construction of the system's boundary lines and solution overlap;
  - cover inclusive, strict, and mixed boundary systems;
  - include at least one **three-inequality** system so “two or more” is real rather than nominal;
  - include a system whose correctly constructed half-planes have **no common solution region**;
  - include contextual transfer and a genuine union-vs-intersection error-repair family;
  - do not substitute candidate-point testing for solving the region.
- No new Path tool capability is required for A2.3F; use `systemsWorkspace` with `mode: "inequalities"`, `interaction: "construct"`, and `ask: ["construction"]`.


### 2026-08-30 — A2.3F staged and gated
- Staged five A2.3F Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3F.json` — commit `4f993bfc02b143ee44fa53f9eeaf436dec68067b`.
- Package-only Algebra II certification run `33318706257`: **PASS**, including student/runtime build.
- All five families use the already-secure `systemsWorkspace` inequality construction contract, so the student must place two points on every boundary, choose solid/dashed, choose the correct half-plane, and produce the actual overlap.
- Coverage includes:
  - two inclusive boundaries;
  - mixed strict/inclusive boundaries;
  - a three-constraint solution region;
  - a contextual three-constraint feasible region;
  - error analysis that repairs an incorrect union by constructing the actual intersection.
- Upgraded the inequality workspace so third/fourth/fifth boundaries receive distinct visual colors instead of every boundary after the first sharing one color — commit `6f87bd36aaa0d570e4bbe407e22af64cd74d5bf7`.
- Added A2.3F-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `cc1c0468b5e659d7fbb4ff1d4aac26fe7c27fa15`.
- The A2.3F gate samples 200+ generated instances, runs the production issue gate, requires secure Path eligibility, checks public-payload nonleakage, self-grades a mathematically correct graph construction through the server contract, deliberately spoils one half-plane per family and requires rejection, requires repeated three-constraint systems, and certifies strict/inclusive/mixed/context/error-analysis breadth.
- Full A2.3F assertion run `33318812867`: **QUEUED/RUNNING** at this checkpoint.
- The first full assertion run was superseded by overlapping commits; run `33318819114` then exposed one substantive coverage mismatch: the staged package had only two three-inequality families while the certification correctly required repeated three-inequality solving.
- Strengthened the contextual no-solution family into a **three-inequality** infeasible system while preserving the no-common-region requirement — commit `97cd9c56a064df056b91c96e38ecc13a23924288`.
- Consolidated two overlapping A2.3F test blocks into one authoritative gate, retained the stricter repeated-three-constraint requirement, and added an explicit generated no-solution polygon check — commit `2594e6b7e67cf83533ab147351d1ba4be5ffc85d`.
- No content requirement was weakened: A2.3F now simultaneously requires repeated three-inequality systems, strict/inclusive/mixed boundaries, context, error repair, secure wrong-shade rejection, and a genuine empty solution set.
- Replacement certification run `33318879330`: **PASS**.
- Generated content, production issue gate, secure graph-construction grading, no-solution verification, repeated three-constraint coverage, wrong-shade rejection, and student/runtime build all passed.
- A2.3F is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3G**.


### 2026-08-30 — A2.3E audit finding
- Official construct: **formulate systems of at least two linear inequalities in two variables**.
- Verdict: **REBUILD**.
- All five legacy families are recognition-first: students select a prewritten inequality/system instead of formulating the constraints themselves.
- Specific drift:
  - the budget context is authentic but only asks which system matches;
  - the table family formulates only one inequality, not a system of at least two;
  - the nonnegativity/cap family chooses prewritten bounds;
  - the feasible-region family chooses a prewritten pair;
  - the strict-boundary error family fixes one symbol but does not formulate the complete system.
- Fidelity V2 requirements:
  - every family must make students **write at least two inequalities**;
  - contexts must include realistic coupled constraints, not only independent x/y bounds;
  - include strict and inclusive boundaries, nonnegativity, capacity/budget, and graph/verbal half-plane descriptions;
  - one error-analysis family must diagnose the boundary-symbol mistake and then write the entire corrected system;
  - representations should include context, table, graph/half-plane description, and verbal constraints.
- This is formulation, not graph solving; generic secure math-response fields are the right evidence. A2.3F will own construction/solution-region behavior.


### 2026-08-30 — A2.3E grading capability check
- Reused the already-existing algebraic half-plane comparator in `functions/shared/linearInequalityEquivalence.mjs` instead of building a second inequality grader.
- Found that the comparator had never been wired into the shared `sameValue` path used by generic secure response fields. Without that connection, a student could formulate the correct boundary in an equivalent form such as `3y+2x<=120` instead of `2x+3y<=120` and be marked wrong.
- Wired `sameLinearInequality` into `functions/shared/answerEquivalence.mjs` — commit `612d91513db3f1353e8c38d222be952ae198e951`.
- Added regression coverage proving generic secure grading accepts reordered terms, equivalent standard/slope-intercept forms, and reversed sides while still preserving strict versus inclusive boundaries — commit `f84b52a8f8b7feebff4e475ec16419b36b173bef`.
- This closes a grading-fairness dependency before authoring A2.3E; no new inequality parser was introduced.


### 2026-08-30 — A2.3E staged and gated
- Staged five A2.3E Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3E.json` — commit `cfa8f75eb8a22e94f0d90f768e489e19aa047a74`.
- Students now author the inequalities instead of selecting a prewritten system.
- Coverage includes:
  - budget + minimum quantity constraints;
  - two coupled resource inequalities plus nonnegativity;
  - table-based half-plane direction and boundary-inclusion evidence;
  - region-description formulation with vertical, slanted, and strict horizontal boundaries;
  - strict-boundary error analysis that diagnoses the symbol and writes the complete corrected system.
- Package-only Algebra II certification run `33318488825`: **PASS**, including student/runtime build.
- Added A2.3E-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `0ea64bbbf6308251a59ee9efc4fc01cbd73d66ae`.
- The A2.3E gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public-key stripping, at least two student-authored inequality fields in every family, repeated 3+ constraint systems, coupled x/y resource constraints, strict/inclusive boundary evidence, nonnegativity, and complete error-analysis repair.
- Full A2.3E assertion run `33318512713` passed generated/issuability/self-grading and failed only on the certification test's coupled-constraint detector: it looked for literal numeric coefficients and therefore missed the generator-backed budget inequality even though that inequality contains both x and y.
- Replaced the detector with the actual structural requirement — a constraint is coupled when its expected inequality contains both x and y — commit `b74e688eef84213128aa26f0eac033e4d37ea294`.
- No content requirement was weakened.
- Replacement Algebra II certification run `33318552461`: **PASS**.
- Correct Answer Acceptance Audit for the shared linear-inequality equivalence wiring: **PASS**.
- Generated content, production issuability, secure self-grading, public-key stripping, coupled constraints, strict/inclusive boundaries, nonnegativity, full error repair, and student/runtime build all passed.
- A2.3E is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3F**.


### 2026-08-30 — A2.3D audit finding
- Official construct: **determine the reasonableness of solutions** to a two-variable system containing one linear and one quadratic equation.
- Verdict: **REBUILD**.
- The legacy bank teaches the right slogans but mostly asks students to recognize the rule “check both equations” rather than actually determine reasonableness from evidence.
- Legacy weaknesses:
  - family 1 asks which check should be done but does not make the student perform it;
  - family 2 applies a context restriction to a supplied point but does not verify the point in the system;
  - family 3 states “yes, if outputs are equal” even when the generated table can contain unequal outputs, so the response key does not actually depend on the generated evidence;
  - family 4 repeats the one-equation-check slogan without performing the missing quadratic check;
  - family 5 states a domain rule abstractly instead of evaluating a concrete system solution against both algebra and model restrictions.
- Fidelity V2 requirements:
  - every family must use concrete substitution/residual/output evidence to judge a candidate solution;
  - include both reasonable and unreasonable algebraic candidates;
  - include candidates that satisfy both equations but are unreasonable in context/domain;
  - include a rounded/approximate candidate where tolerance and scale matter;
  - error analysis must perform the missing check and issue the corrected keep/reject decision.
- A2.3D must remain distinct from A2.3C: it evaluates proposed solutions rather than re-solving the full system from scratch.
- Generic secure multi-response grading is sufficient; no new Path tool capability is needed.


### 2026-08-30 — A2.3D staged and gated
- Staged five A2.3D Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3D.json` — commit `81859de5e35cddd8cbdd7351a196d250a20c7cf7`.
- Coverage now includes:
  - an exact candidate that is retained only after both equations are checked;
  - an invalid candidate that lies on the line but has a nonzero quadratic residual;
  - an algebraically valid candidate rejected by a real-world time-domain restriction;
  - a rounded numerical candidate judged against an explicit 0.05 residual tolerance;
  - genuine error analysis that performs the quadratic check the student omitted and changes the verdict.
- The package-only workflow was superseded/cancelled by the immediate certification-test commit; no content gate was waived.
- Added A2.3D-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `ae9e58b0571d6c84a005bc1258f949a014a8f329`.
- The A2.3D gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public-key stripping, both keep/reject cases, algebraic-vs-context reasonableness, tolerance-aware numerical evidence, nonzero residuals for invalid candidates, and complete error-analysis correction.
- Full A2.3D assertion run `33318316744`: **QUEUED/RUNNING** at this checkpoint.
- Full A2.3D assertion run `33318316744` reached generated/issuability/self-grading checks and failed on the certification test's invalid-candidate residual selector. The test asked for the first field whose id contained “residual,” which selected the intentionally zero **line residual** instead of the nonzero **quadratic residual**.
- Corrected the gate to inspect the explicit `quad-residual` field — commit `42cbb3b7ce812504275136816dcda422883e5bdd`.
- No content was weakened; the invalid-candidate family still must have a nonzero quadratic residual.
- Replacement certification is triggered from the corrected gate.
- Replacement A2.3D certification run `33318356389`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, exact keep/reject cases, context/domain reasoning, numerical tolerance evidence, error-analysis correction, and student/runtime build all passed.
- A2.3D is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3E**.


### 2026-08-30 — A2.3C audit finding
- Official construct: **solve algebraically** a two-variable system containing one linear equation and one quadratic equation.
- Verdict: **REBUILD**.
- The legacy bank has correct mathematical ingredients, but only the first two families truly solve a system, and even the two-intersection family returns only the x-values rather than the complete ordered-pair solutions.
- Legacy drift:
  - the two-intersection family stops after the two x-coordinates;
  - the tangent family does return one ordered pair but does not collect the algebraic reduction used to get it;
  - the table family only counts intersections;
  - the candidate-error family verifies a supplied point instead of solving;
  - the reverse family designs a quadratic for prescribed intersections rather than solving the given system.
- Fidelity V2 requirements:
  - the student must algebraically reduce the system to one quadratic equation;
  - every real x-solution must be substituted back to produce the complete ordered-pair solution(s);
  - the five families must cover systems with **two**, **one/tangent**, and **zero** real solutions;
  - factoring and quadratic-formula pathways must both appear;
  - error analysis must repair an algebraic solve and finish the complete ordered pairs, not merely identify a conceptual mistake.
- Generic secure multi-response grading is sufficient; no new Path tool capability is needed for A2.3C.


### 2026-08-30 — A2.3C staged and gated
- Staged five A2.3C Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3C.json` — commit `fec874332e4735c7eeecfb79f82c004ce298a337`.
- Coverage now includes:
  - two real intersections solved by factoring with both complete ordered pairs;
  - a tangent/repeated-root system with the single complete ordered pair;
  - a no-real-solution system certified through the reduced quadratic and negative discriminant;
  - an exact quadratic-formula system requiring both exact ordered pairs;
  - algebra error analysis that repairs the reduced quadratic and still finishes both ordered pairs.
- Package-only Algebra II certification run `33318148646`: **PASS**, including student/runtime build.
- Added A2.3C-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `6c45e1bdd15972052cf099b92ed1e533226b64b0`.
- The A2.3C gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public-key stripping, repeated complete ordered-pair solves, two/one/zero-real-solution coverage, factoring, quadratic formula, discriminant reasoning, and complete error-analysis repair.
- Full A2.3C assertion run `33318173657`: **QUEUED/RUNNING** at this checkpoint.
- Full A2.3C assertion run `33318173657`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, complete ordered-pair solving, 0/1/2 real-solution breadth, algebraic-method breadth, error-analysis repair, and student/runtime build all passed.
- A2.3C is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3D**.


### 2026-08-30 — A2.3B audit finding
- Official construct: solve 3×3 linear systems using **Gaussian elimination, technology with matrices, and substitution**.
- Verdict: **ENHANCE**, not blind rebuild. The legacy triangular/substitution, elimination, and contextual 3-variable solve families contain sound mathematics worth preserving, but the method coverage is incomplete.
- Legacy gaps:
  - the triangular family is a legitimate substitution/back-substitution solve;
  - the elimination family solves a real 3×3 system but does not expose enough row-operation evidence to certify Gaussian elimination;
  - the “matrix” family only asks students to choose a candidate triple, so it does not use matrix technology;
  - the contextual family solves a 3×3 system but leaves the method unspecified;
  - the error-analysis family examines only two equations and does not complete a 3×3 solve.
- Capability audit found a real platform gap:
  - `SystemsWorkspace` matrix mode currently supports only **2×2** matrices;
  - its Path server contracts also grade only 2-variable systems;
  - the built-in “graphing” calculator drawer explicitly provides numeric/scientific calculations and does **not** provide matrix/RREF technology.
- Therefore A2.3B must not be certified by pretending a 2×2 matrix tool satisfies a 3×3 TEKS.
- Next implementation target:
  1. extend the matrix workspace/math engine to authentic 3×3 augmented matrices and row reduction/RREF;
  2. add a secure Path contract that recomputes the 3×3 solution/row-reduction evidence server-side;
  3. preserve at least one substitution family and one Gaussian-elimination family with meaningful intermediate evidence;
  4. include a true matrix-technology family using the upgraded 3×3 workspace;
  5. add a complete 3×3 row-operation error-analysis family.
- A2.3B remains the FIRST UNFINISHED STANDARD. This capability work is now logged so a new chat cannot skip the 3×3 matrix gap or restart the earlier inverse/system-formulation standards.


### 2026-08-30 — A2.3B 3×3 matrix capability implemented
- Added a real 3×3 augmented-matrix RREF solver to `src/tools/systemsWorkspace/systemsMath.js` — commit `8c7373eaed31aae549522fe68de9009bd56caf4e`.
- Extended the secure `systemsWorkspace` Path contract with `mode: "matrix3"` — commit `29f8251307b6ec14b050d4935d4656b199ab8c38`.
  - server recomputes RREF and x/y/z from the public matrix;
  - public payload contains the matrix but no stored solution/RREF key;
  - matrix3 responses require classification, all three coordinates for a unique solution, and a recorded RREF-technology action;
  - existing linear and inequality workspace modes remain intact.
- Correct Answer Acceptance Audit on the secure contract commit: **PASS**.
- Algebra II Fidelity V2 Certification on the secure contract commit: **PASS**.
- Upgraded `SystemsWorkspace` with an authentic 3×3 matrix-technology flow — commit `552e3790fba9d377070d4edc0585f3eb84fe2478`.
  - displays a 3×4 augmented matrix;
  - requires the student to invoke **Use matrix technology · Compute RREF**;
  - renders the computed RREF as the technology output;
  - requires interpretation/classification and x, y, z;
  - preserves the existing 2×2 matrix mode.
- Added `tests/platform/systemsMatrix3Technology.test.mjs` — commit `f06d7ea69e1a94f863d639763c84903433d07f02`.
  - checks unique/inconsistent/dependent 3×3 systems;
  - checks secure public-payload nonleakage;
  - requires the technology action;
  - rejects a wrong z-coordinate.
- Added the new workspace/math/test files to the dedicated Algebra II certification workflow — commit `2ce4c346ab6ec6e59adeaa95348af8a3973e755f`.
- Capability certification run `33317879619`: **RUNNING** when this checkpoint was written.
- Next: author the five A2.3B Fidelity V2 families around substitution, Gaussian elimination, matrix technology, and complete row-operation error analysis.


### 2026-08-30 — A2.3B staged and gated
- 3×3 matrix capability certification run `33317879619`: **PASS**, including student/runtime build.
- Staged five A2.3B Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3B.json` — commit `daf08a24faf5d17cf607a74554fe7d4d12374767`.
- Coverage now includes:
  - substitution/back-substitution with the substituted equations collected as graded evidence;
  - symbolic Gaussian elimination with explicit reduced-row equations and complete x/y/z solve;
  - secure 3×3 matrix technology using the new RREF workspace;
  - contextual Gaussian elimination with intermediate reduced equations;
  - complete Gaussian-elimination error analysis that repairs the row operation and still finishes the full 3×3 solve.
- Package-only Algebra II certification run `33317978664`: **PASS**, including student/runtime build.
- Added A2.3B-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `f70f511fe975afaa5540745641c2eff425f60695`.
- The A2.3B gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public answer-key stripping, explicit substitution evidence, at least three Gaussian-elimination families with row evidence, a real matrix-technology family, client/server 3×3 solution parity, mandatory RREF-technology use, and a complete error-analysis solve.
- Full A2.3B assertion run `33318007307`: **QUEUED/RUNNING** at this checkpoint.
- Full A2.3B assertion run `33318007307`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, substitution evidence, Gaussian row evidence, matrix-technology enforcement, client/server 3×3 parity, complete error analysis, and student/runtime build all passed.
- A2.3B is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3C**.


### 2026-08-30 — A2.3A audit finding
- Official construct: **formulate systems of equations**, specifically including systems of three linear equations in three variables and systems containing one linear and one quadratic equation.
- Verdict: **REBUILD**.
- Core fidelity issue: all five legacy families are primarily recognition tasks. Students choose a prewritten system or identify a modeling error; they rarely formulate the equations themselves.
- Legacy details:
  - the store context has a legitimate 3-variable situation but asks which system matches instead of requiring the student to write the three equations;
  - the line/parabola family asks students to select a prewritten pair;
  - the table family provides only one row and asks which prewritten rules fit, so it does not formulate a system from sufficient evidence;
  - the three-equation family simply repeats equations already stated in the prompt;
  - the error-analysis family diagnoses a sign in vertex form but still does not require a complete corrected system.
- Fidelity V2 requirement: every family must make the student **author the system**. Three-variable families must collect three equations; linear-quadratic families must collect both equations.
- At least two families must formulate 3×3 linear systems from authentic contextual/tabular information, and at least two must formulate linear-quadratic systems from independently supplied line/parabola information.
- One genuine error-analysis family must diagnose a flawed model and then write the corrected system, so “error analysis” is not a label on a multiple-choice recognition item.
- Secure generic equation fields are sufficient; no new Path tool contract is needed because the assessed evidence is the equations the student formulates, not a graphical manipulation or elimination procedure.


### 2026-08-30 — A2.3A staged and gated
- Staged five A2.3A Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.3A.json` — commit `d3f0949db4f190837108cacd631a6709893d1bc4`.
- Students now author equations rather than choose a prewritten system.
- Coverage includes:
  - school-store 3×3 contextual formulation;
  - shipment count/weight/volume 3×3 contextual formulation;
  - table-to-3×3 system translation;
  - graph-to-linear/quadratic system formulation using exact line and parabola features;
  - genuine linear/quadratic error analysis that requires both corrected equations after diagnosing the vertex-form error.
- Package-only Algebra II certification run `33316398426`: **PASS**, including student/runtime build.
- Added A2.3A generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `e3f778df433dacb522273902c90914b29c1b9c89`.
- The A2.3A gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public-key stripping, at least two 3-equation families, at least two linear/quadratic formulation families, a corrected-system error-analysis family, and four or more representations.
- Full A2.3A assertion run `33316415151`: **QUEUED/RUNNING** at this checkpoint.
- Full A2.3A assertion run `33316415151`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, 3×3 formulation breadth, linear/quadratic formulation breadth, corrected-system error analysis, and student/runtime build all passed.
- A2.3A is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3B**.


### 2026-08-30 — A2.2D audit finding
- Official construct: use **composition of functions**, including necessary **domain restrictions**, to determine whether two functions are inverses.
- Verdict: **REBUILD**.
- Legacy weaknesses:
  - family 1 simplifies only one composition order, so it does not establish the two-sided inverse condition;
  - family 2 is ordinary composition evaluation and never determines whether the functions are inverses;
  - family 3 correctly exposes `sqrt(x^2)=|x|` and a needed restriction, but checks only one composition direction;
  - family 4 is labeled error analysis but asks what to do next after one function evaluation rather than analyzing an actual composition error;
  - family 5 follows a two-row table to get one composition value and never tests inverse status.
- Fidelity V2 requirement for all five families: the student must use composition evidence to make or justify an inverse determination. At least three families must require **both** `f(g(x))` and `g(f(x))` or an equivalent two-direction table/representation.
- Domain restrictions must be operational, not decorative: include right-branch and left-branch quadratic/square-root cases and at least one case where a proposed pair fails because the restriction is missing or wrong.
- Linear and nonlinear pairs should both appear; one genuine error-analysis family must diagnose the false step `sqrt(u^2)=u` without a sign/domain condition.
- No new Path tool contract is required. The existing `inverseComposition` classroom tool is not server-contracted for Path, and adding a new secure adapter is unnecessary here because multi-response symbolic/table composition can capture the TEKS action directly and securely.


### 2026-08-30 — A2.2D staged and gated
- Staged five A2.2D Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.2D.json` — commit `4689642f8706883b2986408f0bba3df9d82856e6`.
- Coverage now includes:
  - two-way symbolic composition proof for a true linear inverse pair;
  - table-based composition counterexample for a near-miss linear pair;
  - right-branch quadratic / principal-square-root inverse verification with both composition orders and both relevant domains;
  - left-branch quadratic / negative-square-root inverse verification;
  - genuine error analysis where one successful composition is insufficient and the reverse composition supplies a concrete counterexample.
- Package-only Algebra II certification run `33316242011`: **PASS**, including student/runtime build.
- Added A2.2D-specific generated certification in `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `dd5871bdd3c981456a38c9a88a5fff92b1fc8dcb`.
- The A2.2D gate requires 200+ generated instances, production issuability, secure correct-answer self-acceptance, public answer-key stripping, at least three families with both composition orders, repeated domain-restriction evidence, both left/right branch cases, and at least two non-inverse/counterexample families.
- Full A2.2D assertion run `33316271929`: **RUNNING** at this checkpoint.
- Full A2.2D assertion run `33316271929`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, composition-direction breadth, domain-restriction breadth, non-inverse counterexamples, and student/runtime build all passed.
- A2.2D is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.3A**.

---

## Standard-by-standard working rules

For each standard:
1. Read the exact TEKS verb/construct.
2. Compare only that standard's five legacy families.
3. Use the frozen KEEP / ENHANCE / REBUILD verdict unless new evidence proves the verdict wrong.
4. Fix the student action, representation, DOK/difficulty truthfulness, generator integrity, and secure grading.
5. Stage exactly five Fidelity V2 families.
6. Add/extend the generated-instance certification gate.
7. Update this checkpoint.
8. Advance immediately to the next standard.

## Master sequence

1. Complete all 48 Algebra II standards.
2. Finish remaining Grade 8, Grade 7, and Grade 6 TEKS Fidelity V2 banks.
3. Audit/upgrade remaining CCMR banks.
4. Upgrade Path student experience, access, navigation, and visual progression.

## Rolling work log

### 2026-08-30 — continuity repair
- Confirmed the stale `audit/teks-fidelity-v2-algebra2` branch is not the working branch.
- Confirmed the certified Algebra I base and the current Algebra II continuation branch.
- Confirmed A2.2A is staged and the first unfinished standard is A2.2B.
- Added the mandatory per-standard logging rule so a streaming/chat interruption cannot send the audit back to A2.2A.

### 2026-08-30 — A2.2B architecture discovery
- The secure `functionInvestigation` contract can grade the full inverse reflection chain and its sketch validator already reflects the actual sampled curve, so nonlinear inverse graphs are supported.
- The current secure sanitizer does **not** pass a question `stimulus` into `functionInvestigation`, and `InteractiveGraphWorkspace` does not render one. Therefore a true table → graph → reflect → write-inverse family would silently lose its table in Path.
- Required fix before A2.2B certification: add a safe public table-stimulus projection to the secure function-investigation payload and render that stimulus inside the graph workspace.
- Also replace the remaining UI copy that says “inverse line” with “inverse graph”; nonlinear inverse families make “line” mathematically false.
- This is an A2.2B capability dependency, not a reason to reopen A2.2A.


### 2026-08-30 — A2.2B staged and gated
- Staged exactly five A2.2B Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.2B.json` — commit `30299481e52b5eac1774cf96d9a439b6e65baa1e`.
- The five-family set now makes graph → reflect across `y=x` → inverse graph → inverse equation the recurring evidence across linear, table/linear, restricted quadratic, square-root, and rational cases.
- Closed the secure table-stimulus gap in `functions/shared/pathToolContracts.mjs` — commit `39b491f201cceac4d49b4d58b2d15e795ab2000f`.
- Rendered the sanitized table inside `InteractiveGraphWorkspace.jsx` and changed nonlinear-safe inverse guidance from “inverse line” to “inverse graph” / authored graph wording — commit `8bb3f824ab59ff8f83f4f87375ec92a99008fb36`.
- Added leakage/rendering regression coverage in `tests/platform/inverseReflectionExperience.test.mjs` — commit `ccbd0f2828ce3a8cb57c53ca2b63fda5d1f66eff`.
- Extended `tests/platform/algebra2FidelityV2Staged.test.mjs` with 200+ generated A2.2B instances, secure Path eligibility, private correct-answer self-grading, table preservation, nonlinear breadth, and inverse-key nonleakage checks — commit `7dd5b09ecc441706260e183f904a3616d2dedd2c`.
- Added a dedicated per-standard `Algebra II Fidelity V2 Certification` workflow that runs the staged/generated inverse gates and builds the student/runtime bundle — commit `10f7c2273f37f761c9d95ab9e0c8d145e2bf98a9`.
- Correct Answer Acceptance Audit was GREEN on the secure table-contract commit and the graph-workspace commit.
- Current targeted Algebra II certification run: GitHub Actions run `33315642444` — **QUEUED/RUNNING when this checkpoint was written**.
- Vercel remains red only for the known deployment build-rate-limit and is not being counted as a code failure.
- Initial targeted run `33315642444` failed for two concrete test-harness issues, not a waived content failure:
  - the newly inserted secure-table regression test was syntactically corrupted by its authoring insertion;
  - the A2.2B self-grade helper read `privateGrading.points` instead of `privateGrading.definition.points`, so it submitted empty “correct” work.
- Repaired the secure-table regression test — commit `ed752fb9f8c412992911181645c66e266697dbee`.
- Repaired the private grading fixture shape and added detailed part output on any future self-acceptance failure — commit `88745d34479fb7ef4147815713b41e0372c9f6c6`.
- Replacement Algebra II certification run for head `88745d34479fb7ef4147815713b41e0372c9f6c6`: GitHub Actions run `33315723037` — **PASS**.
- Targeted generated-instance/inverse-contract tests: **PASS**.
- Student/runtime bundle build in the same certification run: **PASS**.
- A2.2B is now locked as certified; FIRST UNFINISHED STANDARD advanced to **A2.2C**.


### 2026-08-30 — A2.2C audit finding
- Official construct is relationship analysis, not another inverse-equation-writing standard.
- Legacy A2.2C has useful pieces but drifts toward A2.2B:
  - the restricted-quadratic item mainly asks students to write the inverse;
  - the point-swap item is generic coordinate reversal;
  - the exponential/log item checks one reversed value but does not analyze the exponential/logarithmic relationship;
  - the unrestricted quadratic mapping family encodes the repeated inverse input with `t` instead of the mathematically faithful `t^2`, so its demonstration of the full parabola's inverse relation is structurally misleading.
- ENHANCE plan: make quadratic/square-root and exponential/logarithmic pairs the center of all five families; explicitly analyze swapped domain/range and graph features; include both right-branch and left-branch quadratic restrictions; reserve inverse writing as supporting evidence rather than the main assessed action; include one genuine error-analysis family about why an unrestricted quadratic and principal square root are not inverses on all reals.
- No new interactive-tool capability is required for this standard; secure generic multi-response/stimulus grading is sufficient and avoids unnecessary runtime expansion.


### 2026-08-30 — A2.2C staged and gated
- Staged five A2.2C Fidelity V2 families in `drafts/fidelity-v2/algebra2/A2.2C.json` — commit `d69983a6f8b1615acb3bd50f643a1440a3270d69`.
- Coverage now includes:
  - right-branch quadratic ↔ principal square-root inverse with explicit domain/range exchange;
  - left-branch quadratic ↔ negative square-root inverse, so restriction reasoning is not taught as a memorized one-sided rule;
  - exponential ↔ logarithmic table reversal with domain/range analysis;
  - exponential/log graph-feature comparison through reflection across `y=x`, swapped intercepts, and horizontal/vertical asymptotes;
  - error analysis proving why an unrestricted quadratic is not inverted by the principal square root on all real inputs.
- Package-only targeted workflow run `33315902423`: **PASS** (structural/build gate before the new A2.2C-specific assertions landed).
- Added A2.2C certification to `tests/platform/algebra2FidelityV2Staged.test.mjs` — commit `1a72808866ad245d2e1f7b35e147c4298e5e51e6`.
- The A2.2C gate now samples 200+ generated instances, runs the production template issue gate, self-grades generated correct answers with the legacy secure field grader, checks public-payload key stripping, requires both quadratic/root and exponential/log breadth, and explicitly requires left/right restriction evidence plus error analysis.
- Full A2.2C assertion run `33315936785`: **QUEUED/RUNNING when this checkpoint was written**.
- Full A2.2C assertion run `33315936785` failed on the production issue gate because the new generic families declared `type: "response"`. In Path, `type` is interpreted as a named tool; generic field-graded questions must omit it. The server correctly failed closed with `generated_no_server_grader_for_this_tool`.
- Removed the false tool declaration from all five A2.2C families — commit `5bbb92df1ca961c49c12db204967517b107d312b`.
- Replacement run `33315977704` reached all generation/issuability/self-grading checks, then failed only on the certification test's branch-coverage detector. The test inspected `JSON.stringify(doc)`, which doubles backslashes and hid authored `x\\le` / `x\\ge` from the intended match.
- Replaced that brittle JSON-string inspection with recursive raw-string inspection — commit `948fd32a5c7c2e8d57f0d906d184bdcf68db1aa3`.
- Content was not weakened or waived; the left-branch and right-branch requirements remain mandatory.
- Replacement run `33316022565` passed all generation, production-issuability, secure self-grading, public-key stripping, representation breadth, restriction breadth, and task-type checks. It failed only on the final error-analysis identity assertion because the test searched `solutionReview` for the generic `\\sqrt{u^2}=|u|` hint, while that identity is intentionally stored in `supportHints` and the solution review uses the generated shifted form `|x-h|`.
- Corrected the certification to verify the generic identity in `supportHints` and the generated principal-square-root / absolute-value reasoning in every sampled solution review — commit `852f66d3307f70e14af8102994998648d51cd605`.
- No content requirement was removed; the check now tests the fields where the mathematics actually lives.
- Replacement run `33316062716` again passed the substantive A2.2C generation/issuability/self-grading/breadth checks. Its last assertion still depended on the literal text `|x-h|`; sign normalization legitimately rewrites that display as `|x+3|` when the generated shift is negative.
- Replaced the formatting-dependent assertion with the actual mathematical counterexample: every sampled error-analysis item must generate a concrete input left of the vertex whose computed `r(q(x))` differs from that input — commit `bd9a4cd29170cf143e919375aa8ba266b7bbccde`.
- This is a stronger certification because it checks the contradiction numerically rather than checking how the explanation happened to be typeset.
- Replacement certification is triggered from the corrected test.
- Replacement run `33316062716` passed the generated content, production issue gate, secure self-grading, key stripping, breadth, and identity checks, then failed only because its final test required the rendered shifted absolute value to contain the literal characters `|x-`. Generated sign normalization correctly changes `|x-(-3)|` to `|x+3|`, so that string-shape assertion was mathematically too narrow.
- Replaced the string-shape assertion with a concrete generated counterexample check: each unrestricted-quadratic error family must produce a test input for which the composition value is not the original input — commit `bd9a4cd29170cf143e919375aa8ba266b7bbccde`.
- This strengthens the gate by testing the actual mathematical failure rather than a particular printed sign.
- Current replacement run `33316108442`: **RUNNING** at this checkpoint.
- Replacement run `33316108442`: **PASS**.
- Generated content, production issue gate, secure self-grading, public-key stripping, representation/task breadth, concrete unrestricted-quadratic counterexamples, and student/runtime build all passed.
- A2.2C is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.2D**.
- Full A2.4H assertion run `33324732755`: **PASS**.
- Generated content, number-line secure grading, no-real-zero sign case, strict/inclusive breadth, wrong-answer rejection, public-key stripping, and student/runtime build all passed.
- A2.4H is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.5A**.
- Replacement A2.5A run `33324974453`: **PASS**.
- Secure graph construction, transformed feature/behavior parity, wrong-point/attribute rejection, public-key stripping, and student/runtime build all passed.
- A2.5A is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.5B**.
- Replacement A2.5C run `33325302232`: **PASS**.
- Written rewrite breadth, numeric role-map verification, wrong-rewrite rejection, public-key stripping, and student/runtime build all passed.
- A2.5C is now locked as certified.
- FIRST UNFINISHED STANDARD advanced to **A2.5D**.
- Replacement A2.5D run `33325519965`: **IN_PROGRESS** at this checkpoint.
