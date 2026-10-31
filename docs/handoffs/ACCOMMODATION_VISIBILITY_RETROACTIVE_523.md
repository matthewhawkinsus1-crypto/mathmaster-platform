# Workload receipts and historical corrections (#523)

## Teacher walkthrough

1. Open the student's drawer, then **Supports & evidence → Retroactive Accommodation Review**. This is separate from recording a support-profile revision; ordinary profile saves keep the existing already-due-work behavior.
2. Enter the documented percentage (whole number, 10–50), a short source reference, its effective date, the historical date range, and the applicable activities. Do not paste confidential documents into the source field.
3. Select **Preview historical assignments**. Preview writes nothing. Each row shows the original due date, previous/proposed required counts and question sets, actual reduction, required progress, previous/proposed grade, and limitations. Secure assessments, ambiguous or unresolved historical content, persistent/assignment overrides, and held Recovery records need manual review; this workflow will not approve those rows or invent grade estimates from those unresolved inputs.
4. Confirm your authority, select the individual row, and choose **Approve correction**. A decrease or mismatch with an existing automatic policy requires a separate second confirmation. There is no bulk approval. Changed inputs invalidate an old preview.
5. The student sees the same neutral receipt on Home, Assignments, Grades and the assignment result. It reports actual counts and required progress. The graded question view presents the required set, rather than showing every omitted question crossed out; optional practice can still expose the full set. Corrected history is labeled **Retroactive grade correction**, with the approved grade when grades are visible; hidden grades and held teacher feedback remain private. It is never called accommodation originally delivered.
6. In the student's assignment row, expand **Family workload summary**. Share that one assignment's read-only text through the school's approved private family communication channel. It contains no plan classification, source reference or confidential support report. There is no authenticated family route in the current application; this feature does not create one or add parent Firestore rights.
7. Inspect **View correction audit history**. Original attempts, assignment content and support revisions remain unchanged. Corrections and reversals create immutable events under the student's record. An original grade and required set remain in the event.
8. To undo an approval, choose **Preview reversal**, inspect the result and approve that row. A lower grade again requires a second confirmation. The original approval remains in history.
9. Classroom does not sync on approval. Choose **Request Google Classroom sync** explicitly. The request is bound to the correction event and current grade inputs; duplicate requests do not queue another push. Audit history shows the matching whole/section delivery statuses. A request is not proof of successful delivery. Stale content, attempts, overrides, profile or Practice Pass state block an old export authorization. Both triggers check the live correction even for an older event without a correction, then check again before sending a grade. Replayed correction events respect a matching successful delivery audit.
10. History currently reads at most 100 matching adjustment events and 200 student delivery records. Reaching either cap displays an explicit incomplete-results warning. Missing entries in that view do not prove that no event occurred; chronological pagination remains a follow-up.

## Implementation and integration

- Shared facts/selection: `functions/shared/workloadReceipt.mjs`, `workloadCorrection.mjs`, `retroactiveAccommodation.mjs`; the existing `reducedWorkload.mjs` algorithm and historical policy remain authoritative.
- Projection: `grades/{studentId}.profile.workloadCorrections[assignmentId]`, writable only through the Admin SDK callable. It contains neutral counts/sets, event identity and approved grade, not source text. Ordinary profile saves update their own nested fields to preserve corrections even if saves overlap.
- Audit: `grades/{studentId}/accommodationAdjustments/{eventId}`. Teacher-of-record/root access only; no client create/update/delete. Approval/reversal events include who/when/source reference, dates/policy, previous/proposed/applied grade and sets, roles, fingerprints, confirmations and export linkage. Sync requests append another event.
- Backend: `reviewRetroactiveAccommodation` in `functions/index.js`, implemented in `functions/lib/retroactiveAccommodation.js`. Grade previews use the existing authoritative weights, partial/best-attempt and Recovery projection. Whole/section passback respects explicit authorization; corrected section passback preserves applicable question overrides and a Practice Pass.
- Browser: `WorkloadReceipt.jsx` and its adapter are reused across student Home, Assignments, Grade Center, assignment results and the teacher's student-assignment list. `RetroactiveAccommodationReview.jsx` is mounted inside the student support panel.
- Rules/authority: `firestore.rules` pins the correction field against every browser writer. `gradeDocumentAuthority.mjs` documents the profile's mixed authority. Tests attack both the private audit and the student-readable projection.
- Evidence: student launch telemetry ignores corrections, and Support Evidence derives original delivery without borrowing a later correction.

## Verification

Use the prepared Node 22 environment (`source /workspace/.mathmaster-environment/activate.sh`). Some managed cloud images inject an ADC file unsupported by this repository's Firebase Admin SDK. For local metadata/unit/emulator processes only, `env -u GOOGLE_APPLICATION_CREDENTIALS` avoids consuming that credential. This does not change the task's authentication configuration. Use only a `demo-` project for the new emulator/browser checks.

```sh
env -u GOOGLE_APPLICATION_CREDENTIALS METADATA_SERVER_DETECTION=none npm run test:platform -- --test-concurrency=6
npm run test:rules
node --test --test-concurrency=1 tests/tools/*.test.mjs
npm run lint
npm run build
npm run build:firebase
node_modules/.bin/firebase emulators:exec --only firestore --project demo-accommodation-523 \
  'env -u GOOGLE_APPLICATION_CREDENTIALS node --test tests/platform/retroactiveAccommodationEmulator.test.mjs && env -u GOOGLE_APPLICATION_CREDENTIALS node tests/browser/accommodationReviewQa.mjs'
```

The callable tests use the real transaction/grade callback and compare canonical assignment/section export, student required items and receipt. They exercise weighted partial credit, a valid per-question override, explicit authorization, whole/section trigger replay, Challenge credit without raw attempts, and a fully Practice-Pass-waived null grade. Focused server/browser cases also verify manual-review rows do not invent grade estimates. The browser journey drives desktop and mobile approval/reversal, student assignment/grade views, hidden/held grade privacy and the family summary, with every external browser request blocked. Classroom is replaced by the existing test adapter; no Google API is called. Rules tests run through `test:rules`; the demo callable/browser job is included in `student-teacher-journeys.yml`.


Final local verification results:

| Check | Result |
| --- | --- |
| Complete platform suite | 14,603 passed, 0 failed; 2 emulator-only cases skipped here and run separately |
| Firestore rules suite | 246 passed, 0 failed, plus the existing rule checks |
| Tool regression suite | 1,875 passed, 0 failed |
| Real callable/whole-and-section export integration | 2 passed, 0 failed, demo emulator and stubbed Classroom only |
| Browser journeys | Desktop 1366px and mobile 390px passed, including secure/manual rows and hidden/held grades |
| Lint | Passed, existing warnings only |
| Standard and Firebase builds | Both passed, existing dependency/chunk warnings |
| Diff whitespace/integration check | Passed; Claude remained at the pinned snapshot |

The final platform gate completed after the changed source contracts were corrected and mutation-tested. No production student data, live Classroom API or deployment was used. GitHub's API is blocked by the managed network policy; the draft PR body is prepared, but remote PR creation remains subject to that external capability.

## Review findings and disposition

A fresh independent review identified three important defects. Regression tests reproduced each before the fix: delayed export snapshots could bypass a later correction/reversal; the callable omitted Challenge credit without a raw tracker and converted an empty Practice Pass denominator into zero; and the receipt exposed an approved percentage while the Grade Center hid it. The final implementation validates live export identity and inputs, uses the canonical projected grading inputs before deciding a grade is missing, preserves null for an empty denominator, and gates receipt percentages with the host view's visibility. An additional real-trigger test reproduced duplicate manual-retry exports; a matching correction delivery now participates in deduplication.

The minor history-cap finding is disclosed in the UI; chronological pagination is deferred. The accessible history group, the atomic nested profile-save source contract, and the Test Cycle deduplication source-contract boundary were also corrected. Removing the posted-grade comparison fails the revised Test Cycle contract; restoring it passes. Removing the nested `profile.` prefix makes the revised contract fail, and restoring it passes. Live Google delivery and deployed production behavior were outside the authorized scope; emulator/adapter parity was verified instead.

## Branch/change register and release follow-up

Base: `68f2e585b0a0c8ef9b310596726da91cd58e7265`. Main remains `cd3f683290dc76271d48929ad402b9e2144e1e22`. Immediately before the implementation commit, remote Claude and Codex still pointed to the pinned base; no concurrent Claude commits have been incorporated. The implementation commit belongs only to the Codex branch.

Overlap with Claude's committed snapshot is intentional and limited to: reduced workload resolution; profile normalization/persistence; canonical grade/section weight presentation; student and teacher receipt surfaces; support telemetry/report derivation; whole/section Classroom passback; rules and CI coverage. Existing TT23 profile-change resend, due-date history, support evidence history, attempts and grading fixes are retained. The new correction uses a separate explicit sync authorization.

Exact paths modified both by the existing Claude snapshot relative to main and by this feature:

- `.github/workflows/student-teacher-journeys.yml`
- `firestore.rules`
- `functions/classroomSectionEntry.js`
- `functions/index.js`
- `functions/shared/reducedWorkload.mjs`
- `src/components/student/StudentAssignmentsCenter.jsx`
- `src/components/student/StudentDashboardView.jsx`
- `src/components/student/StudentGradeCenter.jsx`
- `src/components/teacher/StudentSupportEvidencePanel.jsx`
- `src/platform/student/studentAssignmentsCenterModel.js`
- `src/platform/student/studentGradeCenterModel.js`
- `src/platform/supportEvidence/evidenceAggregation.js`
- `src/platform/supportEvidence/studentSupportTelemetry.js`
- `src/studentDashboardModel.js`
- `src/studentSupport.js`

Review target is **Claude's branch**, never main. Recheck heads and changed paths immediately before preparing a draft PR. If Claude moves, report exact overlaps and stop short of integration. No auto-merge, force push, deployment, production data access or environment publication belongs to this task.

After review, a separate authorized release must deploy the updated rules, `reviewRetroactiveAccommodation`, `syncGradeToClassroom`, `syncSectionGradeToClassroom`, the repository's provenance function, and the web build using repository release procedures. No deployment has been performed. Self-service family authentication and authorization remain an owner decision; the teacher-mediated summary is the supported family workflow for this change.

### Releasing this feature without Claude's unrelated work

The Codex branch inherits Claude's pinned snapshot, which is 444 commits beyond the current main tip. Deploying that checkout would include that snapshot. A selective Firebase function list does not isolate the web build or remove dependencies from shared grading code.

For an independent release, a separately authorized integration task must start a new release branch from current main/the established release baseline, port only the Codex implementation commit(s), inspect every shared grading/support dependency and conflict, and run the complete CI/emulator/browser gates on that result. Merge that feature-only PR through the repository's normal process. Deploy only from clean, current main after its push CI passes, using `scripts/release-firebase.mjs` to plan the release and the resilient Hosting wrapper for the web build. Do not deploy this Claude-based feature checkout directly or bypass provenance checks. The current task does not create or modify that release branch, main, or Claude's branch.

## Changed paths

- `.github/workflows/student-teacher-journeys.yml`
- `docs/handoffs/ACCOMMODATION_VISIBILITY_RETROACTIVE_523.md`
- `docs/superpowers/plans/2026-10-29-accommodation-visibility-retroactive.md`
- `firestore.rules`
- `functions/classroomSectionEntry.js`
- `functions/index.js`
- `functions/lib/retroactiveAccommodation.js`
- `functions/shared/gradeDocumentAuthority.mjs`
- `functions/shared/reducedWorkload.mjs`
- `functions/shared/retroactiveAccommodation.mjs`
- `functions/shared/workloadCorrection.mjs`
- `functions/shared/workloadReceipt.mjs`
- `src/components/student/StudentAssignmentResult.jsx`
- `src/components/student/StudentAssignmentsCenter.jsx`
- `src/components/student/StudentDashboardView.jsx`
- `src/components/student/StudentGradeCenter.jsx`
- `src/components/student/WorkloadReceipt.jsx`
- `src/components/teacher/RetroactiveAccommodationReview.jsx`
- `src/components/teacher/StudentAssignmentsList.jsx`
- `src/components/teacher/StudentSupportEvidencePanel.jsx`
- `src/platform/student/studentAssignmentsCenterModel.js`
- `src/platform/student/studentGradeCenterModel.js`
- `src/platform/student/workloadReceipt.js`
- `src/platform/supportEvidence/evidenceAggregation.js`
- `src/platform/supportEvidence/studentSupportTelemetry.js`
- `src/platform/supportEvidence/supportEvidenceStore.js`
- `src/platform/teacher/gradeEvidence.js`
- `src/platform/teacher/retroactiveAccommodationService.js`
- `src/studentDashboardModel.js`
- `src/studentSupport.js`
- `tests/browser/accommodationReview.html`
- `tests/browser/accommodationReviewBridge.mjs`
- `tests/browser/accommodationReviewMain.jsx`
- `tests/browser/accommodationReviewQa.mjs`
- `tests/platform/gradeDocumentAuthority.test.mjs`
- `tests/platform/retroactiveAccommodation.test.mjs`
- `tests/platform/retroactiveAccommodationEmulator.test.mjs`
- `tests/platform/retroactiveAccommodationServer.test.mjs`
- `tests/platform/supportProfileEditor.test.mjs`
- `tests/platform/testCycleClassroomGrade.test.mjs`
- `tests/platform/workloadReceipt.test.mjs`
- `tests/rules/retroactiveAccommodationRules.test.mjs`
