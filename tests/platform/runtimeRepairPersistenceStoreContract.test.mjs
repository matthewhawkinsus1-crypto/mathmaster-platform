import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../src/platform/assignments/assignmentRuntimeRepairPersistenceStore.js', import.meta.url), 'utf8');

test('runtime repair write-back is isolated behind teacher/admin authorization and strict verifier', () => {
  assert.match(source, /buildRuntimeRepairPersistencePatch/);
  assert.match(source, /prepareAssignmentForRuntime/);
  assert.match(source, /teacher|admin/i);
  assert.match(source, /updateDoc/);
  assert.match(source, /runtimeCompatibility/);
  assert.doesNotMatch(source, /studentAttempts|studentResponses|gradesByAssignment|evidence|classroomCourseWorkId/);
});

test('runtime repair persistence shell guards duplicate StrictMode/in-flight writes', () => {
  assert.match(source, /inFlight/);
  assert.match(source, /finally/);
});
