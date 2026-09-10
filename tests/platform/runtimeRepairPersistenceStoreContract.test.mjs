import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { executableSource } from './helpers/sourceContract.mjs';

const source = readFileSync(new URL('../../src/platform/assignments/assignmentRuntimeRepairPersistenceStore.js', import.meta.url), 'utf8');

/*
 * The forbidden-identifier check below runs against code with comments removed.
 *
 * It failed otherwise, and for the worst possible reason: the file's only
 * occurrence of `evidence` was a comment stating that this write-back must
 * never touch student attempts, grades, evidence or Classroom identity — the
 * exact boundary this test enforces. Passing would have meant deleting the
 * explanation. A check about what the code DOES must not read what the code
 * SAYS.
 */
const code = executableSource(source);

test('runtime repair write-back is isolated behind teacher/admin authorization and strict verifier', () => {
  assert.match(source, /buildRuntimeRepairPersistencePatch/);
  assert.match(source, /prepareAssignmentForRuntime/);
  assert.match(source, /teacher|admin/i);
  assert.match(source, /updateDoc/);
  assert.match(source, /runtimeCompatibility/);
  assert.doesNotMatch(
    code,
    /studentAttempts|studentResponses|gradesByAssignment|evidence|classroomCourseWorkId/,
    'runtime repair write-back must never reference student attempt, grade, evidence or Classroom identity fields',
  );
});

test('runtime repair persistence shell guards duplicate StrictMode/in-flight writes', () => {
  assert.match(source, /inFlight/);
  assert.match(source, /finally/);
});
