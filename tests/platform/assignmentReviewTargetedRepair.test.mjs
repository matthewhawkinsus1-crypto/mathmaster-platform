import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const modal = fs.readFileSync('src/components/teacher/LessonPreflightModal.jsx', 'utf8');
const app = fs.readFileSync('src/App.jsx', 'utf8');

test('Assignment Review groups validation blockers by exact question', () => {
  assert.match(modal, /groupQuestionPreflightIssues\(validationErrors, previewQuestions\)/);
  assert.match(modal, /Questions MathMaster can target directly/);
  assert.match(modal, /Question \{issue\.questionNumber\}/);
});

test('question-specific blocker exposes a plain-language AI repair action', () => {
  assert.match(modal, /Repair with AI/);
  assert.match(modal, /Anything else you want the AI to know\?/);
  assert.match(modal, /Copy AI Repair Request/);
  assert.match(modal, /Paste AI Replacement/);
});

test('repair request automatically includes MathMaster blockers plus optional teacher note', () => {
  assert.match(modal, /MathMaster found these blockers for this question/);
  assert.match(modal, /Teacher note:/);
  assert.match(modal, /buildQuestionRepairRequest/);
});

test('pasted replacement is checked before becoming the working assignment', () => {
  assert.match(modal, /parseQuestionRepairResponse\(raw\)/);
  assert.match(modal, /replaceQuestionAtFlatIndex/);
  assert.match(modal, /buildAssignmentV5PreflightModel\(candidate\)/);
  assert.match(modal, /The replacement still has blockers/);
  assert.match(modal, /newlyIntroducedPreflightErrors/);
  assert.match(modal, /The replacement introduced a new assignment blocker/);
  assert.match(modal, /setWorkingAssignmentV5\(candidateModel\.assignmentV5\)/);
});

test('reviewed assignment is rebuilt from repaired working content', () => {
  assert.match(modal, /useState\(\(\) => assignmentV5\)/);
  assert.match(modal, /buildPreflightReviewedAssignmentV5\(workingAssignmentV5, draft\)/);
});

test('representation audit follows repaired live questions instead of stale imported questions', () => {
  assert.match(modal, /<RepresentationAudit questions=\{previewQuestions\}/);
});

test('existing assignments with student evidence disable targeted question rewriting in review', () => {
  assert.match(app, /allowQuestionRepair:\s*!allStudents\.some/);
  assert.match(app, /allowQuestionRepair=\{assignmentPreflight\.allowQuestionRepair !== false\}/);
  assert.match(modal, /allowQuestionRepair = true/);
  assert.match(modal, /disabled=\{!allowQuestionRepair\}/);
  assert.match(modal, /Student records already exist, so question content is locked/);
});

test('save handler independently blocks reviewed question-content changes after student evidence exists', () => {
  assert.match(app, /const originalQuestionState = canonicalV5PersistencePatch\(originalV5\)\.questions/);
  assert.match(app, /const reviewedQuestionState = canonicalV5PersistencePatch\(model\.assignmentV5\)\.questions/);
  assert.match(app, /const questionContentChanged = JSON\.stringify\(originalQuestionState\) !== JSON\.stringify\(reviewedQuestionState\)/);
  assert.match(app, /questionContentChanged \? \['question content'\] : \[\]/);
  assert.match(app, /Duplicate the assignment for a new delivery policy or question rewrite instead/);
});

console.log('assignmentReviewTargetedRepair.test.mjs: all assertions passed');
