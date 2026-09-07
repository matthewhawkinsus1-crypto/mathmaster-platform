import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const intakeWrapper = readFileSync(new URL('../../src/AssignmentIntake.jsx', import.meta.url), 'utf8');
const intakeBase = readFileSync(new URL('../../src/AssignmentIntakeBase.jsx', import.meta.url), 'utf8');

test('salvageable V5 assignments open their saved Repair Center immediately', () => {
  assert.match(intakeWrapper, /saveIncompleteAssignmentDraft/);
  assert.match(intakeWrapper, /setRepairDraftId\(saved\.id\)/,
    'after salvage, the saved incomplete draft must be the open Repair Center instead of making the teacher hunt for it');
  assert.match(intakeWrapper, /salvaged:\s*true/);
});

test('salvaged assignments are not rendered through the normal rejection panel', () => {
  assert.match(intakeBase, /result\?\.salvaged/,
    'AssignmentIntakeBase must distinguish a preserved repairable draft from a hard parse/schema failure');
  assert.match(intakeBase, /Saved to Incomplete Assignments|Open Repair Center|repair/i);
});

test('hard failures remain available for malformed or unsupported input', () => {
  assert.match(intakeBase, /setFailure\(/);
  assert.match(intakeBase, /MathMaster could not read this assignment/);
});

console.log('pr152AcceptanceIntakeFlow.test.mjs: all assertions passed');
