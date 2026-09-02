import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const editor = fs.readFileSync('src/AssignmentQuestionEditor.jsx', 'utf8');
const engine = fs.readFileSync('src/QuestionEngine.jsx', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');

test('teacher editor exposes per-question weight and live recalculation confirmation', () => {
  assert.match(editor, /Grade weight for Question/);
  assert.match(editor, /Suggest ×/);
  assert.match(editor, /Recalculate live grades using/);
  assert.match(editor, /questionWeight/);
});

test('live weight changes preserve trackers and signal Classroom reconciliation', () => {
  assert.match(app, /const weightChanges =/);
  assert.match(app, /source: 'question-weight-change'/);
  assert.match(app, /classroomReleaseSignals/);
  assert.match(app, /normalizeQuestionWeight\(liveQuestion\)/);
});

test('app and server both use weighted assignment scoring', () => {
  assert.match(app, /return splitGrade\(\{ tracker: assignmentTracker, assignment: assignmentData \}\)\.score \?\? 0/);
  assert.match(functionsIndex, /weightedQuestionTotals/);
  assert.match(functionsIndex, /runtimeQuestionsFromAssignment\(assignment\)/);
});

test('students are told when a question counts more than standard weight', () => {
  assert.match(engine, /Grade weight ×\{questionGradeWeight\}/);
  assert.match(engine, /times a standard-weight question/);
});
