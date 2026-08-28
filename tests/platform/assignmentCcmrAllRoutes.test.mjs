import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync('src/App.jsx', 'utf8');
const service = fs.readFileSync('src/services/assignmentCcmrService.js', 'utf8');
const functionsIndex = fs.readFileSync('functions/index.js', 'utf8');

test('pasted and uploaded Assignment V5 JSON is bank-hydrated before local compilation', () => {
  const start = app.indexOf('const handleAssignmentJsonReady');
  const end = app.indexOf('const handleCreateAssignment', start);
  const block = app.slice(start, end);
  assert.match(block, /JSON\.parse\(String\(text \|\| ''\)\)/);
  assert.match(block, /await hydrateAssignmentCcmr\(raw\)/);
  assert.match(block, /sourceText = JSON\.stringify\(hydrated\.assignment\)/);
  assert.ok(
    block.indexOf('await hydrateAssignmentCcmr(raw)') < block.indexOf('readAssignmentJson(sourceText)'),
    'bank hydration must happen before V5 compilation and Preflight',
  );
});

test('the client uses a dedicated authenticated callable for bank hydration', () => {
  assert.match(service, /httpsCallable\(functions, 'hydrateAssignmentCcmr'/);
  assert.match(service, /Number\(assignment\.schemaVersion\) !== 5/);
  assert.match(service, /return \{[\s\S]*assignment:[\s\S]*audit:/);
});

test('the server callable requires a teacher and returns audited bank hydration', () => {
  const start = functionsIndex.indexOf('exports.hydrateAssignmentCcmr');
  const end = functionsIndex.indexOf('exports.authorAssignmentWithAI', start);
  const block = functionsIndex.slice(start, end);
  assert.match(block, /await requireTeacher\(request\)/);
  assert.match(block, /replaceDirectCcmrQuestionsWithAuditedBank\(assignment\)/);
  assert.match(block, /assignmentCcmrHydrationAudit/);
  assert.match(block, /return result/);
});

test('bank hydration is resilient: an unavailable callable does not destroy an otherwise valid import', () => {
  const start = app.indexOf('const handleAssignmentJsonReady');
  const end = app.indexOf('const handleCreateAssignment', start);
  const block = app.slice(start, end);
  assert.match(block, /catch \(error\) \{[\s\S]*CCMR assignment hydration was skipped/);
  assert.match(block, /const result = readAssignmentJson\(sourceText\)/);
});
