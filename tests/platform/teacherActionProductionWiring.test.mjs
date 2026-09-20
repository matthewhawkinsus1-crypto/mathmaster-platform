import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { projectTestCycleTeacherActions } from '../../src/platform/teacher/testCycleActionProjection.js';

const app = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');

test('production Action Center receives shared authoritative grade-transfer and Test Cycle projections', () => {
  assert.match(app, /gradeTransferUnits=\{actionGradeScope\.units\}/);
  assert.match(app, /retestRecoveryActions=\{retestRecoveryActions\}/);
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
  assert.match(app, /sourceAction=\{parentContactSourceAction\}/);
  assert.match(app, /recordParentContact\([\s\S]{0,700}SUPPORT_EVENT_KIND\.RESOLVED[\s\S]{0,300}resolvesEventId: contact\.sourceEventId/);
});

test('date-only action keys render as local calendar dates instead of UTC instants', () => {
  const component = readFileSync(new URL('../../src/components/teacher/TeacherActionCenter.jsx', import.meta.url), 'utf8');
  assert.match(component, /new Date\(Number\(year\), Number\(month\) - 1, Number\(day\)\)\.toLocaleDateString\(\)/);
  assert.doesNotMatch(component, /new Date\(item\.dueAt \|\| item\.createdAt\)\.toLocaleDateString\(\)/);
});

test('sidebar badge is fed by the mounted Action Center projection, not another listener', () => {
  assert.match(app, /actionCount=\{teacherActionOpenCount\}/);
  assert.match(app, /const teacherActionOpenCount = openTeacherActionCount\(teacherActionItems\)/);
});
