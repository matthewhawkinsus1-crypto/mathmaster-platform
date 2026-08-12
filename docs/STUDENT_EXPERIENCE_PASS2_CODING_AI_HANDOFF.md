# MathMaster — Student Experience Pass 2 handoff

Merge this package into the root of the current MathMaster project (the directory containing `src`, `tests`, and `package.json`). Preserve all paths.

## Purpose

This pass tests Module 1 content against the actual student-facing components, not just the JSON schema. It fixes platform defects that let structurally valid content produce misleading, incomplete, or student-unfriendly screens.

## Do not regress these behaviors

1. Registry tools (`sequenceExplorer`, `functionInvestigation2`, `representationMatch`, etc.) must display the AI-authored `question.prompt`. Generic tool instructions may supplement it, never replace it.
2. Sequence tools must not reveal the requested target/comparison/final-sum term before the student answers unless the author explicitly marks it as an intentional worked example.
3. Registry-tool questions must show a readable solution review after the final allowed attempt. Do not show JSON, internal schemas, or code-like prose.
4. V4 top-level `difficultyBand` is authoritative input to difficulty normalization.
5. V4 TEKS `alignments` satisfy authoring alignment validation. AI-authored content must not manufacture platform-owned `masteryEvidenceKeys`.
6. Discrete real-world quantities must be represented discretely when a graph-matching item's scenario declares `relationshipType: "discrete"`; continuous scenarios require a continuous representation.
7. Graph-choice UI should display human-readable graph labels instead of cryptic ids such as `L`, `Q`, or `E`.
8. Student task cards may show the human-readable skill description, but should not expose raw TEKS codes as UI clutter.
9. The generic `multiAnswer` heading is `Complete Each Part`, not `Multiple-Part Question`.
10. Preserve all earlier fixes in the baseline: real equation → table → graph artifact dependencies, text-vs-math answer handling, readable solution prose, graph renderability checks, interval-number-line grading compatibility, and stable teacher preview state.

## Content findings that drove this patch

- Several registry tools were silently hiding authored contexts/prompts.
- Sequence Explorer could show `targetN`/`compareN` in its evidence table before asking for that value.
- 50 of the 103 Module 1 registry-tool questions had no solution review after attempt lockout.
- 72 of 103 authored difficulty bands could normalize incorrectly to Band 3.
- All 50 registry-tool questions could receive false missing-alignment warnings.
- A Video Shares count scenario was represented by a continuous curve.
- One graph comparison surfaced raw graph ids as student choices.

## Verification

Focused source/runtime regression suite: 35 passed, 0 failed.
All 8 current Module 1 JSONs: 103 questions, 0 semantic errors, 0 semantic warnings, 0 registry-tool errors, 0 registry-tool warnings, 0 difficulty normalization mismatches.

A full Vite/Playwright run was not possible in the analysis environment because dependencies could not be completely installed (`zip-stream@6.0.1` was unavailable offline and online install timed out). In your normal coding environment run `npm ci`, the complete test suite, `npm run build`, and browser smoke tests before deployment.
