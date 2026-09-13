import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { testCycleClassroomPassback } from '../../functions/shared/testCycleGrade.mjs';
import {
  applyRetestReleased,
  applyTestReleased,
  normalizeTestCycleRecord,
} from '../../functions/shared/testCycleRecord.mjs';
import { assertCapability, executableSource, region } from './helpers/sourceContract.mjs';

const require_ = createRequire(import.meta.url);
const { classroomGradeReleasePolicy } = require_('../../functions/lib/classroomGradeRuntime.js');
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/*
 * ONE GOOGLE CLASSROOM GRADE ITEM PER TEST CYCLE.
 *
 * The whole Classroom contract in #220 is four sentences, and each one is a
 * different way for a parent to end up looking at the wrong number:
 *
 *   push the original recorded Test grade
 *   UPDATE that same item when a retest earns more
 *   never create a second item for the retest
 *   never lower a grade already posted
 */

const POLICY = { mode: 'testCycle' };
const released = (testScore, retestScore = null) => {
  let record = normalizeTestCycleRecord({ assignmentId: 'A1', studentId: 'S1' });
  record = applyTestReleased(record, { rawScore: testScore, policy: POLICY, releasedAt: 1 });
  if (retestScore !== null) record = applyRetestReleased(record, { rawScore: retestScore, policy: POLICY, releasedAt: 2 });
  return record;
};

test('the original recorded Test grade is what first reaches Classroom', () => {
  const record = released(52);
  const decision = testCycleClassroomPassback({ recordedGrade: record.recordedGrade, previouslyPostedGrade: null });
  assert.equal(decision.shouldPost, true);
  assert.equal(decision.grade, 52);
});

test('Classroom has 52 and a raw retest of 84 updates the same grade to 70', () => {
  const record = released(52, 84);
  const decision = testCycleClassroomPassback({ recordedGrade: record.recordedGrade, previouslyPostedGrade: 52 });
  assert.equal(decision.shouldPost, true);
  assert.equal(decision.grade, 70, 'the cap, not the raw 84');
  assert.match(decision.reason, /same Classroom grade item/i);
});

test('Classroom has 68 and a raw retest of 64 leaves Classroom at 68', () => {
  const record = released(68, 64);
  assert.equal(record.recordedGrade, 68);
  const decision = testCycleClassroomPassback({ recordedGrade: record.recordedGrade, previouslyPostedGrade: 68 });
  assert.equal(decision.shouldPost, false);
});

test('Classroom has 75 and a retest can never replace it with 70', () => {
  const record = released(75, 92);
  assert.equal(record.recordedGrade, 75);
  const decision = testCycleClassroomPassback({ recordedGrade: record.recordedGrade, previouslyPostedGrade: 75 });
  assert.equal(decision.shouldPost, false);
  assert.equal(decision.grade, 75);
});

test('a lower recorded grade is refused outright, whatever produced it', () => {
  const decision = testCycleClassroomPassback({ recordedGrade: 40, previouslyPostedGrade: 68 });
  assert.equal(decision.shouldPost, false);
  assert.equal(decision.refusedLowering, true);
  assert.equal(decision.grade, 68);
});

test('a Test Cycle grade is student-visible the moment it exists', () => {
  // It only exists after a teacher released a secure result, so the release
  // decision this policy waits for has already been made.
  for (const stage of ['testcycle-test', 'testcycle-retest']) {
    const policy = classroomGradeReleasePolicy({ stage, assignment: {} });
    assert.equal(policy.studentVisible, true, stage);
    assert.equal(policy.shouldReturn, true, stage);
  }
});

/* --- the wiring, in the trigger that actually posts the grade -------------- */

// Bound to the trigger itself, not to the next thousand lines. A region that
// runs to the next distant export passes for reasons that have nothing to do
// with the behaviour under test — and, for the doesNotMatch below, fails for
// them too.
const syncTrigger = region(
  functionsIndex,
  'exports.syncGradeToClassroom = onDocumentWritten(',
  'exports.queueReleasedAssessmentGrades',
  'syncGradeToClassroom',
);

test('a recorded Test Cycle grade wakes the Classroom passback trigger', () => {
  // Without this the projection would be written by the secure release path and
  // nothing would ever send it to Classroom.
  assertCapability(
    syncTrigger,
    [/testCycleChangedAssignmentIds/],
    'testCycleGrades changes must be a source of changed assignment ids.',
  );
  const changed = region(syncTrigger, 'const changedAssignmentIds', '];', 'changed ids');
  assert.match(changed, /testCycleChangedAssignmentIds/);
});

test('a Test Cycle posts the canonical recorded grade and not the tracker', () => {
  assert.match(syncTrigger, /testCycleProjection/);
  assert.match(syncTrigger, /recordedGrade/);
  // The tracker path is what would otherwise grade Review and Corrections work.
  assertCapability(
    syncTrigger,
    [/isTestCycleAssignment\s*\n?\s*\?\s*\{/, /isTestCycleAssignment\s*$/m],
    'the grade must branch on whether this is a Test Cycle.',
  );
});

test('no second Classroom item is ever created for a retest', () => {
  // A retest writes the same recordedGrade projection and takes the same
  // publication path. The only guard is that a Test Cycle refuses any
  // publication that is not the whole-assignment item.
  assertCapability(
    syncTrigger,
    [/isTestCycleAssignment && String\(publication\.sectionKey \|\| "whole"\) !== "whole"/],
    'a Test Cycle must skip split section publications.',
  );
  // And there is no createCourseWork call inside the grade trigger at all.
  assert.doesNotMatch(executableSource(syncTrigger), /createCourseWork/);
});

test('the trigger refuses to lower a posted grade', () => {
  assertCapability(
    syncTrigger,
    [/testCycleClassroomPassback/],
    'the passback decision must go through the shared never-lower rule.',
  );
  assert.match(syncTrigger, /skipped-would-lower/);
});

test('a re-released Test Cycle score is not swallowed by stage-only deduplication', () => {
  const dedupe = region(syncTrigger, 'if (\n          !forceRetry', 'continue;', 'dedupe');
  assert.match(dedupe, /priorAudit\.grade\) === Number\(grade\)/);
});
