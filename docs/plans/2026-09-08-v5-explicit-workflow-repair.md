# V5 Explicit Workflow / Repair Center Repair Plan

## Goal

Repair the Algebra I District DOL publish path without weakening V5 validation or rewriting valid relationship-model questions.

The repair has three contracts:

1. A V5 question that already contains a valid explicit `workflow` plus `grading` must survive authoring compilation with that workflow/grading intact. The compiler may still validate the workflow; it must not collapse a multi-stage authored workflow into a simpler inferred tool shape.
2. `functionModeling` questions whose explicit `recipe.ask` is only `continuity/domain` or `continuity/domain/range` must expand to exactly those requested interactions and must not acquire the recipe default `graph` stage.
3. A batch Repair Center response with no `replacements` and one or more `platformIssues`/`unclearIssues` is a report-only response, not a failed replacement. The UI must state that no question replacements were supplied and surface the reported platform issues instead of claiming a new assignment blocker was introduced.

## Safety boundaries

- Keep strict V5 validation for missing/empty/unknown workflows and bad grading keys.
- Do not honor an arbitrary internal `type` merely because it is present. Explicit workflow preservation is allowed only when an actual non-empty workflow is authored and passes the existing workflow/semantic validation path.
- Do not change the discrete relationship-model questions to a different tool type.
- Do not add a graph stage when `recipe.ask` omits `graph`.
- Report-only AI responses never mutate the assignment and remain non-committable.

## TDD sequence

### 1. Regression tests first

Add `tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs` covering:

- the exact two-stage graph-choice pattern (vertex choice + axis-of-symmetry choice) survives `compileAuthoringIntentV5` with both stages and both grading keys;
- continuity/domain and continuity/domain/range `functionModeling` asks expand without a graph stage;
- report-only batch repair staging preserves platform issues, has zero question results, is non-committable, and is classified for the Repair Center as a report rather than a blocker-producing replacement.

Run the targeted test through CI and record the expected RED for the currently broken explicit-workflow / report-message behavior.

### 2. Preserve explicit authored workflows

Primary file: `src/platform/contract/authoringIntentV5.js`.

Add a narrow compiler path for a non-empty explicit workflow. Preserve `workflow` and `grading` after common V5 normalization instead of sending the question through a generated single-tool case. Let the existing semantic/workflow validation reject invalid stage kinds, empty workflows, and invalid grading.

### 3. Keep recipe ask exact

Primary files: `src/platform/workflow/questionRecipes.js` and/or compiler only if the regression shows a real loss of `recipe.ask`.

Do not change production code if current merged behavior already satisfies the exact Q6/Q7 contracts; keep the regression tests as protection against the default graph stage returning later.

### 4. Classify report-only repair responses

Primary files:

- `src/platform/preflight/questionRepairImport.js`
- `src/components/teacher/IncompleteAssignmentRepairCenter.jsx`

Expose/report a distinct report-only state when `replacements.length === 0` and platform/unclear reports exist. The Repair Center message must say no replacements were supplied and identify the platform issue(s). It must not use the “introduced a new blocker” message because no replacement was attempted.

### 5. Verification

Targeted tests first, then:

```bash
node --test tests/platform/v5ExplicitWorkflowRepairRegression.test.mjs
npm run test:authoring-v5
node --test tests/platform/*.test.mjs
npm run lint
npm run build
npm run build:firebase
```

Use the Full Platform Test Suite CI as the authoritative full-run surface because this session has no network-capable local checkout.

## Expected deployment surface

Client-side authoring/compiler/Repair Center only unless implementation evidence says otherwise. No Cloud Functions change is expected. Deploy hosting only if no Firestore rule files change.