import test from 'node:test';
import assert from 'node:assert/strict';

import { buildItemAnalytics, collectStudentEvidence } from '../../src/masteryEngine.js';
import { collectAssignmentSkillIds } from '../../src/platform/path/masteryAdapter.js';

const question = {
  questionId: 'q-a5a',
  type: 'stepAlgebra',
  activityRole: 'practice',
  prompt: 'Solve 3x + 4 = 40.',
  equation: '3x+4=40',
  dok: 2,
  difficultyBand: 3,
  alignments: [
    { framework: 'teks', code: 'A.5A', role: 'primary', evidenceLevel: 'assessed' },
  ],
};

const trackerRecord = {
  status: 'correct',
  attemptCount: 1,
  totalAttempts: 1,
  lastAttemptAt: '2026-08-28T12:00:00.000Z',
};

const student = {
  id: 'student-1',
  gradesByAssignment: {
    eligible: { 0: trackerRecord },
    blocked: { 0: trackerRecord },
  },
};

test('masteryEligible false prevents classroom assignment work from moving mastery', () => {
  const eligible = {
    id: 'eligible',
    assignmentType: 'practice',
    evidencePolicy: { masteryEligible: true },
    questions: [question],
  };
  const blocked = {
    id: 'blocked',
    assignmentType: 'practice',
    evidencePolicy: { masteryEligible: false },
    questions: [question],
  };

  const included = collectStudentEvidence({ student, assignments: [eligible] });
  const excluded = collectStudentEvidence({ student, assignments: [blocked] });

  assert.ok(included.length > 0, 'fixture must produce real mastery evidence');
  assert.equal(included[0].teks, 'A.5A');
  assert.deepEqual(excluded, []);
});

test('recommendationEligible false prevents an assignment from biasing Path relevance', () => {
  const eligible = {
    id: 'eligible',
    evidencePolicy: { recommendationEligible: true },
    questions: [question],
  };
  const blocked = {
    id: 'blocked',
    evidencePolicy: { recommendationEligible: false },
    questions: [question],
  };

  assert.deepEqual(collectAssignmentSkillIds([eligible]), ['teks:A.5A']);
  assert.deepEqual(collectAssignmentSkillIds([blocked]), []);
});

test('analyticsEligible false removes the assignment from item analytics without changing its grade record', () => {
  const eligible = {
    id: 'eligible',
    assignmentType: 'practice',
    evidencePolicy: { analyticsEligible: true },
    questions: [question],
  };
  const blocked = {
    id: 'blocked',
    assignmentType: 'practice',
    evidencePolicy: { analyticsEligible: false },
    questions: [question],
  };

  assert.equal(buildItemAnalytics({ students: [student], assignments: [eligible] }).length, 1);
  assert.equal(buildItemAnalytics({ students: [student], assignments: [blocked] }).length, 0);
});
