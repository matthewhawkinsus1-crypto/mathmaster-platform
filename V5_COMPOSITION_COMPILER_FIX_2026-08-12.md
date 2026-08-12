# V5 Composition Compiler Fix — 2026-08-12

## Why this fix was necessary

A real Authoring Intent V5 session exposed that the first V5 implementation was still only partly architectural. The outside AI correctly supplied student actions such as `completeTable`, `constructGraph`, `analyzeRange`, and `classifyContinuity`, but MathMaster collapsed the question to one narrow V4 type. Semantic validation then complained that the table/graph was missing and the repair UI sent the outside AI a V4 repair prompt. The AI was therefore forced back into `type`, `functionSpec`, `analysisRequests`, and renderer `graph` plumbing — exactly what V5 was intended to remove.

## Root causes fixed

1. **One-action type resolution was being used for multi-action questions.**
   - V5 now composes function work from stages when more than one mathematical action is required.
   - Supported connected pattern includes equation -> table -> graph -> domain/range -> classification.

2. **Semantic validation did not understand workflow visuals.**
   - A `tableInput` stage now satisfies a prompt's table promise.
   - A `functionGraph` or `coordinatePlot` stage satisfies a graph promise.
   - Mapping and number-line workflow stages are treated similarly.

3. **Repair requests could downgrade V5 to V4.**
   - V5 repair prompts now explicitly keep `schemaVersion: 5`.
   - Internal renderer-plumbing failures are labeled MathMaster compiler defects, with a platform-bug report instead of an AI-fix request.

4. **A repair AI could add `type` and bypass V5.**
   - When `studentActions` are present, V5 ignores `type`/`toolId` and recompiles from intent.
   - Graph-analysis `analysisRequests` and renderer graph plumbing are also derived/owned by MathMaster rather than trusted from a repair AI.

5. **Relation mapping dropped analyze-domain/analyze-range actions.**
   - Both analyze and state variants now compile into domain/range stages.

6. **Given-function table/graph tasks had weak lineage.**
   - MathMaster derives deterministic table answers from the supplied function when possible.
   - Those derived answers are the runtime key; conflicting AI-authored table answers do not override the mathematics.
   - The table artifact carries the given function into the dependent graph and contradictions are caught.

7. **Composed prompts and set notation were incomplete.**
   - WorkflowRunner now displays the parent question prompt.
   - Set notation has a real input profile.
   - Workflow domain/range finite sets use semantic set equivalence.

8. **Structured V5 domain restrictions could be placed beside the function.**
   - If V5 supplies a structured `{min,max,...}` domain and the function has no nested domain, MathMaster treats it as the function restriction.
   - String domain answers are never mistaken for restrictions.

## Important content-quality behavior

Graph-analysis answers that are mathematically derivable from a supplied function are not taken from an AI-authored `responses` key. This prevents a plausible but wrong answer key from becoming the grading source of truth. The platform derives the analysis contract from the function and requested studentActions.

## Permanent regression gates

- `tests/platform/authoringIntentV5CompositionRegression.test.mjs`
- `tests/platform/workflowGrading.test.mjs`
- `npm run test:authoring-v5`
- `npm run validate:authoring-v5`

The V5 validator now includes a rich question requiring table -> graph -> range -> continuity. A future compiler that collapses it back to a single tool fails the build/test gate.

## Deployment

This specific compiler/composition fix is browser-side. If the previously required Path Cloud Functions release is already deployed, rebuild and deploy the Vercel frontend. No Firestore migration, rules change, or index is required for this fix.
