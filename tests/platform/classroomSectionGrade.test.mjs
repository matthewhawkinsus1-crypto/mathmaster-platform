import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import test from 'node:test';

const require = createRequire(import.meta.url);
const {
  classroomPublicationGrade,
} = require('../../functions/lib/classroomSectionGrade.js');

test('a DOL publication grades only DOL indices while a legacy publication remains whole-assignment compatible', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [
      { role: 'warmup', questions: [{ id: 'w1' }] },
      { role: 'classwork', questions: [{ id: 'c1' }] },
      { role: 'dol', questions: [{ id: 'd1' }, { id: 'd2' }] },
    ],
  };
  const calls = [];
  const gradeProgress = (_tracker, indices) => {
    calls.push([...indices]);
    return {
      grade: indices.length * 10,
      attempted: indices.length,
      total: indices.length,
      complete: true,
    };
  };

  const dol = classroomPublicationGrade({
    assignment,
    publication: { sectionKey: 'dol' },
    tracker: {},
    questions: [],
    gradeProgress,
  });
  const whole = classroomPublicationGrade({
    assignment,
    publication: {},
    tracker: {},
    questions: [],
    gradeProgress,
  });

  assert.equal(dol.sectionKey, 'dol');
  assert.deepEqual(dol.questionIndices, [2, 3]);
  assert.equal(dol.grade, 20);
  assert.equal(whole.sectionKey, 'whole');
  assert.deepEqual(whole.questionIndices, [0, 1, 2, 3]);
  assert.equal(whole.grade, 40);
  assert.deepEqual(calls, [[2, 3], [0, 1, 2, 3]]);
});

test('explicit invalid persisted section identity fails closed instead of receiving the whole-assignment grade', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }],
  };

  assert.throws(
    () => classroomPublicationGrade({
      assignment,
      publication: { sectionKey: 'mystery' },
      tracker: {},
      questions: [],
      gradeProgress: () => ({ grade: 100 }),
    }),
    /Unsupported Classroom section/i,
  );
});

test('a persisted section with no included questions fails closed rather than sending a zero or unrelated score', () => {
  const assignment = {
    schemaVersion: 5,
    sections: [{ role: 'warmup', questions: [{ id: 'w1' }] }],
  };

  assert.throws(
    () => classroomPublicationGrade({
      assignment,
      publication: { sectionKey: 'dol' },
      tracker: {},
      questions: [],
      gradeProgress: () => ({ grade: 0 }),
    }),
    /has no included questions/i,
  );
});
