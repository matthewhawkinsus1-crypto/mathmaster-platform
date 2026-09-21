import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { region, executableSource } from './helpers/sourceContract.mjs';

const indexSource = await readFile('functions/index.js', 'utf8');

const previewFn = region(
  indexSource,
  'exports.previewTeacherQuestionRepair = onCall',
  'exports.commitTeacherQuestionRepair = onCall',
  'previewTeacherQuestionRepair',
);
const commitFn = region(
  indexSource,
  'exports.commitTeacherQuestionRepair = onCall',
  "\n/**\n * Create the next human-facing",
  'commitTeacherQuestionRepair',
);
const authorityFn = region(
  indexSource,
  'async function requireTeacherQuestionRepairAuthority',
  'function teacherQuestionRepairPreviewPayload',
  'requireTeacherQuestionRepairAuthority',
);

test('both callables exist and delegate to the shared repair engine module', () => {
  assert.match(indexSource, /exports\.previewTeacherQuestionRepair\s*=\s*onCall/);
  assert.match(indexSource, /exports\.commitTeacherQuestionRepair\s*=\s*onCall/);
  assert.match(indexSource, /require\("\.\/lib\/teacherQuestionRepair"\)/);
  assert.match(previewFn, /teacherQuestionRepair\.buildTeacherRepairPlan/);
  assert.match(commitFn, /teacherQuestionRepair\.buildTeacherRepairPlan/);
  assert.match(commitFn, /teacherQuestionRepair\.buildRepairedAssignment/);
});

test('preview and commit never trust a client-supplied classification, index, or plan hash', () => {
  // The plan is always rebuilt server-side from the freshly fetched assignment;
  // classification/flatIndex never come from request.data.
  assert.doesNotMatch(executableSource(previewFn), /request\.data\?\.(classification|planHash|flatIndex|affectedStudentCount)/);
  assert.doesNotMatch(executableSource(commitFn), /request\.data\?\.(classification|flatIndex|affectedStudentCount)\b/);
  assert.match(commitFn, /plan\.planHash\s*!==\s*expectedPlanHash/);
});

test('authorization is owner/admin/designated-repairer, reusing existing helpers rather than a new check', () => {
  assert.match(authorityFn, /requireTeacher\(request\)/);
  assert.match(authorityFn, /isRootAdminEmail\(email\)/);
  assert.match(authorityFn, /fullAssignmentRepair\.repairAuthority\(request\.auth\)/);
  assert.match(authorityFn, /designatedRepairer/);
  assert.match(authorityFn, /requireContentUpgradeOwner\(db, request, assignment\)/);
  assert.match(previewFn, /requireTeacherQuestionRepairAuthority\(db, request, liveAssignment\)/);
  assert.match(commitFn, /requireTeacherQuestionRepairAuthority\(db, request, initialAssignment\)/);
});

test('an ordinary unassigned assignment is repairable by any signed-in teacher, matching firestore.rules\' assignments rule', () => {
  // firestore.rules: match /assignments/{assignmentId} { allow update: if
  // teacher() ... } -- no ownership check for an unassigned/editable
  // assignment. requireTeacherQuestionRepairAuthority must not be stricter
  // than that for the same document a teacher could otherwise edit directly.
  const unassignedBranch = region(authorityFn, 'const { classIds, periods } = contentUpgradeAudience(assignment);', 'return requireContentUpgradeOwner(db, request, assignment);', 'unassigned branch');
  assert.doesNotMatch(unassignedBranch, /throw new HttpsError/);
  assert.match(unassignedBranch, /authorizationType:\s*"teacherEditor"/);

  // The `else` arm after the class/legacy-period branches must not deny an
  // unassigned assignment -- there is no permission-denied thrown for the
  // "neither classIds nor periods" case inside the ownership re-check.
  const ownershipRecheck = region(commitFn, 'if (!isRoot && !isElevatedRepairer) {', 'const trackerDocs = await loadSavedAssignmentTrackersInTransaction', 'ownership re-check block');
  assert.doesNotMatch(executableSource(ownershipRecheck), /not assigned to a class/);
});

test('commit re-checks class ownership against fresh transaction reads, not the pre-transaction check', () => {
  const transactionRegion = region(commitFn, 'return await db.runTransaction', 'const trackerDocs = await loadSavedAssignmentTrackersInTransaction', 'commit transaction body');
  assert.match(transactionRegion, /teacherOfRecord/);
  assert.match(transactionRegion, /snap\.exists/);
  assert.match(transactionRegion, /assertLegacyPeriodOwnership/);
});

test('stale baseRevision is rejected in both preview and commit', () => {
  assert.match(previewFn, /Number\(liveAssignment\.assignmentRevision \|\| 1\) !== baseRevision/);
  assert.match(previewFn, /failed-precondition/);
  assert.match(commitFn, /Number\(liveAssignment\.assignmentRevision \|\| 1\) !== baseRevision/);
});

test('preview enters try/catch before any Firestore read and never writes', () => {
  const tryIndex = previewFn.indexOf('try {');
  const firstRead = previewFn.indexOf('db.collection("assignments")');
  assert.ok(tryIndex >= 0 && firstRead > tryIndex, 'preview should enter try/catch before Firestore reads');
  assert.doesNotMatch(executableSource(previewFn), /transaction\.(set|update|delete)|\.collection\([^)]*\)\.doc\([^)]*\)\.(set|update)\(/);
  assert.match(previewFn, /logger\.error\("Teacher question repair preview failed"/);
});

test('commit is atomic: everything happens inside one Firestore transaction, revision bumps exactly once', () => {
  assert.match(commitFn, /db\.runTransaction/);
  const writesOutsideTransaction = commitFn.slice(0, commitFn.indexOf('return await db.runTransaction'));
  assert.doesNotMatch(executableSource(writesOutsideTransaction), /transaction\.(set|update)/);
  assert.match(commitFn, /assignmentRevision: built\.assignment\.assignmentRevision/);
  // Exactly one revision-bearing assignment update call.
  const updateCalls = commitFn.match(/transaction\.update\(assignmentRef,/g) || [];
  assert.equal(updateCalls.length, 1);
});

test('commit never fakes a revision change when there is nothing to apply', () => {
  assert.match(commitFn, /if \(!replacements\.length\)/);
  assert.match(commitFn, /if \(!plan\.canApply\)/);
  const noopReturn = region(commitFn, 'if (!plan.canApply)', 'const correctedAt', 'no-op return');
  assert.match(noopReturn, /applied: false/);
  assert.doesNotMatch(noopReturn, /transaction\.(set|update)/);
});

test('commit writes an allow-list update and preserves operational assignment data (no Classroom repost)', () => {
  const updateRegion = region(commitFn, 'transaction.update(assignmentRef,', 'migratedRows.forEach', 'assignment update');
  assert.match(updateRegion, /sections: built\.assignment\.sections/);
  assert.match(updateRegion, /assignmentRevision:/);
  assert.doesNotMatch(updateRegion, /assignedClassIds|dueAt|classroomPackage|accommodation|CourseWork/i);
  assert.doesNotMatch(executableSource(commitFn), /createCourseWork|publishAssignment|resetAssignment/);
});

test('grade reconciliation is requested only when the tracker migration says a grade may actually change', () => {
  const migrationRegion = region(commitFn, 'migratedRows.forEach', 'transaction.set(eventRef', 'grade reconciliation write');
  assert.match(migrationRegion, /if \(!migration\.changed\) return;/);
  assert.match(migrationRegion, /if \(migration\.gradeMayChange\)/);
  assert.match(migrationRegion, /reason: "section-grade-reconcile"/);
  assert.match(migrationRegion, /source: "teacher-question-repair"/);
});

test('an audit/version event is written to the existing assignmentVersionEvents collection, not a new one', () => {
  assert.match(commitFn, /db\.collection\("assignmentVersionEvents"\)\.doc\(\)/);
  assert.match(commitFn, /eventType: "teacherQuestionRepair"/);
  const eventRegion = region(commitFn, 'transaction.set(eventRef', 'return {', 'audit event');
  assert.match(eventRegion, /actorUid/);
  assert.match(eventRegion, /actorEmail/);
  assert.match(eventRegion, /fromAssignmentRevision/);
  assert.match(eventRegion, /toAssignmentRevision/);
  assert.match(eventRegion, /replacementQuestionIds/);
  assert.match(eventRegion, /affectedStudentCount/);
  assert.doesNotMatch(indexSource, /collection\("teacherQuestionRepair(Audits|History|Events)"\)/);
});

test('a retried commit cannot duplicate a replacement question: it fails closed on the moved revision', () => {
  // No idempotency short-circuit keyed on plan hash: the baseRevision check runs
  // first, inside the transaction, before any mutation, so a retry after a
  // successful commit sees the bumped revision and is rejected rather than
  // re-applying (and re-minting a replacement question ID).
  const revisionCheckIndex = commitFn.indexOf('Number(liveAssignment.assignmentRevision || 1) !== baseRevision');
  const mutationIndex = commitFn.indexOf('transaction.update(assignmentRef,');
  assert.ok(revisionCheckIndex >= 0 && mutationIndex > revisionCheckIndex);
});

test('commit only mints a fresh replacement question ID for the fundamental/history path, never for direct replacement', async () => {
  const teacherQuestionRepairSource = executableSource(await readFile('functions/lib/teacherQuestionRepair.js', 'utf8'));
  assert.match(teacherQuestionRepairSource, /commitBehavior !== "retireAndReplace"/);
  assert.match(teacherQuestionRepairSource, /mintQuestionId\(questionId\)/);
  assert.match(teacherQuestionRepairSource, /supersedesQuestionId: questionId/);
});
