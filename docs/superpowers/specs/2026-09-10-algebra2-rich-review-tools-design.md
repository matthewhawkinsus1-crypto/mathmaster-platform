# Algebra II Rich Review Tools Design

## Goal

Make MathMaster support the Algebra II District DOL review experience directly instead of weakening authored questions to fit older tool limits.

## Product rules

1. Classwork can use rich, coached interactive tools; Practice can repeat the same skill independently with different numbers/representations; DOL remains concise and unassisted.
2. Correct authored mathematics must not be rewritten to work around platform limitations. If a renderer, course capability, compiler route, or validator is too narrow, repair the platform.
3. New interactive work must use the existing V5 authoring boundary: AI authors mathematics, representations, and `studentActions`; the platform chooses/normalizes renderer plumbing.
4. Existing assignments and existing tool modes must remain backward compatible.
5. Tool scoring must report partial credit from meaningful subparts/steps when the tool itself contains multiple scored actions.
6. Teacher/student identity, attempts, grades, and evidence records are outside this PR.

## Scope

### 1. Step-by-step inverse solving

Extend the existing `inverseCompositionLab` family rather than introducing a disconnected inverse tool.

Add a `deriveInverse` mode for linear inverse derivation. The student experience must:

- show the original function as `y = ...`;
- require an explicit x/y swap;
- then let the student isolate y through legal balance operations, one move at a time;
- preserve an undoable step history;
- convert the isolated relation to `f⁻¹(x)` only after y is isolated;
- connect original domain/range to inverse range/domain;
- retain the existing reflection/composition verification capability as optional follow-through, not as a substitute for derivation.

Initial supported mathematics is a nonconstant linear function in the existing tool spec form `a(x-h)+k`. The architecture may be extended later to restricted quadratics/rational/exponential/logarithmic families, but this PR must not fake generic support.

### 2. Algebra II graphing parity

`graphing2` is currently catalogued for Algebra I only even though Algebra II review work needs graph construction. Make the shared graph construction tool available to Algebra II without changing Algebra I behavior.

Acceptance target: a V5 Algebra II question containing `studentActions: ["constructGraph"]` and supported function intent can route to graphing without a course-availability rejection.

### 3. Transformation graph construction

`TransformationsLab` already implements `plotTransform`; V5 authoring must be able to request it explicitly from mathematical intent.

Acceptance target: an authored transformation question can request graph construction / transformed defining points and compile to `transformationsLab` mode `plotTransform`, preserving authored source points, transformation parameters, graph bounds, and snap step.

### 4. Function operations workbench

Create a first-class Algebra II function-operations workspace rather than reducing `(f+g)`, `(f-g)`, `(fg)`, `(f/g)`, restrictions, and composition to generic independent response fields.

The workbench must support:

- sum;
- difference;
- product;
- quotient;
- excluded denominator values / restrictions;
- composition as an optional requested operation;
- partial scoring by requested operation;
- clear display of `f(x)` and `g(x)`;
- expression-equivalence grading rather than string-only grading where current shared math helpers permit it.

Add a V5 `studentAction` alias/canonical action for function operations and compiler routing to the new tool.

### 5. Curated review / CCMR fidelity

A teacher-authored or source-grounded review must not be silently changed by unrelated automatic CCMR enrichment. Existing Honors/CCMR enrichment may continue when explicitly requested by assignment policy or authoring intent.

Acceptance target: a curated review with no CCMR enrichment request preserves its authored section/question set through compilation; an explicit CCMR enrichment request continues to work.

### 6. Contract, validator, and regression coverage

Update the tool catalog, schemas, authoring intent/compiler routing, authoring contract documentation/tests, and any fixture expectations required by the changes above.

## Non-goals

- Rebuilding the assignment JSON itself in this PR.
- Adding broad symbolic inverse derivation for every Algebra II family.
- Replacing the existing inverse/composition lab modes.
- Replacing the current graph engine.
- Changing student progress, grading passback, Google Classroom, or repair-center persistence.

## Release gate

Do not mark the PR ready until targeted regression tests, authoring V5 tests, tool tests, build, and the repository's full platform suite are green on the PR head. Any CI failure encountered during implementation must be recorded in the PR log with classification: expected RED, implementation defect, pre-existing/unrelated, or unresolved blocker.
