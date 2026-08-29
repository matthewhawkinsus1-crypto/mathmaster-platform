# MathMaster Assignment V5 — Canonical Foundation

## Decision

MathMaster is pre-production. There are no real student records or live assignment data that require backward compatibility.

Assignment V5 is now the only supported authoring format. V4/V3/V2 assignment packages and raw question arrays are intentionally unsupported and may be discarded.

## Architecture

Assignment V5 is the authoring and persistence source of truth.

A V5 assignment contains:

- `assignment`: title, course, folder, instructional purpose, grading purpose.
- `sections[]`: Warm-Up, Classwork, Practice, DOL, Quiz, and Test sections.
- `variantPolicy`: shared/personalized/adaptive delivery.
- `differentiationPolicy`: bounded differentiation, Honors behavior, CCMR target share.
- `supportPolicy`: student-profile supports without silently changing the standard.
- `toolPolicy`: calculator/keyboard/tool availability.
- `deliveryPolicy`: section gating and access.
- `gradingPolicy`: attempt/scoring policy.
- `evidencePolicy`: grade/mastery/recommendation/analytics eligibility.
- `outputProfiles`: digital, printable worksheet, lesson-notes PDF, future teacher/answer-key PDFs.
- `classroomIntegration`: Google Classroom publishing intent.
- `provenance`: content/generator/grader release metadata.
- `preflight`: teacher review requirements.

## Question compilation

Outside authors describe mathematics and `studentActions`. They do not choose React components, `type`, `toolId`, viewport bounds, Firestore state, or renderer plumbing.

MathMaster compiles each V5 question into the existing mature interaction/rendering contracts. Those renderer contracts are implementation details, not an older assignment schema.

Generated expected answers must come from the same parameters that generate the prompt. Equivalent formatting should be handled by the grader rather than padded accepted-answer arrays.

## Persistence

New assignment documents persist:

- `schemaVersion: 5`
- canonical `sections[]`
- all V5 policy groups
- `runtimeProjectionVersion: 1`
- a temporary flat `questions[]` runtime projection

The flat projection exists only so mature student renderers, grading paths, and server code do not all need to be rewritten in the same foundation change. New authoring and persistence logic treats `sections[]` as canonical.

Question editing and assignment duplication rebuild canonical sections whenever the runtime projection changes.

## Preflight

The existing Lesson Preflight UI is retained as a working view. V5 sections are explicitly adapted to its activity model. The source package is no longer treated as Bundle V3.

## Honors + CCMR

Honors placement is inherited from the destination class rather than authored as a question flag.

For a full Honors assignment with independent Practice, the V5 default targets about 15% authentic CCMR transfer practice over the recent sequence, while preserving the lesson TEKS and instructional ceiling.

Authentic CCMR items must use the approved TEKS-to-assessment crosswalk and carry explicit assessment metadata for Digital SAT, ACT, TSIA2, or ASVAB. The recent Authentic Language/Fidelity rules remain in force.

## PDF and print

Digital and printable student work use the same resolved questions.

Currently supported:
- student worksheet PDF
- separate 1–2 page lesson-notes PDF

Declared but disabled until dedicated solution renderers are finished:
- teacher worksheet with solutions
- answer-key-only PDF

## Validation

The canonical V5 gate now tests:

- V5 schema normalization and validation
- V4/raw-array rejection
- V5 question compilation
- composed workflows
- instructional scope
- semantic validation
- Honors/CCMR metadata
- Firestore persistence wiring
- worksheet/PDF regression paths
- Digital SAT V2.1 authoring gate
- production build

See `.github/workflows/assignment-v5-foundation.yml`.
