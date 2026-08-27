import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('src/App.jsx');
const lifecycle = read('src/assignmentLifecycle.js');
const dashboard = read('src/studentDashboardModel.js');
const worksheet = read('src/platform/resources/teacherAssignmentWorksheetExport.js');

test('core App runtime reads use canonical section projection instead of assignment.questions', () => {
  assert.match(app, /runtimeQuestionsFromAssignment/);
  assert.doesNotMatch(app, /\bactiveAssignmentData\??\.questions\b/);
  assert.doesNotMatch(app, /\blocalAssignment\??\.questions\b/);
  assert.doesNotMatch(app, /\bselectedAssignment\??\.questions\b/);
  assert.doesNotMatch(app, /\bassignment\??\.questions\b/);
});

test('assignment lifecycle derives section membership, Warm-Up, DOL and completion from V5 sections', () => {
  assert.match(lifecycle, /runtimeQuestionsFromAssignment/);
  assert.doesNotMatch(lifecycle, /Array\.isArray\(assignment\?\.questions\)/);
  assert.doesNotMatch(lifecycle, /assignment\.questions/);
});

test('student dashboard resume logic uses V5 sections', () => {
  assert.match(dashboard, /runtimeQuestionsFromAssignment\(assignment\)/);
  assert.match(dashboard, /runtimeQuestionsFromAssignment\(resumeAssignment\)/);
  assert.doesNotMatch(dashboard, /assignment\??\.questions/);
  assert.doesNotMatch(dashboard, /resumeAssignment\??\.questions/);
});

test('teacher worksheet export resolves printable questions from canonical V5 sections', () => {
  assert.match(worksheet, /runtimeQuestionsFromAssignment\(assignment\)/);
  assert.doesNotMatch(worksheet, /assignment\??\.questions/);
});

test('existing assignment setup save never asks persistence patch for removed flat questions', () => {
  assert.doesNotMatch(app, /persistence\.questions/);
  assert.match(app, /const persistedQuestions = flattenV5Sections\(model\.assignmentV5\)/);
});

console.log('assignmentV5RuntimeReaders.test.mjs: all assertions passed');
