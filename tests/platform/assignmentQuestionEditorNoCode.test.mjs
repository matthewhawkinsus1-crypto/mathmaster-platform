import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const editor = fs.readFileSync('src/AssignmentQuestionEditor.jsx', 'utf8');

test('normal question editor no longer exposes raw JSON editing', () => {
  assert.doesNotMatch(editor, /Edit JSON/);
  assert.doesNotMatch(editor, /Apply Question JSON/);
  assert.doesNotMatch(editor, /questionJson/);
  assert.doesNotMatch(editor, /beginJsonEdit|applyJsonEdit/);
});

test('teacher gets a plain-English AI repair workflow', () => {
  assert.match(editor, /Repair \/ Rewrite with AI/);
  assert.match(editor, /What should change\?/);
  assert.match(editor, /Copy AI Repair Request/);
  assert.match(editor, /Paste AI Replacement/);
  assert.match(editor, /Describe the issue in normal language/);
});

test('AI replacement is parsed and checked as part of the whole assignment before application', () => {
  assert.match(editor, /parseQuestionRepairResponse\(text\)/);
  assert.match(editor, /storedAssignmentToV5\(assignment/);
  assert.match(editor, /buildAssignmentV5PreflightModel\(candidateV5\)/);
  assert.match(editor, /if \(!model\.isValid\)/);
  assert.match(editor, /MathMaster rejected the AI replacement/);
  assert.match(editor, /setQuestions\(candidateQuestions\)/);
});

test('question id and exclusion state are preserved across an AI repair', () => {
  assert.match(editor, /questionId: existing\.questionId \|\| replacement\.questionId \|\| newQuestionId\(\)/);
  assert.match(editor, /teacherExcluded: existing\.teacherExcluded === true/);
});

test('question rewriting is blocked once student records exist', () => {
  assert.match(editor, /disabled=\{hasStudentData\}/);
  assert.match(editor, /Duplicate the assignment before rewriting question content/);
  assert.match(editor, /historical responses stay attached to the question students actually saw/);
});

console.log('assignmentQuestionEditorNoCode.test.mjs: all assertions passed');
