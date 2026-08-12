# My Math Path — Assignment Independence / Secure Bank Update

Date: 2026-08-11

## Root cause

The live student My Math Path already issues work from the secure `pathQuestionBank`, but the Teacher Path Simulator still had an older design assumption: it built its question bank from classroom assignments and refused to start when there were no assignments. That made a fresh simulated student look as if My Math Path had no work even when Path content should exist independently of assignments.

A second bootstrap gap compounded this: the repository contained a reviewed starter Path bank, but there was no one-click server-side initializer for a fresh deployment. An empty Firestore `pathQuestionBank` therefore stayed empty until someone manually imported seed files.

## Intended architecture now enforced

- Student class/course tells MathMaster which course Path to show.
- The standards/prerequisite graph tells Path what skills are mathematically available and related.
- The secure `pathQuestionBank` supplies the actual Path practice content.
- Student mastery/evidence influences recommendations, readiness, and routing.
- Classroom assignments are teacher-directed work and evidence. They are **not required for My Math Path to exist**.
- Question Bench remains assignment-specific QA; Student Experience does not.

## Implemented changes

1. Teacher Path Simulator no longer blocks when there are zero assignments.
2. Student Experience has explicit Course and Starting skill controls, so a fresh learner can be simulated on a selected objective before any assignment exists.
3. Simulator Student Experience reads the actual active secure `pathQuestionBank` rather than teacher assignment questions.
4. Secure-bank simulation supports both Path Tool Contract items and the starter bank's field-graded items without exposing expected answers to the simulated student payload.
5. An explicitly empty secure-bank snapshot never falls back to assignment questions. Empty means empty.
6. Question Bench still works from assignments and is clearly separated from Path simulation.
7. Secure Path-bank records using `alignmentKeys` are recognized by normal question metadata helpers.
8. Administration → Path content coverage now has a one-click **Initialize / refresh built-in starter bank** action.
9. The built-in starter package is installed by a root-admin Cloud Function. Its answer-bearing JSON files live only inside `functions/seeds/pathQuestionBank/`; they are **not** copied into Hosting/public assets.
10. Successful initialization or custom import automatically rebuilds coverage and clears the teacher simulator bank cache.

## Starter bank

The bundled starter bank contains 515 minimum-operational question families:

- 5 families for each of 103 currently routeable standards
- all Algebra I wheel standards
- all Algebra II wheel standards
- current reachable Grade 7/8 hard prerequisites

This is the operational floor, not the long-term richness target. The Path Bank promotion workflow should continue replacing/augmenting these with richer tool-backed question families.

## Fresh deployment steps

1. Deploy Cloud Functions first (the new root-admin initializer and server-only seed files live there).
2. Deploy the web app.
3. Sign in as Root Admin.
4. Open Administration → Path content coverage.
5. Click **Initialize / refresh built-in starter bank** once.
6. Coverage is recomputed automatically.
7. Open Teacher Path Simulator. A fresh student can now enter My Math Path even with zero classroom assignments.

No Firestore rules or index change is required by this update.

## Validation

Focused Path tests after this update:

- 50 tests passed
- 0 failed

Coverage tests verify all 103 currently routeable standards can launch a five-question session without family repeats and that no expected answer is present in the public student payload.

## Remaining parity item to address next

The Teacher Simulator's local session state machine currently models prerequisite diagnosis/descent/return more richly than the production `submitPathResponse` Cloud Function, which still completes an active session primarily on its selected target standard. The secure bank/source-of-content problem fixed here is independent of that issue, but production/simulator adaptive-routing parity should be the next Path workstream so the simulator cannot demonstrate a route the live server would not take.
