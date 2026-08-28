import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

import { getStoredAssignmentQuestions } from '../../src/platform/contract/storedAssignmentV5.js';

const require = createRequire(import.meta.url);
const serverRuntime = require('../../functions/lib/assignmentRuntime.js');

const assignment = {
  id: 'a1',
  schemaVersion: 5,
  title: 'Canonical sections',
  variantPolicy: { mode: 'shared', sectionModes: { warmup: 'shared', practice: 'shared' } },
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

test('client canonical reader flattens V5 sections without creating a stored questions mirror', () => {
  const questions = getStoredAssignmentQuestions(assignment);
  assert.deepEqual(questions.map((question) => question.questionId), ['q1', 'q2']);
  assert.equal(questions[0].activityRole, 'warmup');
  assert.equal(questions[0].sectionId, 'warm');
  assert.equal(questions[1].activityRole, 'practice');
  assert.equal(Object.prototype.hasOwnProperty.call(assignment, 'questions'), false);
});

test('the retired client runtime projection module is gone', () => {
  const projectionUrl = new URL('../../src/platform/contract/assignmentRuntimeProjection.js', import.meta.url);
  assert.equal(existsSync(projectionUrl), false);
});

test('App reads canonical assignments directly instead of hydrating a flat question mirror', () => {
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.doesNotMatch(appSource, /hydrateAssignmentRuntime|assignmentRuntimeProjection/);
  assert.doesNotMatch(appSource, /activeAssignmentData\.questions|assignmentData\.questions|localAssignment\??\.questions|selectedAssignment\.questions/);
  assert.match(appSource, /getStoredAssignmentQuestions\(activeAssignmentData\)/);
  assert.match(appSource, /getStoredAssignmentQuestions\(assignmentData\)/);
});

test('live Firestore snapshots stay canonical section records', () => {
  const appSource = readFileSync(new URL('../../src/App.jsx', import.meta.url), 'utf8');
  assert.match(
    appSource,
    /snapshot\.docs\.map\(\(assignmentDoc\) => \(\{[\s\S]{0,160}assignmentDoc\.data\(\)[\s\S]{0,40}\}\)\)/,
  );
  assert.doesNotMatch(appSource, /snapshot\.docs\.map\(\(assignmentDoc\) => hydrate/);
});

test('server-side derived question view still follows canonical V5 sections', () => {
  const questions = serverRuntime.runtimeQuestionsFromAssignment(assignment);
  assert.deepEqual(questions.map((question) => question.questionId), ['q1', 'q2']);
  assert.equal(questions[0].activityRole, 'warmup');
  assert.equal(questions[1].sectionId, 'practice');
  assert.equal(serverRuntime.runtimeQuestionCount(assignment), 2);
});

console.log('assignmentCanonicalClientRuntime.test.mjs: all assertions passed');
