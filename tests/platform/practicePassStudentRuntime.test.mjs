import test from 'node:test';
import assert from 'node:assert/strict';
import {
  getCurrentContentQuestionIndices,
  practicePassWaivedIndices,
  studentAssignmentIndicesWithPracticePass,
} from '../../src/assignmentLifecycle.js';

// The ONE reusable projection of "what is required right now" for a real
// student holding (or not holding) a Practice Pass. Every student-runtime
// consumer -- startAssignment, the active-question correction effect, live
// presence, the question counter, dashboard completion -- must read this
// function rather than re-filtering `logicalRole !== 'practice'` at each site,
// or the definition of "waived" could drift between them.

const lesson = (overrides = {}) => ({
  title: 'Solving Equations',
  sections: [
    { role: 'warmup', questions: [{}] },
    { role: 'classwork', questions: [{}, {}] },
    { role: 'practice', questions: [{}, {}, {}] },
    { role: 'dol', questions: [{}] },
  ],
  ...overrides,
});

test('without a Practice Pass, every current-content index remains required', () => {
  const assignment = lesson();
  const all = getCurrentContentQuestionIndices(assignment);
  assert.deepEqual(studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass: false }), all);
});

test('with a Practice Pass, Practice indices are removed and everything else remains', () => {
  const assignment = lesson();
  // storageIndex order: 0 warmup, 1-2 classwork, 3-5 practice, 6 dol.
  const withPass = studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass: true });
  assert.deepEqual(withPass, [0, 1, 2, 6]);
  assert.deepEqual(practicePassWaivedIndices(assignment), [3, 4, 5]);
});

test('an assignment with no Practice section is unaffected by hasPracticePass', () => {
  const assignment = lesson({ sections: [{ role: 'classwork', questions: [{}, {}] }] });
  assert.deepEqual(practicePassWaivedIndices(assignment), []);
  assert.deepEqual(
    studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass: true }),
    getCurrentContentQuestionIndices(assignment),
  );
});

test('Warm-Up, Classwork, and DOL indices are identical with or without a Practice Pass', () => {
  const assignment = lesson();
  const without = new Set(studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass: false }));
  const withPass = new Set(studentAssignmentIndicesWithPracticePass({ assignment, hasPracticePass: true }));
  const nonPracticeIndices = [0, 1, 2, 6];
  nonPracticeIndices.forEach((index) => {
    assert.equal(without.has(index), true);
    assert.equal(withPass.has(index), true);
  });
});
