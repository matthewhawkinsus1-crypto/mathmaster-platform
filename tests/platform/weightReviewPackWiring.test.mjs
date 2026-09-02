import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const editor = fs.readFileSync('src/AssignmentQuestionEditor.jsx', 'utf8');
const pack = fs.readFileSync('src/platform/grading/weightReviewPack.js', 'utf8');

test('question editor exposes portable AI weight review copy and paste controls', () => {
  assert.match(editor, /Copy AI Weight Review/);
  assert.match(editor, /Paste AI Weight Review/);
  assert.match(editor, /buildAssignmentWeightReviewRequest/);
  assert.match(editor, /prepareAssignmentWeightReviewPack/);
  assert.match(editor, /navigator\.clipboard\.writeText/);
  assert.match(editor, /navigator\.clipboard\.readText/);
});

test('AI review loads weights for teacher review instead of bypassing normal save protection', () => {
  assert.match(editor, /setQuestions\(prepared\.questions\)/);
  assert.match(editor, /nothing is saved yet/i);
  assert.match(editor, /Save Assignment Questions/);
  assert.match(editor, /Recalculate live grades using/);
});

test('weight review pack can modify only questionWeight and verifies protected fingerprint', () => {
  assert.match(pack, /questionWeight: proposal\.weight/);
  assert.match(pack, /assignmentFingerprint/);
  assert.match(pack, /currentFingerprint/);
  assert.match(pack, /unknown or excluded question ID/);
  assert.doesNotMatch(pack, /updateDoc|runTransaction|gradesByAssignment/);
});
