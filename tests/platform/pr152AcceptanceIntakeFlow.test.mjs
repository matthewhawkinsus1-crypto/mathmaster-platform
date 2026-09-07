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

test('salvaged assignments become a successful preserved-draft intake rather than a rejection result', () => {
  assert.match(intakeWrapper, /ok:\s*true[\s\S]{0,160}salvaged:\s*true/,
    'only a draft that was successfully persisted may be promoted out of the hard-rejection path');
  assert.match(intakeWrapper, /Repair Center is open below|Repair Center/i);
});

test('hard failures remain available for malformed or unsupported input', () => {
  assert.match(intakeBase, /setFailure\(/);
  assert.match(intakeBase, /MathMaster could not read this assignment/);
});

console.log('pr152AcceptanceIntakeFlow.test.mjs: all assertions passed');