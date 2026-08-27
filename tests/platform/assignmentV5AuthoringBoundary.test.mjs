import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const intake = fs.readFileSync('src/AssignmentIntake.jsx', 'utf8');
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('new authoring enters through Assignment V5 and reviewed Preflight', () => {
  assert.match(intake, /Paste AI Assignment/);
  assert.match(app, /const reviewedV5 = reviewedAssignmentV5/);
  assert.match(app, /flattenV5Sections\(reviewedV5\)/);
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5\)/);
});

test('question editing cannot write content before native V5 Preflight succeeds', () => {
  const editStart = app.indexOf('const saveQuestionEditor');
  const editEnd = app.indexOf('const studentsInActiveClass', editStart);
  const block = app.slice(editStart, editEnd);
  assert.match(block, /storedAssignmentToV5/);
  assert.match(block, /buildAssignmentV5PreflightModel/);
  assert.match(block, /if \(!model\.isValid\)/);
  assert.match(block, /canonicalV5PersistencePatch/);
});

test('duplication cannot create a content copy outside native V5 Preflight', () => {
  const start = app.indexOf('const handleDuplicateAssignment');
  const end = app.indexOf('const handleToggleArchiveAssignment', start);
  const block = app.slice(start, end);
  assert.match(block, /storedAssignmentToV5/);
  assert.match(block, /buildAssignmentV5PreflightModel/);
  assert.match(block, /if \(!model\.isValid\)/);
  assert.match(block, /assignedClassPeriods:\s*\[\]/);
});

test('library assignment routes back through V5 Preflight instead of direct publication mutation', () => {
  assert.match(app, /openStoredAssignmentForPreflight/);
  assert.match(app, /Preflight will create the correct destination version/);
  assert.match(app, /Use a destination copy/);
});

test('platform self-export is V5 and cannot resurrect the retired portable V2 package', () => {
  assert.match(app, /buildPortableAssignmentPackage = \(assignment\) => storedAssignmentToV5/);
  assert.doesNotMatch(app, /schemaVersion:\s*2[\s\S]{0,500}questions:\s*assignment\.questions/);
});

test('normal teacher creator does not expose raw JSON editing or schema jargon', () => {
  assert.doesNotMatch(intake, /Edit raw JSON|textarea[^>]+rawJson/i);
  assert.match(intake, /NO CODE REQUIRED/);
  assert.match(intake, /Paste AI Assignment/);
  assert.doesNotMatch(intake, /Paste V5 JSON from Clipboard|Upload V5 JSON|V5 · NO CODE REQUIRED|Assignment V5 JSON object/);
  assert.doesNotMatch(modal, /Choose independently for each V5 section|canonical V5 output profiles|authored in the JSON/);
  assert.match(modal, /Back to Creator/);
  assert.doesNotMatch(modal, />Back to JSON</);
});

test('legacy Lesson Bundle authoring adapters stay out of the V5 path', () => {
  assert.doesNotMatch(app, /buildPreflightBundle|normalizeLessonBundle/);
  assert.doesNotMatch(modal, /validateLessonBundle|lessonBundle/);
});

console.log('assignmentV5AuthoringBoundary.test.mjs: all assertions passed');
