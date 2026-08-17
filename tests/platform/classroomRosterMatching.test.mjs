import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildRosterMatchPlan,
  buildTopicPlan,
  studentsForClass,
  suggestClassroomTopic,
} from '../../src/classroomRosterMatching.js';

test('exact email is the only automatic roster link', () => {
  const result = buildRosterMatchPlan({
    classroomStudents: [{ googleUserId: 'g1', name: 'Jane Doe', email: 'jane@school.org' }],
    mathMasterStudents: [{ id: '42', firstName: 'Jane', lastName: 'Doe', schoolEmail: 'JANE@school.org' }],
  });
  assert.equal(result[0].status, 'exact-email');
  assert.equal(result[0].suggestedStudent.id, '42');
});


test('linked school Google email can auto-match a Classroom student', () => {
  const result = buildRosterMatchPlan({
    classroomStudents: [{ googleUserId: 'g2', name: 'Sam Lee', email: 'sam@school.org' }],
    mathMasterStudents: [{ id: '77', firstName: 'Sam', lastName: 'Lee', linkedEmail: 'SAM@school.org' }],
  });
  assert.equal(result[0].status, 'exact-email');
  assert.equal(result[0].suggestedStudent.id, '77');
});

test('name-only match requires review', () => {
  const result = buildRosterMatchPlan({
    classroomStudents: [{ googleUserId: 'g1', name: 'Jane Doe', email: '' }],
    mathMasterStudents: [{ id: '42', firstName: 'Jane', lastName: 'Doe' }],
  });
  assert.equal(result[0].status, 'exact-name');
  assert.equal(result[0].confidence, 'review');
});

test('duplicate names are ambiguous', () => {
  const result = buildRosterMatchPlan({
    classroomStudents: [{ googleUserId: 'g1', name: 'Alex Smith', email: '' }],
    mathMasterStudents: [
      { id: '1', firstName: 'Alex', lastName: 'Smith' },
      { id: '2', firstName: 'Alex', lastName: 'Smith' },
    ],
  });
  assert.equal(result[0].status, 'ambiguous');
  assert.equal(result[0].suggestedStudent, null);
});

test('class filtering prefers classId over period fallback', () => {
  const students = [
    { id: '1', classId: 'a', classPeriod: 'Period 1' },
    { id: '2', classId: 'b', classPeriod: 'Period 1' },
  ];
  assert.deepEqual(studentsForClass(students, { classId: 'a', period: 'Period 1' }).map((s) => s.id), ['1']);
});

test('topic suggestion mirrors MathMaster folder hierarchy', () => {
  assert.equal(
    suggestClassroomTopic({ folder: 'Algebra I/Module 2/Linear Functions/Lesson 3' }),
    'Module 2 • Linear Functions',
  );
});

test('topic plan deduplicates folders', () => {
  const plan = buildTopicPlan([
    { id: 'a', folder: 'Algebra I/Module 1/Functions' },
    { id: 'b', folder: 'Algebra I/Module 1/Functions' },
  ]);
  assert.equal(plan.length, 1);
  assert.equal(plan[0].count, 2);
});
