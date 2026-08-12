# MathMaster AI Authoring Compiler — Coding AI Handoff

## Why this change exists

The current V4 intake has been asking outside AIs to behave like MathMaster renderer engineers. The attached `Math Assignment Generation.pdf` demonstrates the failure mode: a reasonable assignment turns into multiple repair loops for Python-vs-JSON formatting, fixed questions inside a personalized assignment, graph viewport clipping, internal field names, and standards warnings. The easiest AI response can even make the mathematics/content worse (for example, adding clipping flags or changing a TEKS code simply to silence validation).

That is the wrong boundary.

The new boundary is:

**AI mathematical intent → MathMaster authoring compiler → canonical internal V4 → semantic/student-experience validation → Preflight**

The AI should author the mathematics and what the student does. MathMaster should own renderer/storage plumbing.

## Non-negotiable design rules

1. **Do not send deterministic plumbing errors back to the AI.** Normalize them locally when the meaning is unambiguous.
2. **Do not let one fixed visual force an entire assignment into shared mode.** Personalization is per question: generators/variants personalize; fixed graphs/data stay fixed.
3. **Graph viewport engineering belongs to MathMaster.** Static graph windows auto-fit unless an instructional author explicitly locks the viewport.
4. **Never auto-change a TEKS to another TEKS just to clear a warning.** Alignment changes are content decisions and stay in teacher Preflight.
5. **External authoring names should be ordinary language.** Accept `equation`/`equations`, `standard`, natural `[x,y]` relation pairs, and common graph aliases; internal compatibility names remain internal.
6. **The imported student experience remains the final gate.** Repairing syntax must never weaken representation fidelity or task fidelity.

## What is implemented

### `src/assignmentBlueprint.js`
The intake now acts as an authoring compiler:

- extracts the first complete balanced JSON object/array from surrounding prose/code;
- repairs Python `True`, `False`, `None`;
- preserves/repairs common AI backslash issues;
- accepts `standard: "A.5A"` plus optional `secondaryStandards` / `prerequisiteStandards` and compiles them to canonical alignments;
- infers common question types from unambiguous structure (`intervals`, `pairs`, `sequence`, `answerFields`, graph-match structures, etc.);
- maps `equation` → internal `equationLatex` and `equations` → `equationsLatex`;
- converts nested `relationMapping` pairs to Firestore-safe `{x,y}` objects;
- normalizes interval `notation` ask to `interval`;
- generates missing analysis-request IDs;
- accepts static graph `linear` and normalizes it to `line`;
- nests loose graph-choice fields under `.graph`;
- maps scenario `text`/`prompt` aliases to `description`;
- automatically turns option-backed multipart fields into student choice controls;
- applies the same normalization to Bundle V3 activity questions, not merely to the flattened preview copy.

### `src/graphSpecUtils.js` and `src/GraphDisplay.jsx`
Static graphs now auto-fit at platform/render time:

- routine AI-authored y-window clipping is expanded automatically;
- sensible x-windows are chosen when omitted;
- points/segments are included in the fit;
- `lockViewport: true` / `autoFit: false` is the explicit strict-mode escape hatch when the viewing window is itself instructional;
- validation and actual rendering use the same viewport logic.

Do **not** regress to telling the AI to add `allowClipping: true` merely to satisfy Preflight.

### `src/platform/contract/authoringContract.js`
The teacher-facing copied contract is now a compact authoring API, not the full renderer registry dump.

- course-specific: only Algebra I or Algebra II TEKS are copied based on the teacher's selection;
- teaches `standard` shorthand and ordinary `equation` fields;
- focuses on common interaction recipes and student-experience rules;
- tells AI to omit routine graph bounds and lets MathMaster fit them;
- keeps the old exhaustive contract as `buildAdvancedAuthoringContract` for developers;
- AI fix requests filter out standards/alignment/mastery warnings, preventing an AI from guessing a replacement TEKS.

### `src/AssignmentIntake.jsx`
- teacher selects Algebra I or Algebra II before copying authoring instructions;
- successful auto-repairs are reported as a success, not treated as failures;
- failure wording makes clear that MathMaster already owns formatting and renderer plumbing.

### `src/App.jsx` / `src/components/teacher/LessonPreflightModal.jsx`
- removed the old assignment-wide "fixed questions cannot be personalized" interruption;
- personalized now means "personalize where possible; fixed visuals stay shared".

## Tests added/updated

- `tests/platform/authoringCompiler.test.mjs`
- `tests/platform/graphSpecUtils.test.mjs`
- `tests/platform/semanticValidation.test.mjs`

The authoring compiler regression test intentionally includes the kinds of failures seen in the Gemini transcript: Python wrapper, Python booleans/null, standard shorthand, missing type, nested relation arrays, graph nesting mismatch, graph aliases, fixed content in personalized mode, and graph clipping.

## Deployment

This pass is client/source only.

- No Firestore migration.
- No Firestore rule change.
- No Cloud Function deployment.
- No index creation.

Merge the changed files, run `npm ci`, then run the full test suite and Vite build in the normal development environment.

## What should still cause a stop

MathMaster should still stop and ask for a teacher/AI content decision when meaning is genuinely ambiguous or mathematically wrong, for example:

- no primary standard can be determined;
- a requested representation does not exist;
- answer data contradicts the prompt;
- a graph is intentionally viewport-locked but its key mathematical feature is outside the window;
- the question asks for a student action that no configured stage actually provides;
- a TEKS is unknown or questionable (warn/review; do not silently replace it).

## Recommended next phase (do not block this deployment)

Move from "AI writes canonical-ish V4" to a formal **Authoring Intent V5** where the external schema contains only mathematical intent (`standard`, stimulus, student actions, answer model), and a compiler selects the concrete MathMaster tool. Keep V4 as the internal/runtime compatibility format. That will reduce the copied AI contract further without destabilizing existing assignments.
