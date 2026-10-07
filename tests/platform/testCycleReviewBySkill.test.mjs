import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import testCycle from '../../functions/lib/testCycle.js';
import { region } from './helpers/sourceContract.mjs';

const { reviewProgress, reviewProgressBySkill } = testCycle;
const functionsIndex = readFileSync(new URL('../../functions/index.js', import.meta.url), 'utf8');

/*
 * THE REVIEW, SKILL BY SKILL, ON THE STUDENT'S CARD.
 *
 * What the card shows during Review: per standard, how many Review questions
 * the student has answered and how many are right. It is a VIEW: the gate that
 * unlocks the Test is still `reviewProgress` (the teacher's rule), whose shape
 * tests/platform/testCycleReviewProgress.test.mjs pins.
 */

const assignment = {
  schemaVersion: 5,
  sections: [
    {
      id: 'review',
      role: 'review',
      questions: [
        { questionId: 'r1', standard: 'A.5A' },
        { questionId: 'r2', alignments: [{ framework: 'teks', code: 'A.5A', role: 'primary' }] },
        { questionId: 'r3', standards: { primary: ['A.3B'] } },
        // A declared evidence key wins over the authored standard, as in the
        // evidence the same answer writes (attemptEvidenceEvent.mjs).
        { questionId: 'r4', standard: 'A.3B', masteryEvidenceKeys: ['texas:A.2A'] },
        { questionId: 'r5' },
        { questionId: 'r6', standard: 'A.5A', teacherExcluded: true },
      ],
    },
    { id: 'classwork', role: 'classwork', questions: [{ questionId: 'cw1', standard: 'A.5A' }] },
  ],
};

const tracker = {
  0: { status: 'correct', totalAttempts: 1 },
  1: { status: 'incorrect', totalAttempts: 1 }, // legacy "incorrect" is an attempt, not a correct answer
  2: { status: 'attempted', totalAttempts: 2, bestPartialCredit: 60 },
  3: { status: 'unattempted', totalAttempts: 0 },
  4: { status: 'correct', totalAttempts: 1 },
  5: { status: 'correct', totalAttempts: 1 }, // teacher-excluded
  6: { status: 'correct', totalAttempts: 1 }, // classwork
};

test('Review questions are counted per standard: answered, correct, total', async () => {
  const rows = await reviewProgressBySkill(assignment, tracker, {
    // A sloppy blueprint key still lends its label to the same standard.
    targets: [{ alignmentKey: 'texas:A5A', label: 'Solving linear equations (teacher\'s words)' }, { alignmentKey: 'texas:A.9B', label: 'Not in the Review' }],
  });
  assert.deepEqual(rows, [
    { alignmentKey: 'texas:A.5A', label: 'Solving linear equations (teacher\'s words)', attempted: 2, correct: 1, total: 2 },
    { alignmentKey: 'texas:A.3B', label: null, attempted: 1, correct: 0, total: 1 },
    { alignmentKey: 'texas:A.2A', label: null, attempted: 0, correct: 0, total: 1 },
    // Unaligned Review questions stay, so the counts add up to the Review.
    { alignmentKey: null, label: null, attempted: 1, correct: 1, total: 1 },
  ]);
  const gate = reviewProgress(assignment, tracker);
  assert.equal(rows.reduce((sum, row) => sum + row.total, 0), gate.total);
  assert.equal(rows.reduce((sum, row) => sum + row.attempted, 0), gate.attempted);
});

test('the gate is untouched: reviewProgress keeps its shape and its rule', () => {
  // Answering everything wrong still unlocks the Test under the default rule.
  const allWrong = { 0: { status: 'attempted', totalAttempts: 1 }, 1: { status: 'attempted', totalAttempts: 1 }, 2: { status: 'attempted', totalAttempts: 1 }, 3: { status: 'attempted', totalAttempts: 1 }, 4: { status: 'attempted', totalAttempts: 1 } };
  assert.deepEqual(reviewProgress(assignment, allWrong), { total: 5, attempted: 5, complete: true });
});

test('a Test Cycle with no Review questions has no rows', async () => {
  assert.deepEqual(await reviewProgressBySkill({ schemaVersion: 5, sections: [{ id: 'cw', role: 'classwork', questions: [{ questionId: 'a', standard: 'A.5A' }] }] }, {}), []);
  assert.deepEqual(await reviewProgressBySkill({}, {}), []);
});

test('the student card carries reviewBySkill and the Test\'s own released session', () => {
  const payload = region(functionsIndex, 'exports.getStudentTestCycle = onCall(', 'function testCycleSkillList(', 'getStudentTestCycle');
  assert.match(payload, /reviewBySkill: await testCycleLib\.reviewProgressBySkill\(assignment, tracker, \{ targets: blueprint\?\.targets \}\)/);
  // The tracker it reads is the student's own grade document for THIS assignment.
  assert.match(payload, /const tracker = gradeSnapshot\.data\(\)\?\.gradesByAssignment\?\.\[assignmentId\] \|\| \{\};/);
  // Released only: an unreleased Test never names a reviewable session.
  assert.match(payload, /testReviewExamSessionId: record\.test\.state === shared\.record\.SESSION_STATE\.RELEASED\s*\?\s*record\.test\.examSessionId\s*:\s*null/);
  // What's on the test stays, from the blueprint.
  assert.match(payload, /testSkills: testCycleSkillList\(blueprint\)/);
});
