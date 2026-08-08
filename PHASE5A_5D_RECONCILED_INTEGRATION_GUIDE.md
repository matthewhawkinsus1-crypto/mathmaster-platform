# MathMaster Phase 5A–5D — Reconciled Integration Guide

This package builds the missing Phase 5C and reconciles Phase 5A, 5B, 5C, and 5D against the actual cumulative MathMaster source instead of assuming earlier roadmap modules exist under draft-only filenames.

## Phase 5A — My Math Path mastery experience

- `MyMathPathWheel` derives its Algebra I content TEKS from the canonical Texas registry already used by MathMaster.
- `masteryStateService` adapts the existing assignment mastery engine into the Phase 5 display contract and merges newer server-derived My Math Path evidence when it exists.
- The existing student assignment dashboard remains intact. Students can open **My Math Path** without losing the assignment/DOL workflow.
- Canonical `texas:` keys are converted only at system boundaries; student-facing components use display TEKS such as `A.5A`.

## Phase 5B — retention scheduler

- Retention horizons remain 14 / 30 / 60 days.
- Only Secure or Mastered skills enter the retention schedule.
- Retention concerns outrank overdue checks, which outrank normally due checks.
- A retention Quick Check is a real two-question `retentionProbe` session; it does not silently launch the ordinary five-question practice contract.
- A successful verification requires two completed, mathematically independent successes.

## Phase 5C — Student Practice History & Audit Evidence Timeline

Phase 5C is newly implemented in this package.

- Every successful legacy assignment-grade save launches a non-blocking, append-only evidence write.
- Evidence failure cannot block or roll back the existing student grade/UI.
- Each event carries canonical alignment keys, question-instance/family metadata, DOK, difficulty band, activity role/session, score, correctness, attempt number, and support telemetry.
- Context/reading scaffolds are recorded separately from mathematical assistance and do not reduce mathematical independence.
- The student Practice History can filter canonical or display TEKS and groups evidence chronologically by date.
- `presented` and `used` support signals stay distinct.
- Pre-Phase-5 aggregate grade records are not fabricated into fake historical events. The immutable timeline begins when actual Phase 5C events exist.

## Phase 5D — secure production seam

The supplied 5D draft referenced callables and a player that were not present in the cumulative package. This reconciliation supplies the missing seam.

- `startMyMathPathSession`, `issueNextQuestion`, and `submitPathResponse` are implemented as authenticated Cloud Functions.
- Sessions are server-owned and one active session lock is enforced per student + TEKS.
- Secure questions come from the server-only `pathQuestionBank` collection.
- Students receive an allowlisted/sanitized payload. Expected answers, grading definitions, and contextual expected meanings never leave the server.
- Response grading happens server-side.
- `submissionId` is preserved across network retries and is enforced as an idempotency key server-side.
- Finalized attempts append immutable Phase 5C evidence in the same transaction that advances the path session.
- Retention-probe completion updates the server-owned retention schedule.
- An idempotent evidence trigger maintains the Phase 5A shadow-mastery read model without double-counting trigger retries.

### Execution flag

The safe default is:

```text
VITE_MATHMASTER_EXECUTION_MODE=mockLocal
```

Switch to `firebaseProduction` only after deploying the included Functions and Firestore rules and publishing gradeable `pathQuestionBank` content for the TEKS you intend students to practice.

## Authentication/security reconciliation

The cumulative source already contained the new `LoginScreen` and `AuthProvider`, but they were not connected to the application entry point and `firebase.js` did not export Firebase Auth. This package connects them.

Firestore rules now enforce:

- students can read/update only their own grade document;
- students cannot delete permanent grade records or scratchpads;
- Phase 5C evidence is student-readable but append-only;
- assignments/settings are signed-in reads and teacher-only writes;
- mastery/retention read models are student-own/teacher readable but student non-writable;
- path sessions, locks, submissions, auth internals, and evidence-application markers are server-only;
- the answer-bearing `pathQuestionBank` is teacher-only.

## Validation

Validated on the reconciled package:

- 111/111 cumulative policy/math/platform tests passed.
- Phase 5 focused tests: 11/11 passed.
- Production Vite build passed.
- All-tool Lab SSR compile passed.
- Lesson preflight SSR compile passed.
- Cloud Functions syntax checks passed.
- Lint exits successfully with no errors. Existing non-blocking warnings remain in legacy files.
