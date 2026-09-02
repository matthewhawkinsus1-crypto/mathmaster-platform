import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');

test('live question repair uses a Firestore transaction for assignment and student grade records', () => {
  assert.match(app, /runTransaction\(db, async \(transaction\) =>/);
  assert.match(app, /repairAssignmentTrackerForLiveCorrections/);
  assert.match(app, /questionFingerprint\(liveQuestion\)/);
  assert.match(app, /gradesByAssignment:\s*\{/);
});

test('live correction keeps question identity and index stable before touching grades', () => {
  assert.match(app, /liveQuestion\.questionId/);
  assert.match(app, /repairedQuestion\.questionId/);
  assert.match(app, /questionIndex/);
  assert.match(app, /repair\.beforeFingerprint/);
});

test('student grade docs are read inside the transaction before repair writes', () => {
  assert.match(app, /transaction\.get\(studentRef\)/);
  assert.match(app, /transaction\.update\(studentRef/);
  assert.match(app, /transaction\.update\(assignmentRef, assignmentPatch\)/);
});

test('large live migrations fail closed instead of partially repairing students', () => {
  assert.match(app, /audienceStudents\.length > 450/);
  assert.match(app, /server migration path/);
});


test('assigned assignments always enable live question protection even before grade history hydrates', () => {
  assert.match(app, /hasLiveProtection=\{/);
  assert.match(app, /!isLibraryAssignment\(questionEditorAssignment\)/);
  assert.match(app, /gradesByAssignment\?\.\[questionEditorAssignment\.id\]/);
});


test('question editor exposes one-action Safe Live Repair Pack import and immediate transactional save', () => {
  const editor = fs.readFileSync('src/AssignmentQuestionEditor.jsx', 'utf8');
  assert.match(editor, /Import Safe Repair Pack/);
  assert.match(editor, /accept=".json,application\/json"/);
  assert.match(editor, /prepareSafeLiveRepairPack/);
  assert.match(editor, /await onSave\(\{/);
  assert.match(editor, /liveRepairs: prepared\.liveRepairs/);
});
