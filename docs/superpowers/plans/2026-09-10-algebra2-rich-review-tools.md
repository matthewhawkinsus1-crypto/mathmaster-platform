# Algebra II Rich Review Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add first-class Algebra II inverse derivation, graphing, transformation plotting, function operations, and curated-review fidelity so the District DOL review can use rich V5 interactions without assignment workarounds.

**Architecture:** Extend the existing tool families where the capability already exists (`inverseCompositionLab`, `transformationsLab`, `graphing2`) and introduce one focused `functionOperationsLab` for a capability the platform does not currently own. Route all of it through V5 `studentActions` and the existing authoring compiler; keep renderer ids and grading plumbing platform-owned.

**Tech Stack:** React 19, Vite, Node test runner, MathMaster V5 authoring/compiler, existing tool registry/catalog/schema/runtime.

**Spec:** `docs/superpowers/specs/2026-09-10-algebra2-rich-review-tools-design.md`

## Global Constraints

- Existing tool modes and saved assignments remain backward compatible.
- Initial step-by-step inverse derivation supports nonconstant linear functions only; unsupported families must fail validation rather than pretending to derive them.
- V5 authors provide mathematics and `studentActions`; the platform owns `toolId`/renderer plumbing.
- Graphing parity must not regress Algebra I behavior.
- Curated review assignments must not receive unsolicited CCMR question injection.
- Every CI/test error found while implementing this plan is logged in the PR body with a classification and resolution/status.

## Completion handoff

Tasks 1–4 are implemented and covered in `tests/platform/algebra2RichReviewTools.test.mjs` and `tests/platform/assignmentTransformationsFullModel.test.mjs`. Task 5 now gates the real integrated assignment-AI mutation path behind one explicit `ccmrEnrichment` option (default `false`), while the existing Honors destination hydration path remains explicit and destination-aware. Function-operation quotients retain original-denominator exclusions, derive linear/quadratic real zeros, and fail closed for unsupported higher-degree zeros without authored restrictions. Task 6 capability declarations and mobile form layout are audited by the platform suite. See `docs/architecture/tool-authoring-guide.md` and `docs/architecture/aleks-mathmaster-parity-audit.md` for the verified scope; neither document claims arbitrary nonlinear inverse or polynomial-root support.

---

### Task 1: Linear inverse derivation inside Inverse & Composition Lab

**Files:**
- Create: `src/tools/inverseComposition/inverseDerivationMath.js`
- Modify: `src/tools/inverseComposition/InverseCompositionLab.jsx`
- Modify: `src/tools/toolSchemas.js`
- Test: `tests/platform/algebra2RichReviewTools.test.mjs`

**Interfaces:**
- Produces `createLinearInverseDerivation(spec)`, `applyInverseDerivationOperation(state, operation, value)`, `formatInverseDerivationRelation(state)`, and `isLinearInverseSolved(state)`.
- Adds `inverseCompositionLab` mode `deriveInverse`.

- [ ] Write regression assertions that `deriveInverse` is accepted by the tool schema and that linear derivation helpers require a nonzero linear coefficient.
- [ ] Run the targeted test and capture the expected RED failure in the PR log.
- [ ] Implement pure derivation math: represent the swapped relation as `left = rightA*y + rightB`, support same-operation-on-both-sides add/subtract/multiply/divide, reject divide-by-zero and multiply-by-zero, and detect `y = mx+b` isolation.
- [ ] Add the `deriveInverse` UI to `InverseCompositionLab`: explicit Swap x and y gate, operation preview, Apply, Undo, Start over, step history, final `f⁻¹(x)` presentation, domain/range swap reminder, and partial scoring based on swap + valid isolation.
- [ ] Preserve existing `full`, `composition`, `inverse`, and `restriction` behavior unchanged.
- [ ] Run targeted tests and commit.

### Task 2: Algebra II graphing parity

**Files:**
- Modify: `src/tools/toolCatalog.js`
- Modify as needed: `src/tools/toolCapabilities.js`
- Test: `tests/platform/algebra2RichReviewTools.test.mjs`
- Test: existing V5 authoring/compiler tests where routing coverage belongs.

**Interfaces:**
- `graphing2.courses` becomes `['Algebra I', 'Algebra II']`.

- [ ] Add a regression assertion that `graphing2` is available to Algebra II and that existing Algebra I availability remains.
- [ ] Run targeted test and capture RED.
- [ ] Make the minimum catalog/capability change.
- [ ] Verify authoring/preflight tests do not reject supported Algebra II `constructGraph` work because of course metadata.
- [ ] Commit.

### Task 3: V5 transformation graph-construction routing

**Files:**
- Modify: `src/platform/contract/authoringIntentV5.js`
- Modify: `src/tools/toolSchemas.js`
- Test: `tests/platform/algebra2RichReviewTools.test.mjs`
- Test: `tests/platform/assignmentTransformationsFullModel.test.mjs` if the existing fixture is the better integration location.

**Interfaces:**
- V5 transformation intent with `studentActions` containing `constructGraph` and authored `sourcePoints` compiles to `transformationsLab` mode `plotTransform` unless an explicit compatible mode is supplied.
- Compiler preserves `sourcePoints`, `sourceLabel`, `graphBounds`, and `snapStep`.

- [ ] Add RED regression coverage for a V5 Algebra II transformation question that asks the student to transform/plot defining points.
- [ ] Expand schema mode validation to include existing runtime mode `plotTransform` if it is not already accepted.
- [ ] Update compiler mode selection and field preservation without changing other transformation modes.
- [ ] Verify compiled tool definition preserves the source geometry exactly.
- [ ] Commit.

### Task 4: Function Operations Workbench

**Files:**
- Create: `src/tools/functionOperations/functionOperationsMath.js`
- Create: `src/tools/functionOperations/FunctionOperationsLab.jsx`
- Modify: `src/tools/toolCatalog.js`
- Modify: `src/tools/toolRegistry.js`
- Modify: `src/tools/toolSchemas.js`
- Modify: `src/platform/contract/authoringIntentV5.js`
- Modify as needed: `src/tools/toolCapabilities.js`, mobile tool profiles/tool-lab fixtures.
- Test: `tests/platform/algebra2RichReviewTools.test.mjs`

**Interfaces:**
- Add canonical action `operateOnFunctions` with aliases `functionOperations` / `operationsOnFunctions`.
- Add tool id `functionOperationsLab` for Algebra II.
- Compiled question fields: `f`, `g`, `operations`, optional `composeOrder`, optional authored restrictions; tool derives/checks expected results from supplied function mathematics.

- [ ] Add RED tests that the action normalizes, routes to `functionOperationsLab`, and the tool id/schema/catalog all recognize the tool.
- [ ] Implement pure math helpers for supported polynomial/linear expression forms used by the review: sum, difference, product, quotient simplification when an exact common linear factor cancels, denominator exclusions, and composition for supported function specs.
- [ ] Implement workbench UI with one scored panel/field per requested operation and partial credit across parts.
- [ ] Register the tool and add schema validation for required `f`, `g`, and supported operation names.
- [ ] Update V5 compiler routing and field preservation.
- [ ] Run targeted + authoring tests and commit.

### Task 5: Curated review / CCMR enrichment fidelity

**Files:**
- Locate and modify the current Honors/CCMR assignment-enrichment boundary rather than adding a parallel bypass.
- Test: `tests/platform/algebra2RichReviewTools.test.mjs` or the existing Honors/CCMR authoring test file that owns the behavior.

**Interfaces:**
- Source-grounded/curated review with no explicit CCMR enrichment request preserves authored question count/order.
- Explicit CCMR enrichment policy retains current enrichment behavior.

- [ ] Trace the current enrichment call path and record the exact file/function in the PR log before changing it.
- [ ] Add a RED regression fixture for a curated Algebra II review with no CCMR request and a positive control with an explicit request.
- [ ] Gate enrichment on explicit policy/intent, not merely Honors course destination.
- [ ] Run targeted Honors/CCMR authoring tests and commit.

### Task 6: Contract documentation and certification

**Files:**
- Modify as required: current V5 authoring contract/handoff docs that enumerate actions/tools/modes.
- Modify: `package.json` only if the new regression file must be included in an explicit test script.
- Test: all targeted tests, `npm run test:authoring-v5`, `npm run test:platform`, `npm run build`, `npm run lint`.

**Interfaces:**
- Documentation and generated/static contract assertions agree with runtime catalog/schema/compiler behavior.

- [ ] Update tool/action/mode documentation for `deriveInverse`, Algebra II graphing parity, `plotTransform`, and `functionOperationsLab`.
- [ ] Run targeted tests.
- [ ] Run `npm run test:authoring-v5`.
- [ ] Run `npm run test:platform`.
- [ ] Run `npm run build` and `npm run lint`.
- [ ] For every failure, classify and log it in the PR before fixing/re-running.
- [ ] Compare PR head against `main`, review the complete diff, and update the PR checklist/status so another agent can resume from the exact point of failure if needed.
