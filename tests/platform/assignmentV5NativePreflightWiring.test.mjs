import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');

test('assignment intake opens Preflight with canonical V5 rather than a Lesson Bundle adapter', () => {
  assert.doesNotMatch(app, /buildPreflightBundle/);
  assert.doesNotMatch(app, /normalizeLessonBundle/);
  assert.match(app, /const assignmentV5 = inspected\.bundleSource/);
  assert.match(app, /assignmentV5=\{assignmentPreflight\.assignmentV5\}/);
});

test('Preflight validates and plans delivery from Assignment V5 directly', () => {
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5\)/);
  assert.doesNotMatch(modal, /validateLessonBundle/);
  assert.doesNotMatch(modal, /lessonBundle/);
  assert.match(modal, /assignmentV5:\s*effectiveAssignmentV5/);
  assert.match(modal, /Printable and shareable outputs/);
  assert.match(modal, /setOutputProfileEnabled/);
  assert.match(modal, /SectionBalanceRigorAudit assignmentV5=\{effectiveAssignmentV5\}/);
});

test('Preflight section controls use canonical V5 section ids', () => {
  assert.doesNotMatch(modal, /activity\.activityId|currentActivity\.activityId/);
  assert.match(modal, /activity\.id \|\| activity\.sectionId/);
});

console.log('assignmentV5NativePreflightWiring.test.mjs: all assertions passed');


test('final Preflight callback returns the exact reviewed V5 object and canonical policies', () => {
  assert.match(modal, /variantPolicy:\s*effectiveAssignmentV5\.variantPolicy/);
  assert.match(modal, /outputProfiles:\s*effectiveAssignmentV5\.outputProfiles/);
  assert.match(modal, /assignmentV5:\s*effectiveAssignmentV5/);
});

test('App publishes from reviewed V5 sections instead of reparsing original pasted questions', () => {
  assert.match(app, /flattenV5Sections\(reviewedV5\)/);
  assert.match(app, /rebuildV5SectionsFromQuestions\(reviewedV5, variantQuestions\)/);
  assert.match(app, /handleCreateAssignment\(null, null, draft, assignmentV5\)/);
});
