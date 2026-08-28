import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import {
  hydrateAssignmentRuntime,
  runtimeQuestionCount,
  runtimeQuestionsFromAssignment,
} from '../../src/platform/contract/assignmentRuntimeProjection.js';

const require = createRequire(import.meta.url);
const serverRuntime = require('../../functions/lib/assignmentRuntime.js');

const assignment = {
  id: 'a1',
  schemaVersion: 5,
  title: 'Canonical sections',
  sections: [
    {
      id: 'warm',
      role: 'warmup',
      title: 'Warm-Up',
      questions: [{ questionId: 'q1', type: 'multiAnswer', prompt: 'Warm' }],
    },
    {
      id: 'practice',
      role: 'practice',
      title: 'Practice',
      questions: [{ questionId: 'q2', type: 'multiAnswer', prompt: 'Practice' }],
    },
  ],
};

test('client runtime projection flattens canonical sections in source order', () => {
  const questions = runtimeQuestionsFromAssignment(assignment);
  assert.deepEqual(questions.map((question) => question.questionId), ['q1', 'q2']);
  assert.equal(questions[0].activityRole, 'warmup');
  assert.equal(questions[0].sectionId, 'warm');
  assert.equal(questions[1].activityRole, 'practice');
  assert.equal(runtimeQuestionCount(assignment), 2);
});

test('hydration creates a runtime-only questions array without mutating canonical sections', () => {
  const hydrated = hydrateAssignmentRuntime(assignment);
  assert.equal(hydrated.questions.length, 2);
  assert.equal(hydrated.sections, assignment.sections);
  assert.equal('questions' in assignment, false);
});

test('V5 runtime ignores a stale top-level questions copy', () => {
  const hydrated = hydrateAssignmentRuntime({
    ...assignment,
    questions: [{ questionId: 'stale', prompt: 'Wrong source' }],
  });
  assert.deepEqual(hydrated.questions.map((question) => question.questionId), ['q1', 'q2']);
});

test('non-V5 assignments do not get a compatibility projection', () => {
  assert.deepEqual(runtimeQuestionsFromAssignment({
    schemaVersion: 4,
    questions: [{ questionId: 'legacy' }],
  }), []);
});

test('server runtime projection matches client flattening semantics', () => {
  const questions = serverRuntime.runtimeQuestionsFromAssignment(assignment);
  assert.deepEqual(questions.map((question) => question.questionId), ['q1', 'q2']);
  assert.equal(questions[0].activityRole, 'warmup');
  assert.equal(questions[1].sectionId, 'practice');
  assert.equal(serverRuntime.runtimeQuestionCount(assignment), 2);
});


test('live Firestore assignment snapshots are hydrated before replacing React state', () => {
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /snapshot\.docs\.map\(\(assignmentDoc\) => hydrateAssignmentRuntime\(\{[\s\S]{0,180}assignmentDoc\.data\(\)[\s\S]{0,40}\}\)\)/,
  );
});


console.log('assignmentRuntimeProjection.test.mjs: all assertions passed');
