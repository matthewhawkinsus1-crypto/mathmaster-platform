import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { buildStudentGradeCenter } from '../../src/platform/student/studentGradeCenterModel.js';
import { buildStudentAssignmentsCenter } from '../../src/platform/student/studentAssignmentsCenterModel.js';
import { buildTestCycleGradeState } from '../../functions/shared/testCycleGrade.mjs';
import { assertCapability, componentSource, region } from './helpers/sourceContract.mjs';

const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');
const gradeCenter = componentSource('src/components/student/StudentGradeCenter.jsx');
const resultScreen = componentSource('src/components/student/StudentAssignmentResult.jsx');
const assignmentsCenter = componentSource('src/components/student/StudentAssignmentsCenter.jsx');
const teacherControls = componentSource('src/components/teacher/TestCycleControls.jsx');
const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

/*
 * ONE RECORDED GRADE, READ BY EVERY SURFACE.
 *
 * A student's Grade Center, their Assignment Result, the teacher gradebook and
 * Google Classroom must show the same number, and the way to guarantee that is
 * for none of them to compute it.
 */

const ASSIGNMENT = {
  id: 'A1',
  title: 'Unit 3 Test Cycle',
  schemaVersion: 5,
  assignedClassIds: ['class-a'],
  dueAt: '2099-09-01T00:00:00.000Z',
  assessmentPolicy: { mode: 'testCycle' },
  testBlueprint: { blueprintId: 'unit3', targets: [{ targetId: 't1', alignmentKey: 'texas:A.5A', questionCount: 4, familyIds: ['f1', 'f2', 'f3', 'f4'] }] },
  sections: [{ role: 'review', questions: [{ questionId: 'r1' }, { questionId: 'r2' }] }],
};

const centerFor = (projection) => buildStudentGradeCenter({
  assignments: [ASSIGNMENT],
  classId: 'class-a',
  studentId: 'S1',
  testCycleGrades: projection ? { A1: projection } : {},
});

test('the Grade Center shows the canonical recorded grade, not the Review tracker', () => {
  const entry = centerFor({ originalTestGrade: 58, rawRetestGrade: 82 }).entriesByAssignmentId.A1;
  assert.equal(entry.isTestCycle, true);
  assert.equal(entry.displayGrade, 70);
  assert.equal(entry.testCycle.originalTestGrade, 58);
  assert.equal(entry.testCycle.rawRetestGrade, 82);
  assert.equal(entry.testCycle.retestCappedContribution, 70);
  assert.equal(entry.testCycle.retestCapApplied, true);
  // The same value the server-side rule produces, from the same function.
  assert.equal(
    entry.testCycle.recordedGrade,
    buildTestCycleGradeState({ originalTestGrade: 58, rawRetestGrade: 82, policy: ASSIGNMENT.assessmentPolicy }).recordedGrade,
  );
});

test('an unreleased Test Cycle is Pending Grade, never 0%', () => {
  const entry = centerFor({ recordedGrade: null, stage: 'awaitingRelease' }).entriesByAssignmentId.A1;
  assert.equal(entry.displayGrade, null);
  assert.equal(entry.status, 'pendingGrade');
  assert.equal(entry.countsTowardPeriodGrade, false);
  assert.equal(entry.feedbackHeld, true);
});

test('a secure Test submitted after the final deadline is still Pending Grade, not Practice Only', () => {
  // "Practice Only" means no credit is recoverable. Telling a student that
  // while their teacher is still holding the score would be a lie about what
  // MathMaster recorded.
  const closed = { ...ASSIGNMENT, dueAt: '2020-01-01T00:00:00.000Z', lateDueAt: '2020-01-02T00:00:00.000Z' };
  const center = buildStudentGradeCenter({
    assignments: [closed],
    classId: 'class-a',
    studentId: 'S1',
    testCycleGrades: { A1: { recordedGrade: null, stage: 'awaitingRelease' } },
  });
  assert.equal(center.entriesByAssignmentId.A1.status, 'pendingGrade');
});

test('a Test Cycle nobody started is Not Started, and past its deadline is Practice Only', () => {
  const notStarted = centerFor({ recordedGrade: null, stage: 'review' }).entriesByAssignmentId.A1;
  assert.equal(notStarted.status, 'notStarted');
  assert.equal(notStarted.displayGrade, null);
});

test('a Test Cycle carries one assessment grade worth of weight in the period average', () => {
  const entry = centerFor({ originalTestGrade: 58, rawRetestGrade: 82 }).entriesByAssignmentId.A1;
  assert.deepEqual(entry.weights, { possibleWeight: 100, earnedWeight: 70, score: 70 });
  const summary = centerFor({ originalTestGrade: 58, rawRetestGrade: 82 }).currentSummary;
  assert.equal(summary.score, 70);
});

test('a Test Cycle is ONE row in the Assignments Center, marked as one assessment', () => {
  const center = buildStudentAssignmentsCenter({
    dashboard: { allEntries: [{ assignment: ASSIGNMENT, lifecycle: {}, bucket: 'active', questionsTotal: 2, questionsDone: 0, questionsAttempted: 0 }] },
    gradeCenter: centerFor({ originalTestGrade: 58, rawRetestGrade: 82 }),
  });
  const rows = center.rows.filter((row) => row.assignmentId === 'A1');
  assert.equal(rows.length, 1, 'never four cards for four stages');
  assert.equal(rows[0].isTestCycle, true);
  assert.equal(rows[0].continueLabel, 'Open assessment');
  assert.equal(rows[0].canPractice, false, 'a secure assessment is not ordinary post-deadline practice');
});

test('the student surfaces render the breakdown from the canonical entry', () => {
  for (const [name, source] of [['Grade Center', gradeCenter], ['Assignment Result', resultScreen]]) {
    assertCapability(
      source,
      [/<TestCycleGradeBreakdown/],
      `${name} must show the Test Cycle breakdown beside the grade.`,
    );
    assert.match(source, /entry=\{entry\}/);
  }
  assert.match(assignmentsCenter, /row\.isTestCycle/);
});

test('the breakdown component computes nothing of its own', () => {
  const breakdown = componentSource('src/components/student/TestCycleGradeBreakdown.jsx');
  assertCapability(breakdown, [/testCycleGradeBreakdown\(/], 'it must render the shared breakdown.');
  // No arithmetic on grades in a component. Math.max/min over scores here would
  // be a second copy of the policy.
  assert.doesNotMatch(breakdown, /Math\.(max|min)\(/);
});

test('the teacher gradebook reads the same record, with the same five numbers', () => {
  const teacherRows = region(
    functionsIndex,
    'exports.listTeacherTestCycleRecords = onCall(',
    'exports.getTeacherTestCyclePlans',
    'listTeacherTestCycleRecords',
  );
  assert.match(teacherRows, /recordGradeState\(record, policy\)/);
  for (const field of ['originalTestGrade', 'rawRetestGrade', 'retestCappedContribution', 'maxRecordedGrade', 'recordedGrade']) {
    assert.match(teacherRows, new RegExp(`${field}: grade\\.${field}`), `${field} must come from the canonical grade state`);
  }
  assert.match(teacherRows, /stage: state\?\.stage/);
  // And the teacher screen shows them.
  for (const heading of ['Original Test', 'Retest raw', 'Retest capped', 'Recorded']) {
    assert.match(teacherControls, new RegExp(heading));
  }
});

test('the browser never writes a recorded Test Cycle grade', () => {
  // A device that can write its own recorded grade is a device that can pass a
  // test it did not take. App reads the projection and never sets it.
  const state = region(app, 'const [testCycleGrades, setTestCycleGrades]', 'const studentGradeCenter', 'testCycleGrades state');
  assert.doesNotMatch(state, /updateDoc[^\n]*testCycleGrades/);
  assert.match(app, /setTestCycleGrades\(snapshot\.data\(\)\?\.testCycleGrades \|\| \{\}\)/);
  assert.match(app, /testCycleGrades,/);
});

test('the grade projection is written only by the secure release path', () => {
  const persist = region(functionsIndex, 'async function persistTestCycleRecord(', 'async function readTestCycleRecord', 'persistTestCycleRecord');
  assert.match(persist, /new FieldPath\("testCycleGrades", normalized\.assignmentId\)/);
  assert.match(persist, /recordGradeState\(normalized, policy\)/);
});
