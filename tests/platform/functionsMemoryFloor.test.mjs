// NO FUNCTION IN THIS CODEBASE MAY RUN AT THE 256 MiB DEFAULT.
//
// Every function loads the whole codebase, and in production that alone took
// 257–334 MiB in the 14 functions Cloud Run killed for it. What that looked
// like from outside:
//   - ingestStudentSubmissions (every graded answer a student submits) was
//     killed thousands of times a school day; the device queue retried it;
//   - queueClassroomSectionGradeCheckpoints ran out of memory on every
//     five-minute run from Oct 6 to Oct 13, 2026, so no due-time or final
//     grade checkpoint reached Google Classroom for section-published work;
//   - syncGradeToClassroom and syncSectionGradeToClassroom dropped grade
//     writes; listTeacherTestCycleRecords was the "server did not answer"
//     incident fixed for that one callable in #477.
// Read from the real endpoint manifests the Firebase CLI deploys from, so a
// function defined in any file, with any options object, is covered.

import test from 'node:test';
import assert from 'node:assert/strict';

import { listDeployableFunctions } from '../../scripts/lib/functionsInventory.mjs';

const FLOOR_MB = 512;
const { functions } = listDeployableFunctions();
const memoryOf = (name) => functions.find((fn) => fn.name === name)?.memoryMb;

test('every deployable function declares at least 512 MiB', () => {
  assert.ok(functions.length > 150, 'the real entry point was loaded');
  const below = functions
    .filter((fn) => !(Number.isFinite(fn.memoryMb) && fn.memoryMb >= FLOOR_MB))
    .map((fn) => `${fn.name} (${fn.memoryMb === null ? 'platform default, 256' : fn.memoryMb} MiB)`);
  assert.deepEqual(below, [], 'these functions would be deployed below the memory this codebase needs');
});

test('the functions production killed for memory are covered, whichever file defines them', () => {
  // Callable, Firestore trigger and scheduler; index.js and the Classroom
  // section entry. The floor is a global option, so it has to reach all of
  // these shapes, not only the ones written in the file that sets it.
  for (const name of [
    'ingestStudentSubmissions',
    'reportStudentDeviceQueue',
    'advanceSectionRecovery',
    'syncGradeToClassroom',
    'syncSectionGradeToClassroom',
    'queueClassroomGradeCheckpoints',
    'queueClassroomSectionGradeCheckpoints',
    'finalizeStudentResponseCheckpoints',
  ]) {
    assert.ok(memoryOf(name) >= FLOOR_MB, `${name} is deployed with ${memoryOf(name)} MiB`);
  }
});

test('a function that asks for more than the floor keeps what it asked for', () => {
  // The teacher's Test Cycle panel reads a whole class at once (#477).
  assert.equal(memoryOf('listTeacherTestCycleRecords'), 1024);
});
