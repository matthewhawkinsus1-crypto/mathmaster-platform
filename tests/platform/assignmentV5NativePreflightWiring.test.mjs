import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { appAndTeacherWorkspaceSource } from './helpers/appScreens.mjs';

const app = appAndTeacherWorkspaceSource();
const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
// The teacher's screen, which mounts Pre-Flight, is its own module since G2.
const teacherWorkspace = fs.readFileSync('src/app/teacher/TeacherWorkspace.jsx', 'utf8');

test('assignment intake opens Preflight with canonical V5 rather than a Lesson Bundle adapter', () => {
  assert.doesNotMatch(app, /buildPreflightBundle/);
  assert.doesNotMatch(app, /normalizeLessonBundle/);
  assert.match(app, /const assignmentV5 = inspected\.assignmentV5/);
  assert.match(teacherWorkspace, /assignmentV5=\{assignmentPreflight\.assignmentV5\}/);
  assert.doesNotMatch(teacherWorkspace, /buildPreflightBundle|normalizeLessonBundle/);
});

test('Preflight validates and plans delivery from Assignment V5 directly', () => {
  assert.match(modal, /buildPreflightReviewedAssignmentV5/);
  // The reviewed V5 object is the model's input (first argument); an options
  // bag may follow (it carries the class size for Pre-Flight's uniqueness check).
  assert.match(modal, /buildAssignmentV5PreflightModel\(reviewedAssignmentV5[,)]/);
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
  assert.match(app, /handleCreateAssignment\(draft, assignmentV5\)/);
  const publishStart = app.indexOf('const handleCreateAssignment');
  const publishEnd = app.indexOf('const updateExistingAssignmentFromReview', publishStart);
  const publishBlock = app.slice(publishStart, publishEnd);
  assert.doesNotMatch(publishBlock, /parseAssignmentBlueprintText|packageMetadata|normalizeAssignmentPackageMetadata/);
});
