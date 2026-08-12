# MathMaster Phase 3A–3D Fixed Integration Guide

Date: 2026-08-08

This build integrates Phase 3A–3D into the cumulative Batch D platform. The intended handoff is a **complete `src` replacement**, not a file-by-file merge.

## 3A — Activity Policy Engine

`src/platform/policies/activityPolicies.js` is the single activity-role policy registry used by the Question Engine, Tool Wrapper, attempt recorder, and mastery engine.

| Role | Attempts | Feedback | Hints | Remediation | Replacement | Classroom composite weight | Mastery evidence |
|---|---:|---|---|---|---|---:|---|
| Warm-Up | 3 | immediate | yes | yes | yes | 0 | diagnostic, 0.80 |
| Classwork | 3 | immediate | yes | yes | yes | 0.40 | instructional, 0.90 |
| DOL | 1 | after submit | no | no | no | 0.35 | independent, 1.25 |
| Practice | 3 | immediate | yes | yes | yes | 0.25 | independent, 1.00 |
| Quiz | 1 | teacher release | no | no | no | excluded | summative, 1.35 |
| Test | 1 | teacher release | no | no | no | excluded | summative, 1.40 |

Warm-Up grades and diagnostic evidence are deliberately separate. `warmupEvaluator.js` awards a 5-point engagement grade from meaningful completion while preserving initial correctness as diagnostic data. `warmupAggregator.js` supports the default weekly combined posting pattern without converting diagnostic accuracy into the engagement grade.

Classroom composite weights are also deliberately separate from mastery weights. The grade calculator uses 40% Classwork / 35% DOL / 25% Practice and renormalizes over whichever of those components are present. Quiz, Test, and Warm-Up cannot accidentally enter that composite calculation.

Question-level attempts, hints, remediation, feedback timing, or replacement overrides are stripped by Bundle normalization. Activity policy owns those behaviors.

Quiz/Test correctness, partial credit, solution review, question-card state, dashboard grade, and Classroom grade passback remain held until teacher release. The Gradebook exposes the one-way release action. Release also queues previously completed grades for Classroom passback.

## 3B — Lesson Bundle V3

`src/platform/schemas/BundleDefinition.js` normalizes a single lesson JSON into ordered activities using the shared roles. IDs are deterministic and stable across equivalent JSON object key ordering.

Each normalized question follows QuestionDefinition v1 fields (`schemaVersion`, `questionId`, `familyId`, `familyVersion`, `questionType`, `teks`, `alignments`, `dok`, `difficultyBand`, `calculatorPolicy`, `responseFields`, `generator`, and `rawSpec`) while retaining the runtime-compatible `type` alias.

`bundleValidator.js` and `validatorRegistry.js` deeply validate the bundle, activity policies, stable IDs, legacy question types, and all Batch A–D tool definitions. The teacher pre-flight modal displays teacher-readable validation failures and disables Publish until deep validation passes. Its student sandbox runs through the same policy-aware Question Engine but keeps preview attempts isolated from student grading state.

## 3C — Classroom Publication Planner

`publicationPlanner.js` supports the three planned strategies:

- **Hybrid (preferred):** Classwork plus same-due Practice becomes Lesson Work; DOL is separate; later-due Practice/Homework is separate; Quiz and Test are always separate.
- **Bundle:** same-due instruction/DOL/Practice can share one lesson post; later-due Practice remains separate; Quiz and Test remain separate.
- **Split:** Classwork, DOL, and Practice are separate; Quiz and Test remain separate.

Warm-Up is internal/weekly by default. If a daily Warm-Up Classroom post is explicitly requested, it uses the separate 5-point engagement contract; it is never folded into an accuracy composite.

Due times compare actual instants rather than raw date strings, so equivalent timezone representations do not create accidental duplicate posts.

The Phase 3 planner/pre-flight modules are the normalized publication contract. The existing legacy Classroom assignment publisher remains intact rather than being replaced with an incompatible multi-post storage model in this pass.

## 3D — Calculator, Context, Units, and Grading

Calculator modes are `none`, `basic`, `scientific`, `graphing`, `teacherChoice`, and `inherit`. Resolution is policy-driven: assessment context first, then question/activity inheritance and question-specific defaults, teacher choice where required, and eligible support-plan accommodation. Explicit computation-skill locks require the dedicated `calculator-override-computation` accommodation before support can enable a calculator.

- SAT / Digital SAT context forces the allowed graphing/scientific calculator surface.
- ASVAB context disables calculators.
- Warm-Up `inherit` correctly resolves to the activity default of `none`.
- Calculator expressions are evaluated through a restricted math parser; JavaScript `eval` is not used.

Context scaffolds and mathematical assistance are recorded separately. Reading/quantity scaffolds and calculator use do not by themselves reduce mathematical-independence evidence; hints, teacher help, mathematical scaffolds, remediation, and worked examples do.

Unit grading canonicalizes aliases and compound powers (`meters` → `m`, `m*m` → `m^2`, `m/s/s` → `m/s^2`), rejects blank answers as zero, and reports numeric-vs-unit errors separately. Algebraic field equivalence uses symbolic simplification and does not accept expressions merely because they match a fixed numeric probe set.

## Compatibility boundary

The existing authentication/server-authoritative grading work remains a parallel platform track. Phase 3A–3D does not rewrite the authentication files or Firestore security rules. The existing Google Classroom grade-passback Function is only extended to honor Quiz/Test teacher-release timing.

## Verified commands

```text
node --test tests/platform/*.test.mjs tests/tools/*.test.mjs
node --check functions/index.js
npm run lint
npm run build
npx vite build --ssr src/toolsLabMain.jsx
npx vite build --ssr src/components/teacher/LessonPreflightModal.jsx
```

See `docs/handoffs/PHASE3A_3D_FIXED_VALIDATION_REPORT.txt` for the recorded results.
