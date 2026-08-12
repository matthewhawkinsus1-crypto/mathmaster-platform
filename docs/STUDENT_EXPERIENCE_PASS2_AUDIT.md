# MathMaster Module 1 — Student Experience Pass 2

Baseline tested: `mathmaster-platform-main-5-workflow-text-solution-fixed`
Content tested: 8 Module 1 JSON lesson bundles, 103 questions total.

## Why a second pass was necessary

The earlier schema/semantic pass was not enough. It could prove that JSON was structurally renderable, but it did not prove that the actual student tool would show the authored problem, avoid revealing an answer, or provide a real solution after the final attempt.

This pass compared every question type used by the 103 items against the current student component that renders it.

## Issues found and fixed

### 1. Registry tools hid the AI-authored prompt

`sequenceExplorer`, `functionInvestigation2`, and `representationMatch` passed `questionData` into `TaskCard`, but the TaskCard displayed only each tool's generic task text. Contexts such as "a theater adds 8 seats in each successive row" therefore disappeared from the student's screen.

Fix: `TaskCard` now always shows the authored `question.prompt`, then shows generic tool directions separately when they add information.

### 2. Sequence Explorer could print the answer before asking for it

The table/graph used `displayCount` directly. Four Module 1 items displayed the requested comparison/target term before the student answered, and partial-sum mode had the same platform risk.

Fix: sequence evidence now stops at `targetN - 1` / `compareN - 1` / `sumN - 1` by default. Intentional worked examples can explicitly opt into revealing the target. Preflight/tool validation blocks `analyze` JSON where `displayCount >= targetN` unless the reveal is deliberate.

Affected current JSONs corrected:
- Topic 2 Lesson 2: two analyze questions.
- Topic 2 Lesson 3: one analyze question.
- Topic 2 Lesson 3 compare mode is protected by the runtime even though it has no authored display count.

### 3. 50 registry-tool questions had no final solution review

The final-attempt screen explicitly said "Review the solution," but `QuestionEngine` suppressed `SolutionReview` whenever the question came from the tool registry. In this Module 1 set that affected:
- 22 `sequenceExplorer`
- 10 `representationMatch`
- 10 `functionInvestigation2`
- 8 `relationMapping`

Fix: added a safe tool-aware solution review for all four tool families used in Module 1. It is rendered only after the response is closed and gives readable mathematical results rather than JSON/code.

### 4. Top-level V4 `difficultyBand` was ignored by one metadata normalizer

The authoring contract uses `difficultyBand`, but `normalizeQuestionDifficulty` only read nested `difficulty.generatorBand`, `difficulty.band`, or `generatorBand`. Consequently, 72 of these 103 questions would have normalized to Band 3 instead of their authored Band 1, 2, or 4.

Fix: `difficultyBand` is now a supported fallback everywhere the platform normalizes/validates difficulty.

### 5. Tool schema falsely warned that aligned V4 questions had no mastery alignment

All registry-tool questions use V4 `alignments`, but `validateToolQuestion` only looked for platform-owned `masteryEvidenceKeys`. It therefore warned on all 50 registry-tool questions even though they had TEKS alignments.

Fix: V4 TEKS `alignments` now satisfy the authoring alignment check. AI authors are still prohibited from writing platform-owned mastery keys.

### 6. Video-share count data was still drawn as a continuous exponential curve

Topic 1 Lesson 1 correctly made Snack Packs discrete, but the Video Shares scenario is also count data at whole-hour observations and was still rendered as a continuous exponential function.

Fix: that matched graph is now discrete points. `graphScenarioMatch` also supports optional `scenario.relationshipType`; when supplied, semantic validation rejects a discrete scenario matched to a continuous curve, or a continuous scenario matched to point-only data.

### 7. Graph-comparison answer choices could expose cryptic internal graph ids

One function-family comparison asked students to choose `L`, `Q`, or `E`, despite the cards having readable labels.

Fix: the JSON now gives readable option labels, and `GraphComparison` itself automatically substitutes a graph's display label whenever a choice value matches a graph id. This protects future AI-authored items too.

### 8. Student tool cards exposed raw TEKS codes

The skill description can be useful; the raw identifier is teacher/programming metadata for this student interface.

Fix: the task card now shows `Skill focus` with the human-readable standard description only. The TEKS code remains available to teacher/admin tooling.

### 9. Generic multi-answer heading

The student heading `Multiple-Part Question` was implementation-flavored and added no instructional meaning.

Fix: the default is now `Complete Each Part`; authors may supply a more specific heading.

## Automated results after fixes

### Content/contract audit

- 8 lesson JSON files loaded successfully.
- 103 questions inspected.
- Semantic validation: **0 errors, 0 warnings**.
- Registry tool validation: **0 errors, 0 warnings**.
- Difficulty-band normalization mismatches: **0**.
- Sequence target-answer leaks in authored JSON: **0**.

### Regression tests

35 focused tests passed, 0 failed, covering:
- ordinary-text answer normalization from MathLive wrappers;
- simple fraction entry for numeric tools;
- zero preserved in equation → table → graph workflows;
- Firestore-safe relation pairs;
- inequality normalization;
- composed workflow dependencies;
- incomplete-table waiting behavior;
- sequence answer-leak protection;
- V4 difficulty-band normalization;
- final solution review for registry tools;
- authored prompt visibility in tool cards;
- discrete/continuous graph-matching fidelity.

## Browser-build limitation in this environment

A complete Vite/Playwright pixel-level run could not be executed because the extracted project does not contain installed dependencies and `npm ci --offline` fails on an uncached package (`zip-stream@6.0.1`). Earlier online install attempts also timed out. Therefore this report does **not** claim a pixel-perfect browser rendering test.

It does claim a source/runtime-contract audit against the actual current student components plus executable Node regression tests for the platform logic that can run without the missing dependency tree.

The coding environment/deployment pipeline should still run the normal `npm ci`, full test suite, Vite build, and browser smoke tests before production deployment.
