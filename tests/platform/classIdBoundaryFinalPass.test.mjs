import test from 'node:test';
import assert from 'node:assert/strict';
import { assignmentIsForStudent, getSectionAccessState } from '../../src/assignmentLifecycle.js';
import { mappedCourseIdsForAssignment, shouldAutoPublishClassroomPackage } from '../../src/platform/classroom/automaticClassroomPublishing.js';
import { readFile } from 'node:fs/promises';

const assignment = {
  assignedClassIds: ['class-A'],
  assignedClassPeriods: ['Period 3'],
  dueAt: '2026-08-24T23:59:00Z',
  sectionAccess: {
    classwork: {
      defaultState: 'open',
      overridesByClassId: { 'class-A': { state: 'closed' } },
      overridesByClassPeriod: { 'Period 3': { state: 'open' } },
    },
  },
  questions: [{ activityRole: 'classwork' }],
};

test('a matching period cannot widen a modern assignment audience to a different class', () => {
  assert.equal(assignmentIsForStudent(assignment, { classId: 'class-A', classPeriod: 'Period 3' }), true);
  assert.equal(assignmentIsForStudent(assignment, { classId: 'class-B', classPeriod: 'Period 3' }), false);
});

test('class-ID live-control maps are authoritative over legacy period maps', () => {
  const stateA = getSectionAccessState({ assignment, activityRole: 'classwork', classId: 'class-A', classPeriod: 'Period 3', nowValue: Date.parse('2026-08-23T12:00:00Z') });
  const stateB = getSectionAccessState({ assignment, activityRole: 'classwork', classId: 'class-B', classPeriod: 'Period 3', nowValue: Date.parse('2026-08-23T12:00:00Z') });
  assert.equal(stateA.isOpen, false);
  assert.equal(stateB.isOpen, true, 'missing class-ID override must not inherit another class through a shared period');
});


test('Google Classroom mapping uses classId before a shared period label', () => {
  const modern = { id: 'A1', assignedClassIds: ['class-A'], assignedClassPeriods: ['Period 3'], classroomPackage: { enabled: true, assignmentPost: { publishMode: 'whenAssigned' } } };
  const mappings = [
    { classId: 'class-A', classPeriod: 'Period 3', courseId: 'google-A' },
    { classId: 'class-B', classPeriod: 'Period 3', courseId: 'google-B' },
  ];
  assert.equal(shouldAutoPublishClassroomPackage(modern), true);
  assert.deepEqual(mappedCourseIdsForAssignment(modern, mappings), ['google-A']);
});

test('server onboarding and Live Challenge boundaries are class-ID first', async () => {
  const functionsSource = await readFile(new URL('../../functions/index.js', import.meta.url), 'utf8');
  const challengeUi = await readFile(new URL('../../src/components/liveChallenge/LiveChallengeTeacher.jsx', import.meta.url), 'utf8');
  assert.match(functionsSource, /issueClassJoinCode[\s\S]*where\(\"classId\", \"==\", classId\)/);
  assert.match(functionsSource, /loadChallengeRoster\(db, teacherEmail, \{ classId, classPeriod \}\)/);
  assert.match(challengeUi, /createLiveChallenge\(\{[\s\S]*classId,/);
});
