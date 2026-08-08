# MathMaster Phase 6A–6D Reconciled Integration Guide

Date: 2026-08-08

This package is a replacement build based on the reconciled Phase 5A–5D platform. Phase 6 was implemented against the actual Phase 5 schemas, activity policies, support-profile arrays, canonical TEKS utilities, server grading model, and Firestore security boundary.

## What is implemented

### Phase 6A — Interactive Modeling Labs

- Bundle V3 supports lab-only and mixed question/lab activities.
- Modeling labs are real `modelingLab` question-engine entries, not preview-only cards.
- Public lab definitions strip private evaluation criteria.
- Private lab definitions are stored in `modelingLabDefinitions` and read only by the server grader.
- Restricted arithmetic/constraint parsing uses no `eval` or `new Function`.
- Lab evidence is written server-side with DOK 3/4 metadata and support telemetry.
- Written reasoning is completion-scored automatically and flagged for human review rather than pretending to perform semantic grading.

### Phase 6B — College & Career Readiness

- One exam policy layer covers Digital SAT Math, ACT Math, TSIA2 Math, and ASVAB math preparation.
- Calculator modes reuse the Phase 3 calculator policy constants.
- Domain weighting is performed domain-first so a domain with more tagged TEKS does not become overweighted accidentally.
- Score outputs are explicitly instructional projections. ASVAB math preparation is never labeled as an AFQT score or enlistment qualification.
- TSIA2 projections are labeled as CRC projections; the official alternate readiness pathway of CRC below 950 plus Diagnostic Level 6 is preserved in the benchmark metadata/disclaimer instead of being silently discarded.
- Readiness analytics expose domain coverage/confidence and exclude evidence-thin students from readiness-rate denominators.
- Calculator support that would deviate from a base exam simulation is held until a teacher/proctor explicitly confirms documented accommodations.

Policy constants were reconciled to official current guidance as of the date above. Recheck official exam-owner guidance before each testing season.

### Phase 6C — Secure Exam Runtime

- Secure exam sessions are teacher-created and student-owned.
- Question banks, answer keys, current private grading definitions, saved responses, integrity events, and submission markers are server-only in Firestore rules.
- Student clients receive sanitized question payloads and never receive expected answers or unreleased correctness.
- Typed responses autosave transactionally through a callable; a saved open response is finalized if time expires or the proctor force-submits.
- Timer expiration is verified against the server-side deadline.
- Browser focus/tab/fullscreen/clipboard/context-menu/restricted-shortcut events are recorded idempotently and can lock a session after the configured threshold.
- Only authenticated teachers can lock/unlock, add time, force-submit, or release feedback. The insecure draft proctor PIN was removed.
- Secure exam mastery evidence is not published until the teacher releases feedback, preventing the mastery UI from becoming a correctness side channel.
- The UI calls this a monitored secure simulation. A standard browser is not represented as an operating-system lockdown browser.

Teacher navigation now includes **Secure Exams**. Student navigation now includes **Secure Exams**.

### Phase 6D — Multi-Stakeholder Analytics

- Teacher analytics use the real Phase 5 mastery profile output and convert it into the Phase 6 domain-prediction shape.
- Retention concerns can move an otherwise on-track student into targeted follow-up.
- Support percentages count unique students; overlapping SPED/504/EB/support flags cannot produce percentages above 100%.
- Accommodations and modifications remain separate.
- English/Spanish parent summaries derive strengths/focus from evidence and honor the real `translationLanguage` profile field.
- The showcase district/principal/parent views use synthetic data and are explicitly labeled demo-only. Existing production authorization remains teacher/student; Phase 6D does not fabricate new signed-in roles.

Teacher navigation now includes **Analytics**.

## New server collections

- `modelingLabDefinitions` — teacher-authored private lab criteria.
- `modelingLabSubmissions` — server-only lab idempotency markers.
- `examQuestionBank` — teacher-authored secure assessment items/answer definitions.
- `examSessions` — server-only secure runtime state and response records.
- `examSubmissions` — server-only response idempotency markers.
- `examIntegrityEvents` — server-only integrity telemetry.

## Secure exam question-bank contract

An active `examQuestionBank` item should include:

- `examTypes`: array containing one or more of `digitalSAT`, `act`, `tsia2`, `asvab`.
- `questionType`, `prompt`, `responseFields`, and optional render-safe `choices`/`formulaLatex`.
- Each response field includes a private `expected` value or `accepted` values; these are stripped by the sanitizer before student delivery.
- TEKS may be supplied with `alignmentKeys`, `teksAlignments`, or `teks`.
- TSIA2-style items may set `examCalculatorMode` to the permitted item-level calculator mode.

## Deployment sequence

1. Replace the previous project with this full package (or replace only `src` when backend/rules changes are intentionally handled separately).
2. Install dependencies with the project lockfile.
3. Deploy Firestore rules and Functions before assigning Phase 6A labs or Phase 6C secure exams.
4. Seed teacher-reviewed `examQuestionBank` content before creating secure exam sessions.
5. Run the production build and test suite in the target environment.

Use the full-platform replacement for the normal Phase 6 upgrade because Phase 6 changes `src`, Cloud Functions, and Firestore rules together.
