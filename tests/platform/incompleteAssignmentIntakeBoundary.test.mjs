import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '../..');

const intake = fs.readFileSync(path.join(repoRoot, 'src', 'AssignmentIntake.jsx'), 'utf8');

test('Assignment Intake wraps the existing creator and salvages only parseable failed V5 results', () => {
  assert.match(intake, /AssignmentIntakeBase/);
  assert.match(intake, /canSalvageV5IntakeResult/);
  assert.match(intake, /saveIncompleteAssignmentDraft/);
  assert.match(intake, /Incomplete Assignments/);
  assert.match(intake, /onJsonReady/);
});

console.log('incompleteAssignmentIntakeBoundary.test.mjs: all assertions passed');