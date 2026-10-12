import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectTestCycleTeacherActions } from '../../src/platform/teacher/testCycleActionProjection.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
// The Action Center, the sidebar and the parent-contact screen are mounted by
// the teacher's screen, its own module since G2; App computes what they show.
const teacherWorkspace = readFileSync(new URL('../../src/app/teacher/TeacherWorkspace.jsx', import.meta.url), 'utf8');

test('production Action Center receives shared authoritative grade-transfer and Test Cycle projections', () => {
  assert.match(teacherWorkspace, /gradeTransferUnits=\{actionGradeScope\.units\}/);
  assert.match(teacherWorkspace, /retestRecoveryActions=\{retestRecoveryActions\}/);
  assert.match(app, /\n {8}actionGradeScope=\{actionGradeScope\}\n/);
  assert.match(app, /\n {8}retestRecoveryActions=\{retestRecoveryActions\}\n/);
  assert.match(app, /loadTeacherGradeTransferState/);
  assert.match(app, /listTeacherTestCycleRecords[\s\S]*projectTestCycleTeacherActions/);
});

test('canonical Test Cycle rows surface only teacher-action and completed history states', () => {
  const actions = projectTestCycleTeacherActions({ assignment: { id: 'a1', classId: 'c1' }, records: [
    { studentId: 's1', stage: 'awaitingRelease', statusLabel: 'Test submitted' },
    { studentId: 's2', stage: 'complete', statusLabel: 'Retest complete' },
    { studentId: 's3', stage: 'test', statusLabel: 'Test' },
  ] });
  assert.deepEqual(actions.map((row) => [row.studentId, row.actionRequired, row.completed]), [['s1', true, false], ['s2', false, true]]);
});

test('parent-contact handoff records contact then appends support resolution', () => {
  assert.match(teacherWorkspace, /sourceAction=\{parentContactSourceAction\}/);
  assert.match(teacherWorkspace, /recordParentContact\([\s\S]{0,700}SUPPORT_EVENT_KIND\.RESOLVED[\s\S]{0,300}resolvesEventId: contact\.sourceEventId/);
});

test('date-only action keys render as local calendar dates instead of UTC instants', () => {
  const component = readFileSync(new URL('../../src/components/teacher/TeacherActionCenter.jsx', import.meta.url), 'utf8');
  assert.match(component, /new Date\(Number\(year\), Number\(month\) - 1, Number\(day\)\)\.toLocaleDateString\(\)/);
  assert.doesNotMatch(component, /new Date\(item\.dueAt \|\| item\.createdAt\)\.toLocaleDateString\(\)/);
});

test('sidebar badge keeps only the last projected count after Action Center releases heavy data', () => {
  assert.match(teacherWorkspace, /actionCount=\{teacherActionOpenCount\}/);
  assert.match(app, /\n {8}teacherActionOpenCount=\{teacherActionOpenCount\}\n/);
  assert.match(app, /const currentTeacherActionOpenCount = openTeacherActionCount\(teacherActionItems\)/);
  assert.match(app, /setTeacherActionOpenCountCache\(currentTeacherActionOpenCount\)/);
  assert.match(app, /const teacherActionOpenCount = teacherTab === 'actionCenter'/);
});
